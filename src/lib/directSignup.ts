import type { SupabaseClient } from '@supabase/supabase-js';
import type { VehicleType } from './types';

type CustomerInput = { name: string; email?: string; phone?: string };
type RiderInput = CustomerInput & { vehicleType: VehicleType; vehiclePlate: string; nationalIdUrl: string; photoUrl: string };

async function register(client: SupabaseClient, operation: string, parameters: Record<string, unknown>, expectedRole: 'customer' | 'rider') {
  const { data, error } = await client.rpc(operation, parameters);
  if (error) {
    if (error.code === '23505') throw new Error('An account for this email or phone already exists. Sign in instead.');
    if (error.code === '42501') throw new Error('This email cannot be used to sign up. Please contact support.');
    console.warn('[signup] Server registration unavailable:', error.code || 'unknown error');
    throw new Error('Sign-up is temporarily unavailable. Please try again later.');
  }
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || typeof row.id !== 'string' || row.role !== expectedRole ||
      (expectedRole === 'rider' && (row.status !== 'pending' || row.availability !== 'offline'))) {
    throw new Error('Sign-up could not be confirmed. Please contact support.');
  }
  return row;
}

/** Separate server operations assign customer or pending rider. No role, id,
 * approval status or availability is supplied by the browser. */
export function requestCustomerSignup(client: SupabaseClient, data: CustomerInput) {
  return register(client, 'register_direct_customer', {
    p_name: data.name, p_email: data.email || null, p_phone: data.phone || null,
  }, 'customer');
}

export function requestRiderSignup(client: SupabaseClient, data: RiderInput) {
  return register(client, 'register_direct_rider', {
    p_name: data.name, p_email: data.email || null, p_phone: data.phone || null,
    p_vehicle_type: data.vehicleType, p_vehicle_plate: data.vehiclePlate,
    p_national_id_url: data.nationalIdUrl || null, p_photo_url: data.photoUrl || null,
  }, 'rider');
}
