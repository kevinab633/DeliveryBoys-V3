// Discounts set by the manager on the Prices tab.
//
// A discount takes the same percentage off the whole fare: the customer pays
// less, and the commission and the rider's share (fuel included) each give up
// that percentage, so the split stays fair for both.
//
// - First sign-up offer: the customer's first N bookings. Every booking counts,
//   including cancelled ones, so cancelling cannot be used to reset the offer.
// - Seasonal discount: applies to every customer whose sign-up offer is used up.
// - When both apply, a new customer gets the larger of the two.

export interface DiscountSettings {
  signup: { active: boolean; pct: number; deliveries: number };
  seasonal: { active: boolean; pct: number; label: string };
}

export const DEFAULT_DISCOUNTS: DiscountSettings = {
  signup: { active: false, pct: 0, deliveries: 0 },
  seasonal: { active: false, pct: 0, label: '' },
};

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Discount percentage for a customer who has made this many bookings (all statuses). */
export function discountPercentFor(bookingCount: number, s: DiscountSettings): number {
  const signupPct = s.signup.active && bookingCount < s.signup.deliveries ? clampPct(s.signup.pct) : 0;
  const seasonalPct = s.seasonal.active ? clampPct(s.seasonal.pct) : 0;
  return Math.max(signupPct, seasonalPct);
}

/** Returns an error message, or null when the settings are valid. */
export function validateDiscounts(s: DiscountSettings): string | null {
  const validPct = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
  if (!validPct(s.signup.pct) || !validPct(s.seasonal.pct)) return 'Discount must be between 0 and 100%.';
  if (!Number.isInteger(s.signup.deliveries) || s.signup.deliveries < 0 || s.signup.deliveries > 100) {
    return 'Number of bookings must be a whole number from 0 to 100.';
  }
  return null;
}

/** Fill in any missing fields from saved JSON. */
export function mergeDiscounts(saved: Partial<DiscountSettings> | null | undefined): DiscountSettings {
  return {
    signup: { ...DEFAULT_DISCOUNTS.signup, ...(saved?.signup ?? {}) },
    seasonal: { ...DEFAULT_DISCOUNTS.seasonal, ...(saved?.seasonal ?? {}) },
  };
}
