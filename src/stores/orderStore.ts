import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Order, OrderStatus, OrderType, VehicleType, Location, RiderProfile } from '../lib/types';
import { formatDate } from '../lib/utils';
import { syncService } from '../lib/syncService';
import { calculatePrice, calculateDistance } from '../lib/pricing';
import { getDefaultRules } from '../lib/pricing';
import { useAuthStore } from './authStore';
import { useNotificationStore } from './notificationStore';
import { showToast } from '../components/Toast';
import { fireBrowserNotification } from '../lib/browserNotify';

// Instant orders still pending after this long are auto-cancelled.
const AUTO_CANCEL_MS = 5 * 60 * 1000;
// Scheduled orders start dispatching this long before scheduledFor.
const SCHEDULED_DISPATCH_WINDOW_MS = 30 * 60 * 1000;
// Scheduled orders still pending this long AFTER scheduledFor are cancelled.
const SCHEDULED_GRACE_MS = 15 * 60 * 1000;

// ── Notification helpers (single source of truth for lifecycle events) ──
// Fires an in-app notification (bell/dropdown) AND, if the target user has
// a saved push subscription, a real system push notification that arrives
// even with the site fully closed. Push failures are non-fatal — the
// in-app notification above always lands regardless.
function pushNotify(userId: string, title: string, message: string) {
  useNotificationStore.getState().addNotification({ userId, title, message, type: 'order' });
  void pushToDevice(userId, title, message);
}

async function pushToDevice(userId: string, title: string, body: string) {
  try {
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title, body, url: '/' }),
    });
  } catch (err) {
    // Non-fatal: the in-app bell notification above already landed, and
    // fireBrowserNotification() covers the tab-open case separately.
    console.warn('[orderStore] push send failed (in-app notification still delivered):', err);
  }
}

// ── Live sync (Supabase Realtime broadcast + cross-tab BroadcastChannel) ──
// Optimistic-update pattern: every mutation applies to local state FIRST
// (instant UX, works offline), then fans out through syncService, which
// both broadcasts the change to other devices/tabs AND persists it to the
// Supabase `orders` table in the background. If the network is down the
// local copy simply stands until the next event or catch-up fetch.

// ── On-screen booking feedback (visible on mobile, no DevTools needed) ──
function toastOnScreen(t: { title: string; message: string; type: 'success' | 'warning' | 'info' | 'error' }) {
  try {
    showToast(t);
  } catch {
    /* toast system unavailable — console only */
  }
}

// Pull recent orders from Supabase and merge them into local state. Used on
// app load / dashboard mount so other devices' orders become visible.
// Params are accepted for call-site compatibility but the fetch is global —
// merging is an upsert by id, so local optimistic state is never wiped.
async function fetchAndMergeOrders(_params?: { customerId?: string; riderId?: string; status?: string }) {
  try {
    const rows = await syncService.fetchRemoteOrders();
    if (rows && rows.length > 0) {
      useOrderStore.getState().mergeRemoteOrders(rows);
    }
  } catch (err) {
    console.warn('[orderStore] catch-up fetch failed (keeping local state):', err);
  }
}

