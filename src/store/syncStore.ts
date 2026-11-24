import { create } from 'zustand';

interface SyncState {
  isOnline: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: number | null;
  status: 'synced' | 'syncing' | 'offline' | 'error';
  setOnline: (isOnline: boolean) => void;
  setPendingCount: (pendingCount: number) => void;
  setFailedCount: (failedCount: number) => void;
  setLastSyncedAt: (lastSyncedAt: number) => void;
  setStatus: (status: 'synced' | 'syncing' | 'offline' | 'error') => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isOnline: navigator.onLine,
  pendingCount: 0,
  failedCount: 0,
  lastSyncedAt: null,
  status: navigator.onLine ? 'synced' : 'offline',
  setOnline: (isOnline) => set({ isOnline, status: isOnline ? 'synced' : 'offline' }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setFailedCount: (failedCount) => set({ failedCount }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setStatus: (status) => set({ status }),
}));

