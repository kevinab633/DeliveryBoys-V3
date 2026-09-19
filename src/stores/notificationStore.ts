import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Notification } from '../lib/types';
import { generateId } from '../lib/utils';

interface NotificationStore {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markRead: (id: string) => void;
  markAllRead: (userId: string) => void;
  getUnread: (userId: string) => Notification[];
  getUserNotifications: (userId: string) => Notification[];
}

export const useNotificationStore = create<NotificationStore>()(persist((set, get) => ({
  notifications: [],
  addNotification: (n) => set(s => ({
    notifications: [{ ...n, id: generateId(), read: false, createdAt: Date.now() }, ...s.notifications],
  })),
  markRead: (id) => set(s => ({
    notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n),
  })),
  markAllRead: (userId) => set(s => ({
    notifications: s.notifications.map(n => n.userId === userId ? { ...n, read: true } : n),
  })),
  getUnread: (userId) => get().notifications.filter(n => n.userId === userId && !n.read),
  getUserNotifications: (userId) => get().notifications.filter(n => n.userId === userId),
}), { name: 'db-notifications' }));
