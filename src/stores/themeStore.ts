import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeStore {
  theme: 'dark' | 'light';
  toggle: () => void;
  setTheme: (t: 'dark' | 'light') => void;
}

export const useThemeStore = create<ThemeStore>()(persist((set) => ({
  theme: 'dark',
  toggle: () => set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setTheme: (t) => set({ theme: t }),
}), { name: 'db-theme' }));
