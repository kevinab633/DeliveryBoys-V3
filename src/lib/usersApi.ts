import supabase from './supabase';
import { User, RiderProfile, RiderStatus, RiderAvailability, VehicleType } from './types';
import { findContactRow } from './contactLookup';
import { requestCustomerSignup, requestRiderSignup } from './directSignup';

/** Row shape as stored in Supabase (snake_case), mirrors the orders table's
 *  own convention in syncService.ts. */
function rowToUser(row: any): User | RiderProfile {
  const base: User = {
    id: row.id,
    name: row.name,
    email: row.email || undefined,
    phone: row.phone || undefined,
    role: row.role,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    verified: row.verified ?? true,
  };
  if (row.role !== 'rider') return base;
  const status = (row.status as RiderStatus) || 'pending';
  return {
    ...base,
    role: 'rider',
    vehicleType: (row.vehicle_type as VehicleType) || 'motorcycle',
    vehiclePlate: row.vehicle_plate || '',
    status,
    // A stale online value must not make a pending/rejected/suspended rider
    // appear available. The authoritative server guard is still a draft.
    availability: status === 'approved' ? ((row.availability as RiderAvailability) || 'offline') : 'offline',
    location: row.location || undefined,
    totalDeliveries: Number(row.total_deliveries) || 0,
    rating: Number(row.rating) || 0,
    earnings: Number(row.earnings) || 0,
    nationalIdUrl: row.national_id_url || undefined,
    photoUrl: row.photo_url || undefined,
    commissionSettledAt: row.commission_settled_at ? new Date(row.commission_settled_at).getTime() : undefined,
    commissionPaymentRequest: row.commission_payment_request || undefined,
  } as RiderProfile;
}

function userToRow(user: User | RiderProfile): any {
  const row: any = {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email || null,
    phone: user.phone || null,
    verified: user.verified,
    updated_at: new Date().toISOString(),
  };
  if (user.role === 'rider') {
    const r = user as RiderProfile;
    row.vehicle_type = r.vehicleType;
    row.vehicle_plate = r.vehiclePlate;
    row.status = r.status;
    row.availability = r.availability;
    row.location = r.location || null;
    row.total_deliveries = r.totalDeliveries || 0;
    row.rating = r.rating || 0;
    row.earnings = r.earnings || 0;
    row.national_id_url = r.nationalIdUrl || null;
    row.photo_url = r.photoUrl || null;
  }
  return row;
}

export const usersApi = {
  /** Fetch every account — used on app startup so allUsers reflects the
   *  real, shared table instead of each device's own local seed data. */
  async fetchAll(): Promise<(User | RiderProfile)[]> {
    try {
      const { data, error } = await supabase.from('users').select('*');
      if (error) {
        console.warn('[usersApi] fetchAll error:', error.message);
        return [];
      }
      return (data || []).map(rowToUser);
    } catch (err) {
      console.warn('[usersApi] fetchAll failed:', err);
      return [];
    }
  },

  /** Create or fully overwrite one account row — used on signup and for
   *  any full-profile save. Non-blocking: local state is always updated
   *  first by the caller, this just persists it in the background. */
  async upsert(user: User | RiderProfile): Promise<void> {
    try {
      const { error } = await supabase.from('users').upsert(userToRow(user));
      if (error) console.warn('[usersApi] upsert error:', error.message);
    } catch (err) {
      console.warn('[usersApi] upsert failed:', err);
    }
  },

  /** Fetch one linked app profile. Used by the verified sign-in flow. */
  async fetchById(userId: string): Promise<User | RiderProfile | null> {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data ? rowToUser(data) : null;
  },

  /** Partial update by id — for small, frequent changes (availability,
   *  location, delivery stats) where sending the whole row is wasteful. */
  async update(userId: string, patch: Record<string, any>): Promise<void> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) console.warn('[usersApi] update error:', error.message);
    } catch (err) {
      console.warn('[usersApi] update failed:', err);
    }
  },

  /** Existing accounts only. Errors are distinct from a genuine no-match. */
  async findByContact(contact: string, method: 'email' | 'phone', role: string): Promise<User | RiderProfile | null> {
    const row = await findContactRow(supabase, contact, method, role);
    return row ? rowToUser(row) : null;
  },

  /** These server functions are review-only drafts until explicitly deployed.
   * Never substitute a client-created row when an RPC is unavailable. */
  async registerCustomer(data: { name: string; email?: string; phone?: string }): Promise<User> {
    return rowToUser(await requestCustomerSignup(supabase, data)) as User;
  },

  async registerRider(data: { name: string; email?: string; phone?: string; vehicleType: VehicleType; vehiclePlate: string; nationalIdUrl: string; photoUrl: string }): Promise<RiderProfile> {
    return rowToUser(await requestRiderSignup(supabase, data)) as RiderProfile;
  },

  /** Only an approved row can be changed to online/busy, even if approval
   * changed after the preceding refresh. Errors are not hidden from callers. */
  async setRiderAvailability(userId: string, availability: RiderAvailability): Promise<RiderProfile | null> {
    let query = supabase.from('users')
      .update({ availability, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .eq('role', 'rider');
    if (availability !== 'offline') query = query.eq('status', 'approved');
    const { data, error } = await query.select('*').maybeSingle();
    if (error) throw error;
    return data ? rowToUser(data) as RiderProfile : null;
  },
};
