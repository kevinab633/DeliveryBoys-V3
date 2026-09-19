import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, RiderProfile, UserRole, RiderStatus, VehicleType } from '../lib/types';
import { generateId, generateOTP } from '../lib/utils';

interface AuthStore {
  user: User | RiderProfile | null;
  allUsers: (User | RiderProfile)[];
  otpPending: { contact: string; otp: string; role: UserRole; method: 'email' | 'phone' } | null;
  login: (emailOrPhone: string, role: UserRole) => string; // returns OTP
  verifyOTP: (code: string) => boolean;
  signup: (data: { name: string; email?: string; phone?: string; role: UserRole }) => string;
  signupRider: (data: { name: string; email?: string; phone?: string; vehicleType: VehicleType; vehiclePlate: string; nationalIdUrl: string; photoUrl: string }) => string;
  // ── Direct auth (OTP removed for now — will be re-added later) ──────
  // These sign the user in immediately with no verification step.
  loginDirect: (emailOrPhone: string, role: UserRole) => void;
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
  otpPending: null,

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
  loginDirect: (emailOrPhone, role) => {
    const method = emailOrPhone.includes('@') ? 'email' : 'phone';
    const { allUsers } = get();
    let user = allUsers.find(u => {
      if (method === 'email') return u.email === emailOrPhone && u.role === role;
      return u.phone === emailOrPhone && u.role === role;
    });
    if (!user) {
      user = {
        id: generateId(),
        name: emailOrPhone.split('@')[0] || 'User',
        [method]: emailOrPhone,
        role,
        createdAt: Date.now(),
        verified: true,
      } as User;
      set({ allUsers: [...allUsers, user] });
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
    return {
      user: updated,
      allUsers: s.allUsers.map(u => u.id === updated.id ? updated : u),
    };
  }),

  addContact: (type, value) => set(s => {
    if (!s.user) return s;
    const updated = { ...s.user, [type]: value };
    return {
      user: updated,
      allUsers: s.allUsers.map(u => u.id === updated.id ? updated : u),
    };
  }),

  approveRider: (riderId) => set(s => ({
    allUsers: s.allUsers.map(u => u.id === riderId && u.role === 'rider' ? { ...u, status: 'approved' as RiderStatus } : u),
  })),

  rejectRider: (riderId) => set(s => ({
    allUsers: s.allUsers.map(u => u.id === riderId && u.role === 'rider' ? { ...u, status: 'rejected' as RiderStatus } : u),
  })),

  suspendRider: (riderId) => set(s => ({
    allUsers: s.allUsers.map(u => u.id === riderId && u.role === 'rider' ? { ...u, status: 'suspended' as RiderStatus } : u),
  })),

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

  updateRiderLocation: (lat, lng) => set(s => {
    if (!s.user || s.user.role !== 'rider') return s;
    const updated = { ...s.user, location: { lat, lng } } as RiderProfile;
    return {
      user: updated,
      allUsers: s.allUsers.map(u => u.id === updated.id ? updated : u),
    };
  }),

  setRiderAvailability: (status) => set(s => {
    if (!s.user || s.user.role !== 'rider') return s;
    const updated = { ...s.user, availability: status } as RiderProfile;
    return {
      user: updated,
      allUsers: s.allUsers.map(u => u.id === updated.id ? updated : u),
    };
  }),
}), { name: 'db-auth' }));
