import type { SupabaseClient } from '@supabase/supabase-js';

/** Preview API: all authorization and settlement decisions belong to the
 * database. These calls require the as-yet-unreleased secure migrations. */
export interface CommissionCycle {
  id: string;
  week_start: string;
  week_end: string;
  deadline: string;
  amount_pesewas: number | string;
  state: 'unpaid' | 'pending' | 'rejected' | 'paid';
  proof_path: string | null;
}
export interface CommissionReview extends Omit<CommissionCycle, 'state'> { rider_id: string; }
export interface CommissionHold { rider_id: string; rider_name: string; overdue_remaining: boolean; }
const bucket = 'commission-proofs';
const allowed = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);

export function createWeeklyCommissionApi(client: SupabaseClient) {
  return {
    async cycles(): Promise<CommissionCycle[]> {
      const { data, error } = await client.rpc('my_commission_cycles');
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Could not load commission statements.');
      return data as CommissionCycle[];
    },
    async reviews(): Promise<CommissionReview[]> {
      const { data, error } = await client.rpc('pending_commission_reviews');
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Could not load payment reviews.');
      return data as CommissionReview[];
    },
    async holds(): Promise<CommissionHold[]> {
      const { data, error } = await client.rpc('commission_riders_needing_reapproval');
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Could not load rider holds.');
      return data as CommissionHold[];
    },
    async report(cycleId: string, file: File) {
      const ext = allowed.get(file.type);
      if (!ext || file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP image under 10 MB.');
      const { data, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!data.user) throw new Error('Sign in before reporting payment.');
      const path = `${data.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      // Do not delete on an ambiguous network error: the RPC may have committed.
      // A trusted cleanup job must eventually remove orphaned uploads.
      const { error } = await client.rpc('report_commission_payment', { p_cycle_id: cycleId, p_proof_path: path });
      if (error) throw error;
    },
    async proofUrl(path: string): Promise<string> {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Could not open payment screenshot.');
      return data.signedUrl;
    },
    async review(cycleId: string, approve: boolean) {
      const { error } = await client.rpc(approve ? 'approve_commission_payment' : 'reject_commission_payment', { p_cycle_id: cycleId });
      if (error) throw error;
    },
    async reapprove(riderId: string) {
      const { error } = await client.rpc('reapprove_commission_rider', { p_rider_id: riderId });
      if (error) throw error;
    },
    async setDeadlineDays(days: number) {
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Enter a whole number from 1 to 365.');
      const { error } = await client.rpc('set_commission_deadline_days', { p_days: days });
      if (error) throw error;
    },
  };
}
