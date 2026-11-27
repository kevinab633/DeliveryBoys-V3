import type { SupabaseClient } from '@supabase/supabase-js';

// Preliminary client only: server-side identity and role enforcement must be
// implemented and tested before this can replace the existing sign-in flow.
const managerEmail = 'support.deliveryboysgh@gmail.com';
function customerEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!value || !value.includes('@')) throw new Error('Enter a valid email address.');
  if (value === managerEmail) throw new Error('The manager account must use Google sign-in.');
  return value;
}

export function createEmailPasswordAuth(client: SupabaseClient) {
  return {
    async signUp(email: string, password: string, redirectTo: string) {
      const { data, error } = await client.auth.signUp({
        email: customerEmail(email), password, options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      return data;
    },
    async signIn(email: string, password: string) {
      const { data, error } = await client.auth.signInWithPassword({ email: customerEmail(email), password });
      if (error) throw error;
      return data;
    },
    async resetPassword(email: string, redirectTo: string) {
      const { data, error } = await client.auth.resetPasswordForEmail(customerEmail(email), { redirectTo });
      if (error) throw error;
      return data;
    },
  };
}
