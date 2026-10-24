import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FUEL_PRICE_PER_LITER, DIESEL_PRICE_PER_LITER } from '../lib/pricing';
import { fetchFuelPrice, saveFuelPrice, FuelKind } from '../lib/settingsApi';

interface FuelPriceStore {
  /** Petrol price, GHS per litre. Used for motorcycles and cars. */
  pricePerLitre: number;
  /** Diesel price, GHS per litre. Used for vans and trucks. */
  dieselPricePerLitre: number;
  /** When the petrol price was last saved (null = never saved in the database). */
  updatedAt: number | null;
  /** When the diesel price was last saved (null = never saved in the database). */
  dieselUpdatedAt: number | null;
  /** Pull the shared prices from the database. Keeps the last known values if offline. */
  load: () => Promise<void>;
  /** Save a new price for everyone. Returns false if validation or the save fails. */
  save: (fuel: FuelKind, price: number) => Promise<boolean>;
}

export const useFuelPriceStore = create<FuelPriceStore>()(persist((set) => ({
  pricePerLitre: FUEL_PRICE_PER_LITER,
  dieselPricePerLitre: DIESEL_PRICE_PER_LITER,
  updatedAt: null,
  dieselUpdatedAt: null,

  load: async () => {
    const [petrol, diesel] = await Promise.all([fetchFuelPrice('petrol'), fetchFuelPrice('diesel')]);
    set(s => ({
      pricePerLitre: petrol?.price ?? s.pricePerLitre,
      updatedAt: petrol?.updatedAt ?? s.updatedAt,
      dieselPricePerLitre: diesel?.price ?? s.dieselPricePerLitre,
      dieselUpdatedAt: diesel?.updatedAt ?? s.dieselUpdatedAt,
    }));
  },

  save: async (fuel, price) => {
    if (!Number.isFinite(price) || price <= 0 || price > 100) return false;
    const ok = await saveFuelPrice(fuel, price);
    if (!ok) return false;
    const now = Date.now();
    set(fuel === 'petrol'
      ? { pricePerLitre: price, updatedAt: now }
      : { dieselPricePerLitre: price, dieselUpdatedAt: now });
    return true;
  },
}), { name: 'db-fuel-price' }));
