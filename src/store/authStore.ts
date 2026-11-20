import { create } from 'zustand';
import { User, Tenant } from '../types';

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  activeBranchId: string | null;
  isMasterAdmin: boolean;
  isLoading: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  setUser: (user: User | null) => void;
  setTenant: (tenant: Tenant | null) => void;
  setActiveBranchId: (branchId: string | null) => void;
  setMasterAdmin: (isMasterAdmin: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  setAuthenticating: (isAuthenticating: boolean) => void;
  setAuthError: (authError: string | null) => void;
  clearAuthError: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenant: null,
  activeBranchId: null,
  isMasterAdmin: false,
  isLoading: true,
  isAuthenticating: false,
  authError: null,
  setUser: (user) => set({ user }),
  setTenant: (tenant) => set({ tenant }),
  setActiveBranchId: (activeBranchId) => set({ activeBranchId }),
  setMasterAdmin: (isMasterAdmin) => set({ isMasterAdmin }),
  setLoading: (isLoading) => set({ isLoading }),
  setAuthenticating: (isAuthenticating) => set({ isAuthenticating }),
  setAuthError: (authError) => set({ authError }),
  clearAuthError: () => set({ authError: null }),
  logout: () =>
    set({
      user: null,
      tenant: null,
      activeBranchId: null,
      isMasterAdmin: false,
      isLoading: false,
      isAuthenticating: false,
    }),
}));
