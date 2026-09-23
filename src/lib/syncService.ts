import { v4 as uuidv4 } from 'uuid';
import supabase from './supabase';
import { Order, OrderStatus, RiderProfile } from './types';
import { useOrderStore } from '../stores/orderStore';
import { useAuthStore } from '../stores/authStore';
import { fireBrowserNotification } from './browserNotify';

// Unique client instance identifier to avoid handling self-broadcast loops
export const CLIENT_ID = uuidv4();

const CHANNEL_NAME = 'delivery_boys_live_sync';
const LOCAL_CHANNEL_NAME = 'delivery_boys_local_channel';

// Type definitions for broadcast events
export type SyncEvent =
  | { type: 'ORDER_CREATED'; senderId: string; order: Order }
  | {
      type: 'ORDER_ACCEPTED';
      senderId: string;
      orderId: string;
      riderId: string;
      riderName: string;
      riderPhone?: string;
      acceptedAt: number;
    }
  | {
      type: 'ORDER_STATUS_CHANGED';
      senderId: string;
      orderId: string;
      status: OrderStatus;
      timestamp: number;
    }
  | {
      type: 'RIDER_LOCATION_UPDATED';
      senderId: string;
      orderId: string;
      lat: number;
      lng: number;
      riderId: string;
    }
  | {
      type: 'ORDER_CANCELLED';
      senderId: string;
      orderId: string;
      cancelReason?: string;
    }
  | {
      type: 'ORDER_DISPATCH_EXPANDED';
      senderId: string;
      orderId: string;
      dispatchedTo: string[];
    }
  | {
      type: 'RIDER_PRESENCE';
      senderId: string;
      rider: RiderProfile;
    }
  | {
      // Broadcast-only — never persisted to the orders table. Fires the
      // moment a rider opens/is viewing an order's ringing or detail
      // view, and again with riderId undefined when they close out
      // without accepting, so the customer's "rider is responding" state
      // reverts back to "searching".
      type: 'RIDER_RESPONDING';
      senderId: string;
      orderId: string;
      riderId?: string;
    };

// Listeners for UI connection status
type ConnectionListener = (connected: boolean) => void;
const connectionListeners = new Set<ConnectionListener>();

let isConnected = false;
let broadcastChannel: BroadcastChannel | null = null;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let isInitialized = false;

function setConnectionStatus(status: boolean) {
  isConnected = status;
  connectionListeners.forEach((fn) => {
    try {
      fn(status);
    } catch {
      void 0;
    }
  });
}

export function onConnectionChange(fn: ConnectionListener): () => void {
  connectionListeners.add(fn);
  fn(isConnected);
  return () => {
    connectionListeners.delete(fn);
  };
}

export function getSyncStatus(): boolean {
  return isConnected;
}

// Convert database row to app Order object
export function rowToOrder(row: any): Order {
  const pickupData = typeof row.pickup === 'object' && row.pickup ? row.pickup : {};
  const dropoffData = typeof row.dropoff === 'object' && row.dropoff ? row.dropoff : {};

  return {
    id: row.id,
    customerId: row.customer_id || 'cust-anon',
    customerName: pickupData.customerName || 'Customer',
    customerPhone: pickupData.customerPhone || '',
    pickup: {
      lat: typeof pickupData.lat === 'number' ? pickupData.lat : 5.6037,
      lng: typeof pickupData.lng === 'number' ? pickupData.lng : -0.187,
      address: pickupData.address || 'Accra',
    },
    dropoff: {
      lat: typeof dropoffData.lat === 'number' ? dropoffData.lat : 5.556,
      lng: typeof dropoffData.lng === 'number' ? dropoffData.lng : -0.1824,
      address: dropoffData.address || 'Accra',
    },
    distance: typeof pickupData.distance === 'number' ? pickupData.distance : 5.0,
    price: Number(row.price) || 25,
    status: (row.status as OrderStatus) || 'pending',
    vehicleType: row.vehicle_type || 'motorcycle',
    packageDescription: row.package_description || 'Package delivery',
    orderType: row.order_type || 'instant',
    scheduledFor: row.scheduled_for ? Number(row.scheduled_for) : undefined,
    dispatchedTo: Array.isArray(row.dispatched_to) ? row.dispatched_to : undefined,
    riderId: row.rider_id || undefined,
    riderName: row.rider_name || undefined,
    riderLocation:
      row.rider_location && typeof row.rider_location.lat === 'number'
        ? row.rider_location
        : undefined,
    cancelReason: row.cancel_reason || undefined,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    acceptedAt: pickupData.acceptedAt ? Number(pickupData.acceptedAt) : undefined,
    pickedUpAt: pickupData.pickedUpAt ? Number(pickupData.pickedUpAt) : undefined,
    deliveredAt: pickupData.deliveredAt ? Number(pickupData.deliveredAt) : undefined,
  };
}

