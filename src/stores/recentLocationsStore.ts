import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RecentLocation {
  address: string;
  lat: number;
  lng: number;
}

interface RecentLocationsStore {
  recents: RecentLocation[];
  addRecent: (loc: RecentLocation) => void;
}

const MAX_RECENTS = 5;

export const useRecentLocationsStore = create<RecentLocationsStore>()(persist((set) => ({
  recents: [],
  addRecent: (loc) => set((s) => {
    // Dedupe by address, then prepend, cap at MAX_RECENTS
    const filtered = s.recents.filter((r) => r.address !== loc.address);
    return { recents: [loc, ...filtered].slice(0, MAX_RECENTS) };
  }),
}), { name: 'db-recent-locations' }));
