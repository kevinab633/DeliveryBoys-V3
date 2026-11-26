import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import supabase from '../lib/supabase';
import { createVerifiedAuth, type LinkedIdentity } from '../lib/verifiedAuth';
import { usersApi } from '../lib/usersApi';
import { useAuthStore } from '../stores/authStore';

const auth = createVerifiedAuth(supabase);
const oauthKey = 'deliveryboys-google-preview';
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

/** Server-assigned identities only. The manager role always takes precedence;
 * customers may request rider access separately for manager review. */
async function openAccount(identities: LinkedIdentity[], navigate: ReturnType<typeof useNavigate>) {
  const identity = identities.find(i => i.app_role === 'manager') || identities.find(i => i.app_role === 'rider') || identities.find(i => i.app_role === 'customer');
  if (!identity) return false;
  const profile = await usersApi.fetchById(identity.app_user_id);
  if (!profile || profile.role !== identity.app_role) throw new Error('Your account profile is unavailable. Contact support.');
  useAuthStore.setState(state => ({ user: profile, allUsers: [...state.allUsers.filter(u => u.id !== profile.id), profile], otpPending: null }));
  navigate(identity.app_role === 'manager' ? '/manager' : identity.app_role === 'rider' ? '/rider/dashboard' : '/', { replace: true });
  return true;
}

export function VerifiedLoginPage({ manager = false }: { manager?: boolean }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem(oauthKey) !== '1') return;
    sessionStorage.removeItem(oauthKey);
    void (async () => {
      try {
        const identities = await auth.getLinkedIdentities();
        if (manager && !identities.some(i => i.app_role === 'manager')) {
          await supabase.auth.signOut(); throw new Error('This Google account is not authorized as manager.');
        }
        if (!await openAccount(identities, navigate)) navigate('/auth/signup', { replace: true });
      } catch (err) { setError(message(err)); }
    })();
  }, [manager, navigate]);
  const google = async () => {
    setBusy(true); setError(''); sessionStorage.setItem(oauthKey, '1');
    try { await auth.signInWithGoogle(`${window.location.origin}${manager ? '/manager/login' : '/auth/login'}`); }
    catch (err) { sessionStorage.removeItem(oauthKey); setError(message(err)); setBusy(false); }
  };
  return <main className="mx-auto min-h-screen max-w-md px-4 py-28"><h1 className="mb-6 text-3xl font-bold">{manager ? 'Manager access' : 'Sign in'}</h1>
    <p className="mb-4">Use your Google account to continue.</p>{error && <p role="alert" className="mb-4 text-red-500">{error}</p>}
    <button type="button" onClick={google} disabled={busy} className="w-full rounded-full bg-brand px-4 py-3 font-bold text-white">{busy ? 'Connecting…' : 'Continue with Google'}</button>
    {!manager && <p className="mt-4">New here? <Link className="text-brand" to="/auth/signup">Create an account</Link></p>}</main>;
}

export function VerifiedSignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { void (async () => {
    try {
      const { data, error: e } = await supabase.auth.getUser();
      if (e || !data.user?.email_confirmed_at) { navigate('/auth/login', { replace: true }); return; }
      const identities = await auth.getLinkedIdentities();
      if (await openAccount(identities, navigate)) return;
      setName(data.user.user_metadata?.full_name || ''); setReady(true);
    } catch (err) { setError(message(err)); }
  })(); }, [navigate]);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setError('');
    try {
      if (!agreed) throw new Error('Please accept the terms and privacy policy.');
      await auth.registerGoogleProfile(name, phone);
      if (!await openAccount(await auth.getLinkedIdentities(), navigate)) throw new Error('Could not open your account.');
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  };
  return <main className="mx-auto min-h-screen max-w-md px-4 py-28"><h1 className="mb-6 text-3xl font-bold">Complete your account</h1>
    {ready && <form onSubmit={submit} className="space-y-4"><input required className="w-full rounded-xl border p-3 text-gray-900" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
      <input className="w-full rounded-xl border p-3 text-gray-900" placeholder="Phone number (optional)" value={phone} onChange={e => setPhone(e.target.value)} />
      <label className="flex gap-2"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} /><span>I agree to the <Link to="/terms" className="text-brand">terms</Link> and <Link to="/privacy" className="text-brand">privacy policy</Link>.</span></label>
      <button disabled={busy} className="w-full rounded-full bg-brand p-3 font-bold text-white">{busy ? 'Please wait…' : 'Create account'}</button></form>}
    {error && <p role="alert" className="mt-4 text-red-500">{error}</p>}</main>;
}
