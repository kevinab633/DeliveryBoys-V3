import type { SupabaseClient } from '@supabase/supabase-js';

type ContactMethod = 'email' | 'phone';
type DuplicateReport = { method: ContactMethod; role: string; count: number; selectedId: string; sampleIds: string[] };

/** Look up an existing profile, scoped to its role. Duplicate legacy rows are
 * left intact; the oldest row wins, with id as a stable tie-breaker. */
export async function findContactRow(
  client: SupabaseClient,
  contact: string,
  method: ContactMethod,
  role: string,
  report: (details: DuplicateReport) => void = details => console.warn('[usersApi] Duplicate account rows:', details),
): Promise<Record<string, any> | null> {
  const value = contact.trim();
  if (!value) return null;

  let query = client.from('users').select('*', { count: 'exact' }).eq('role', role);
  if (method === 'email' && !value.includes('*')) {
    // ILIKE is case-insensitive, but %, _ and backslash must be literal.
    query = query.ilike('email', value.replace(/[\\%_]/g, '\\$&'));
  } else {
    // PostgREST treats * as a LIKE wildcard; use exact equality for such
    // addresses rather than risk matching an unrelated account.
    query = query.eq(method, value);
  }
  const { data, error, count } = await query
    .order('created_at', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .limit(2);
  if (error) throw new Error('Account lookup is unavailable. Please try again.');
  if (!data?.length) return null;

  // Never sign in as a different contact even if a backend filter is misconfigured.
  const matches = data.filter(row => row.role === role && typeof row[method] === 'string' &&
    (method === 'email' ? row.email.toLowerCase() === value.toLowerCase() : row.phone === value));
  if (!matches.length) return null;
  const selected = matches[0];
  const total = count ?? matches.length;
  if (total > 1 && matches.length > 1) {
    report({ method, role, count: total, selectedId: selected.id, sampleIds: matches.map(row => row.id) });
  }
  return selected;
}
