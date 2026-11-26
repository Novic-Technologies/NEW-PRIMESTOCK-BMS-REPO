import React, { useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  CreditCard,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';
import { useMasterAdmin } from '../../hooks/useMasterAdmin';
import { getPlanQuota } from '../../utils/planLimits';
import { usePlatformPlansConfig } from '../../utils/platformPlans';
import { formatUGX } from '../../utils/format';
import { SYSTEM_LOGO_URL } from '../../utils/branding';
import { prefetchRoute } from '../../utils/routePrefetch';
import { PWAInstallButton } from '../shared/PWAInstallButton';
import { ThemeToggleButton } from '../shared/ThemeToggleButton';

const MASTER_NAV = [
  { label: 'Control Overview', path: '/master', icon: LayoutDashboard, end: true },
  { label: 'Business Monitoring', path: '/master/monitoring', icon: Activity },
  { label: 'All User Accounts', path: '/master/users', icon: Users },
  { label: 'Upgrade Approvals', path: '/master/approvals', icon: CheckCircle2 },
  { label: 'Tiers & Upgrade Paths', path: '/master/plans', icon: Layers },
  { label: 'Payment Channels', path: '/master/payments', icon: CreditCard },
  { label: 'System & Sweeps', path: '/master/system', icon: Server },
];

const MASTER_SIDEBAR_MINIMIZED_KEY = 'primestock_master_sidebar_minimized';

export function MasterConsoleLayout() {
  const { user } = useAuthStore();
  const { handleLogout } = useAuth();
  const { organizations } = useMasterAdmin();
  const { config: plansConfig } = usePlatformPlansConfig();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MASTER_SIDEBAR_MINIMIZED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const handleToggleMinimize = () => {
    setIsMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MASTER_SIDEBAR_MINIMIZED_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const summary = useMemo(() => {
    const pendingCount = organizations.filter((o) => Boolean(o.pendingPlan)).length;
    const activeCount = organizations.filter((o) => o.status === 'active' && !o.locked).length;
    const mrrUgx = organizations.reduce((sum, org) => {
      if (org.status !== 'active' || org.locked || org.isComplimentary) return sum;
      const fee =
        typeof org.customPriceUgx === 'number'
          ? org.customPriceUgx
          : getPlanQuota(org.plan).monthlyPriceUgx;
      return sum + fee;
    }, 0);
    return { total: organizations.length, pendingCount, activeCount, mrrUgx };
  }, [organizations, plansConfig]);

  return (
    <div className="min-h-screen flex bg-canvas text-text-primary">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Dedicated Platform Governance Sidebar */}
      <aside
        className={cn(
          'w-64 bg-[#0B1F3A] text-white flex flex-col fixed lg:sticky top-0 h-screen z-50 border-r border-slate-800/70 transition-[transform,width] duration-200 lg:translate-x-0 shrink-0',
          isMinimized ? 'lg:w-[76px]' : 'lg:w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div
          className={cn(
            'px-5 py-4 border-b border-white/10 flex items-center justify-between gap-2',
            isMinimized && 'lg:px-3 lg:flex-col lg:gap-2.5'
          )}
        >
          <div className={cn('flex items-center gap-3 min-w-0', isMinimized && 'lg:justify-center')}>
            <div className="w-9 h-9 rounded-lg bg-white p-1 flex items-center justify-center shrink-0 ring-1 ring-white/20 overflow-hidden">
              <img
                src={SYSTEM_LOGO_URL}
                alt="PRIMESTOCK Platform"
                className="w-full h-full object-contain"
              />
            </div>
            <div className={cn('min-w-0', isMinimized && 'lg:hidden')}>
              <p className="text-sm font-bold tracking-tight text-white truncate">
                PRIMESTOCK
              </p>
              <p className="text-[11px] text-slate-300/75 truncate">Platform Governance</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleMinimize}
            title={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
            aria-label={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
            aria-expanded={!isMinimized}
            className="hidden lg:inline-flex p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            {isMinimized ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 text-slate-300 hover:text-white"
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>

        <nav className={cn('flex-1 px-3 py-4 space-y-1 overflow-y-auto', isMinimized && 'lg:px-2.5')}>
          <p
            className={cn(
              'px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400',
              isMinimized && 'lg:hidden'
            )}
          >
            Owner Administration
          </p>
          {MASTER_NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              title={item.label}
              aria-label={item.label}
              onMouseEnter={() => prefetchRoute(item.path)}
              onFocus={() => prefetchRoute(item.path)}
              onPointerDown={() => prefetchRoute(item.path)}
              onTouchStart={() => prefetchRoute(item.path)}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap',
                  isMinimized && 'lg:justify-center lg:px-0',
                  isActive
                    ? 'bg-white/14 text-white font-semibold ring-1 ring-white/15'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                )
              }
            >
              <span className={cn('flex items-center gap-2.5', isMinimized && 'lg:justify-center lg:gap-0')}>
                <item.icon size={17} />
                <span className={cn(isMinimized && 'lg:hidden')}>{item.label}</span>
              </span>
              {item.path === '/master/approvals' && summary.pendingCount > 0 && (
                <span
                  className={cn(
                    'font-mono tabular-nums text-[11px] font-bold text-amber-300',
                    isMinimized && 'lg:absolute lg:top-1 lg:right-1.5 lg:text-[9px]'
                  )}
                >
                  {summary.pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={cn('p-4 border-t border-white/10 space-y-3', isMinimized && 'lg:p-2.5')}>
          <PWAInstallButton compact={false} iconOnly={isMinimized} />
          <div
            title={`${user?.name || 'Master Owner'} · ${user?.email || ''}`}
            className={cn(
              'px-3 py-2.5 rounded-lg bg-white/8 border border-white/10',
              isMinimized && 'lg:px-0 lg:py-2 lg:flex lg:items-center lg:justify-center'
            )}
          >
            {isMinimized ? (
              <span className="hidden lg:flex w-7 h-7 rounded-full bg-white/15 text-white text-xs font-bold items-center justify-center">
                {(user?.name || 'M').charAt(0)}
              </span>
            ) : null}
            <div className={cn(isMinimized && 'lg:hidden')}>
              <p className="text-xs font-semibold text-white truncate">{user?.name || 'Master Owner'}</p>
              <p className="text-[11px] text-white/60 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            title="Sign Out"
            aria-label="Sign Out"
            onClick={handleLogout}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/75 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap',
              isMinimized && 'lg:justify-center lg:px-0'
            )}
          >
            <LogOut size={16} />
            <span className={cn(isMinimized && 'lg:hidden')}>Sign Out</span>
          </button>
          <p className={cn('text-[10px] text-white/45 text-center', isMinimized && 'lg:hidden')}>
            Novic Technologies · System Control
          </p>
        </div>
      </aside>

      {/* Main Governance Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-surface/95 backdrop-blur-sm border-b border-border px-4 md:px-8 h-16 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-border text-text-primary hover:bg-surface-alt"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-accent">
                Master Platform Control
              </p>
              <p className="text-xs text-text-muted truncate hidden sm:block">
                System-wide business governance · Strictly separated from merchant storefronts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 md:gap-4 text-xs shrink-0">
            <ThemeToggleButton compact />
            <div className="hidden md:block">
              <PWAInstallButton compact />
            </div>
            <div className="hidden md:flex items-center gap-4 text-text-secondary font-medium">
              <span>
                Workspaces:{' '}
                <strong className="font-mono tabular-nums text-text-primary">{summary.total}</strong>
              </span>
              <span>·</span>
              <span>
                Active:{' '}
                <strong className="font-mono tabular-nums text-accent">{summary.activeCount}</strong>
              </span>
              <span>·</span>
              <span>
                Platform MRR:{' '}
                <strong className="font-mono tabular-nums text-text-primary">
                  {formatUGX(summary.mrrUgx)}
                </strong>
              </span>
            </div>
            {summary.pendingCount > 0 && (
              <NavLink
                to="/master/approvals"
                className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-bold text-xs whitespace-nowrap hover:bg-amber-500/25"
              >
                {summary.pendingCount} Pending Approval{summary.pendingCount === 1 ? '' : 's'}
              </NavLink>
            )}
          </div>
        </header>

        <main
          className={cn(
            'p-4 md:p-8 w-full mx-auto flex-1 transition-[max-width] duration-200',
            isMinimized ? 'max-w-[1680px]' : 'max-w-[1440px]'
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