interface OrderStore {
  orders: Order[];
  createOrder: (data: {
    customerId: string;
    customerName: string;
    customerPhone: string;
    pickup: Location;
    dropoff: Location;
    vehicleType: VehicleType;
    packageDescription: string;
    orderType?: OrderType;
    scheduledFor?: number;
  }) => Order;
  acceptOrder: (orderId: string, riderId: string, riderName: string) => boolean;
  cancelOrder: (orderId: string) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  updateRiderLocation: (orderId: string, lat: number, lng: number) => void;
  /** Fetch current orders from GET /api/orders (optionally filtered) and
   *  merge them into local state. Used on app load / dashboard mount. */
  fetchOrders: (params?: { customerId?: string; riderId?: string; status?: string }) => Promise<void>;
  getOrdersByCustomer: (customerId: string) => Order[];
  getOrdersByRider: (riderId: string) => Order[];
  getPendingOrders: () => Order[];
  getActiveOrders: () => Order[];
  getTotalRevenue: () => number;
  /** Merge a server-side order into local state (used by backend sync +
   *  Realtime subscriptions). Matches by id; prepends if unknown. */
  __applyServerOrder: (server: Order) => void;
  // ── Remote sync handlers (called by syncService on incoming events) ──
  /** Merge a batch of orders pulled from Supabase on startup. Keeps the
   *  more-advanced status when local and remote disagree. */
  mergeRemoteOrders: (remoteOrders: Order[]) => void;
  /** A new order was created on another device. */
  applyRemoteOrder: (order: Order) => void;
  /** A rider accepted an order on another device. */
  applyRemoteOrderAccepted: (orderId: string, riderId: string, riderName: string, riderPhone?: string, acceptedAt?: number) => void;
  /** An order's lifecycle status changed on another device. */
  applyRemoteStatus: (orderId: string, status: OrderStatus, timestamp?: number) => void;
  /** A rider's live GPS position arrived from their device. */
  applyRemoteRiderLocation: (orderId: string, lat: number, lng: number) => void;
  /** An order was cancelled on another device. */
  applyRemoteCancel: (orderId: string, cancelReason?: string) => void;
  /** The dispatch window was widened on another device. */
  applyRemoteDispatchExpanded: (orderId: string, dispatchedTo: string[]) => void;
  /** Online riders (with a known location) ranked nearest-first to the
   *  order's pickup point — used for staged dispatch. */
  getRankedRidersForOrder: (order: Pick<Order, 'pickup'>) => RiderProfile[];
  /** Widen a pending order's dispatch window to the next 2 nearest
   *  riders not yet included. Idempotent; no-op once someone accepted
   *  or every online rider is already included. */
  expandOrderDispatch: (orderId: string) => void;
  /** Periodic sweep (run globally from App.tsx): auto-cancel expired
   *  instant orders, start dispatch for scheduled orders coming due,
   *  and auto-cancel scheduled orders that missed their window. */
  sweepExpiredOrders: () => void;
}

const DEMO_ORDERS: Order[] = [
  {
    id: 'ORD-001', customerId: 'cust-1', customerName: 'Nana Yaa', customerPhone: '+233201111111',
    pickup: { lat: 5.6037, lng: -0.1870, address: 'University of Ghana, Legon' },
    dropoff: { lat: 5.5560, lng: -0.1824, address: 'Osu Oxford Street' },
    distance: 7.2, price: 28.50, status: 'delivered', vehicleType: 'motorcycle',
    packageDescription: 'Documents', createdAt: Date.now() - 86400000 * 2,
    riderId: 'rider-001', riderName: 'Kwame Mensah', deliveredAt: Date.now() - 86400000 * 2 + 3600000,
    orderType: 'instant',
  },
  {
    id: 'ORD-002', customerId: 'cust-2', customerName: 'Kofi Brew', customerPhone: '+233202222222',
    pickup: { lat: 5.6245, lng: -0.1674, address: 'Accra Mall' },
    dropoff: { lat: 5.5650, lng: -0.2350, address: 'Kaneshie Market' },
    distance: 9.8, price: 35.20, status: 'delivered', vehicleType: 'motorcycle',
    packageDescription: 'Food order', createdAt: Date.now() - 86400000,
    riderId: 'rider-002', riderName: 'Ama Serwaa', deliveredAt: Date.now() - 86400000 + 2400000,
    orderType: 'instant',
  },
  {
    id: 'ORD-003', customerId: 'cust-3', customerName: 'Esi Mensah', customerPhone: '+233203333333',
    pickup: { lat: 5.5710, lng: -0.2200, address: 'Kwame Nkrumah Circle' },
    dropoff: { lat: 5.6350, lng: -0.1580, address: 'East Legon' },
    distance: 11.5, price: 42.00, status: 'pending', vehicleType: 'car',
    packageDescription: 'Groceries - 3 bags', createdAt: Date.now() - 3600000,
    orderType: 'instant',
  },
  {
    id: 'ORD-004', customerId: 'cust-1', customerName: 'Nana Yaa', customerPhone: '+233201111111',
    pickup: { lat: 5.6052, lng: -0.1718, address: 'Kotoka International Airport' },
    dropoff: { lat: 5.6700, lng: -0.1700, address: 'Madina' },
    distance: 8.3, price: 31.50, status: 'pending', vehicleType: 'motorcycle',
    packageDescription: 'Small parcel', createdAt: Date.now() - 1800000,
    orderType: 'instant',
  },
];

