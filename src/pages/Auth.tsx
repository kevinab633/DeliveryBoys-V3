import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, Shield } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { cn } from '../lib/utils';
import { VehicleType } from '../lib/types';
import supabase from '../lib/supabase';
import { createEmailPasswordAuth } from '../lib/emailPasswordAuth';
import { createLinkedAccount } from '../lib/linkedAccount';
import { usersApi } from '../lib/usersApi';

const emailAuth = createEmailPasswordAuth(supabase);
const linkAccount = createLinkedAccount({ client: supabase, fetchById: usersApi.fetchById });

async function linkedSignIn(managerRequired = false) {
  const profile = await linkAccount();
  if (managerRequired || profile.role === 'manager') {
    const { data, error } = await supabase.rpc('is_manager');
    if (error) throw error;
    if (data !== true || profile.role !== 'manager') throw new Error('This account is not authorized as manager.');
  }
  useAuthStore.setState(s => ({ user: profile, allUsers: [...s.allUsers.filter(u => u.id !== profile.id), profile], otpPending: null }));
  return profile;
}

const errorText = (e: unknown) => e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' ? e.message : 'Sign-in failed. Please try again.';

export function LoginPage() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const navigate = useNavigate();
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [noAccount, setNoAccount] = useState(false);

  // Back from Google: link the authenticated account and open its profile.
  useEffect(() => {
    if (sessionStorage.getItem('db-oauth-login') !== '1') return;
    sessionStorage.removeItem('db-oauth-login');
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user.email;
      if (!email) {
        setError('Google sign-in did not complete. Please try again.');
        return;
      }
      try {
        const profile = await linkedSignIn();
        navigate(profile.role === 'manager' ? '/manager' : profile.role === 'rider' ? '/rider/dashboard' : '/');
      } catch (err) {
        await supabase.auth.signOut();
        setError(errorText(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const continueWithGoogle = async () => {
    setError('');
    setNoAccount(false);
    sessionStorage.setItem('db-oauth-login', '1');
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/login` },
    });
    if (oauthError) {
      sessionStorage.removeItem('db-oauth-login');
      setError(`Google sign-in is unavailable: ${oauthError.message}`);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) {
      setError('Please enter your email address.');
      return;
    }
    setError('');
    setNoAccount(false);
    try {
      await emailAuth.signIn(contact, password);
      const profile = await linkedSignIn();
      navigate(profile.role === 'manager' ? '/manager' : profile.role === 'rider' ? '/rider/dashboard' : '/');
    } catch (err) {
      setNoAccount(true);
      setError(errorText(err));
    }
  };

  const inp = cn('w-full pl-12 pr-4 py-3.5 rounded-xl text-sm border transition', dk ? 'bg-surface-dark-3 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400');

  return (
    <div className="relative isolate pt-20 min-h-screen flex items-center justify-center overflow-hidden px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className={cn('relative z-10 w-full max-w-md p-8 rounded-2xl border', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-white border-gray-200 shadow-xl')}>
        <div className="text-center mb-8">
          <img src="/images/logo.jpeg" alt="Delivery Boys logo" className="w-16 h-16 rounded-full mx-auto mb-4 object-cover" />
          <h1 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Welcome Back</h1>
          <p className={cn('text-sm mt-1', dk ? 'text-white/50' : 'text-gray-500')}>Sign in to your account</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="relative">
            <div className={cn('absolute left-4 top-1/2 -translate-y-1/2', dk ? 'text-white/30' : 'text-gray-400')}>
              <Mail size={18} />
            </div>
            <input type="email" aria-label="Email address" autoComplete="email" required value={contact} onChange={e => setContact(e.target.value)}
              placeholder="Email address" className={inp} />
          </div>
          <div className="relative">
            <div className={cn('absolute left-4 top-1/2 -translate-y-1/2', dk ? 'text-white/30' : 'text-gray-400')}><Lock size={18} /></div>
            <input type="password" aria-label="Password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className={inp} />
          </div>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          {noAccount && (
            <Link to="/auth/signup" className="block w-full text-center bg-brand text-white py-3 rounded-full font-bold hover:bg-brand-dark transition">
              Sign Up to create an account
            </Link>
          )}
          <button type="submit" className="w-full bg-brand text-white py-3.5 rounded-full font-bold hover:bg-brand-dark transition flex items-center justify-center gap-2">
            Sign In <ArrowRight size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className={cn('flex-1 h-px', dk ? 'bg-white/10' : 'bg-gray-200')} />
            <span className={cn('text-xs', dk ? 'text-white/40' : 'text-gray-400')}>or</span>
            <div className={cn('flex-1 h-px', dk ? 'bg-white/10' : 'bg-gray-200')} />
          </div>
          <button type="button" onClick={continueWithGoogle}
            className={cn('w-full py-3.5 rounded-full font-bold border transition flex items-center justify-center gap-2',
              dk ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-800 hover:bg-gray-50')}>
            <span className="text-base font-black">G</span> Continue with Google
          </button>
          <p className={cn('text-center text-sm', dk ? 'text-white/40' : 'text-gray-500')}>
            Don&apos;t have an account? <Link to="/auth/signup" className="text-brand font-semibold">Sign Up</Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}

export function SignupPage() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const riderApplication = searchParams.get('role') === 'rider';
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<'method' | 'details'>('method');
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', vehicleType: 'motorcycle' as VehicleType, vehiclePlate: '' });

  useEffect(() => {
    // Returning from Google OAuth starts at the details step. The remaining
    // profile and rider information is collected here before creating the
    // app profile.
    void supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user.email;
      if (email) {
        // Google sends the person's name with the account; prefill it.
        const meta = (data.session?.user.user_metadata ?? {}) as Record<string, unknown>;
        const googleName = typeof meta.full_name === 'string' ? meta.full_name
          : typeof meta.name === 'string' ? meta.name : '';
        setForm(current => ({ ...current, email, name: current.name || googleName }));
        setStep('details');
      }
    });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [e.target.name]: e.target.value });

  const continueWithEmail = () => {
    if (!form.email || !form.email.includes('@') || !password) {
      setError('Enter a valid email address and password to continue.');
      return;
    }
    setError('');
    setStep('details');
  };

  const continueWithGoogle = async () => {
    setError('');
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/signup${riderApplication ? '?role=rider' : ''}` },
    });
    if (oauthError) setError('Google sign up is unavailable right now. Please use email.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      setError('Please enter your full name.');
      return;
    }
    if (!form.name.trim() || form.name.trim().length > 120) {
      setError('Please enter your full name (up to 120 characters).');
      return;
    }
    if (!agreed) {
      setError('Please accept the Terms & Conditions and Privacy Policy to continue.');
      return;
    }
    try {
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (session.session && session.session.user.email?.toLowerCase() !== form.email.trim().toLowerCase()) throw new Error('Sign out before creating an account with a different email.');
      if (!session.session) {
        const redirectPath = riderApplication ? '/auth/signup?role=rider' : '/auth/signup';
        const result = await emailAuth.signUp(form.email, password, `${window.location.origin}${redirectPath}`, form.name);
        if (!result.session) { setMessage('Check your email to confirm your account, then return to finish signup.'); return; }
      }
      const profile = await linkAccount();
      if (profile.role !== 'customer' && !(riderApplication && profile.role === 'rider' && 'status' in profile && profile.status === 'pending')) throw new Error('This account cannot complete this signup.');
      const { error: nameError } = await supabase.rpc('save_signup_name', { p_name: form.name.trim() });
      if (nameError) throw nameError;
      if (riderApplication) {
        const { data, error: applicationError } = await supabase.rpc('submit_step2_rider_application', { p_vehicle_type: form.vehicleType, p_vehicle_plate: form.vehiclePlate });
        if (applicationError) throw applicationError;
        if (data !== 'pending') throw new Error('Your rider application is not pending. Please contact support.');
        const rider = await usersApi.fetchById(profile.id);
        if (!rider || rider.role !== 'rider' || !('status' in rider) || rider.status !== 'pending') throw new Error('Your pending rider profile is unavailable. Please contact support.');
        useAuthStore.setState(s => ({ user: rider, allUsers: [...s.allUsers.filter(u => u.id !== rider.id), rider], otpPending: null }));
        navigate('/rider/verification');
      } else {
        await linkedSignIn();
        navigate('/book');
      }
    } catch (err) { setError(errorText(err)); }
  };

  const inp = cn('w-full px-4 py-3 rounded-xl text-sm border transition', dk ? 'bg-surface-dark-3 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400');

  return (
    <div className="relative isolate pt-20 min-h-screen flex items-center justify-center overflow-hidden px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className={cn('relative z-10 w-full max-w-md p-8 rounded-2xl border', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-white border-gray-200 shadow-xl')}>
        <div className="text-center mb-8">
          <img src="/images/logo.jpeg" alt="Delivery Boys logo" className="w-16 h-16 rounded-full mx-auto mb-4 object-cover" />
          <h1 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Create Account</h1>
          <p className={cn('text-sm mt-1', dk ? 'text-white/50' : 'text-gray-500')}>{step === 'method' ? 'Start with your email or Google' : 'Tell us a little more about you'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 'method' ? (
            <>
              <input name="email" aria-label="Email address" autoComplete="email" type="email" required value={form.email} onChange={handleChange} placeholder="Email address" className={inp} />
              <input type="password" aria-label="Password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className={inp} />
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
              <button type="button" onClick={continueWithEmail} className="w-full bg-brand text-white py-3.5 rounded-full font-bold hover:bg-brand-dark transition flex items-center justify-center gap-2">
                Continue with Email <ArrowRight size={18} />
              </button>
              <div className="flex items-center gap-3 text-xs text-gray-400"><span className="h-px flex-1 bg-current opacity-20" /> OR <span className="h-px flex-1 bg-current opacity-20" /></div>
              <button type="button" onClick={continueWithGoogle} className={cn('w-full py-3.5 rounded-full font-bold border transition flex items-center justify-center gap-2', dk ? 'border-white/10 text-white hover:bg-white/5' : 'border-gray-200 text-gray-700 hover:bg-gray-50')}>
                <span className="text-base font-black">G</span> Continue with Google
              </button>
              <p className={cn('text-center text-sm', dk ? 'text-white/40' : 'text-gray-500')}>
                Already have an account? <Link to="/auth/login" className="text-brand font-semibold">Sign In</Link>
              </p>
            </>
          ) : (
            <>
              <input name="name" aria-label="Full name" autoComplete="name" required value={form.name} onChange={handleChange} placeholder="Full Name" className={inp} />
              <input name="email" aria-label="Email address" autoComplete="email" type="email" required value={form.email} readOnly className={cn(inp, 'opacity-70')} />
              {riderApplication && (
                <>
                  <select name="vehicleType" value={form.vehicleType} onChange={handleChange} className={inp}>
                    <option value="motorcycle">Motorcycle</option><option value="car">Car</option><option value="van">Van</option><option value="truck">Truck</option>
                  </select>
                  <input name="vehiclePlate" required value={form.vehiclePlate} onChange={handleChange} placeholder="Vehicle plate number" className={inp} />
                  <p className={cn('rounded-xl border px-4 py-3 text-sm', dk ? 'border-white/10 text-white/55' : 'border-gray-200 text-gray-500')}>Document and photo verification happens after signup. You’ll be guided through camera capture and image quality checks next.</p>
                </>
              )}
              <label className={cn('flex items-start gap-2 text-xs leading-relaxed', dk ? 'text-white/55' : 'text-gray-500')}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 accent-brand" />
                <span>I agree to the <Link to={riderApplication ? '/terms/rider' : '/terms'} className="font-semibold text-brand">{riderApplication ? 'Rider Terms & Conditions' : 'Terms & Conditions'}</Link> and <Link to="/privacy" className="font-semibold text-brand">Privacy Policy</Link>.</span>
              </label>
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
              {message && <p className="text-sm text-center">{message}</p>}
              <button type="submit" className="w-full bg-brand text-white py-3.5 rounded-full font-bold hover:bg-brand-dark transition flex items-center justify-center gap-2">
                {riderApplication ? 'Continue as Rider' : 'Create Account'} <ArrowRight size={18} />
              </button>
              <button type="button" onClick={() => { setStep('method'); setError(''); }} className={cn('w-full text-sm font-semibold', dk ? 'text-white/50' : 'text-gray-500')}>Use a different sign-up method</button>
            </>
          )}
        </form>
      </motion.div>
    </div>
  );
}

export function ManagerLoginPage() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    if (sessionStorage.getItem('db-oauth-manager') !== '1') return;
    sessionStorage.removeItem('db-oauth-manager');
    void linkedSignIn(true).then(() => navigate('/manager')).catch(err => setError(errorText(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    sessionStorage.setItem('db-oauth-manager', '1');
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/manager/login` } });
    if (oauthError) { sessionStorage.removeItem('db-oauth-manager'); setError(errorText(oauthError)); }
  };

  return (
    <div className="relative isolate pt-20 min-h-screen flex items-center justify-center overflow-hidden px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className={cn('relative z-10 w-full max-w-md p-8 rounded-2xl border', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-white border-gray-200 shadow-xl')}>
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mx-auto mb-4"><Shield size={32} className="text-brand" /></div>
          <h1 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Manager Access</h1>
          <p className={cn('text-sm mt-1', dk ? 'text-white/50' : 'text-gray-500')}>Authorized personnel only</p>
        </div>
        <form onSubmit={handleSignIn} className="space-y-4">
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" className="w-full bg-brand text-white py-3.5 rounded-full font-bold hover:bg-brand-dark transition">Continue with Google</button>
        </form>
      </motion.div>
    </div>
  );
}
