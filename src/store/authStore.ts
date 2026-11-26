import { create } from 'zustand';
import { User, Tenant } from '../types';
import { applyTenantTheme } from '../utils/branding';

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

function hydrateBootSession(): {
  user: User | null;
  tenant: Tenant | null;
  activeBranchId: string | null;
  isMasterAdmin: boolean;
  hasCachedSession: boolean;
} {
  try {
    const lastUid = localStorage.getItem('primestock_last_uid');
    if (!lastUid) {
      return { user: null, tenant: null, activeBranchId: null, isMasterAdmin: false, hasCachedSession: false };
    }
    const raw = localStorage.getItem(`primestock_session_cache_${lastUid}`);
    if (!raw) {
      return { user: null, tenant: null, activeBranchId: null, isMasterAdmin: false, hasCachedSession: false };
    }
    const parsed = JSON.parse(raw) as {
      user?: User;
      tenant?: Tenant | null;
      isMasterAdmin?: boolean;
    };
    if (parsed?.user?.uid === lastUid && (parsed?.tenant?.id || parsed?.isMasterAdmin)) {
      if (parsed.tenant) {
        applyTenantTheme(parsed.tenant);
      }
      return {
        user: parsed.user,
        tenant: parsed.tenant ?? null,
        activeBranchId: parsed.user.branchId || null,
        isMasterAdmin: Boolean(parsed.isMasterAdmin),
        hasCachedSession: true,
      };
    }
  } catch {
    // Fall back to standard auth loading state
  }
  return { user: null, tenant: null, activeBranchId: null, isMasterAdmin: false, hasCachedSession: false };
}

const initialBoot = hydrateBootSession();

export const useAuthStore = create<AuthState>((set) => ({
  user: initialBoot.user,
  tenant: initialBoot.tenant,
  activeBranchId: initialBoot.activeBranchId,
  isMasterAdmin: initialBoot.isMasterAdmin,
  isLoading: !initialBoot.hasCachedSession,
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
