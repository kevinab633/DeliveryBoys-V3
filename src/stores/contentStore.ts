import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PriceRule, PricingMode } from '../lib/types';
import { getDefaultRules } from '../lib/pricing';

interface ContentStore {
  content: Record<string, string>;
  priceRules: PriceRule[];
  pricingMode: PricingMode;
  manualOverrides: Record<string, number>;
  updateContent: (key: string, value: string) => void;
  updatePriceRule: (id: string, updates: Partial<PriceRule>) => void;
  setPricingMode: (mode: PricingMode) => void;
  setManualOverride: (key: string, price: number) => void;
  removeManualOverride: (key: string) => void;
  getContent: (key: string, fallback: string) => string;
}

export const useContentStore = create<ContentStore>()(persist((set, get) => ({
  content: {
    'home.hero.title': 'Delivery Boys',
    'home.hero.subtitle': 'We Go The Extra Mile For You!',
    'home.hero.description': "Ghana's most trusted delivery service. Fast, reliable, and always on time. Book a delivery in seconds.",
    'home.cta.primary': 'Book a Delivery',
    'home.cta.secondary': 'Become a Rider',
    'about.title': 'About Delivery Boys',
    'about.description': 'Founded in Accra, we started with a small team of dedicated riders and a big dream. Today, we\'ve grown into one of the most trusted delivery services in Ghana.',
  },
  priceRules: getDefaultRules(),
  pricingMode: 'auto',
  manualOverrides: {},

  updateContent: (key, value) => set(s => ({ content: { ...s.content, [key]: value } })),
  updatePriceRule: (id, updates) => set(s => ({
    priceRules: s.priceRules.map(r => r.id === id ? { ...r, ...updates } : r),
  })),
  setPricingMode: (mode) => set({ pricingMode: mode }),
  setManualOverride: (key, price) => set(s => ({ manualOverrides: { ...s.manualOverrides, [key]: price } })),
  removeManualOverride: (key) => set(s => {
    const { [key]: _, ...rest } = s.manualOverrides;
    return { manualOverrides: rest };
  }),
  getContent: (key, fallback) => get().content[key] || fallback,
}), { name: 'db-content' }));
