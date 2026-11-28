import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, RiderProfile, UserRole, RiderStatus, VehicleType } from '../lib/types';
import { generateId, generateOTP, nameFromEmail } from '../lib/utils';
import { usersApi } from '../lib/usersApi';
import { isApprovedRider } from '../lib/riderAccess';
import supabase from '../lib/supabase';
import { useThemeStore } from './themeStore';

interface AuthStore {
  user: User | RiderProfile | null;
  allUsers: (User | RiderProfile)[];
  usersLoaded: boolean;
  otpPending: { contact: string; otp: string; role: UserRole; method: 'email' | 'phone' } | null;
  /** Fetches every account from Supabase and merges it into allUsers —
   *  call this once on app startup, same pattern as orderStore's init(). */
  loadUsers: () => Promise<void>;
  /** Re-read the signed-in row; a missing or role-changed row ends that session. */
  refreshCurrentUser: () => Promise<User | RiderProfile | null>;
  login: (emailOrPhone: string, role: UserRole) => string; // returns OTP
  verifyOTP: (code: string) => boolean;
  signup: (data: { name: string; email?: string; phone?: string; role: UserRole }) => string;
  signupRider: (data: { name: string; email?: string; phone?: string; vehicleType: VehicleType; vehiclePlate: string; nationalIdUrl: string; photoUrl: string }) => string;
  // ── Direct auth (OTP removed for now — will be re-added later) ──────
  // These sign the user in immediately with no verification step.
  /** Returns false when no account matches; nothing is created then. */
  loginDirect: (emailOrPhone: string, role: UserRole) => Promise<boolean>;
  signupDirect: (data: { name: string; email?: string; phone?: string; role: UserRole }) => Promise<void>;
  signupRiderDirect: (data: { name: string; email?: string; phone?: string; vehicleType: VehicleType; vehiclePlate: string; nationalIdUrl: string; photoUrl: string }) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => void;
  updateRiderVerification: (data: { nationalIdUrl?: string; photoUrl?: string; selfieUrl?: string }) => Promise<void>;
  addContact: (type: 'email' | 'phone', value: string) => void;
  // Manager actions
  approveRider: (riderId: string) => void;
  rejectRider: (riderId: string) => void;
  suspendRider: (riderId: string) => void;
  getRiders: () => RiderProfile[];
  getCustomers: () => User[];
  updateRiderLocation: (lat: number, lng: number) => void;
  persistRiderLocation: (lat: number, lng: number) => void;
  setRiderAvailability: (status: 'online' | 'offline' | 'busy') => Promise<boolean>;
  recordDelivery: (riderId: string, earnedAmount: number) => void;
  /** Rider reports they have paid the commission shown. */
  requestCommissionPayment: (amount: number) => void;
  /** Manager confirms the payment was received; owed resets to zero. */
  confirmCommissionPayment: (riderId: string) => void;
  // ── Remote sync handlers (called by syncService on incoming events) ──
  /** A rider on another device announced they are online. */
  applyRemoteRiderPresence: (rider: RiderProfile) => void;
  /** A rider's live GPS position arrived from their device. */
  applyRemoteRiderLocation: (riderId: string, lat: number, lng: number) => void;
}

const DEFAULT_MANAGER: User = {
  id: 'manager-001',
  name: 'Admin Manager',
  email: 'admin@deliveryboys.gh',
  phone: '+233544188778',
  role: 'manager',
  createdAt: Date.now(),
  verified: true,
};

