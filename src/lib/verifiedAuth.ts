import type { SupabaseClient } from '@supabase/supabase-js';

/** Google-only identity helpers. These are a development preview and do not
 * secure the live app until the matching server authorization is deployed. */
export type AccountRole = 'customer' | 'rider' | 'manager';
export type LinkedIdentity = { app_user_id: string; app_role: AccountRole };

export function createVerifiedAuth(client: SupabaseClient) {
  return {
    async signInWithGoogle(redirectTo: string) {
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) throw error;
    },
    async registerGoogleProfile(name: string, phone?: string): Promise<LinkedIdentity> {
      const { data: current, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!current.user?.email_confirmed_at) throw new Error('A verified Google account is required.');
      // The server determines the role. No role is supplied by the browser.
      const { data, error } = await client.rpc('register_google_profile', { p_name: name, p_phone: phone || null });
      if (error) throw error;
      if (!Array.isArray(data) || data.length !== 1 || typeof data[0].app_user_id !== 'string' ||
          !['customer', 'rider', 'manager'].includes(data[0].app_role)) {
        throw new Error('Profile registration did not complete.');
      }
      return data[0] as LinkedIdentity;
    },
    async getLinkedIdentities(): Promise<LinkedIdentity[]> {
      const { data: current, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!current.user?.email_confirmed_at) return [];
      const { data, error } = await client.rpc('my_deliveryboys_identities');
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Account identities unavailable.');
      return data.filter((row): row is LinkedIdentity => typeof row.app_user_id === 'string' && ['customer','rider','manager'].includes(row.app_role));
    },
  };
}
