// This legacy endpoint used a service-role database client without verifying
// the caller. The app's current sync layer talks to Supabase directly and
// does not use it. Do not restore it until order operations verify identity,
// enforce ownership and apply the overdue restriction server-side.
export default async function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({ error: 'Legacy order API is disabled.' });
}
