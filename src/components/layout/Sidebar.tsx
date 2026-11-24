import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  Settings,
  LogOut,
  CreditCard,
  Briefcase,
  FileText,
  X,
  ClipboardList,
  Sparkles,
  UsersRound,
  Lock,
  Receipt,
  Wallet,
  History,
  FileSpreadsheet,
  PanelLeftClose,
  PanelLeftOpen,
  MapPin,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';
import { useBranches } from '../../hooks/useBranches';
import { useTrialGuard } from '../../hooks/useTrialGuard';
import { PWAInstallButton } from '../shared/PWAInstallButton';
import {
  getPlanQuota,
  canAccessFeature,
  getTrialDaysCount,
  TierFeatureKey,
} from '../../utils/planLimits';
import { getDefaultRouteForUser, hasSectionAccess, ROLE_META } from '../../utils/rbac';
import { SYSTEM_LOGO_URL } from '../../utils/branding';
import { prefetchRoute } from '../../utils/routePrefetch';
import { AppSection } from '../../types';

interface NavItem {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  path: string;
  allowWhenLocked: boolean;
  section?: AppSection;
  requiredFeature?: TierFeatureKey;
  end?: boolean;
}

const tenantNavItems: NavItem[] = [
  {
    icon: LayoutDashboard,
    label: 'Dashboard',
    path: '/',
    allowWhenLocked: false,
    section: 'dashboard',
    end: true,
  },
  {
    icon: ShoppingCart,
    label: 'POS',
    path: '/pos',
    allowWhenLocked: false,
    section: 'pos',
  },
  {
    icon: Receipt,
    label: 'Sales & Refunds',
    path: '/sales',
    allowWhenLocked: false,
    section: 'sales',
  },
  {
    icon: Package,
    label: 'Inventory',
    path: '/inventory',
    allowWhenLocked: false,
    section: 'inventory',
  },
  {
    icon: ClipboardList,
    label: 'Purchases',
    path: '/purchases',
    allowWhenLocked: false,
    section: 'purchases',
    requiredFeature: 'suppliersAndPOs',
  },
  {
    icon: Users,
    label: 'Customers',
    path: '/customers',
    allowWhenLocked: false,
    section: 'customers',
  },
  {
    icon: Briefcase,
    label: 'Suppliers',
    path: '/suppliers',
    allowWhenLocked: false,
    section: 'suppliers',
    requiredFeature: 'suppliersAndPOs',
  },
  {
    icon: TrendingUp,
    label: 'Finance',
    path: '/finance',
    allowWhenLocked: false,
    section: 'finance',
  },
  {
    icon: Wallet,
    label: 'Payroll',
    path: '/payroll',
    allowWhenLocked: false,
    section: 'payroll',
    requiredFeature: 'payrollPayeNssf',
  },
  {
    icon: FileText,
    label: 'Reports',
    path: '/reports',
    allowWhenLocked: false,
    section: 'reports',
    requiredFeature: 'advancedReports',
  },
  {
    icon: History,
    label: 'Shifts & Audit',
    path: '/shifts',
    allowWhenLocked: false,
    section: 'shifts',
  },
  {
    icon: FileSpreadsheet,
    label: 'Bulk Import',
    path: '/bulk-import',
    allowWhenLocked: false,
    section: 'bulk_import',
  },
  {
    icon: Sparkles,
    label: 'AI Copilot',
    path: '/ai',
    allowWhenLocked: false,
    section: 'ai',
  },
  {
    icon: UsersRound,
    label: 'Team & Branches',
    path: '/team',
    allowWhenLocked: false,
    section: 'team',
  },
  {
    icon: CreditCard,
    label: 'Billing',
    path: '/billing',
    allowWhenLocked: true,
    section: 'billing',
  },
  {
    icon: Settings,
    label: 'Settings',
    path: '/settings',
    allowWhenLocked: true,
    section: 'settings',
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

export function Sidebar({ isOpen, onClose, isMinimized = false, onToggleMinimize }: SidebarProps) {
  const { user, tenant } = useAuthStore();
  const { handleLogout } = useAuth();
  const { branches, activeBranchId, setActiveBranchId } = useBranches();
  const { isSoftLocked, isComplimentary, isTrial } = useTrialGuard();
  const canViewAllBranches = user?.role === 'admin' || user?.role === 'manager';

  const visibleItems = tenantNavItems.filter(
    (item) => item.section && hasSectionAccess(user, item.section)
  );

  const brandName = tenant?.name || 'PRIMESTOCK';
  const packLabel = isComplimentary
    ? `${getPlanQuota(tenant?.plan).name} · Free`
    : isTrial && !isSoftLocked
    ? `${getPlanQuota(tenant?.plan).name} · ${getTrialDaysCount()}-Day Trial`
    : `${getPlanQuota(tenant?.plan).name} Pack`;

  const roleDisplay = user?.role
    ? ROLE_META[user.role]?.label || user.role
    : 'Staff';

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'w-64 bg-primary text-white h-screen flex flex-col fixed lg:sticky top-0 z-50 transition-[transform,width] duration-200 lg:translate-x-0 shrink-0 no-print',
          isMinimized ? 'lg:w-[76px]' : 'lg:w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div
          className={cn(
            'p-5 flex items-center justify-between gap-2 border-b border-white/10',
            isMinimized && 'lg:px-3 lg:py-4 lg:flex-col lg:gap-2.5'
          )}
        >
          <div className={cn('flex items-center gap-3 min-w-0', isMinimized && 'lg:justify-center')}>
            {tenant?.logo ? (
              <img
                src={tenant.logo}
                alt={brandName}
                className="w-10 h-10 rounded-lg object-cover bg-white shrink-0 border border-white/20"
              />
            ) : (
              <div className="w-10 h-10 bg-white rounded-lg p-1 flex items-center justify-center shrink-0 ring-1 ring-white/20 overflow-hidden">
                <img
                  src={SYSTEM_LOGO_URL}
                  alt={brandName}
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div className={cn('min-w-0', isMinimized && 'lg:hidden')}>
              <span className="font-bold text-base tracking-tight block truncate">{brandName}</span>
              <span className="text-[11px] text-white/65 block truncate">{packLabel}</span>
            </div>
          </div>

          {onToggleMinimize && (
            <button
              type="button"
              onClick={onToggleMinimize}
              title={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
              aria-label={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
              aria-expanded={!isMinimized}
              className="hidden lg:inline-flex items-center justify-center p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            >
              {isMinimized ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          )}

          <button
            type="button"
            aria-label="Close menu"
            className="lg:hidden text-white/70 hover:text-white shrink-0"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>

        {branches.length > 0 && (
          <div className="lg:hidden px-4 py-2.5 border-b border-white/10">
            <label
              htmlFor="sidebar-branch-select"
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 mb-1"
            >
              <MapPin size={12} className="text-accent" />
              Active Branch
            </label>
            <select
              id="sidebar-branch-select"
              value={activeBranchId || ''}
              onChange={(e) => setActiveBranchId(e.target.value || null)}
              className="w-full bg-white/10 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {canViewAllBranches && branches.length > 1 && (
                <option value="ALL" className="text-primary">
                  All Branches
                </option>
              )}
              {branches.map((b) => (
                <option key={b.id} value={b.id} className="text-primary">
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className={cn('flex-1 px-4 py-3 space-y-1 overflow-y-auto', isMinimized && 'lg:px-2.5')}>
          {visibleItems.map((item) => {
            const subLocked = isSoftLocked && !item.allowWhenLocked;
            const tierLocked =
              !subLocked && item.requiredFeature
                ? !canAccessFeature(tenant, item.requiredFeature)
                : false;
            const locked = subLocked || tierLocked;
            const lockedDest = hasSectionAccess(user, 'billing')
              ? '/billing'
              : getDefaultRouteForUser(user, false);
              const targetPath = subLocked ? lockedDest : item.path;
              return (
              <NavLink
                key={item.path}
                to={targetPath}
                end={item.end}
                title={item.label}
                aria-label={item.label}
                onMouseEnter={() => prefetchRoute(targetPath)}
                onFocus={() => prefetchRoute(targetPath)}
                onClick={() => {
                  if (window.innerWidth < 1024) onClose();
                }}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center justify-between px-4 py-2.5 rounded-lg transition-all whitespace-nowrap',
                    isMinimized && 'lg:justify-center lg:px-0',
                    locked
                      ? 'text-white/40 hover:bg-white/5 cursor-pointer'
                      : isActive
                      ? 'bg-white/14 text-white font-semibold border-l-2 border-accent shadow-xs'
                      : 'text-white/75 hover:text-white hover:bg-white/10'
                  )
                }
              >
                <span className={cn('flex items-center gap-3', isMinimized && 'lg:justify-center lg:gap-0')}>
                  <item.icon size={19} />
                  <span className={cn('text-sm', isMinimized && 'lg:hidden')}>{item.label}</span>
                </span>
                {locked && (
                  <Lock
                    size={isMinimized ? 11 : 14}
                    className={cn('opacity-70', isMinimized && 'lg:absolute lg:top-1.5 lg:right-1.5')}
                  />
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className={cn('p-4 border-t border-white/10 space-y-2', isMinimized && 'lg:p-2.5')}>
          <PWAInstallButton compact={false} iconOnly={isMinimized} />

          <a
            href="/PrimeStock-BMS-System-Guide.pdf"
            download="PrimeStock-BMS-System-Guide.pdf"
            title="Download System Guide (PDF)"
            aria-label="Download System Guide (PDF)"
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 w-full text-white/75 hover:text-white hover:bg-white/10 rounded-lg transition-all',
              isMinimized && 'lg:justify-center lg:px-0'
            )}
          >
            <FileText size={19} />
            <span className={cn('text-sm', isMinimized && 'lg:hidden')}>System Guide (PDF)</span>
          </a>

          <button
            type="button"
            title="Logout"
            aria-label="Logout"
            onClick={handleLogout}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 w-full text-white/75 hover:text-white hover:bg-white/10 rounded-lg transition-all',
              isMinimized && 'lg:justify-center lg:px-0'
            )}
          >
            <LogOut size={19} />
            <span className={cn('text-sm', isMinimized && 'lg:hidden')}>Logout</span>
          </button>

          <div
            title={`${user?.name || 'User'} · ${roleDisplay}`}
            className={cn(
              'mt-2 px-4 py-3 bg-white/8 border border-white/10 rounded-lg flex items-center gap-3',
              isMinimized && 'lg:justify-center lg:px-0 lg:py-2'
            )}
          >
            <div className="w-8 h-8 bg-white/15 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className={cn('flex-1 min-w-0', isMinimized && 'lg:hidden')}>
              <p className="text-sm font-medium truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-white/65 truncate">{roleDisplay}</p>
            </div>
          </div>

          <p className={cn('text-[10px] text-white/50 text-center pt-1', isMinimized && 'lg:hidden')}>
            Built &amp; managed by Novic Technologies
          </p>
        </div>
      </aside>
    </>
  );
}
