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
  ShieldCheck,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';
import { useTrialGuard } from '../../hooks/useTrialGuard';
import { PWAInstallButton } from '../shared/PWAInstallButton';
import { getPlanQuota, canAccessFeature, TierFeatureKey } from '../../utils/planLimits';
import { getDefaultRouteForUser, hasSectionAccess, ROLE_META } from '../../utils/rbac';
import { AppSection } from '../../types';

interface NavItem {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  path: string;
  allowWhenLocked: boolean;
  section?: AppSection;
  masterOnly?: boolean;
  requiredFeature?: TierFeatureKey;
}

const navItems: NavItem[] = [
  {
    icon: ShieldCheck,
    label: 'Master Console',
    path: '/master',
    allowWhenLocked: true,
    masterOnly: true,
  },
  {
    icon: LayoutDashboard,
    label: 'Dashboard',
    path: '/',
    allowWhenLocked: false,
    section: 'dashboard',
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
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, tenant, isMasterAdmin } = useAuthStore();
  const { handleLogout } = useAuth();
  const { isSoftLocked, isComplimentary, isTrial } = useTrialGuard();

  const visibleItems = navItems.filter((item) => {
    if (item.masterOnly) return isMasterAdmin;
    if (item.section) return hasSectionAccess(user, item.section);
    return false;
  });

  const brandName = tenant?.name || 'PRIMESTOCK';
  const packLabel = isComplimentary
    ? `${getPlanQuota(tenant?.plan).name} · Free`
    : isTrial && !isSoftLocked
    ? '14-Day Free Trial'
    : `${getPlanQuota(tenant?.plan).name} Pack`;

  const roleDisplay = isMasterAdmin
    ? 'Master Admin'
    : user?.role
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
          'w-64 bg-primary text-white h-screen flex flex-col fixed lg:sticky top-0 z-50 transition-transform duration-300 lg:translate-x-0 no-print',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-5 flex items-center justify-between gap-2 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            {tenant?.logo ? (
              <img
                src={tenant.logo}
                alt={brandName}
                className="w-10 h-10 rounded-lg object-cover bg-white shrink-0 border border-white/20"
              />
            ) : (
              <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center font-bold text-xl shrink-0">
                {brandName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <span className="font-bold text-base tracking-tight block truncate">{brandName}</span>
              <span className="text-[11px] text-white/65 block truncate">{packLabel}</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            className="lg:hidden text-white/70 hover:text-white shrink-0"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-3 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const subLocked = isSoftLocked && !item.allowWhenLocked;
            const tierLocked =
              !subLocked && item.requiredFeature ? !canAccessFeature(tenant, item.requiredFeature) : false;
            const locked = subLocked || tierLocked;
            const lockedDest = hasSectionAccess(user, 'billing')
              ? '/billing'
              : getDefaultRouteForUser(user);
            return (
              <NavLink
                key={item.path}
                to={subLocked ? lockedDest : item.path}
                onClick={() => {
                  if (window.innerWidth < 1024) onClose();
                }}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-between px-4 py-2.5 rounded-lg transition-all whitespace-nowrap',
                    locked
                      ? 'text-white/40 hover:bg-white/5 cursor-pointer'
                      : isActive
                      ? 'bg-accent text-white font-semibold'
                      : 'text-white/75 hover:text-white hover:bg-white/10'
                  )
                }
              >
                <span className="flex items-center gap-3">
                  <item.icon size={19} />
                  <span className="text-sm">{item.label}</span>
                </span>
                {locked && <Lock size={14} className="opacity-70" />}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <PWAInstallButton compact />

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2.5 w-full text-white/75 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          >
            <LogOut size={19} />
            <span className="text-sm">Logout</span>
          </button>

          <div className="mt-2 px-4 py-3 bg-white/5 rounded-lg flex items-center gap-3">
            <div className="w-8 h-8 bg-accent-alt rounded-full flex items-center justify-center text-xs font-bold shrink-0">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-white/65 truncate">{roleDisplay}</p>
            </div>
          </div>

          <p className="text-[10px] text-white/50 text-center pt-1">
            Built &amp; managed by Novic Technologies
          </p>
        </div>
      </aside>
    </>
  );
}
