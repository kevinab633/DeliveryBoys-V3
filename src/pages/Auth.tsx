import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Phone, User, ArrowRight, Bike, Shield, Upload, Car, Truck } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { cn } from '../lib/utils';
import { VehicleType } from '../lib/types';

export function LoginPage() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { loginDirect } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role') as 'customer' | 'rider' | null;
  const [role, setRole] = useState<'customer' | 'rider'>(roleParam || 'customer');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');

  // NOTE: OTP verification removed for now — will be re-added later.
  // Sign-in is direct: enter email/phone and continue.
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) {
      setError('Please enter your email or phone number.');
      return;
    }
    await loginDirect(contact, role);
    navigate(role === 'rider' ? '/rider/dashboard' : '/book');
  };

  const inp = cn('w-full pl-12 pr-4 py-3.5 rounded-xl text-sm border transition', dk ? 'bg-surface-dark-3 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400');

  return (
    <div className="pt-20 min-h-screen flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className={cn('w-full max-w-md p-8 rounded-2xl border', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-white border-gray-200 shadow-xl')}>
        <div className="text-center mb-8">
          <img src="/images/logo.jpeg" alt="DB" className="w-16 h-16 rounded-full mx-auto mb-4 object-cover" />
          <h1 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Welcome Back</h1>
          <p className={cn('text-sm mt-1', dk ? 'text-white/50' : 'text-gray-500')}>Sign in to your account</p>
        </div>

        {/* Role Tabs */}
        <div className={cn('flex rounded-xl p-1 mb-6', dk ? 'bg-surface-dark-3' : 'bg-gray-100')}>
          {(['customer', 'rider'] as const).map(r => (
            <button key={r} onClick={() => setRole(r)}
              className={cn('flex-1 py-2.5 rounded-lg text-sm font-semibold transition capitalize flex items-center justify-center gap-2',
                role === r ? 'bg-brand text-white shadow' : dk ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-700')}>
              {r === 'rider' ? <Bike size={16} /> : <User size={16} />} {r}
            </button>
          ))}
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="relative">
            <div className={cn('absolute left-4 top-1/2 -translate-y-1/2', dk ? 'text-white/30' : 'text-gray-400')}>
              {contact.includes('@') ? <Mail size={18} /> : <Phone size={18} />}
            </div>
            <input type="text" value={contact} onChange={e => setContact(e.target.value)}
              placeholder="Email or phone number" className={inp} />
          </div>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" className="w-full bg-brand text-white py-3.5 rounded-xl font-bold hover:bg-brand-dark transition flex items-center justify-center gap-2">
            Sign In <ArrowRight size={18} />
          </button>
          <p className={cn('text-center text-sm', dk ? 'text-white/40' : 'text-gray-500')}>
            Don&apos;t have an account? <Link to={`/auth/signup?role=${role}`} className="text-brand font-semibold">Sign Up</Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}

export function SignupPage() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { signupDirect, signupRiderDirect } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role') as 'customer' | 'rider' | null;
  const [role, setRole] = useState<'customer' | 'rider'>(roleParam || 'customer');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', vehicleType: 'motorcycle' as VehicleType, vehiclePlate: '', nationalId: '', photo: '' });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [e.target.name]: e.target.value });

  // NOTE: OTP verification removed for now — will be re-added later.
  // Account is created and signed in immediately on submit.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      setError('Please enter your full name.');
      return;
    }
    if (role === 'rider') {
      await signupRiderDirect({ name: form.name, email: form.email || undefined, phone: form.phone || undefined, vehicleType: form.vehicleType, vehiclePlate: form.vehiclePlate, nationalIdUrl: form.nationalId || '/images/logo.jpeg', photoUrl: form.photo || '/images/logo.jpeg' });
      navigate('/rider/dashboard');
    } else {
      await signupDirect({ name: form.name, email: form.email || undefined, phone: form.phone || undefined, role: 'customer' });
      navigate('/book');
    }
  };

  const inp = cn('w-full px-4 py-3 rounded-xl text-sm border transition', dk ? 'bg-surface-dark-3 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400');

  return (
    <div className="pt-20 min-h-screen flex items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className={cn('w-full max-w-md p-8 rounded-2xl border', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-white border-gray-200 shadow-xl')}>
        <div className="text-center mb-8">
          <img src="/images/logo.jpeg" alt="DB" className="w-16 h-16 rounded-full mx-auto mb-4 object-cover" />
          <h1 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Create Account</h1>
        </div>

        <div className={cn('flex rounded-xl p-1 mb-6', dk ? 'bg-surface-dark-3' : 'bg-gray-100')}>
          {(['customer', 'rider'] as const).map(r => (
            <button key={r} onClick={() => setRole(r)}
              className={cn('flex-1 py-2.5 rounded-lg text-sm font-semibold transition capitalize flex items-center justify-center gap-2',
                role === r ? 'bg-brand text-white shadow' : dk ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-700')}>
              {r === 'rider' ? <Bike size={16} /> : <User size={16} />} {r}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input name="name" required value={form.name} onChange={handleChange} placeholder="Full Name" className={inp} />
          <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="Email address" className={inp} />
          <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone number (e.g. 0544188778)" className={inp} />
          {role === 'rider' && (
            <>
              <select name="vehicleType" value={form.vehicleType} onChange={handleChange} className={inp}>
                <option value="motorcycle">Motorcycle</option>
                <option value="car">Car</option>
                <option value="van">Van</option>
                <option value="truck">Truck</option>
              </select>
              <input name="vehiclePlate" required value={form.vehiclePlate} onChange={handleChange} placeholder="Vehicle plate number" className={inp} />
              <div className={cn('p-4 rounded-xl border-2 border-dashed text-center', dk ? 'border-white/10' : 'border-gray-300')}>
                <Upload size={24} className={cn('mx-auto mb-2', dk ? 'text-white/30' : 'text-gray-400')} />
                <p className={cn('text-sm', dk ? 'text-white/40' : 'text-gray-500')}>National ID & Photo uploads</p>
                <p className={cn('text-xs mt-1', dk ? 'text-white/20' : 'text-gray-400')}>Will be verified by managers after signup</p>
              </div>
            </>
          )}
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" className="w-full bg-brand text-white py-3.5 rounded-xl font-bold hover:bg-brand-dark transition flex items-center justify-center gap-2">
            {role === 'rider' ? 'Apply as Rider' : 'Create Account'} <ArrowRight size={18} />
          </button>
          <p className={cn('text-center text-sm', dk ? 'text-white/40' : 'text-gray-500')}>
            Already have an account? <Link to={`/auth/login?role=${role}`} className="text-brand font-semibold">Sign In</Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}

export function ManagerLoginPage() {
  const dk = useThemeStore(s => s.theme === 'dark');
  const { loginDirect } = useAuthStore();
  const navigate = useNavigate();
  const [contact, setContact] = useState('admin@deliveryboys.gh');
  const [error, setError] = useState('');

  // NOTE: OTP verification removed for now — will be re-added later.
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) {
      setError('Please enter your manager email or phone.');
      return;
    }
    await loginDirect(contact, 'manager');
    navigate('/manager');
  };

  const inp = cn('w-full px-4 py-3.5 rounded-xl text-sm border transition', dk ? 'bg-surface-dark-3 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400');

  return (
    <div className="pt-20 min-h-screen flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className={cn('w-full max-w-md p-8 rounded-2xl border', dk ? 'bg-surface-dark-2 border-white/5' : 'bg-white border-gray-200 shadow-xl')}>
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mx-auto mb-4"><Shield size={32} className="text-brand" /></div>
          <h1 className={cn('text-2xl font-extrabold', dk ? 'text-white' : 'text-gray-900')}>Manager Access</h1>
          <p className={cn('text-sm mt-1', dk ? 'text-white/50' : 'text-gray-500')}>Authorized personnel only</p>
        </div>
        <form onSubmit={handleSignIn} className="space-y-4">
          <input type="text" value={contact} onChange={e => setContact(e.target.value)} placeholder="Manager email or phone" className={inp} />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" className="w-full bg-brand text-white py-3.5 rounded-xl font-bold hover:bg-brand-dark transition">Sign In</button>
        </form>
      </motion.div>
    </div>
  );
}
