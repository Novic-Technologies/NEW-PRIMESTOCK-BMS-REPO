import React, { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Lock, LogOut } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { TrialBanner } from './TrialBanner';
import { useSync } from '../../hooks/useSync';
import { useTrialGuard } from '../../hooks/useTrialGuard';
import { useAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../store/authStore';
import { hasSectionAccess } from '../../utils/rbac';
import { getTrialDaysCount } from '../../utils/planLimits';

import { cn } from '../../lib/utils';

const ALLOWED_LOCKED_PATHS = ['/billing', '/settings'];
const SIDEBAR_MINIMIZED_KEY = 'primestock_sidebar_minimized';

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_MINIMIZED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const { syncData } = useSync();
  const { isSoftLocked, isSuspended, isPendingApproval, isTrial, effectiveEndsAt } = useTrialGuard();
  const { tenant, user, isMasterAdmin } = useAuthStore();
  const { handleLogout } = useAuth();
  const location = useLocation();

  const handleToggleSidebarMinimize = () => {
    setIsSidebarMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_MINIMIZED_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const isLockedWithoutBilling =
    isSoftLocked && !hasSectionAccess(user, 'billing') && !isMasterAdmin;

  if (
    !isMasterAdmin &&
    isSoftLocked &&
    !isLockedWithoutBilling &&
    !ALLOWED_LOCKED_PATHS.includes(location.pathname)
  ) {
    return <Navigate to="/billing" replace />;
  }

  return (
    <div className="flex min-h-screen bg-[#EDF1F6]">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isMinimized={isSidebarMinimized}
        onToggleMinimize={handleToggleSidebarMinimize}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          onMenuClick={() => setIsSidebarOpen(true)}
          onSyncNow={syncData}
          isSidebarMinimized={isSidebarMinimized}
          onToggleSidebarMinimize={handleToggleSidebarMinimize}
        />
        <TrialBanner />
        <main
          className={cn(
            'p-4 md:p-8 mx-auto w-full flex-1 transition-[max-width] duration-200',
            isSidebarMinimized ? 'max-w-[1640px]' : 'max-w-[1400px]'
          )}
        >
          {isLockedWithoutBilling ? (
            <div className="card max-w-lg mx-auto mt-8 p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mx-auto">
                <Lock size={24} />
              </div>
              <h1 className="text-xl font-bold text-primary">
                {isPendingApproval
                  ? 'Subscription Payment Under Review'
                  : isSuspended
                  ? 'Workspace Temporarily Disabled'
                  : !isTrial && effectiveEndsAt
                  ? 'Monthly Subscription Expired'
                  : `${getTrialDaysCount()}-Day Free Trial Ended`}
              </h1>
              <p className="text-sm text-text-secondary">
                {isPendingApproval
                  ? `Your business admin has submitted payment reference ${tenant?.pendingPaymentRef || ''} for ${tenant?.name || 'this workspace'}. POS access unlocks automatically once approved.`
                  : `All ${tenant?.name || 'business'} records are safely preserved. Please ask your Manager or Business Administrator to renew the workspace subscription in Billing.`}
              </p>
              {(tenant?.ownerEmail || tenant?.branding?.supportPhone) && (
                <p className="text-xs text-text-muted">
                  Workspace Contact: {tenant.ownerEmail || tenant.branding?.supportPhone}
                </p>
              )}
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn btn-secondary text-xs gap-2"
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
        <footer className="px-4 md:px-8 py-4 border-t border-border bg-[#F4F7FB] text-xs text-text-muted flex flex-col sm:flex-row items-center justify-between gap-2 max-w-full no-print">
          <span>
            {isMasterAdmin
              ? `© ${new Date().getFullYear()} PrimeStock Platform · Owner Control Console`
              : `© ${new Date().getFullYear()} ${tenant?.name || 'Business Workspace'}${
                  tenant?.branding?.tagline ? ` · ${tenant.branding.tagline}` : ''
                }`}
          </span>
          <span className="font-medium text-text-secondary">
            Built &amp; managed by <strong className="text-primary">Novic Technologies</strong>
          </span>
        </footer>
      </div>
    </div>
  );
}
