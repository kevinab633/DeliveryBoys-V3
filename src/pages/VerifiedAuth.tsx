import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import supabase from '../lib/supabase';
import { createVerifiedAuth, type LoginRole, type SignupRole } from '../lib/verifiedAuth';
import { usersApi } from '../lib/usersApi';
import { useAuthStore } from '../stores/authStore';
import type { VehicleType } from '../lib/types';

const auth = createVerifiedAuth(supabase);
const input = 'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900';
const button = 'w-full rounded-full bg-brand px-4 py-3 font-bold text-white';
const oauthKey = 'deliveryboys-verified-oauth';
function message(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
function redirectFor(role: LoginRole) { return role === 'manager' ? '/manager' : role === 'rider' ? '/rider/dashboard' : '/'; }

/** Resolve a verified identity through the server-managed mapping. Never use a
 * typed email or browser-stored role as proof of account ownership. */
async function openLinkedAccount(role: LoginRole): Promise<boolean> {
  const id = await auth.getLinkedProfileId(role);
  if (!id) return false;
  const profile = await usersApi.fetchById(id);
  if (!profile || profile.role !== role) throw new Error('Your account profile is unavailable. Contact support.');
  useAuthStore.setState(state => ({ user: profile, allUsers: [...state.allUsers.filter(u => u.id !== profile.id), profile], otpPending: null }));
  return true;
}

export function VerifiedLoginPage({ manager = false }: { manager?: boolean }) {
  const [params] = useSearchParams();
  const initial = params.get('role') === 'rider' ? 'rider' : 'customer';
  const [role, setRole] = useState<LoginRole>(manager ? 'manager' : initial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = sessionStorage.getItem(oauthKey);
    if (saved !== `login:${role}`) return;
    sessionStorage.removeItem(oauthKey);
    void (async () => {
      try {
        if (await openLinkedAccount(role)) navigate(redirectFor(role), { replace: true });
        else { await supabase.auth.signOut(); setError('This account does not exist for the selected role.'); }
      } catch (err) { setError(message(err)); }
    })();
  }, [navigate, role]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await auth.signIn(email, password);
      if (!await openLinkedAccount(role)) { await supabase.auth.signOut(); setError('This account does not exist for the selected role.'); return; }
      navigate(redirectFor(role), { replace: true });
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  };
  const google = async () => {
    setError(''); sessionStorage.setItem(oauthKey, `login:${role}`);
    try { await auth.signInWithGoogle(`${window.location.origin}${manager ? '/manager/login' : `/auth/login?role=${role}`}`); }
    catch (err) { sessionStorage.removeItem(oauthKey); setError(message(err)); }
  };
  return <main className="mx-auto min-h-screen max-w-md px-4 py-28"><h1 className="mb-6 text-3xl font-bold">{manager ? 'Manager access' : 'Sign in'}</h1>
    {!manager && <label className="mb-4 block">Account type<select className={input} value={role} onChange={e => setRole(e.target.value as SignupRole)}><option value="customer">Customer</option><option value="rider">Rider</option></select></label>}
    <form className="space-y-4" onSubmit={login}><input className={input} type="email" autoComplete="email" required placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
      <input className={input} type="password" autoComplete="current-password" required placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
      {error && <p role="alert" className="text-red-500">{error}</p>}
      <button className={button} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <button type="button" className="w-full rounded-full border px-4 py-3" onClick={google}>Continue with Google</button>
      {!manager && <p>New here? <Link className="text-brand" to={`/auth/signup?role=${role}`}>Sign up</Link></p>}
    </form></main>;
}