const DEMO_RIDERS: RiderProfile[] = [
  { id: 'rider-001', name: 'Kwame Mensah', email: 'kwame@test.com', phone: '+233201234567', role: 'rider', vehicleType: 'motorcycle', vehiclePlate: 'GR-2345-21', status: 'approved', availability: 'online', location: { lat: 5.6037, lng: -0.1870 }, totalDeliveries: 234, rating: 4.8, earnings: 4520, createdAt: Date.now() - 86400000 * 30, verified: true, nationalIdUrl: '/images/logo.jpeg', photoUrl: '/images/logo.jpeg' },
  { id: 'rider-002', name: 'Ama Serwaa', email: 'ama@test.com', phone: '+233209876543', role: 'rider', vehicleType: 'motorcycle', vehiclePlate: 'GR-8901-22', status: 'approved', availability: 'online', location: { lat: 5.5560, lng: -0.1824 }, totalDeliveries: 178, rating: 4.9, earnings: 3890, createdAt: Date.now() - 86400000 * 20, verified: true, nationalIdUrl: '/images/logo.jpeg', photoUrl: '/images/logo.jpeg' },
  { id: 'rider-003', name: 'Kofi Asante', phone: '+233207654321', role: 'rider', vehicleType: 'car', vehiclePlate: 'GW-1234-23', status: 'approved', availability: 'offline', location: { lat: 5.6245, lng: -0.1674 }, totalDeliveries: 89, rating: 4.6, earnings: 2100, createdAt: Date.now() - 86400000 * 15, verified: true, nationalIdUrl: '/images/logo.jpeg', photoUrl: '/images/logo.jpeg' },
  { id: 'rider-004', name: 'Yaa Asantewaa', email: 'yaa@test.com', role: 'rider', vehicleType: 'van', vehiclePlate: 'GT-5678-23', status: 'pending', availability: 'offline', totalDeliveries: 0, rating: 0, earnings: 0, createdAt: Date.now() - 86400000, verified: true, nationalIdUrl: '/images/logo.jpeg', photoUrl: '/images/logo.jpeg' },
];

// Prevent an older async sign-in/refresh from reviving a replaced session.
let authGeneration = 0;