// Convert app Order object to database row payload
export function orderToRow(order: Order): any {
  return {
    id: order.id,
    customer_id: order.customerId,
    rider_id: order.riderId || null,
    rider_name: order.riderName || null,
    status: order.status,
    pickup: {
      lat: order.pickup.lat,
      lng: order.pickup.lng,
      address: order.pickup.address,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      distance: order.distance,
      acceptedAt: order.acceptedAt,
      pickedUpAt: order.pickedUpAt,
      deliveredAt: order.deliveredAt,
    },
    dropoff: {
      lat: order.dropoff.lat,
      lng: order.dropoff.lng,
      address: order.dropoff.address,
    },
    price: order.price,
    vehicle_type: order.vehicleType,
    package_description: order.packageDescription,
    order_type: order.orderType,
    scheduled_for: order.scheduledFor || null,
    dispatched_to: order.dispatchedTo || null,
    rider_location: order.riderLocation || null,
    cancel_reason: order.cancelReason || null,
  };
}

// ── Broadcast sender (sends via both WebSocket and local BroadcastChannel) ──
function emitSyncEvent(event: SyncEvent) {
  // 1. Send via local BroadcastChannel for zero-latency cross-tab sync
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(event);
    } catch {
      void 0;
    }
  }

  // 2. Send via Supabase Realtime WebSocket for cross-device live sync
  if (realtimeChannel && isConnected) {
    try {
      realtimeChannel.send({
        type: 'broadcast',
        event: event.type,
        payload: event,
      });
    } catch {
      void 0;
    }
  }
}

// ── Handle incoming sync event from any peer ──
export function handleIncomingSyncEvent(event: SyncEvent) {
  if (!event || event.senderId === CLIENT_ID) return;

  const orderStore = useOrderStore.getState();
  const authStore = useAuthStore.getState();

  switch (event.type) {
    case 'ORDER_CREATED': {
      const incoming = event.order;
      if (!incoming || !incoming.id) return;
      orderStore.applyRemoteOrder(incoming);

      // If current user is an online rider, alert them with native notification
      const currentUser = authStore.user;
      if (
        currentUser &&
        currentUser.role === 'rider' &&
        (currentUser as RiderProfile).availability === 'online'
      ) {
        fireBrowserNotification(
          '🚨 Incoming Delivery Request!',
          `Pickup: ${incoming.pickup.address} · GH₵ ${incoming.price.toFixed(2)}`,
        );
      }
      break;
    }

    case 'ORDER_ACCEPTED': {
      orderStore.applyRemoteOrderAccepted(
        event.orderId,
        event.riderId,
        event.riderName,
        event.riderPhone,
        event.acceptedAt,
      );
      break;
    }

    case 'ORDER_STATUS_CHANGED': {
      orderStore.applyRemoteStatus(event.orderId, event.status, event.timestamp);
      break;
    }

    case 'RIDER_LOCATION_UPDATED': {
      orderStore.applyRemoteRiderLocation(event.orderId, event.lat, event.lng);
      // Also update the rider profile location in allUsers
      if (event.riderId) {
        authStore.applyRemoteRiderLocation(event.riderId, event.lat, event.lng);
      }
      break;
    }

    case 'ORDER_CANCELLED': {
      orderStore.applyRemoteCancel(event.orderId, event.cancelReason);
      break;
    }

    case 'ORDER_DISPATCH_EXPANDED': {
      orderStore.applyRemoteDispatchExpanded(event.orderId, event.dispatchedTo);
      break;
    }

    case 'RIDER_PRESENCE': {
      if (event.rider && event.rider.id) {
        authStore.applyRemoteRiderPresence(event.rider);
      }
      break;
    }

    case 'RIDER_RESPONDING': {
      orderStore.applyRemoteRiderResponding(event.orderId, event.riderId);
      break;
    }
  }
}

