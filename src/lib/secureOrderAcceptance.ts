import type { SupabaseClient } from '@supabase/supabase-js';

/** The server chooses the rider, name and timestamp from verified identity.
 * The UI must not update, broadcast or notify until this call succeeds. */
export async function requestSecureOrderAcceptance(client: SupabaseClient, orderId: string, expectedRiderId: string): Promise<Record<string, unknown>> {
  const { data, error } = await client.rpc('accept_delivery_order', { p_order_id: orderId });
  if (error) throw new Error(error.message || 'Order could not be accepted.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.id !== orderId || row.rider_id !== expectedRiderId || row.status !== 'accepted') {
    throw new Error('The server did not confirm this assignment.');
  }
  return row;
}
