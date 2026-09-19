import supabase from './db-client.js';

// ── Row <-> Order mapping ──────────────────────────────────────────────
// The REAL `orders` table shape (confirmed directly via SQL — do NOT
// recreate or alter it):
//   - `pickup` / `dropoff` are single jsonb columns:
//       { lat, lng, address, customerName?, customerPhone?, distance?, ... }
//   - `rider_location` is a single jsonb column: { lat, lng } | null
//   - There are NO customer_name / customer_phone / distance /
//     accepted_at / picked_up_at / delivered_at / rider_lat / rider_lng /
//     pickup_lat / ... flat columns — those values live inside the jsonb
//     blobs (customerName/customerPhone/distance inside `pickup`).
//   - created_at / updated_at / scheduled_for are timestamptz.
//   - id is uuid.
// The frontend Order type (see src/lib/types.ts) uses camelCase with
// nested objects + millisecond numbers, so this file translates both ways.
function toMs(v, fallback) {
  if (v == null) return fallback;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? fallback : t;
}

function toISO(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function newUuid() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch { /* fall through to manual generation */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

function rowToOrder(r) {
  const pickup = r.pickup && typeof r.pickup === 'object' ? r.pickup : {};
  const dropoff = r.dropoff && typeof r.dropoff === 'object' ? r.dropoff : {};
  const rl = r.rider_location && typeof r.rider_location === 'object' ? r.rider_location : null;
  return {
    id: r.id,
    customerId: r.customer_id ?? '',
    customerName: pickup.customerName ?? '',
    customerPhone: pickup.customerPhone ?? '',
    riderId: r.rider_id ?? undefined,
    riderName: r.rider_name ?? undefined,
    pickup: {
      lat: Number(pickup.lat ?? 0) || 0,
      lng: Number(pickup.lng ?? 0) || 0,
      address: pickup.address ?? '',
    },
    dropoff: {
      lat: Number(dropoff.lat ?? 0) || 0,
      lng: Number(dropoff.lng ?? 0) || 0,
      address: dropoff.address ?? '',
    },
    distance: pickup.distance != null ? Number(pickup.distance) || 0 : 0,
    price: r.price != null ? Number(r.price) : 0,
    status: r.status,
    vehicleType: r.vehicle_type,
    packageDescription: r.package_description ?? pickup.packageDescription ?? '',
    createdAt: toMs(r.created_at, Date.now()),
    acceptedAt: pickup.acceptedAt != null ? Number(pickup.acceptedAt) : undefined,
    pickedUpAt: pickup.pickedUpAt != null ? Number(pickup.pickedUpAt) : undefined,
    deliveredAt: pickup.deliveredAt != null ? Number(pickup.deliveredAt) : undefined,
    riderLocation:
      rl && rl.lat != null && rl.lng != null
        ? { lat: Number(rl.lat), lng: Number(rl.lng) }
        : undefined,
    orderType: r.order_type || 'instant',
    scheduledFor: r.scheduled_for != null ? toMs(r.scheduled_for, undefined) : undefined,
    dispatchedTo: r.dispatched_to ?? undefined,
    cancelReason: r.cancel_reason ?? undefined,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // ── GET /api/orders?id=&customerId=&riderId=&status=&limit= ───────
    if (req.method === 'GET') {
      // Temporary version marker to prove which code is live.
      if ((req.query || {}).version === 'check') {
        return res.status(200).json({ version: 'dropoff-jsonb-fix-v1', deployedCode: true });
      }
      const { id, customerId, riderId, status, limit } = req.query || {};
      // id is uuid — a non-uuid id can never match, so short-circuit
      // instead of sending it to PostgREST (which would 400).
      if (id && !isUuid(id)) return res.status(200).json([]);
      let q = supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (id) q = q.eq('id', id);
      if (customerId) q = q.eq('customer_id', customerId);
      if (riderId) q = q.eq('rider_id', riderId);
      if (status) q = q.eq('status', status);
      if (limit) q = q.limit(Math.min(parseInt(limit, 10) || 50, 200));
      else q = q.limit(200);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json((data || []).map(rowToOrder));
    }

    // ── POST /api/orders — create an order ────────────────────────────
    // Writes the REAL shape: customerName/customerPhone/distance nested
    // inside the `pickup` jsonb object (no separate columns exist for
    // them), pickup/dropoff/rider_location as single jsonb objects,
    // timestamps as timestamptz ISO strings.
    if (req.method === 'POST') {
      console.log('[orders API] POST body received:', JSON.stringify(req.body));
      const b = req.body || {};
      if (!b.customerId) {
        return res.status(400).json({ error: 'customerId is required' });
      }
      if (!b.pickup || typeof b.pickup.lat !== 'number' || typeof b.pickup.lng !== 'number' || !b.pickup.address) {
        return res.status(400).json({ error: 'pickup { lat, lng, address } is required' });
      }
      if (!b.dropoff || typeof b.dropoff.lat !== 'number' || typeof b.dropoff.lng !== 'number' || !b.dropoff.address) {
        return res.status(400).json({ error: 'dropoff { lat, lng, address } is required' });
      }
      if (b.distance == null || b.price == null) {
        return res.status(400).json({ error: 'distance and price are required' });
      }
      const pickupJson = {
        lat: b.pickup.lat,
        lng: b.pickup.lng,
        address: b.pickup.address,
        customerName: b.customerName ?? '',
        customerPhone: b.customerPhone ?? '',
        distance: b.distance,
      };
      if (b.packageDescription) pickupJson.packageDescription = b.packageDescription;
      if (b.acceptedAt !== undefined) pickupJson.acceptedAt = b.acceptedAt;
      if (b.pickedUpAt !== undefined) pickupJson.pickedUpAt = b.pickedUpAt;
      if (b.deliveredAt !== undefined) pickupJson.deliveredAt = b.deliveredAt;
      const row = {
        // id column is uuid — mint one unless the caller sent a valid uuid.
        id: isUuid(b.id) ? b.id : newUuid(),
        customer_id: b.customerId,
        rider_id: b.riderId ?? null,
        rider_name: b.riderName ?? null,
        status: b.status || 'pending',
        pickup: pickupJson,
        dropoff: { lat: b.dropoff.lat, lng: b.dropoff.lng, address: b.dropoff.address },
        price: b.price,
        vehicle_type: b.vehicleType || 'motorcycle',
        package_description: b.packageDescription || null,
        order_type: b.orderType || 'instant',
        scheduled_for: toISO(b.scheduledFor),
        dispatched_to: b.dispatchedTo ?? null,
        rider_location: b.riderLocation ? { lat: b.riderLocation.lat, lng: b.riderLocation.lng } : null,
        cancel_reason: b.cancelReason ?? null,
        created_at: toISO(b.createdAt) ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('orders').insert(row).select().single();
      if (error) throw error;
      return res.status(201).json(rowToOrder(data));
    }

    // ── PATCH /api/orders — accept / status / location / dispatch ─────
    if (req.method === 'PATCH') {
      const b = req.body || {};
      const { id } = b;
      if (!id) return res.status(400).json({ error: 'id is required' });
      if (!isUuid(id)) return res.status(404).json({ error: 'Order not found' });

      // Read the current row first: needed for the accept race-guard and
      // for merging into the pickup/rider_location jsonb blobs.
      const { data: current, error: fetchErr } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr) {
        if (fetchErr.code === 'PGRST116') return res.status(404).json({ error: 'Order not found' });
        throw fetchErr;
      }

      // Race-condition safety for accept: only a pending order can be
      // accepted. If another rider already won, return 409 (frontend keeps
      // its local state and shows "already taken").
      if (b.status === 'accepted' && current.status !== 'pending') {
        return res.status(409).json({ error: 'Order is no longer available', status: current.status });
      }

      const updates = { updated_at: new Date().toISOString() };
      if (b.status !== undefined) updates.status = b.status;
      if (b.riderId !== undefined) updates.rider_id = b.riderId;
      if (b.riderName !== undefined) updates.rider_name = b.riderName;

      // Rider location -> single rider_location jsonb object.
      if (b.riderLocation !== undefined) {
        updates.rider_location = b.riderLocation
          ? { lat: b.riderLocation.lat, lng: b.riderLocation.lng }
          : null;
      } else if (b.riderLat !== undefined || b.riderLng !== undefined) {
        const prev = current.rider_location && typeof current.rider_location === 'object'
          ? current.rider_location
          : {};
        updates.rider_location = {
          lat: b.riderLat !== undefined ? b.riderLat : prev.lat,
          lng: b.riderLng !== undefined ? b.riderLng : prev.lng,
        };
      }

      // pickup jsonb merge: customerName/customerPhone/distance/
      // packageDescription live here (no columns), and lifecycle
      // timestamps are stashed here too (no accepted_at / picked_up_at /
      // delivered_at columns exist).
      const prevPickup = current.pickup && typeof current.pickup === 'object' ? current.pickup : {};
      let nextPickup = null;
      const mergePickup = (obj) => { nextPickup = { ...(nextPickup || prevPickup), ...obj }; };
      if (b.pickup && typeof b.pickup === 'object') {
        const p = {};
        if (b.pickup.lat !== undefined) p.lat = b.pickup.lat;
        if (b.pickup.lng !== undefined) p.lng = b.pickup.lng;
        if (b.pickup.address !== undefined) p.address = b.pickup.address;
        if (Object.keys(p).length > 0) mergePickup(p);
      }
      if (b.customerName !== undefined) mergePickup({ customerName: b.customerName });
      if (b.customerPhone !== undefined) mergePickup({ customerPhone: b.customerPhone });
      if (b.distance !== undefined) mergePickup({ distance: b.distance });
      if (b.packageDescription !== undefined) {
        updates.package_description = b.packageDescription;
        mergePickup({ packageDescription: b.packageDescription });
      }
      if (b.acceptedAt !== undefined) mergePickup({ acceptedAt: b.acceptedAt });
      if (b.pickedUpAt !== undefined) mergePickup({ pickedUpAt: b.pickedUpAt });
      if (b.deliveredAt !== undefined) mergePickup({ deliveredAt: b.deliveredAt });
      // Auto-stamp lifecycle timestamps when the caller only sends status.
      if (b.status === 'accepted' && b.acceptedAt === undefined && prevPickup.acceptedAt === undefined) {
        mergePickup({ acceptedAt: Date.now() });
      }
      if (b.status === 'picked_up' && b.pickedUpAt === undefined && prevPickup.pickedUpAt === undefined) {
        mergePickup({ pickedUpAt: Date.now() });
      }
      if (b.status === 'delivered' && b.deliveredAt === undefined && prevPickup.deliveredAt === undefined) {
        mergePickup({ deliveredAt: Date.now() });
      }
      if (nextPickup) updates.pickup = nextPickup;

      // dropoff jsonb merge (partial updates preserve existing keys).
      if (b.dropoff && typeof b.dropoff === 'object') {
        const prevDrop = current.dropoff && typeof current.dropoff === 'object' ? current.dropoff : {};
        const d = {};
        if (b.dropoff.lat !== undefined) d.lat = b.dropoff.lat;
        if (b.dropoff.lng !== undefined) d.lng = b.dropoff.lng;
        if (b.dropoff.address !== undefined) d.address = b.dropoff.address;
        if (Object.keys(d).length > 0) updates.dropoff = { ...prevDrop, ...d };
      }

      if (b.dispatchedTo !== undefined) updates.dispatched_to = b.dispatchedTo;
      if (b.cancelReason !== undefined) updates.cancel_reason = b.cancelReason;
      if (b.scheduledFor !== undefined) updates.scheduled_for = toISO(b.scheduledFor);
      if (b.orderType !== undefined) updates.order_type = b.orderType;
      if (b.price !== undefined) updates.price = b.price;

      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ error: 'Order not found' });
        throw error;
      }
      return res.status(200).json(rowToOrder(data));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API /api/orders error (full object):', JSON.stringify(err, Object.getOwnPropertyNames(err), 2), err?.stack);
    console.error('API /api/orders error:', err);
    return res.status(500).json({ error: err.message });
  }
}
