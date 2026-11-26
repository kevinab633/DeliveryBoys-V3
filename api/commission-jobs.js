import { timingSafeEqual } from 'node:crypto';

function authorized(header, secret) {
  if (!secret || typeof header !== 'string') return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Dependency-injected for tests. Run only with a server-side service-role client.
export async function runCommissionJobs(client) {
  const { data: created, error: closeError } = await client.rpc('cron_prepare_commission_cycles');
  if (closeError) throw closeError;
  const { data: queue, error: queueError } = await client.rpc('cron_pending_storage_deletions');
  if (queueError) throw queueError;
  let removed = 0;
  for (const item of queue ?? []) {
    const { error: removeError } = await client.storage.from(item.bucket).remove([item.path]);
    if (removeError) throw removeError; // keep the queue entry for retry
    const { error: ackError } = await client.rpc('cron_ack_storage_deletion', { p_bucket: item.bucket, p_path: item.path });
    if (ackError) throw ackError; // removal is idempotent; retry the acknowledgement
    removed++;
  }
  return { created, removed };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!authorized(req.headers.authorization, process.env.CRON_SECRET)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { default: client } = await import('./db-client.js');
    const result = await runCommissionJobs(client);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[commission-jobs] maintenance failed', error);
    return res.status(500).json({ error: 'Commission maintenance failed' });
  }
}
