import type { SupabaseClient } from '@supabase/supabase-js';

// The function returns only the caller's linked app user ID when pending.
export async function isOwnPendingRiderApplication(client: SupabaseClient, appUserId: string): Promise<boolean> {
  const { data, error } = await client.rpc('my_pending_step2_rider_user_id');
  if (error) throw error;
  return typeof data === 'string' && data === appUserId;
}
