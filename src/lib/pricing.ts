import { VehicleType, PriceRule } from './types';

// Yango-style pricing model
// Base fare + per-km rate + fuel surcharge + company margin
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

export function calculatePrice(
  distance: number,
  vehicleType: VehicleType,
  rules: PriceRule[],
  manualOverrides?: Record<string, number>,
  pricingMode: 'auto' | 'manual' | 'hybrid' = 'auto'
): { price: number; breakdown: PriceBreakdown } {
  // Motorcycles use the agreed rider-pay formula (see motorcyclePricing).
  if (vehicleType === 'motorcycle') {
    const m = motorcyclePricing(distance);
    let total = m.total;
    if ((pricingMode === 'manual' || pricingMode === 'hybrid') && manualOverrides) {
      const key = `${vehicleType}-${Math.floor(distance)}`;
      if (manualOverrides[key]) total = manualOverrides[key];
    }
    return {
      price: total,
      breakdown: {
        baseFare: m.riderPay,
        distanceFare: 0,
        fuelCost: m.fuelCost,
        companyFee: m.companyFee,
        total,
        riderPay: m.riderPay,
        serviceFee: MOTORCYCLE_RATES.companyFlatFee,
        riderEarnings: round2(total - m.companyFee),
      },
    };
  }

  // Find applicable rule
  const rule = rules.find(r => r.vehicleType === vehicleType && distance >= r.minDistance && distance < r.maxDistance)
    || rules.find(r => r.vehicleType === vehicleType);
  
  if (!rule) {
    return { price: 0, breakdown: { baseFare: 0, distanceFare: 0, fuelCost: 0, companyFee: 0, total: 0 } };
  }

  const baseFare = rule.baseFare;
  const distanceFare = distance * rule.perKmRate;
  const fuelCost = distance * (rule.fuelSurcharge / 10); // fuel per km
  const subtotal = baseFare + distanceFare + fuelCost;
  const companyFee = subtotal * rule.companyMargin;
  let total = Math.round((subtotal + companyFee) * 100) / 100;

  // Manual override
  if (pricingMode === 'manual' && manualOverrides) {
    const key = `${vehicleType}-${Math.floor(distance)}`;
    if (manualOverrides[key]) total = manualOverrides[key];
  } else if (pricingMode === 'hybrid' && manualOverrides) {
    const key = `${vehicleType}-${Math.floor(distance)}`;
    if (manualOverrides[key]) total = manualOverrides[key];
  }

  return { price: total, breakdown: { baseFare, distanceFare: Math.round(distanceFare * 100) / 100, fuelCost: Math.round(fuelCost * 100) / 100, companyFee: Math.round(companyFee * 100) / 100, total } };
}

// Fuel consumption estimates (L/100km)
export const FUEL_CONSUMPTION: Record<VehicleType, number> = {
  motorcycle: 3.0,
  car: 8.0,
  van: 12.0,
  truck: 18.0,
};

// Petrol pump price in GHS per litre. Updated to the October 2026 price
// (about GHS 18.78). Used only for the "Est. fuel" display on the booking
// page; fares are calculated separately in calculatePrice and do not use it.
export const FUEL_PRICE_PER_LITER = 18.78; // GHS

export function estimateFuelCost(distance: number, vehicleType: VehicleType): number {
  const consumption = FUEL_CONSUMPTION[vehicleType];
  const liters = (distance / 100) * consumption;
  return Math.round(liters * FUEL_PRICE_PER_LITER * 100) / 100;
}

// ════════════════════════════════════════════════════════════════════
// Motorcycle pricing (agreed Oct 2026 model)
//  - Rider pay: GHS 15 for trips up to 4 km, then +GHS 2.50 per km
//    (i.e. +GHS 5 for every 2 km).
//  - Fuel: separate line, for the trip plus a 2 km approach to pickup,
//    at the motorcycle's litres/100 km and the current pump price.
//  - Service fee: GHS 5 flat, charged to the customer.
//  - Company keeps a 10% share of rider pay above GHS 15, taken from the
//    rider's pay (the customer fare is not affected by this share).
// Customer fare = rider pay + fuel + service fee.
// ════════════════════════════════════════════════════════════════════

export interface PriceBreakdown {
  baseFare: number;
  distanceFare: number;
  fuelCost: number;
  companyFee: number;
  total: number;
  /** Motorcycle only: gross rider pay before the company share. */
  riderPay?: number;
  /** Motorcycle only: flat service fee shown to the customer. */
  serviceFee?: number;
  /** Motorcycle only: what the rider receives (rider pay minus the company
   *  share, plus fuel). Equals total minus companyFee. */
  riderEarnings?: number;
}

export const MOTORCYCLE_RATES = {
  approachKm: 2,
  riderBaseFare: 15,
  riderBaseKm: 4,
  riderPerKmAfterBase: 2.5,
  companyFlatFee: 5,
  companyShareAboveBase: 0.1,
};

/** Orders created before this moment keep the old 75% rider earnings. */
export const MOTORCYCLE_PRICING_EFFECTIVE_AT = Date.parse('2026-10-13T00:00:00Z');

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function motorcyclePricing(distance: number) {
  const r = MOTORCYCLE_RATES;
  const riderPay = distance <= r.riderBaseKm
    ? r.riderBaseFare
    : r.riderBaseFare + r.riderPerKmAfterBase * (distance - r.riderBaseKm);
  const fuelCost = round2((distance + r.approachKm) * (FUEL_CONSUMPTION.motorcycle / 100) * FUEL_PRICE_PER_LITER);
  const companyShare = round2(r.companyShareAboveBase * Math.max(0, riderPay - r.riderBaseFare));
  const companyFee = round2(r.companyFlatFee + companyShare);
  const total = round2(riderPay + fuelCost + r.companyFlatFee);
  return { riderPay: round2(riderPay), fuelCost, companyFee, total };
}

/** What the rider receives for an order. Motorcycle orders from the new
 *  model: fare minus the company fee. Older orders: 75% of the fare. */
export function riderEarningsForOrder(order: {
  price: number;
  distance: number;
  vehicleType: VehicleType;
  createdAt: number;
}): number {
  if (order.vehicleType === 'motorcycle' && order.createdAt >= MOTORCYCLE_PRICING_EFFECTIVE_AT) {
    return round2(order.price - motorcyclePricing(order.distance).companyFee);
  }
  return order.price * 0.75;
}
