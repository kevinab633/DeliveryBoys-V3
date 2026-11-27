import type { SupabaseClient } from '@supabase/supabase-js';
import type { User, RiderProfile } from './types';

type AppProfile = User | RiderProfile;
type Dependencies = { client: SupabaseClient; fetchById: (id: string) => Promise<AppProfile | null> };

/** Link the current verified Supabase identity without passing a role or an
 * email from the browser. The server returns review rather than choosing among
 * duplicate legacy records. This is not an authorization boundary while the
 * public users policies remain in place. */
export function createLinkedAccount({ client, fetchById }: Dependencies) {
  return async (): Promise<AppProfile> => {
    const { data, error } = await client.rpc('link_auth_user');
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== 1) throw new Error('Unable to link your account. Please contact support.');
    const result = data[0];
    if (result?.result === 'account needs review') throw new Error('Your account needs review. Please contact support.');
    if (result?.result !== 'linked' || typeof result.user_id !== 'string' || !result.user_id) throw new Error('Unable to link your account. Please contact support.');
    const profile = await fetchById(result.user_id);
    if (!profile || profile.id !== result.user_id || !['customer', 'rider', 'manager'].includes(profile.role)) {
      throw new Error('Your account profile is unavailable. Please contact support.');
    }
    return profile;
  };
}
