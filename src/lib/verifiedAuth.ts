import type { SupabaseClient } from '@supabase/supabase-js';

/** Authentication operations for the planned verified-account migration.
 * These functions alone do not secure the existing public database policies.
 * Do not switch the live UI to this flow before the migration is complete. */
export type SignupRole = 'customer' | 'rider';
export type LoginRole = SignupRole | 'manager';
export interface RegistrationDetails {
  role: SignupRole;
  name: string;
  phone?: string;
  vehicleType?: 'motorcycle' | 'car' | 'van' | 'truck';
  vehiclePlate?: string;
}

export function createVerifiedAuth(client: SupabaseClient) {
  return {
    async signIn(email: string, password: string) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (!data.user?.email_confirmed_at) {
        await client.auth.signOut();
        throw new Error('Verify your email before signing in.');
      }
    },

    async startEmailSignup(email: string, password: string) {
      if (!email.trim() || password.length < 8) throw new Error('Enter an email and a password of at least 8 characters.');
      const { error } = await client.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
      // With email confirmation enabled Supabase sends an OTP. Configure its
      // confirmation email template to include {{ .Token }} before rollout.
    },

    async verifySignupCode(email: string, code: string) {
      const { data, error } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'signup' });
      if (error) throw error;
      if (!data.session || !data.user?.email_confirmed_at) throw new Error('Email verification did not complete.');
    },

    async resendSignupCode(email: string) {
      const { error } = await client.auth.resend({ type: 'signup', email: email.trim() });
      if (error) throw error;
    },

    async requestPasswordReset(email: string, redirectTo: string) {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
    },

    async signInWithGoogle(redirectTo: string) {
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) throw error;
    },

    async registerProfile(details: RegistrationDetails) {
      if (details.role !== 'customer' && details.role !== 'rider') throw new Error('Invalid account role.');
      const { data: current, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!current.user?.email_confirmed_at) throw new Error('A verified email is required.');
      const { data, error } = await client.rpc('register_deliveryboys_profile', {
        p_role: details.role, p_name: details.name, p_phone: details.phone || null,
        p_vehicle_type: details.vehicleType || null, p_vehicle_plate: details.vehiclePlate || null,
      });
      if (error) throw error;
      if (!Array.isArray(data) || data.length !== 1 || data[0].app_role !== details.role || !data[0].app_user_id) {
        throw new Error('Profile registration did not complete.');
      }
      return data[0].app_user_id as string;
    },

    async getLinkedProfileId(role: LoginRole): Promise<string | null> {
      // getUser verifies with the auth server; local app role/contact is not
      // trusted as proof of identity or authority.
      const { data: current, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!current.user?.email_confirmed_at) return null;
      const { data, error } = await client.rpc('my_deliveryboys_identities');
      if (error) throw error;
      const identity = Array.isArray(data) ? data.find((row: { app_role: string }) => row.app_role === role) : null;
      return typeof identity?.app_user_id === 'string' ? identity.app_user_id : null;
    },
  };
}
