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
): { price: number; breakdown: { baseFare: number; distanceFare: number; fuelCost: number; companyFee: number; total: number } } {
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

export const FUEL_PRICE_PER_LITER = 14.5; // GHS

export function estimateFuelCost(distance: number, vehicleType: VehicleType): number {
  const consumption = FUEL_CONSUMPTION[vehicleType];
  const liters = (distance / 100) * consumption;
  return Math.round(liters * FUEL_PRICE_PER_LITER * 100) / 100;
}