export const useOrderStore = create<OrderStore>()(persist((set, get) => ({
  orders: DEMO_ORDERS,

  createOrder: (data) => {
    const distance = calculateDistance(data.pickup.lat, data.pickup.lng, data.dropoff.lat, data.dropoff.lng);
    const { price } = calculatePrice(distance, data.vehicleType, getDefaultRules());
    const orderType: OrderType = data.orderType || 'instant';
    const baseOrder: Order = {
      // NOTE: the Supabase `orders.id` column is a real `uuid` — a
      // human-style "ORD-XXXXXX" string is rejected by Postgres on insert.
      id: uuidv4(),
      customerId: data.customerId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      pickup: data.pickup,
      dropoff: data.dropoff,
      vehicleType: data.vehicleType,
      packageDescription: data.packageDescription,
      distance,
      price,
      status: 'pending',
      orderType,
      scheduledFor: orderType === 'scheduled' ? data.scheduledFor : undefined,
      createdAt: Date.now(),
    };
    // Staged dispatch: instant orders start ringing at the SINGLE nearest
    // online rider only; the window widens every ~15 s if nobody accepts.
    // Scheduled orders don't ring at booking time — the sweep starts their
    // dispatch ~30 minutes before scheduledFor.
    let dispatchedTo: string[] = [];
    if (orderType === 'instant') {
      const ranked = get().getRankedRidersForOrder(baseOrder);
      dispatchedTo = ranked.length > 0 ? [ranked[0].id] : [];
    }
    const order: Order = { ...baseOrder, dispatchedTo };
    // Optimistic local update first (instant UX, works offline)…
    set(s => ({ orders: [order, ...s.orders] }));

    // Push each dispatched rider — this is what makes a new order ring
    // their phone even if the tab isn't open/focused (the in-app "Incoming
    // Order!" alert already covers the tab-open case).
    dispatchedTo.forEach((riderId) => {
      pushNotify(riderId, 'New Order Available!', `A new delivery near you is ready to accept — ${order.pickup.address} → ${order.dropoff.address}.`);
    });

    // …then fan out: broadcast to every other device/tab instantly AND
    // persist to Supabase in the background.
    try {
      syncService.broadcastNewOrder(order);
      toastOnScreen({ title: 'Order created!', message: 'Searching for a rider…', type: 'success' });
    } catch (err) {
      console.warn('[orderStore] broadcastNewOrder failed (order kept locally):', err);
      toastOnScreen({
        title: 'Sync issue',
        message: 'Order saved on this device but may not have reached riders.',
        type: 'warning',
      });
    }

    // Lifecycle notification: order created
    if (orderType === 'scheduled') {
      pushNotify(data.customerId, 'Order Scheduled!', `Order ${order.id} is scheduled for ${formatDate(order.scheduledFor!)}.`);
      fireBrowserNotification('Order Scheduled', `Order ${order.id} is scheduled for ${formatDate(order.scheduledFor!)}.`);
    } else {
      pushNotify(data.customerId, 'Order Placed!', `Order ${order.id} has been placed. Waiting for a rider.`);
      fireBrowserNotification('Order Placed', `Order ${order.id} has been placed. Waiting for a rider.`);
    }
    return order;
  },

  // Race-condition safety: only the FIRST rider to accept actually gets the
  // order. If the order is no longer 'pending' (another rider won the race,
  // or it was cancelled), this is a no-op and returns false.
  acceptOrder: (orderId, riderId, riderName) => {
    const order = get().orders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending') return false;
    const acceptedAt = Date.now();
    // Optimistic local update first…
    set(s => ({
      orders: s.orders.map(o => o.id === orderId ? { ...o, riderId, riderName, status: 'accepted' as OrderStatus, acceptedAt } : o),
    }));

    // Lifecycle notifications: accepted
    const riderProfile = useAuthStore.getState().allUsers.find(u => u.id === riderId);
    const riderPhone = riderProfile && 'phone' in riderProfile && riderProfile.phone
      ? String(riderProfile.phone)
      : undefined;
    const phone = riderPhone ? ` Rider phone: ${riderPhone}.` : '';

    // …then fan out to the customer's device (and persist) so their screen
    // flips to "rider assigned" immediately.
    try {
      syncService.broadcastOrderAccepted(orderId, riderId, riderName, riderPhone, acceptedAt);
    } catch (err) {
      console.warn('[orderStore] broadcastOrderAccepted failed:', err);
    }
    pushNotify(order.customerId, 'Rider Assigned!', `A rider is on the way to pickup — ${riderName} accepted your order ${orderId}.${phone}`);
    pushNotify(riderId, 'Order Accepted', `You accepted order ${orderId}. Head to the pickup point.`);
    fireBrowserNotification('Rider Assigned', `${riderName} accepted order ${orderId} — on the way to pickup.`);
    return true;
  },

  // Only pending orders can be cancelled (a customer can't cancel once a
  // rider has accepted).
  cancelOrder: (orderId) => {
    const order = get().orders.find(o => o.id === orderId);
    set(s => ({
      orders: s.orders.map(o => o.id === orderId && o.status === 'pending' ? { ...o, status: 'cancelled' as OrderStatus } : o),
    }));
    if (order && order.status === 'pending') {
      try {
        syncService.broadcastOrderCancelled(orderId, 'cancelled_by_customer');
      } catch (err) {
        console.warn('[orderStore] broadcastOrderCancelled failed:', err);
      }
      // Lifecycle notification: manual cancellation
      pushNotify(order.customerId, 'Order Cancelled', `Your order ${orderId} was cancelled.`);
      if (order.riderId) {
        pushNotify(order.riderId, 'Order Cancelled', `Order ${orderId} was cancelled by the customer.`);
      }
      fireBrowserNotification('Order Cancelled', `Order ${orderId} was cancelled.`);
    }
  },

  updateOrderStatus: (orderId, status) => {
    const order = get().orders.find(o => o.id === orderId);
    const now = Date.now();
    // Optimistic local update first (timestamps stamped on the same clock
    // value that is sent to the backend below)…
    set(s => ({
      orders: s.orders.map(o => {
        if (o.id !== orderId) return o;
        const updates: Partial<Order> = { status };
        if (status === 'picked_up') updates.pickedUpAt = now;
        if (status === 'delivered') updates.deliveredAt = now;
        return { ...o, ...updates };
      }),
    }));

    // …then fan out to the other side of the delivery (and persist).
    try {
      syncService.broadcastOrderStatus(orderId, status, now);
    } catch (err) {
      console.warn('[orderStore] broadcastOrderStatus failed:', err);
    }

    if (!order) return;

    // Lifecycle notifications per status (customer + rider)
    if (status === 'picked_up') {
      pushNotify(order.customerId, 'Package Picked Up', `Your order ${orderId} has been picked up and is on its way.`);
      if (order.riderId) pushNotify(order.riderId, 'Picked Up', `You picked up order ${orderId}. Safe travels!`);
      fireBrowserNotification('Package Picked Up', `Order ${orderId} has been picked up.`);
    } else if (status === 'in_transit') {
      pushNotify(order.customerId, 'In Transit', `Your order ${orderId} is in transit — track it live on the map.`);
      if (order.riderId) pushNotify(order.riderId, 'Delivery Started', `Order ${orderId} is in transit to the drop-off.`);
      fireBrowserNotification('In Transit', `Order ${orderId} is on its way.`);
    } else if (status === 'delivered') {
      pushNotify(order.customerId, 'Delivered 🎉', `Your order ${orderId} has been delivered. Thank you for using Delivery Boys!`);
      if (order.riderId) pushNotify(order.riderId, 'Delivered', `Order ${orderId} delivered. Great job!`);
      fireBrowserNotification('Delivered 🎉', `Order ${orderId} has been delivered.`);
    } else if (status === 'cancelled') {
      pushNotify(order.customerId, 'Order Cancelled', `Your order ${orderId} was cancelled.`);
      if (order.riderId) pushNotify(order.riderId, 'Order Cancelled', `Order ${orderId} was cancelled.`);
      fireBrowserNotification('Order Cancelled', `Order ${orderId} was cancelled.`);
    }
  },

  updateRiderLocation: (orderId, lat, lng) => {
    // Local state updates on every call (drives the live map)…
    set(s => ({
      orders: s.orders.map(o => o.id === orderId ? { ...o, riderLocation: { lat, lng } } : o),
    }));
    // …and stream the position to the customer's live tracking map.
    const riderId = get().orders.find(o => o.id === orderId)?.riderId;
    if (!riderId) return;
    try {
      syncService.broadcastRiderLocation(orderId, lat, lng, riderId);
    } catch (err) {
      console.warn('[orderStore] broadcastRiderLocation failed:', err);
    }
  },

  fetchOrders: (params) => fetchAndMergeOrders(params),

  // Merge a server-side order into local state (backend sync echo +
  // Realtime subscription events). Matches by id; prepends if unknown.
  __applyServerOrder: (server) => set(s => {
    const exists = s.orders.some(o => o.id === server.id);
    if (!exists) return { orders: [server, ...s.orders] };
    return { orders: s.orders.map(o => (o.id === server.id ? { ...o, ...server } : o)) };
  }),

  // ── Remote sync handlers (invoked by syncService) ──────────────────
  // Startup catch-up: upsert by id. When both sides know an order, the
  // one further along its lifecycle wins, so a stale local "pending"
  // never clobbers a remote "delivered".
  mergeRemoteOrders: (remoteOrders) => set(s => {
    const byId = new Map(s.orders.map(o => [o.id, o]));
    const rank: Record<OrderStatus, number> = {
      pending: 1, accepted: 2, picked_up: 3, in_transit: 4, delivered: 5, cancelled: 6,
    };
    for (const ro of remoteOrders) {
      const current = byId.get(ro.id);
      if (!current) {
        byId.set(ro.id, ro);
      } else if ((rank[ro.status] || 0) >= (rank[current.status] || 0)) {
        byId.set(ro.id, { ...current, ...ro });
      }
    }
    return { orders: Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt) };
  }),

  applyRemoteOrder: (order) => set(s => {
    const exists = s.orders.some(o => o.id === order.id);
    if (exists) return { orders: s.orders.map(o => (o.id === order.id ? { ...o, ...order } : o)) };
    return { orders: [order, ...s.orders] };
  }),

  applyRemoteOrderAccepted: (orderId, riderId, riderName, riderPhone, acceptedAt) => {
    const current = get().orders.find(o => o.id === orderId);
    set(s => ({
      orders: s.orders.map(o => o.id === orderId ? {
        ...o,
        status: 'accepted' as OrderStatus,
        riderId,
        riderName,
        acceptedAt: acceptedAt || Date.now(),
      } : o),
    }));
    if (current) {
      const phone = riderPhone ? ` Rider phone: ${riderPhone}.` : '';
      pushNotify(current.customerId, 'Rider Assigned!', `A rider is on the way to pickup — ${riderName} accepted your order ${orderId}.${phone}`);
      fireBrowserNotification('Rider Assigned', `${riderName} accepted order ${orderId} — on the way to pickup.`);
    }
  },

  applyRemoteStatus: (orderId, status, timestamp) => {
    const order = get().orders.find(o => o.id === orderId);
    const ts = timestamp || Date.now();
    set(s => ({
      orders: s.orders.map(o => {
        if (o.id !== orderId) return o;
        const updates: Partial<Order> = { status };
        if (status === 'picked_up') updates.pickedUpAt = ts;
        if (status === 'delivered') updates.deliveredAt = ts;
        return { ...o, ...updates };
      }),
    }));
    if (!order) return;
    if (status === 'picked_up') {
      pushNotify(order.customerId, 'Package Picked Up', `Your order ${orderId} has been picked up and is on its way.`);
      fireBrowserNotification('Package Picked Up', `Order ${orderId} has been picked up.`);
    } else if (status === 'in_transit') {
      pushNotify(order.customerId, 'In Transit', `Your order ${orderId} is in transit — track it live on the map.`);
      fireBrowserNotification('In Transit', `Order ${orderId} is on its way.`);
    } else if (status === 'delivered') {
      pushNotify(order.customerId, 'Delivered 🎉', `Your order ${orderId} has been delivered. Thank you for using Delivery Boys!`);
      fireBrowserNotification('Delivered 🎉', `Order ${orderId} has been delivered.`);
    }
  },

  applyRemoteRiderLocation: (orderId, lat, lng) => set(s => ({
    orders: s.orders.map(o => o.id === orderId ? { ...o, riderLocation: { lat, lng } } : o),
  })),

  applyRemoteCancel: (orderId, cancelReason) => set(s => ({
    orders: s.orders.map(o => o.id === orderId ? { ...o, status: 'cancelled' as OrderStatus, cancelReason } : o),
  })),

  applyRemoteDispatchExpanded: (orderId, dispatchedTo) => set(s => ({
    orders: s.orders.map(o => o.id === orderId ? { ...o, dispatchedTo } : o),
  })),

  // ── Staged dispatch helpers ────────────────────────────────────────
  // Rank every online rider with a known location by straight-line
  // distance to the order's pickup point, nearest first.
  getRankedRidersForOrder: (order) => {
    const riders = useAuthStore.getState().allUsers.filter(
      (u): u is RiderProfile => u.role === 'rider',
    );
    return riders
      .filter(r => r.availability === 'online' && r.location)
      .map(r => ({
        rider: r,
        dist: calculateDistance(r.location!.lat, r.location!.lng, order.pickup.lat, order.pickup.lng),
      }))
      .sort((a, b) => a.dist - b.dist)
      .map(x => x.rider);
  },

  // Widen the dispatch window: add up to the next 2 nearest riders not
  // yet included. Safe to call from multiple tabs/timers — membership is
  // re-checked inside the set() so no duplicates can slip in.
  expandOrderDispatch: (orderId) => {
    const order = get().orders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending') return;
    const current = order.dispatchedTo || [];
    const ranked = get().getRankedRidersForOrder(order);
    const candidates = ranked.filter(r => !current.includes(r.id)).slice(0, 2).map(r => r.id);
    if (candidates.length === 0) return;
    set(s => ({
      orders: s.orders.map(o => {
        if (o.id !== orderId || o.status !== 'pending') return o;
        const existing = o.dispatchedTo || [];
        const fresh = candidates.filter(id => !existing.includes(id));
        return fresh.length > 0 ? { ...o, dispatchedTo: [...existing, ...fresh] } : o;
      }),
    }));
    // Push the newly-added riders too, same as the initial dispatch —
    // otherwise only the first rider ever gets a push, and everyone the
    // window later widens to only sees the in-app alert if their tab happens
    // to be open.
    candidates.forEach((riderId) => {
      pushNotify(riderId, 'New Order Available!', `A new delivery near you is ready to accept — ${order.pickup.address} → ${order.dropoff.address}.`);
    });

    // Tell the other devices about the widened window so the newly-included
    // riders start ringing too.
    const updated = get().orders.find(o => o.id === orderId);
    if (updated?.dispatchedTo) {
      try {
        syncService.broadcastDispatchExpanded(orderId, updated.dispatchedTo);
      } catch (err) {
        console.warn('[orderStore] broadcastDispatchExpanded failed:', err);
      }
    }
  },

  // ── Periodic sweep (called every 15 s from App.tsx) ───────────────
  // 1. Instant orders pending > 5 min → cancel ('no_riders_available').
  // 2. Scheduled orders within 30 min of scheduledFor → start the same
  //    staged dispatch instant orders use (nearest rider first), and let
  //    expandOrderDispatch keep widening every ~15 s.
  // 3. Scheduled orders still pending > 15 min past scheduledFor →
  //    cancel ('no_riders_available_scheduled').
  sweepExpiredOrders: () => {
    const now = Date.now();
    const ordersNow = get().orders;
    const toCancel: { id: string; customerId: string; reason: string; scheduled: boolean }[] = [];

    for (const o of ordersNow) {
      if (o.status !== 'pending') continue;
      const scheduled = (o.orderType || 'instant') === 'scheduled';

      if (!scheduled) {
        if (now - o.createdAt > AUTO_CANCEL_MS) {
          toCancel.push({ id: o.id, customerId: o.customerId, reason: 'no_riders_available', scheduled: false });
        }
        continue;
      }

      const when = o.scheduledFor ?? o.createdAt;

      // 2) Start dispatch ~30 min before the scheduled time (but not for
      //    orders already past the grace window — those just get cancelled)
      if (now >= when - SCHEDULED_DISPATCH_WINDOW_MS && now <= when + SCHEDULED_GRACE_MS && (o.dispatchedTo || []).length === 0) {
        const ranked = get().getRankedRidersForOrder(o);
        if (ranked.length > 0) {
          const firstId = ranked[0].id;
          set(s => ({
            orders: s.orders.map(x =>
              x.id === o.id && x.status === 'pending' ? { ...x, dispatchedTo: [firstId] } : x,
            ),
          }));
          // Notify online riders that a scheduled delivery is coming up
          const onlineRiders = useAuthStore.getState().allUsers.filter(
            u => u.role === 'rider' && (u as { availability?: string }).availability === 'online',
          );
          onlineRiders.forEach(r => {
            pushNotify(r.id, 'Scheduled Delivery Coming Up', `Order ${o.id} is due at ${formatDate(when)} — ${o.pickup.address} → ${o.dropoff.address}.`);
          });
          fireBrowserNotification('Scheduled Delivery Coming Up', `Order ${o.id} is due at ${formatDate(when)}.`);
        }
      }

      // 3) Missed the scheduled window entirely
      if (now > when + SCHEDULED_GRACE_MS) {
        toCancel.push({ id: o.id, customerId: o.customerId, reason: 'no_riders_available_scheduled', scheduled: true });
      }
    }

    if (toCancel.length === 0) return;

    const ids = new Set(toCancel.map(c => c.id));
    const reasonById = new Map(toCancel.map(c => [c.id, c.reason]));
    set(s => ({
      orders: s.orders.map(o =>
        ids.has(o.id) && o.status === 'pending'
          ? { ...o, status: 'cancelled' as OrderStatus, cancelReason: reasonById.get(o.id) }
          : o,
      ),
    }));

    toCancel.forEach(c => {
      const title = c.scheduled ? 'Scheduled Delivery Unfilled' : 'No Riders Available';
      const msg = c.scheduled
        ? `We couldn't find a rider for your scheduled delivery ${c.id} — please rebook or try again.`
        : `No riders were available for order ${c.id}. Please try again shortly.`;
      pushNotify(c.customerId, title, msg);
      fireBrowserNotification(title, msg);
    });
  },

  getOrdersByCustomer: (customerId) => get().orders.filter(o => o.customerId === customerId),
  getOrdersByRider: (riderId) => get().orders.filter(o => o.riderId === riderId),
  getPendingOrders: () => get().orders.filter(o => o.status === 'pending'),
  getActiveOrders: () => get().orders.filter(o => ['accepted', 'picked_up', 'in_transit'].includes(o.status)),
  getTotalRevenue: () => get().orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + o.price, 0),
}), { name: 'db-orders' }));
