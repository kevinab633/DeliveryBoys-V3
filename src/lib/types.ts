export type UserRole = 'customer' | 'rider' | 'manager';
export type RiderStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type OrderStatus = 'pending' | 'accepted' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';
export type RiderAvailability = 'online' | 'offline' | 'busy';
export type PricingMode = 'auto' | 'manual' | 'hybrid';
export type VehicleType = 'motorcycle' | 'car' | 'van' | 'truck';
export type OrderType = 'instant' | 'scheduled';

export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  avatar?: string;
  createdAt: number;
  verified: boolean;
}

export interface RiderProfile extends User {
  role: 'rider';
  nationalIdUrl?: string;
  photoUrl?: string;
  vehicleType: VehicleType;
  vehiclePlate: string;
  status: RiderStatus;
  availability: RiderAvailability;
  location?: { lat: number; lng: number };
  totalDeliveries: number;
  rating: number;
  earnings: number;
}

export interface Location {
  lat: number;
  lng: number;
  address: string;
}

export interface Order {
  id: string;
  /** Short, human-readable order code shown to customers/riders (e.g.
   *  "DB-4F82") — the real database key (id) is a UUID and unreadable,
   *  so this is what appears anywhere an order needs to be shown, read
   *  aloud, or referenced in conversation. */
  displayCode: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  riderId?: string;
  riderName?: string;
  pickup: Location;
  dropoff: Location;
  distance: number; // km
  price: number;
  status: OrderStatus;
  vehicleType: VehicleType;
  packageDescription: string;
  createdAt: number;
  acceptedAt?: number;
  pickedUpAt?: number;
  deliveredAt?: number;
  riderLocation?: { lat: number; lng: number };
  orderType: OrderType;
  scheduledFor?: number; // timestamp for scheduled orders
  /** Staged dispatch: rider IDs currently in the active ringing window,
   *  nearest-first. undefined = legacy order (rings for everyone). */
  dispatchedTo?: string[];
  /** Why an order was cancelled (e.g. 'no_riders_available', 'user_cancelled'). */
  cancelReason?: string;
  /** Rider ID currently reviewing this order in their ringing/detail
   *  view — broadcast-only (not persisted to Supabase), so the customer
   *  can see "rider is responding" the moment a rider opens the order,
   *  even before they accept. Cleared on accept, decline, or dismiss. */
  respondingRiderId?: string;
}

export interface PriceRule {
  id: string;
  minDistance: number;
  maxDistance: number;
  baseFare: number;
  perKmRate: number;
  fuelSurcharge: number;
  companyMargin: number;
  vehicleType: VehicleType;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'order' | 'system' | 'promo';
  read: boolean;
  createdAt: number;
}

export interface EditableContent {
  [key: string]: string;
}
