import webpush from 'web-push';
import supabase from './db-client.js';

// ── VAPID keys ──────────────────────────────────────────────────────
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:support@deliveryboys.gh', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, title, body, url } = req.body || {};
    if (!userId || !title) {
      return res.status(400).json({ error: 'userId and title are required' });
    }

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId);
    if (error) throw error;

    if (!subs || subs.length === 0) {
      // Not an error — this user simply never enabled push (or denied
      // permission). The existing in-app/toast/tab-open notifications
      // still cover them.
      return res.status(200).json({ sent: 0, reason: 'no subscriptions for this user' });
    }

    const payload = JSON.stringify({ title, body: body || '', url: url || '/' });

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        ),
      ),
    );

    // A 404/410 from the push service means that subscription is dead
    // (browser data cleared, permission revoked, etc.) — clean it up so
    // future sends don't keep failing against it.
    const deadIds = [];
    const failures = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const statusCode = r.reason?.statusCode;
        const detail = r.reason?.body || r.reason?.message || String(r.reason);
        if (statusCode === 404 || statusCode === 410) deadIds.push(subs[i].id);
        console.error('[send-push] send failed:', statusCode, detail);
        failures.push({ statusCode: statusCode || null, detail });
      }
    });
    if (deadIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', deadIds);
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length;

    // Also log this attempt into a plain table so it can be checked from
    // Supabase's Table Editor on a phone — no dev tools or scrolling
    // through Vercel's log UI required, just open the table and read it.
    try {
      await supabase.from('push_send_log').insert({
        user_id: userId,
        sent,
        total: subs.length,
        pruned: deadIds.length,
        failures: failures.length > 0 ? JSON.stringify(failures) : null,
      });
    } catch (logErr) {
      // Don't let logging itself break the actual send response.
      console.error('[send-push] failed to write push_send_log:', logErr.message);
    }

    // Failures are surfaced in the response body itself (not just server
    // logs) so a quick look at the Vercel request log — even collapsed —
    // shows exactly why a send didn't land, instead of a bare 200 that
    // looks identical whether 0 or all subscriptions were actually reached.
    return res.status(200).json({ sent, total: subs.length, pruned: deadIds.length, failures });
  } catch (err) {
    console.error('[send-push] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
