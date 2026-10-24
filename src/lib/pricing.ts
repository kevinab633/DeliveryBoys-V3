import { VehicleType, PriceRule, Order } from './types';

// Legacy per-km rules. They are still stored for the manager's pricing
// table, but fares no longer use them (see calculatePrice).
const DEFAULT_RULES: PriceRule[] = [
  // Motorcycle
  { id: 'moto-short', minDistance: 0, maxDistance: 5, baseFare: 8, perKmRate: 2.5, fuelSurcharge: 1.5, companyMargin: 0.25, vehicleType: 'motorcycle' },
  { id: 'moto-mid', minDistance: 5, maxDistance: 15, baseFare: 8, perKmRate: 2.0, fuelSurcharge: 1.5, companyMargin: 0.25, vehicleType: 'motorcycle' },
  { id: 'moto-long', minDistance: 15, maxDistance: 50, baseFare: 8, perKmRate: 1.8, fuelSurcharge: 1.5, companyMargin: 0.25, vehicleType: 'motorcycle' },
  { id: 'moto-xlong', minDistance: 50, maxDistance: 999, baseFare: 8, perKmRate: 1.5, fuelSurcharge: 1.5, companyMargin: 0.25, vehicleType: 'motorcycle' },
  // Car
  { id: 'car-short', minDistance: 0, maxDistance: 5, baseFare: 15, perKmRate: 3.5, fuelSurcharge: 3.0, companyMargin: 0.25, vehicleType: 'car' },
  { id: 'car-mid', minDistance: 5, maxDistance: 15, baseFare: 15, perKmRate: 3.0, fuelSurcharge: 3.0, companyMargin: 0.25, vehicleType: 'car' },
  { id: 'car-long', minDistance: 15, maxDistance: 50, baseFare: 15, perKmRate: 2.5, fuelSurcharge: 3.0, companyMargin: 0.25, vehicleType: 'car' },
  { id: 'car-xlong', minDistance: 50, maxDistance: 999, baseFare: 15, perKmRate: 2.0, fuelSurcharge: 3.0, companyMargin: 0.25, vehicleType: 'car' },
  // Van
  { id: 'van-short', minDistance: 0, maxDistance: 5, baseFare: 25, perKmRate: 5.0, fuelSurcharge: 5.0, companyMargin: 0.25, vehicleType: 'van' },
  { id: 'van-mid', minDistance: 5, maxDistance: 15, baseFare: 25, perKmRate: 4.5, fuelSurcharge: 5.0, companyMargin: 0.25, vehicleType: 'van' },
  { id: 'van-long', minDistance: 15, maxDistance: 999, baseFare: 25, perKmRate: 3.5, fuelSurcharge: 5.0, companyMargin: 0.25, vehicleType: 'van' },
  // Truck
  { id: 'truck-short', minDistance: 0, maxDistance: 10, baseFare: 50, perKmRate: 7.0, fuelSurcharge: 8.0, companyMargin: 0.25, vehicleType: 'truck' },
  { id: 'truck-long', minDistance: 10, maxDistance: 999, baseFare: 50, perKmRate: 5.5, fuelSurcharge: 8.0, companyMargin: 0.25, vehicleType: 'truck' },
];

export function getDefaultRules(): PriceRule[] {
  return DEFAULT_RULES;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 1.3 * 10) / 10; // 1.3x road factor
}

// ════════════════════════════════════════════════════════════════════
// Fuel
// ════════════════════════════════════════════════════════════════════

// Fuel consumption estimates (L/100km) per vehicle type.
export const FUEL_CONSUMPTION: Record<VehicleType, number> = {
  motorcycle: 3.0,
  car: 8.0,
  van: 12.0,
  truck: 18.0,
};

/** Default petrol pump price in GHS per litre (October 2026). The live
 *  value is set by managers and stored in the app's settings table. */
export const FUEL_PRICE_PER_LITER = 18.78;

export function estimateFuelCost(
  distance: number,
  vehicleType: VehicleType,
  fuelPricePerLitre: number = FUEL_PRICE_PER_LITER
): number {
  const liters = (distance / 100) * FUEL_CONSUMPTION[vehicleType];
  return Math.round(liters * fuelPricePerLitre * 100) / 100;
}

// ════════════════════════════════════════════════════════════════════
// Fare model (agreed October 2026, all vehicle types)
//  - Rider pay: GHS 15 for trips up to 4 km, then +GHS 2.50 per km
//    (i.e. +GHS 5 for every 2 km).
//  - Fuel: separate line, for the trip plus a 2 km approach to pickup,
//    at the vehicle's L/100 km and the current pump price.
//  - Service fee: GHS 5 flat, charged to the customer.
//  - Company keeps a 10% share of rider pay above GHS 15, taken from the
//    rider's pay (it does not change the customer fare).
// Customer fare = rider pay + fuel + service fee.
// ════════════════════════════════════════════════════════════════════

export interface PriceBreakdown {
  baseFare: number;
  distanceFare: number;
  fuelCost: number;
  companyFee: number;
  total: number;
  /** Gross rider pay before the company share. */
  riderPay?: number;
  /** Flat service fee shown to the customer. */
  serviceFee?: number;
  /** What the rider receives: rider pay minus the company share, plus fuel.
   *  Equals total minus companyFee. */
  riderEarnings?: number;
}

