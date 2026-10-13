import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FUEL_PRICE_PER_LITER } from '../lib/pricing';
import { fetchFuelPrice, saveFuelPrice } from '../lib/settingsApi';

interface FuelPriceStore {
  /** Current petrol price in GHS per litre, used for every new fare. */
  pricePerLitre: number;
  /** When the price was last saved (null = never saved in the database). */
  updatedAt: number | null;
  /** Pull the shared price from the database. Keeps the last known value if offline. */
  load: () => Promise<void>;
  /** Save a new price for everyone. Returns false if validation or the save fails. */
  save: (price: number) => Promise<boolean>;
}

export const useFuelPriceStore = create<FuelPriceStore>()(persist((set) => ({
  pricePerLitre: FUEL_PRICE_PER_LITER,
  updatedAt: null,

  load: async () => {
    const remote = await fetchFuelPrice();
    if (remote) set({ pricePerLitre: remote.price, updatedAt: remote.updatedAt });
  },

  save: async (price) => {
    if (!Number.isFinite(price) || price <= 0 || price > 100) return false;
    const ok = await saveFuelPrice(price);
    if (ok) set({ pricePerLitre: price, updatedAt: Date.now() });
    return ok;
  },
}), { name: 'db-fuel-price' }));