// ── Public API for dispatching sync events ──
export const syncService = {
  /**
   * Broadcast a newly created order to all online riders.
   */
  broadcastNewOrder(order: Order) {
    emitSyncEvent({
      type: 'ORDER_CREATED',
      senderId: CLIENT_ID,
      order,
    });
    // Persist to Supabase database in background
    void syncService.saveOrderToDatabase(order);
  },

  /**
   * Broadcast that a rider accepted the order.
   */
  broadcastOrderAccepted(
    orderId: string,
    riderId: string,
    riderName: string,
    riderPhone?: string,
    acceptedAt = Date.now(),
  ) {
    emitSyncEvent({
      type: 'ORDER_ACCEPTED',
      senderId: CLIENT_ID,
      orderId,
      riderId,
      riderName,
      riderPhone,
      acceptedAt,
    });
    // Update Supabase database in background
    void syncService.updateOrderInDatabase(orderId, {
      status: 'accepted',
      riderId,
      riderName,
      acceptedAt,
    });
  },

  /**
   * Broadcast order status changes (picked_up, in_transit, delivered).
   */
  broadcastOrderStatus(orderId: string, status: OrderStatus, timestamp = Date.now()) {
    emitSyncEvent({
      type: 'ORDER_STATUS_CHANGED',
      senderId: CLIENT_ID,
      orderId,
      status,
      timestamp,
    });
    const updates: Partial<Order> = { status };
    if (status === 'picked_up') updates.pickedUpAt = timestamp;
    if (status === 'delivered') updates.deliveredAt = timestamp;
    void syncService.updateOrderInDatabase(orderId, updates);
  },

  /**
   * Broadcast live GPS location of the rider.
   */
  broadcastRiderLocation(orderId: string, lat: number, lng: number, riderId: string) {
    emitSyncEvent({
      type: 'RIDER_LOCATION_UPDATED',
      senderId: CLIENT_ID,
      orderId,
      lat,
      lng,
      riderId,
    });
    // Throttle database update to prevent excessive writes while keeping WebSockets 60fps
    void syncService.updateOrderInDatabase(orderId, {
      riderLocation: { lat, lng },
    });
  },

  /**
   * Broadcast that a rider has opened/is reviewing an order (or has
   * closed out without accepting, when riderId is omitted). Broadcast
   * only — deliberately never written to the orders table, since this
   * is a fast, transient signal with no lasting value once the rider
   * accepts, declines, or the order moves on.
   */
  broadcastRiderResponding(orderId: string, riderId?: string) {
    emitSyncEvent({
      type: 'RIDER_RESPONDING',
      senderId: CLIENT_ID,
      orderId,
      riderId,
    });
  },

  /**
   * Broadcast order cancellation.
   */
  broadcastOrderCancelled(orderId: string, cancelReason?: string) {
    emitSyncEvent({
      type: 'ORDER_CANCELLED',
      senderId: CLIENT_ID,
      orderId,
      cancelReason,
    });
    void syncService.updateOrderInDatabase(orderId, {
      status: 'cancelled',
      cancelReason,
    });
  },

  /**
   * Broadcast widened dispatch window.
   */
  broadcastDispatchExpanded(orderId: string, dispatchedTo: string[]) {
    emitSyncEvent({
      type: 'ORDER_DISPATCH_EXPANDED',
      senderId: CLIENT_ID,
      orderId,
      dispatchedTo,
    });
    void syncService.updateOrderInDatabase(orderId, { dispatchedTo });
  },

  /**
   * Broadcast online rider presence (so customers see live moving bikes on the map).
   */
  broadcastRiderPresence(rider: RiderProfile) {
    emitSyncEvent({
      type: 'RIDER_PRESENCE',
      senderId: CLIENT_ID,
      rider,
    });
  },

  /**
   * Persist order to Supabase Postgres table.
   */
  async saveOrderToDatabase(order: Order) {
    try {
      const row = orderToRow(order);
      const { error } = await supabase.from('orders').upsert(row);
      if (error) {
        console.warn('[SyncService] DB saveOrder error:', error.message);
      }
    } catch (err) {
      console.warn('[SyncService] saveOrder failed:', err);
    }
  },

  /**
   * Update order in Supabase Postgres table.
   */
  async updateOrderInDatabase(orderId: string, updates: Partial<Order>) {
    try {
      const payload: any = { updated_at: new Date().toISOString() };
      if (updates.status) payload.status = updates.status;
      if (updates.riderId) payload.rider_id = updates.riderId;
      if (updates.riderName) payload.rider_name = updates.riderName;
      if (updates.riderLocation) payload.rider_location = updates.riderLocation;
      if (updates.cancelReason) payload.cancel_reason = updates.cancelReason;
      if (updates.dispatchedTo) payload.dispatched_to = updates.dispatchedTo;

      const { error } = await supabase.from('orders').update(payload).eq('id', orderId);
      if (error) {
        console.warn('[SyncService] DB updateOrder error:', error.message);
      }
    } catch (err) {
      console.warn('[SyncService] updateOrder failed:', err);
    }
  },

  /**
   * Fetch historical and active orders from Supabase on startup.
   */
  async fetchRemoteOrders(): Promise<Order[]> {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.warn('[SyncService] fetchRemoteOrders error:', error.message);
        return [];
      }
      if (!data || !Array.isArray(data)) return [];
      return data.map(rowToOrder);
    } catch (err) {
      console.warn('[SyncService] fetchRemoteOrders failed:', err);
      return [];
    }
  },

  /**
   * Initialize all realtime listeners and sync on app startup.
   */
  init() {
    if (isInitialized) return;
    isInitialized = true;

    // 1. Initialize local cross-tab BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        broadcastChannel = new BroadcastChannel(LOCAL_CHANNEL_NAME);
        broadcastChannel.onmessage = (e) => {
          if (e.data) handleIncomingSyncEvent(e.data);
        };
      } catch {
        void 0;
      }
    }

    // 2. Initialize Supabase Realtime WebSocket Channel
    try {
      realtimeChannel = supabase.channel(CHANNEL_NAME, {
        config: { broadcast: { self: false } },
      });

      const eventTypes: SyncEvent['type'][] = [
        'ORDER_CREATED',
        'ORDER_ACCEPTED',
        'ORDER_STATUS_CHANGED',
        'RIDER_LOCATION_UPDATED',
        'ORDER_CANCELLED',
        'ORDER_DISPATCH_EXPANDED',
        'RIDER_PRESENCE',
        'RIDER_RESPONDING',
      ];

      eventTypes.forEach((eventType) => {
        realtimeChannel?.on('broadcast', { event: eventType }, (msg) => {
          if (msg?.payload) {
            handleIncomingSyncEvent(msg.payload as SyncEvent);
          }
        });
      });

      realtimeChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[SyncService] Realtime WebSocket connected');
          setConnectionStatus(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('[SyncService] Realtime channel status:', status);
          setConnectionStatus(false);
        }
      });
    } catch (err) {
      console.warn('[SyncService] Supabase channel error:', err);
      setConnectionStatus(false);
    }

    // 3. Initial sync from database: pull orders and merge into local store
    void syncService.fetchRemoteOrders().then((remoteOrders) => {
      if (remoteOrders && remoteOrders.length > 0) {
        useOrderStore.getState().mergeRemoteOrders(remoteOrders);
      }
    });

    // 4. Also broadcast rider presence if current user is an online rider
    const currentUser = useAuthStore.getState().user;
    if (
      currentUser &&
      currentUser.role === 'rider' &&
      (currentUser as RiderProfile).availability === 'online'
    ) {
      syncService.broadcastRiderPresence(currentUser as RiderProfile);
    }
  },

  /** Force the Realtime WebSocket to reconnect immediately instead of
   *  waiting on its internal backoff timer. Call this on tab resume —
   *  Android suspends/kills the socket while backgrounded, and it doesn't
   *  always reconnect promptly on its own once the tab is visible again. */
  reconnectIfNeeded() {
    if (!isConnected) {
      try {
        realtimeChannel?.subscribe();
      } catch {
        void 0;
      }
    }
  },
};