export const useAuthStore = create<AuthStore>()(persist((set, get) => ({
  user: null,
  allUsers: [DEFAULT_MANAGER, ...DEMO_RIDERS],
  usersLoaded: false,
  otpPending: null,

  // Merges real Supabase accounts into local state on startup. The demo
  // riders/manager seeded above stay as an offline fallback — merged, not
  // replaced, so the app still has riders to show if the DB is briefly
  // unreachable. Real DB rows win over demo data for the same id.
  loadUsers: async () => {
    const remoteUsers = await usersApi.fetchAll();
    if (remoteUsers.length === 0) {
      set({ usersLoaded: true });
      return;
    }
    set(s => {
      const remoteIds = new Set(remoteUsers.map(u => u.id));
      const keptLocal = s.allUsers.filter(u => !remoteIds.has(u.id));
      const mergedUsers = [...keptLocal, ...remoteUsers];
      // If the logged-in user's own record came back from the DB, refresh
      // it too, so a rider's stats/status reflect what's actually stored.
      const refreshedSelf = s.user ? remoteUsers.find(u => u.id === s.user!.id) : undefined;
      return {
        allUsers: mergedUsers,
        user: refreshedSelf ? (refreshedSelf.role === s.user?.role ? refreshedSelf : null) : s.user,
        usersLoaded: true,
      };
    });
  },

  refreshCurrentUser: async () => {
    const current = get().user;
    const generation = authGeneration;
    if (!current) return null;
    const profile = await usersApi.fetchById(current.id);
    // Do not resurrect a logged-out/replaced session after an async request.
    if (authGeneration !== generation || get().user?.id !== current.id) return null;
    if (!profile || profile.role !== current.role) {
      set({ user: null, otpPending: null });
      return null;
    }
    set(s => ({
      user: profile,
      allUsers: [...s.allUsers.filter(u => u.id !== profile.id), profile],
    }));
    return profile;
  },

  login: (emailOrPhone, role) => {
    const otp = generateOTP();
    const method = emailOrPhone.includes('@') ? 'email' : 'phone';
    set({ otpPending: { contact: emailOrPhone, otp, role, method } });
    console.log(`[OTP] ${method}: ${otp} for ${emailOrPhone}`);
    return otp;
  },

  verifyOTP: (code) => {
    const { otpPending, allUsers } = get();
    if (!otpPending || otpPending.otp !== code) return false;
    // Find or create user
    let user = allUsers.find(u => {
      if (otpPending.method === 'email') return u.email === otpPending.contact && u.role === otpPending.role;
      return u.phone === otpPending.contact && u.role === otpPending.role;
    });
    if (!user) {
      // Auto-create for login attempt
      user = {
        id: generateId(),
        name: otpPending.contact.split('@')[0] || 'User',
        [otpPending.method]: otpPending.contact,
        role: otpPending.role,
        createdAt: Date.now(),
        verified: true,
      } as User;
      set({ allUsers: [...allUsers, user] });
    }
    set({ user, otpPending: null });
    return true;
  },

  // ── Direct auth (OTP removed for now — will be re-added later) ──────
  // Contact lookup is not proof of ownership. Only a matching remote row for
  // the requested role is used; local/demo data never creates a session.
  loginDirect: async (emailOrPhone, role) => {
    const generation = ++authGeneration;
    set({ user: null, otpPending: null });
    const contact = emailOrPhone.trim();
    const method = contact.includes('@') ? 'email' : 'phone';
    let user = await usersApi.findByContact(contact, method, role);
    if (generation !== authGeneration || !user || user.role !== role) return false;

    // Re-read the customer profile before navigating so both the current user
    // and the cached list reflect the latest row, not a stale local profile.
    if (role === 'customer') {
      user = await usersApi.fetchById(user.id);
      if (!user || user.role !== 'customer') return false;
    }
    if (generation !== authGeneration) return false;
    const storedContact = user[method];
    if (!storedContact || (method === 'email'
      ? storedContact.toLowerCase() !== contact.toLowerCase()
      : storedContact !== contact)) return false;
    // Keep the existing readable-name behavior, but UPDATE rather than upsert:
    // signing in must never insert an account if the row disappears.
    if (user.email && (!user.name || user.name.toLowerCase() === user.email.split('@')[0].toLowerCase())) {
      const derived = nameFromEmail(user.email);
      if (derived) {
        user = { ...user, name: derived };
        void usersApi.update(user.id, { name: derived });
      }
    }
    const profile = user;
    set(s => ({
      user: profile,
      allUsers: [...s.allUsers.filter(u => u.id !== profile.id), profile],
      otpPending: null,
    }));
    return true;
  },

  signupDirect: async (data) => {
    if (data.role !== 'customer') throw new Error('Use the appropriate sign-up flow for this account.');
    const generation = ++authGeneration;
    const newUser = await usersApi.registerCustomer({ name: data.name, email: data.email, phone: data.phone });
    if (generation !== authGeneration) throw new Error('Your session changed. Please sign in to your new account.');
    set(s => ({ allUsers: [...s.allUsers.filter(u => u.id !== newUser.id), newUser], user: newUser, otpPending: null }));
  },

  signupRiderDirect: async (data) => {
    const generation = ++authGeneration;
    const newRider = await usersApi.registerRider(data);
    if (generation !== authGeneration) throw new Error('Your session changed. Please sign in to your new account.');
    set(s => ({ allUsers: [...s.allUsers.filter(u => u.id !== newRider.id), newRider], user: newRider, otpPending: null }));
    // Preserve the rider's daylight-friendly default after confirmed signup.
    useThemeStore.getState().setTheme('light');
  },

  signup: (data) => {
    const otp = generateOTP();
    const contact = data.email || data.phone || '';
    const method = data.email ? 'email' : 'phone';
    const newUser: User = {
      id: generateId(),
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      createdAt: Date.now(),
      verified: false,
    };
    set(s => ({
      allUsers: [...s.allUsers, newUser],
      otpPending: { contact, otp, role: data.role, method },
    }));
    console.log(`[OTP] ${method}: ${otp} for ${contact}`);
    return otp;
  },

  signupRider: (data) => {
    const otp = generateOTP();
    const contact = data.email || data.phone || '';
    const method = data.email ? 'email' : 'phone';
    const newRider: RiderProfile = {
      id: generateId(),
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: 'rider',
      vehicleType: data.vehicleType,
      vehiclePlate: data.vehiclePlate,
      status: 'pending',
      availability: 'offline',
      totalDeliveries: 0,
      rating: 0,
      earnings: 0,
      createdAt: Date.now(),
      verified: false,
      nationalIdUrl: data.nationalIdUrl,
      photoUrl: data.photoUrl,
    };
    set(s => ({
      allUsers: [...s.allUsers, newRider],
      otpPending: { contact, otp, role: 'rider', method },
    }));
    console.log(`[OTP] ${method}: ${otp} for ${contact}`);
    return otp;
  },

  logout: () => {
    authGeneration++;
    // Also end the Google session, so the next visit does not sign straight back in.
    void supabase.auth.signOut();
    set({ user: null, otpPending: null });
  },

  updateProfile: (data) => set(s => {
    if (!s.user) return s;
    // Profile editing must not change identity, role, verification or rider
    // approval. The server draft must enforce this independently of the UI.
    const editable: Partial<User> = {};
    const patch: Record<string, unknown> = {};
    if ('name' in data) { editable.name = data.name; patch.name = data.name; }
    if ('email' in data) { editable.email = data.email; patch.email = data.email || null; }
    if ('phone' in data) { editable.phone = data.phone; patch.phone = data.phone || null; }
    if ('avatar' in data) editable.avatar = data.avatar;
    const updated = { ...s.user, ...editable };
    if (Object.keys(patch).length) void usersApi.update(updated.id, patch);
    return {
      user: updated,
      allUsers: s.allUsers.map(u => u.id === updated.id ? updated : u),
    };
  }),

  updateRiderVerification: async (data) => {
    const current = get().user;
    if (!current || current.role !== 'rider') return;
    const patch = { ...data, status: 'pending' as const };
    const updated = { ...current, ...patch } as RiderProfile;
    set(s => ({ user: updated, allUsers: s.allUsers.map(u => u.id === updated.id ? updated : u) }));
    await usersApi.update(updated.id, {
      national_id_url: updated.nationalIdUrl || null,
      photo_url: updated.photoUrl || null,
      selfie_url: (updated as RiderProfile & { selfieUrl?: string }).selfieUrl || null,
      status: 'pending',
    });
  },

  addContact: (type, value) => set(s => {
    if (!s.user) return s;
    const updated = { ...s.user, [type]: value };
    void usersApi.update(updated.id, { [type]: value });
    return {
      user: updated,
      allUsers: s.allUsers.map(u => u.id === updated.id ? updated : u),
    };
  }),

  approveRider: (riderId) => {
    void usersApi.update(riderId, { status: 'approved' });
    set(s => ({
      allUsers: s.allUsers.map(u => u.id === riderId && u.role === 'rider' ? { ...u, status: 'approved' as RiderStatus } : u),
    }));
  },

  rejectRider: (riderId) => {
    void usersApi.update(riderId, { status: 'rejected' });
    set(s => ({
      allUsers: s.allUsers.map(u => u.id === riderId && u.role === 'rider' ? { ...u, status: 'rejected' as RiderStatus } : u),
    }));
  },

  suspendRider: (riderId) => {
    void usersApi.update(riderId, { status: 'suspended' });
    set(s => ({
      allUsers: s.allUsers.map(u => u.id === riderId && u.role === 'rider' ? { ...u, status: 'suspended' as RiderStatus } : u),
    }));
  },

  // ── Remote sync handlers (invoked by syncService) ──────────────────
  applyRemoteRiderPresence: (remoteRider) => {
    if (!remoteRider || !remoteRider.id) return;
    set(s => {
      const exists = s.allUsers.some(u => u.id === remoteRider.id);
      return {
        allUsers: exists
          ? s.allUsers.map(u => (u.id === remoteRider.id ? { ...u, ...remoteRider } : u))
          : [...s.allUsers, remoteRider],
      };
    });
  },

  applyRemoteRiderLocation: (riderId, lat, lng) => {
    set(s => ({
      allUsers: s.allUsers.map(u =>
        u.id === riderId && u.role === 'rider'
          ? ({ ...u, location: { lat, lng } } as RiderProfile)
          : u,
      ),
    }));
  },

  getRiders: () => get().allUsers.filter((u): u is RiderProfile => u.role === 'rider'),

  getCustomers: () => get().allUsers.filter(u => u.role === 'customer'),

  // Local-only — updates the in-memory position immediately, with no
  // network write. This is what should drive the map/camera/arrow, since
  // it needs every real GPS tick, not throttled. Call persistLocation
  // (below) separately, on its own throttle, for the Supabase write.
  updateRiderLocation: (lat, lng) => {
    const s = get();
    if (!s.user || s.user.role !== 'rider') return;
    set(s2 => {
      if (!s2.user || s2.user.role !== 'rider') return s2;
      const updated = { ...s2.user, location: { lat, lng } } as RiderProfile;
      // Only rebuild allUsers when this rider's entry actually needs to
      // change within it — on the live nav screen this fires frequently
      // (even at the capped ~10/sec rate above), and remapping the
      // whole array every time is needless extra work on top of an
      // already-frequent update.
      const idx = s2.allUsers.findIndex(u => u.id === updated.id);
      const allUsers = idx === -1 ? s2.allUsers : [
        ...s2.allUsers.slice(0, idx),
        updated,
        ...s2.allUsers.slice(idx + 1),
      ];
      return { user: updated, allUsers };
    });
  },

  // Network write — call this on its own throttle (not every GPS tick),
  // since every call is a real Supabase write.
  persistRiderLocation: (lat, lng) => {
    const s = get();
    if (!s.user || s.user.role !== 'rider') return;
    void usersApi.update(s.user.id, { location: { lat, lng } });
  },

  setRiderAvailability: async (status) => {
    const current = get().user;
    if (!current || current.role !== 'rider') return false;

    // Going offline is always allowed locally, even during an outage.
    if (status === 'offline') {
      set(s => {
        if (s.user?.id !== current.id || s.user.role !== 'rider') return s;
        const updated = { ...s.user, availability: 'offline' as const } as RiderProfile;
        return { user: updated, allUsers: s.allUsers.map(u => u.id === updated.id ? updated : u) };
      });
    }
    try {
      if (status !== 'offline') {
        const fresh = await get().refreshCurrentUser();
        if (!fresh || fresh.id !== current.id || !isApprovedRider(fresh) || get().user?.id !== current.id) return false;
      }
      const saved = await usersApi.setRiderAvailability(current.id, status);
      if (!saved || (status !== 'offline' && !isApprovedRider(saved))) {
        if (get().user?.id === current.id) await get().refreshCurrentUser();
        return false;
      }
      set(s => s.user?.id === current.id && s.user.role === 'rider'
        ? { user: saved, allUsers: [...s.allUsers.filter(u => u.id !== saved.id), saved] }
        : s);
      return get().user?.id === current.id;
    } catch (err) {
      console.warn('[authStore] Could not save rider availability:', err);
      return false;
    }
  },

  // Records a completed delivery against a rider BY ID rather than the
  // currently logged-in user — the status change that completes an order
  // can be triggered from the rider's own session, but should still work
  // correctly if triggered elsewhere (e.g. a manager action) later on.
  // Now writes through to Supabase so the count/earnings persist across
  // devices, not just the browser that completed the delivery.
  requestCommissionPayment: (amount) => {
    const me = get().user;
    if (!me || me.role !== 'rider' || !(amount > 0)) return;
    const request = { amount, requestedAt: Date.now() };
    void usersApi.update(me.id, { commission_payment_request: request });
    set(st => ({
      user: { ...(st.user as RiderProfile), commissionPaymentRequest: request },
      allUsers: st.allUsers.map(u => u.id === me.id ? { ...u, commissionPaymentRequest: request } : u),
    }));
  },

  confirmCommissionPayment: (riderId) => {
    const rider = get().allUsers.find((u): u is RiderProfile => u.id === riderId && u.role === 'rider');
    const request = rider?.commissionPaymentRequest;
    if (!rider || !request) return;
    // Settle up to the moment the rider reported paying; later deliveries stay owed.
    const settledAt = request.requestedAt;
    void usersApi.update(riderId, {
      commission_settled_at: new Date(settledAt).toISOString(),
      commission_payment_request: null,
    });
    set(st => ({
      allUsers: st.allUsers.map(u => u.id === riderId && u.role === 'rider'
        ? { ...u, commissionSettledAt: settledAt, commissionPaymentRequest: undefined } : u),
      user: st.user?.id === riderId && st.user.role === 'rider'
        ? { ...st.user, commissionSettledAt: settledAt, commissionPaymentRequest: undefined } : st.user,
    }));
  },

  recordDelivery: (riderId, earnedAmount) => {
    const rider = get().allUsers.find(u => u.id === riderId && u.role === 'rider') as RiderProfile | undefined;
    if (!rider) return;
    const newTotalDeliveries = (rider.totalDeliveries || 0) + 1;
    const newEarnings = (rider.earnings || 0) + earnedAmount;
    void usersApi.update(riderId, { total_deliveries: newTotalDeliveries, earnings: newEarnings });
    set(s => {
      const current = s.allUsers.find(u => u.id === riderId && u.role === 'rider') as RiderProfile | undefined;
      if (!current) return s;
      const updated: RiderProfile = { ...current, totalDeliveries: newTotalDeliveries, earnings: newEarnings };
      return {
        allUsers: s.allUsers.map(u => u.id === riderId ? updated : u),
        user: s.user && s.user.id === riderId ? updated : s.user,
      };
    });
  },
}), { name: 'db-auth' }));
