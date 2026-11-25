import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DiscountSettings, DEFAULT_DISCOUNTS, validateDiscounts } from '../lib/discounts';
import { fetchDiscounts, saveDiscounts } from '../lib/settingsApi';

interface DiscountStore {
  settings: DiscountSettings;
  updatedAt: number | null;
  /** Pull the shared discount settings. Keeps the last known values if offline. */
  load: () => Promise<void>;
  /** Save for everyone. Returns an error message if validation or the save fails. */
  save: (settings: DiscountSettings) => Promise<{ ok: boolean; error?: string }>;
}

export const useDiscountStore = create<DiscountStore>()(persist((set) => ({
  settings: DEFAULT_DISCOUNTS,
  updatedAt: null,

  load: async () => {
    const result = await fetchDiscounts();
    if (result) set({ settings: result.settings, updatedAt: result.updatedAt });
  },

  save: async (settings) => {
    const error = validateDiscounts(settings);
    if (error) return { ok: false, error };
    const result = await saveDiscounts(settings);
    if (!result.ok) return result;
    set({ settings, updatedAt: Date.now() });
    return { ok: true };
  },
}), { name: 'db-discounts' }));
