import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, RiderProfile, UserRole, RiderStatus, VehicleType } from '../lib/types';
import { generateId, generateOTP } from '../lib/utils';
import { usersApi } from '../lib/usersApi';

interface AuthStore {
  user: User | RiderProfile | null;
  allUsers: (User | RiderProfile)[];
  usersLoaded: boolean;
  otpPending: { contact: string; otp: string; role: UserRole; method: 'email' | 'phone' } | null;
  /** Fetches every account from Supabase and merges it into allUsers —
   *  call this once on app startup, same pattern as orderStore's init(). */
  loadUsers: () => Promise<void>;
  login: (emailOrPhone: string, role: UserRole) => string; // returns OTP
  verifyOTP: (code: string) => boolean;
  signup: (data: { name: string; email?: string; phone?: string; role: UserRole }) => string;
  signupRider: (data: { name: string; email?: string; phone?: string; vehicleType: VehicleType; vehiclePlate: string; nationalIdUrl: string; photoUrl: string }) => string;
  // ── Direct auth (OTP removed for now — will be re-added later) ──────
  // These sign the user in immediately with no verification step.
  loginDirect: (emailOrPhone: string, role: UserRole) => Promise<void>;
  signupDirect: (data: { name: string; email?: string; phone?: string; role: UserRole }) => void;
  signupRiderDirect: (data: { name: string; email?: string; phone?: string; vehicleType: VehicleType; vehiclePlate: string; nationalIdUrl: string; photoUrl: string }) => void;
  logout: () => void;
  updateProfile: (data: Partial<User>) => void;
  addContact: (type: 'email' | 'phone', value: string) => void;
  // Manager actions
  approveRider: (riderId: string) => void;
  rejectRider: (riderId: string) => void;
  suspendRider: (riderId: string) => void;
  getRiders: () => RiderProfile[];
  getCustomers: () => User[];
  updateRiderLocation: (lat: number, lng: number) => void;
  setRiderAvailability: (status: 'online' | 'offline' | 'busy') => void;
  recordDelivery: (riderId: string, earnedAmount: number) => void;
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
        user: refreshedSelf || s.user,
        usersLoaded: true,
      };
    });
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
  // Find-or-create by contact and sign in immediately, no code step.
  // Checks Supabase first (so an account created on another device is
  // found), falling back to local allUsers, then creates fresh if neither
  // has it — same shape as before, just DB-backed now.
  loginDirect: async (emailOrPhone, role) => {
    const method = emailOrPhone.includes('@') ? 'email' : 'phone';
    let user = get().allUsers.find(u => {
      if (method === 'email') return u.email === emailOrPhone && u.role === role;
      return u.phone === emailOrPhone && u.role === role;
    });
    if (!user) {
      user = (await usersApi.findByContact(emailOrPhone, method, role)) || undefined;
    }
    if (!user) {
      user = {
        id: generateId(),
        name: emailOrPhone.split('@')[0] || 'User',
        [method]: emailOrPhone,
        role,
        createdAt: Date.now(),
        verified: true,
      } as User;
      set(s => ({ allUsers: [...s.allUsers, user!] }));
      void usersApi.upsert(user);
    } else {
      // Found remotely but not yet in local allUsers — merge it in.
      set(s => (s.allUsers.some(u => u.id === user!.id) ? s : { allUsers: [...s.allUsers, user!] }));
    }
    set({ user, otpPending: null });
  },

  signupDirect: (data) => {
    const newUser: User = {
      id: generateId(),
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      createdAt: Date.now(),
      verified: true,
    };
    set(s => ({ allUsers: [...s.allUsers, newUser], user: newUser, otpPending: null }));
    void usersApi.upsert(newUser);
  },

  signupRiderDirect: (data) => {
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
      verified: true,
      nationalIdUrl: data.nationalIdUrl,
      photoUrl: data.photoUrl,
    };
    set(s => ({ allUsers: [...s.allUsers, newRider], user: newRider, otpPending: null }));
    void usersApi.upsert(newRider);
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

  logout: () => set({ user: null, otpPending: null }),

  updateProfile: (data) => set(s => {
    if (!s.user) return s;
    const updated = { ...s.user, ...data };
    void usersApi.upsert(updated);
    return {
      user: updated,
      allUsers: s.allUsers.map(u => u.id === updated.id ? updated : u),
    };
  }),

  addContact: (type, value) => set(s => {
    if (!s.user) return s;
    const updated = { ...s.user, [type]: value };
    void usersApi.upsert(updated);
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

  updateRiderLocation: (lat, lng) => {
    const s = get();
    if (!s.user || s.user.role !== 'rider') return;
    void usersApi.update(s.user.id, { location: { lat, lng } });
    set(s2 => {
      if (!s2.user || s2.user.role !== 'rider') return s2;
      const updated = { ...s2.user, location: { lat, lng } } as RiderProfile;
      return {
        user: updated,
        allUsers: s2.allUsers.map(u => u.id === updated.id ? updated : u),
      };
    });
  },

  setRiderAvailability: (status) => {
    const s = get();
    if (!s.user || s.user.role !== 'rider') return;
    void usersApi.update(s.user.id, { availability: status });
    set(s2 => {
      if (!s2.user || s2.user.role !== 'rider') return s2;
      const updated = { ...s2.user, availability: status } as RiderProfile;
      return {
        user: updated,
        allUsers: s2.allUsers.map(u => u.id === updated.id ? updated : u),
      };
    });
  },

  // Records a completed delivery against a rider BY ID rather than the
  // currently logged-in user — the status change that completes an order
  // can be triggered from the rider's own session, but should still work
  // correctly if triggered elsewhere (e.g. a manager action) later on.
  // Now writes through to Supabase so the count/earnings persist across
  // devices, not just the browser that completed the delivery.
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