export const PAY_RATES = {
  approachKm: 2,
  riderBaseFare: 15,
  riderBaseKm: 4,
  riderPerKmAfterBase: 2.5,
  companyFlatFee: 5,
  companyShareAboveBase: 0.1,
};

/** Orders created before this moment keep the old 75% rider earnings. */
export const PRICING_EFFECTIVE_AT = Date.parse('2026-10-13T00:00:00Z');

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formulaPricing(
  distance: number,
  vehicleType: VehicleType,
  fuelPricePerLitre: number = FUEL_PRICE_PER_LITER
) {
  const r = PAY_RATES;
  const riderPay = distance <= r.riderBaseKm
    ? r.riderBaseFare
    : r.riderBaseFare + r.riderPerKmAfterBase * (distance - r.riderBaseKm);
  const fuelCost = round2((distance + r.approachKm) * (FUEL_CONSUMPTION[vehicleType] / 100) * fuelPricePerLitre);
  const companyShare = round2(r.companyShareAboveBase * Math.max(0, riderPay - r.riderBaseFare));
  const companyFee = round2(r.companyFlatFee + companyShare);
  const total = round2(riderPay + fuelCost + r.companyFlatFee);
  return { riderPay: round2(riderPay), fuelCost, companyShare, companyFee, serviceFee: r.companyFlatFee, total };
}

/** Cars, vans and trucks: the previous rule-table structure (base fare, per-km
 *  rate, company margin) is unchanged. The only moving part is the fuel line,
 *  which is now litres (distance x L/100 km) x the current pump price. */
function rulePricing(
  distance: number,
  vehicleType: VehicleType,
  rules: PriceRule[],
  fuelPricePerLitre: number
) {
  const rule = rules.find(r => r.vehicleType === vehicleType && distance >= r.minDistance && distance < r.maxDistance)
    || rules.find(r => r.vehicleType === vehicleType);
  if (!rule) return null;
  const baseFare = rule.baseFare;
  const distanceFare = round2(distance * rule.perKmRate);
  const fuelCost = estimateFuelCost(distance, vehicleType, fuelPricePerLitre);
  const subtotal = baseFare + distanceFare + fuelCost;
  const companyFee = round2(subtotal * rule.companyMargin);
  const total = round2(subtotal + companyFee);
  return { baseFare, distanceFare, fuelCost, companyFee, total };
}

export function calculatePrice(
  distance: number,
  vehicleType: VehicleType,
  rules: PriceRule[] = DEFAULT_RULES,
  manualOverrides?: Record<string, number>,
  pricingMode: 'auto' | 'manual' | 'hybrid' = 'auto',
  fuelPricePerLitre: number = FUEL_PRICE_PER_LITER
): { price: number; breakdown: PriceBreakdown } {
  let breakdown: PriceBreakdown;

  if (vehicleType === 'motorcycle') {
    const m = formulaPricing(distance, vehicleType, fuelPricePerLitre);
    breakdown = {
      baseFare: m.riderPay,
      distanceFare: 0,
      fuelCost: m.fuelCost,
      companyFee: m.companyFee,
      total: m.total,
      riderPay: m.riderPay,
      serviceFee: m.serviceFee,
      riderEarnings: round2(m.total - m.companyFee),
    };
  } else {
    const r = rulePricing(distance, vehicleType, rules, fuelPricePerLitre);
    if (!r) return { price: 0, breakdown: { baseFare: 0, distanceFare: 0, fuelCost: 0, companyFee: 0, total: 0 } };
    breakdown = { ...r };
  }

  let total = breakdown.total;
  if ((pricingMode === 'manual' || pricingMode === 'hybrid') && manualOverrides) {
    const key = `${vehicleType}-${Math.floor(distance)}`;
    if (manualOverrides[key]) total = manualOverrides[key];
  }

  return { price: total, breakdown: { ...breakdown, total } };
}

/** What the rider receives for an order.
 *  - Motorcycle orders from 2026-10-13: fare minus the company fee.
 *  - Everything else (and older orders): 75% of the fare, as before. */
export function riderEarningsForOrder(order: {
  price: number;
  distance: number;
  vehicleType: VehicleType;
  createdAt: number;
}): number {
  if (order.vehicleType === 'motorcycle' && order.createdAt >= PRICING_EFFECTIVE_AT) {
    return round2(order.price - formulaPricing(order.distance, order.vehicleType).companyFee);
  }
  return order.price * 0.75;
}

/** Company commission on one order: the fare minus what the rider receives. */
export function commissionForOrder(order: Order): number {
  return round2(order.price - riderEarningsForOrder(order));
}

/** Commission a rider still owes: their delivered orders after the last
 *  confirmed payment. Resets to zero once a payment is confirmed. */
export function commissionOwed(riderId: string, orders: Order[], settledAt?: number): number {
  const since = settledAt ?? 0;
  return round2(orders
    .filter(o => o.riderId === riderId && o.status === 'delivered' && (o.deliveredAt ?? o.createdAt) > since)
    .reduce((sum, o) => sum + commissionForOrder(o), 0));
}