export function VerifiedSignupPage() {
  const [params] = useSearchParams();
  const [role, setRole] = useState<SignupRole>(params.get('role') === 'rider' ? 'rider' : 'customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicle, setVehicle] = useState<VehicleType>('motorcycle');
  const [plate, setPlate] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState<'signup' | 'verify' | 'details'>('signup');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (sessionStorage.getItem(oauthKey) !== `signup:${role}`) return;
    sessionStorage.removeItem(oauthKey);
    void (async () => {
      try {
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!data.user?.email_confirmed_at) throw new Error('Google sign-in did not complete.');
        if (await openLinkedAccount(role)) { navigate(redirectFor(role), { replace: true }); return; }
        setEmail(data.user.email || ''); setName(data.user.user_metadata?.full_name || ''); setStep('details');
      } catch (err) { setError(message(err)); }
    })();
  }, [role, navigate]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (err) { setError(message(err)); } finally { setBusy(false); } };
  const next = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    if (step === 'signup') { await auth.startEmailSignup(email, password); setStep('verify'); }
    else if (step === 'verify') { await auth.verifySignupCode(email, code); setStep('details'); }
    else {
      if (!agreed) throw new Error('Please accept the terms and privacy policy.');
      await auth.registerProfile({ role, name, phone, vehicleType: role === 'rider' ? vehicle : undefined, vehiclePlate: role === 'rider' ? plate : undefined });
      if (!await openLinkedAccount(role)) throw new Error('Unable to open the new account.');
      navigate(role === 'rider' ? '/rider/verification' : '/book', { replace: true });
    }
  }); };
  const google = () => { void run(async () => {
    sessionStorage.setItem(oauthKey, `signup:${role}`);
    try { await auth.signInWithGoogle(`${window.location.origin}/auth/signup?role=${role}`); }
    catch (err) { sessionStorage.removeItem(oauthKey); throw err; }
  }); };
  return <main className="mx-auto min-h-screen max-w-md px-4 py-28"><h1 className="mb-6 text-3xl font-bold">Create account</h1>
    <form className="space-y-4" onSubmit={next}>
      {step === 'signup' && <><label className="block">Account type<select className={input} value={role} onChange={e => setRole(e.target.value as SignupRole)}><option value="customer">Customer</option><option value="rider">Rider</option></select></label>
        <input className={input} type="email" autoComplete="email" required placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
        <input className={input} type="password" autoComplete="new-password" minLength={8} required placeholder="Password (at least 8 characters)" value={password} onChange={e => setPassword(e.target.value)} />
        <button type="button" className="w-full rounded-full border px-4 py-3" onClick={google} disabled={busy}>Continue with Google</button></>}
      {step === 'verify' && <><p>Enter the verification code sent to {email}.</p><input className={input} inputMode="numeric" autoComplete="one-time-code" required placeholder="Verification code" value={code} onChange={e => setCode(e.target.value)} />
        <button type="button" className="text-brand" onClick={() => void run(() => auth.resendSignupCode(email))} disabled={busy}>Resend code</button></>}
      {step === 'details' && <><input className={input} required placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
        <input className={input} type="tel" placeholder="Phone number (optional)" value={phone} onChange={e => setPhone(e.target.value)} />
        {role === 'rider' && <><select className={input} value={vehicle} onChange={e => setVehicle(e.target.value as VehicleType)}><option value="motorcycle">Motorcycle</option><option value="car">Car</option><option value="van">Van</option><option value="truck">Truck</option></select><input className={input} required placeholder="Vehicle plate" value={plate} onChange={e => setPlate(e.target.value)} /></>}
        <label className="flex gap-2"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} /><span>I agree to the <Link className="text-brand" to={role === 'rider' ? '/terms/rider' : '/terms'}>terms</Link> and <Link className="text-brand" to="/privacy">privacy policy</Link>.</span></label></>}
      {error && <p role="alert" className="text-red-500">{error}</p>}<button className={button} disabled={busy}>{busy ? 'Please wait…' : step === 'signup' ? 'Continue with email' : step === 'verify' ? 'Verify email' : 'Create account'}</button>
      <p>Already have an account? <Link className="text-brand" to={`/auth/login?role=${role}`}>Sign in</Link></p>
    </form></main>;
}
