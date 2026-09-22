import supabase from './supabase';
import { User, RiderProfile, RiderStatus, RiderAvailability, VehicleType } from './types';

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
  return {
    ...base,
    role: 'rider',
    vehicleType: (row.vehicle_type as VehicleType) || 'motorcycle',
    vehiclePlate: row.vehicle_plate || '',
    status: (row.status as RiderStatus) || 'pending',
    availability: (row.availability as RiderAvailability) || 'offline',
    location: row.location || undefined,
    totalDeliveries: Number(row.total_deliveries) || 0,
    rating: Number(row.rating) || 0,
    earnings: Number(row.earnings) || 0,
    nationalIdUrl: row.national_id_url || undefined,
    photoUrl: row.photo_url || undefined,
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

  /** Look up one account by email or phone + role — used by login/signup
   *  find-or-create flows, matching the old in-memory .find() behavior. */
  async findByContact(contact: string, method: 'email' | 'phone', role: string): Promise<User | RiderProfile | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq(method, contact)
        .eq('role', role)
        .maybeSingle();
      if (error || !data) return null;
      return rowToUser(data);
    } catch (err) {
      console.warn('[usersApi] findByContact failed:', err);
      return null;
    }
  },
};
