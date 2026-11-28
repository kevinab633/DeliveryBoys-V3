import type { RiderProfile, User } from './types';

/** UI/store guard only. Server authorization is required to prevent bypass. */
export function isApprovedRider(user: User | RiderProfile | null | undefined): user is RiderProfile & { status: 'approved' } {
  return !!user && user.role === 'rider' && 'status' in user && user.status === 'approved';
}
