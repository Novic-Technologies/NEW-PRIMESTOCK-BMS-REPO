import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Search,
  Wifi,
  WifiOff,
  RefreshCw,
  Menu,
  AlertTriangle,
  Package,
  User,
  Briefcase,
  Receipt,
  CheckCircle2,
  MapPin,
  Clock,
  CheckCheck,
  MailOpen,
  Mail,
  Trash2,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  ArrowRight,
  X,
} from 'lucide-react';
import { useSyncStore } from '../../store/syncStore';
import { useAuthStore } from '../../store/authStore';
import { usePOS } from '../../hooks/usePOS';
import { useInventory } from '../../hooks/useInventory';
import { useCustomers } from '../../hooks/useCustomers';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useBranches } from '../../hooks/useBranches';
import { usePurchaseOrders } from '../../hooks/usePurchaseOrders';
import { useStockOperations } from '../../hooks/useStockOperations';
import { UnifiedNotification, useNotifications } from '../../hooks/useNotifications';
import { computeSmartPrioritizedTasks } from '../../utils/aiAnalytics';
import { formatUGX } from '../../utils/format';
import { getEffectiveStock } from '../../utils/branchStock';
import { canAccessFeature } from '../../utils/planLimits';
import { getSectionForRoute, hasSectionAccess } from '../../utils/rbac';
import { PWAInstallButton } from '../shared/PWAInstallButton';
import { ThemeToggleButton } from '../shared/ThemeToggleButton';
import { SyncRecoveryDrawer } from '../shared/SyncRecoveryDrawer';
import { SYSTEM_LOGO_URL } from '../../utils/branding';
import { Product } from '../../types';
import { cn } from '../../lib/utils';

interface TopBarProps {
  onMenuClick: () => void;
  onSyncNow?: () => void;
  isSidebarMinimized?: boolean;
  onToggleSidebarMinimize?: () => void;
}

export function TopBar({
  onMenuClick,
  onSyncNow,
  isSidebarMinimized = false,
  onToggleSidebarMinimize,
}: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOnline, status, pendingCount, failedCount } = useSyncStore();
  const { tenant, user, isMasterAdmin } = useAuthStore();
  const { sales } = usePOS();
  const { products } = useInventory();
  const { customers } = useCustomers();
  const { suppliers } = useSuppliers();
  const { branches, activeBranchId, setActiveBranchId } = useBranches();
  const { purchaseOrders } = usePurchaseOrders();
  const { adjustments } = useStockOperations();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isSyncDrawerOpen, setIsSyncDrawerOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const alertsContainerRef = useRef<HTMLDivElement>(null);

  const effectiveBranchId = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : null;
  const canViewAllBranches = user?.role === 'admin' || user?.role === 'manager';
  const canSeeInventoryAlerts =
    hasSectionAccess(user, 'inventory') || hasSectionAccess(user, 'pos');
  const canSeeTodaySales =
    hasSectionAccess(user, 'dashboard') ||
    hasSectionAccess(user, 'pos') ||
    hasSectionAccess(user, 'sales') ||
    hasSectionAccess(user, 'reports');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(e.target as Node)) {
        setIsMobileSearchOpen(false);
      }
      if (alertsContainerRef.current && !alertsContainerRef.current.contains(e.target as Node)) {
        setIsAlertsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const todaySalesTotal = useMemo(() => {
    if (!canSeeTodaySales) return 0;
    return sales
      .filter((s) => {
        if (s.status === 'refunded') return false;
        if (!s.createdAt.startsWith(today)) return false;
        if (effectiveBranchId && s.branchId && s.branchId !== effectiveBranchId) return false;
        return true;
      })
      .reduce((acc, s) => acc + s.total, 0);
  }, [canSeeTodaySales, sales, today, effectiveBranchId]);

  const getStockCount = useCallback(
    (p: Product) => getEffectiveStock(p, effectiveBranchId),
    [effectiveBranchId]
  );

  const lowStockProducts = useMemo(() => {
    if (!canSeeInventoryAlerts) return [];
    return products.filter((p) => getStockCount(p) <= (p.minStockLevel ?? 0));
  }, [canSeeInventoryAlerts, products, getStockCount]);

  const expiringSoonProducts = useMemo(() => {
    if (!canSeeInventoryAlerts) return [];
    const cutoff = Date.now() + 30 * 24 * 60 * 60 * 1000;
    return products.filter((p) => {
      if (!p.expiryDate || getStockCount(p) <= 0) return false;
      const t = new Date(p.expiryDate).getTime();
      return !Number.isNaN(t) && t <= cutoff;
    });
  }, [canSeeInventoryAlerts, products, getStockCount]);

  const {
    notifications,
    unreadCount,
    badgeCount,
    dismissBadgeCounter,
    setNotificationReadState,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
  } = useNotifications({
    lowStockProducts,
    expiringSoonProducts,
    pendingCount,
    getStockCount,
  });

  const smartPriorityTasks = useMemo(() => {
    if (isMasterAdmin) return [];
    return computeSmartPrioritizedTasks({
      products,
      sales,
      customers,
      purchaseOrders,
      adjustments,
      branchId: effectiveBranchId,
      user,
    }).slice(0, 3);
  }, [isMasterAdmin, products, sales, customers, purchaseOrders, adjustments, effectiveBranchId, user]);

  const handleToggleBell = () => {
    setIsAlertsOpen((prev) => {
      const opening = !prev;
      if (opening) {
        dismissBadgeCounter();
      }
      return opening;
    });
  };

  const handleNotificationClick = async (item: UnifiedNotification) => {
    if (!item.read) {
      await setNotificationReadState(item, true);
    }
    if (item.actionRoute) {
      const targetSection = getSectionForRoute(item.actionRoute);
      if (!targetSection || hasSectionAccess(user, targetSection)) {
        setIsAlertsOpen(false);
        navigate(item.actionRoute);
      }
    }
  };

  const renderCategoryIcon = (item: UnifiedNotification) => {
    if (item.category === 'billing') {
      return (
        <Bell
          size={16}
          className={cn(
            'shrink-0 mt-0.5',
            item.severity === 'critical' ? 'text-danger' : 'text-accent-alt'
          )}
        />
      );
    }
    if (item.category === 'expiry') {
      return <Clock size={16} className="text-accent-alt shrink-0 mt-0.5" />;
    }
    if (item.category === 'stock') {
      return <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />;
    }
    return <RefreshCw size={16} className="text-accent shrink-0 mt-0.5" />;
  };

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const matches: {
      id: string;
      type: 'Product' | 'Customer' | 'Supplier' | 'Sale';
      title: string;
      subtitle: string;
      route: string;
    }[] = [];

    if (hasSectionAccess(user, 'inventory') || hasSectionAccess(user, 'pos')) {
      const productTargetRoute = hasSectionAccess(user, 'inventory') ? '/inventory' : '/pos';
      products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q) ||
            p.barcode?.toLowerCase().includes(q)
        )
        .slice(0, 3)
        .forEach((p) =>
          matches.push({
            id: `p-${p.id}`,
            type: 'Product',
            title: p.name,
            subtitle: `${formatUGX(p.sellingPrice)} · ${getStockCount(p)} ${p.unit || 'pcs'} in stock`,
            route: productTargetRoute,
          })
        );
    }

    if (hasSectionAccess(user, 'customers')) {
      customers
        .filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
        .slice(0, 3)
        .forEach((c) =>
          matches.push({
            id: `c-${c.id}`,
            type: 'Customer',
            title: c.name,
            subtitle: c.phone,
            route: '/customers',
          })
        );
    }

    if (hasSectionAccess(user, 'suppliers') && canAccessFeature(tenant, 'suppliersAndPOs')) {
      suppliers
        .filter((s) => s.name.toLowerCase().includes(q) || s.phone.includes(q))
        .slice(0, 2)
        .forEach((s) =>
          matches.push({
            id: `s-${s.id}`,
            type: 'Supplier',
            title: s.name,
            subtitle: `${s.category} · ${s.phone}`,
            route: '/suppliers',
          })
        );
    }

    if (hasSectionAccess(user, 'sales')) {
      sales
        .filter((s) => s.reference.toLowerCase().includes(q))
        .slice(0, 2)
        .forEach((s) =>
          matches.push({
            id: `sale-${s.id}`,
            type: 'Sale',
            title: s.reference,
            subtitle: `${formatUGX(s.total)} · ${s.paymentMethod}`,
            route: '/sales',
          })
        );
    }

    return matches;
  }, [user, tenant, searchQuery, products, customers, suppliers, sales, getStockCount]);

  const handleSelectResult = (route: string) => {
    setIsSearchOpen(false);
    setIsMobileSearchOpen(false);
    setSearchQuery('');
    navigate(route);
  };

  if (isMasterAdmin) {
    const sectionTitle = location.pathname.startsWith('/master/approvals')
      ? 'Subscription Approvals & Invoices'
      : location.pathname.startsWith('/master/payments')
      ? 'Subscription Payment Channels'
      : location.pathname.startsWith('/master/plans')
      ? 'Plans & Tier Quotas Matrix'
      : location.pathname.startsWith('/master/system')
      ? 'Email Delivery & Automated Sweeps'
      : 'Businesses & Multi-Tenant Overview';

    return (
      <header className="h-16 bg-surface/95 backdrop-blur-sm border-b border-border flex items-center justify-between px-4 md:px-8 sticky top-0 z-20 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            aria-label="Open navigation menu"
            className="lg:hidden p-2 text-text-secondary hover:bg-surface-alt rounded-lg"
            onClick={onMenuClick}
          >
            <Menu size={24} />
          </button>
          {onToggleSidebarMinimize && (
            <button
              type="button"
              onClick={onToggleSidebarMinimize}
              aria-label={isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
              title={isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
              className="hidden lg:inline-flex p-2 text-text-secondary hover:text-primary hover:bg-surface-alt rounded-lg transition-colors"
            >
              {isSidebarMinimized ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </button>
          )}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white border border-border p-1 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src={SYSTEM_LOGO_URL}
                alt="PRIMESTOCK Platform"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-primary truncate">{sectionTitle}</p>
              <p className="text-[11px] text-text-muted truncate hidden sm:block">
                PrimeStock Platform Governance · Novic Technologies
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <ThemeToggleButton compact />
          <div className="hidden sm:block">
            <PWAInstallButton compact />
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-alt text-xs font-medium whitespace-nowrap">
            {isOnline ? <Wifi size={14} className="text-accent" /> : <WifiOff size={14} className="text-danger" />}
            <span className={cn(isOnline ? 'text-primary' : 'text-danger')}>
              {isOnline ? 'Platform Live' : 'Offline'}
            </span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="relative h-16 bg-surface/95 backdrop-blur-sm border-b border-border flex items-center justify-between gap-2 px-3 sm:px-4 md:px-8 sticky top-0 z-20 no-print">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          aria-label="Open navigation menu"
          className="lg:hidden p-2 text-text-secondary hover:bg-surface-alt rounded-lg shrink-0"
          onClick={onMenuClick}
        >
          <Menu size={22} />
        </button>
        {onToggleSidebarMinimize && (
          <button
            type="button"
            onClick={onToggleSidebarMinimize}
            aria-label={isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
            title={isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
            className="hidden lg:inline-flex p-2 text-text-secondary hover:text-primary hover:bg-surface-alt rounded-lg transition-colors shrink-0"
          >
            {isSidebarMinimized ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
        )}

        <div className="relative hidden md:block" ref={searchContainerRef}>
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            size={18}
          />
          <input
            type="text"
            placeholder="Search products, customers, sales..."
            aria-label="Global search"
            value={searchQuery}
            onFocus={() => setIsSearchOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsSearchOpen(false);
            }}
            className="pl-10 pr-4 py-2 bg-surface-alt border border-transparent focus:border-border rounded-lg text-sm text-primary w-44 lg:w-64 focus:bg-surface focus:ring-2 focus:ring-accent/20 outline-none transition-all"
          />

          {isSearchOpen && searchQuery.trim() && (
            <div className="absolute left-0 top-full mt-2 w-80 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50">
              {searchResults.length === 0 ? (
                <div className="p-4 text-center text-sm text-text-muted">
                  No matches for &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                <div className="divide-y divide-border max-h-80 overflow-y-auto">
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectResult(item.route)}
                      className="w-full px-4 py-3 text-left hover:bg-surface-alt flex items-center gap-3 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center shrink-0">
                        {item.type === 'Product' ? (
                          <Package size={16} />
                        ) : item.type === 'Customer' ? (
                          <User size={16} />
                        ) : item.type === 'Supplier' ? (
                          <Briefcase size={16} />
                        ) : (
                          <Receipt size={16} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-primary truncate">{item.title}</p>
                        <p className="text-xs text-text-muted truncate">
                          {item.type} · {item.subtitle}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="hidden md:block h-6 w-px bg-border mx-1" />
        <div className="flex items-center gap-2 min-w-0">
          {tenant?.logo && (
            <img
              src={tenant.logo}
              alt={tenant.name}
              className="w-7 h-7 rounded object-cover border border-border shrink-0 hidden sm:block"
            />
          )}
          <span className="font-semibold text-primary truncate max-w-[115px] xs:max-w-[150px] sm:max-w-[180px] lg:max-w-[200px]">
            {tenant?.name || 'My Business'}
          </span>
        </div>

        {branches.length > 0 && (
          <div className="hidden lg:flex items-center gap-1.5 pl-2">
            <MapPin size={14} className="text-accent shrink-0" />
            <select
              aria-label="Active branch"
              value={activeBranchId || ''}
              onChange={(e) => setActiveBranchId(e.target.value || null)}
              className="bg-surface-alt border border-border rounded-lg px-2.5 py-1 text-xs font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {canViewAllBranches && branches.length > 1 && (
                <option value="ALL">All Branches</option>
              )}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3 shrink-0">
        <ThemeToggleButton compact />

        <div className="hidden md:block">
          <PWAInstallButton compact />
        </div>

        <button
          type="button"
          aria-label={isMobileSearchOpen ? 'Close search' : 'Search workspace'}
          onClick={() => setIsMobileSearchOpen((v) => !v)}
          className="md:hidden p-2 text-text-secondary hover:text-primary hover:bg-surface-alt rounded-lg transition-colors"
        >
          {isMobileSearchOpen ? <X size={20} /> : <Search size={20} />}
        </button>

        <button
          type="button"
          onClick={() => {
            if (pendingCount > 0 || failedCount > 0) {
              setIsSyncDrawerOpen(true);
            } else {
              onSyncNow?.();
            }
          }}
          title={
            failedCount > 0
              ? `${failedCount} failed sync items — click to inspect & retry`
              : pendingCount > 0
              ? `${pendingCount} offline items queued — click to inspect`
              : isOnline
              ? 'Click to sync'
              : 'Offline mode'
          }
          className={cn(
            'hidden xs:flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] md:text-xs font-medium transition-colors whitespace-nowrap',
            failedCount > 0
              ? 'bg-danger/10 border border-danger/30 text-danger hover:bg-danger/15'
              : 'bg-surface-alt hover:bg-border/60'
          )}
        >
          {status === 'syncing' ? (
            <RefreshCw size={14} className="animate-spin text-accent" />
          ) : failedCount > 0 ? (
            <AlertTriangle size={14} className="text-danger" />
          ) : isOnline ? (
            <Wifi size={14} className="text-accent" />
          ) : (
            <WifiOff size={14} className="text-danger" />
          )}
          <span className={cn(failedCount > 0 || !isOnline ? 'text-danger' : 'text-primary')}>
            {status === 'syncing'
              ? 'Syncing...'
              : failedCount > 0
              ? `${failedCount} sync error${failedCount === 1 ? '' : 's'}`
              : isOnline
              ? 'Online'
              : 'Offline'}
            {failedCount === 0 && pendingCount > 0 && ` · ${pendingCount} pending`}
          </span>
        </button>

        <div className="relative" ref={alertsContainerRef}>
          <button
            type="button"
            aria-label="Notifications"
            onClick={handleToggleBell}
            className="relative p-2 text-text-secondary hover:text-primary hover:bg-surface-alt rounded-lg transition-colors"
          >
            <Bell size={20} />
            {badgeCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 bg-danger text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-surface tabular-nums">
                {badgeCount}
              </span>
            )}
          </button>

          {isAlertsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 bg-surface-alt/60">
                <div>
                  <span className="text-sm font-bold text-primary">Notifications</span>
                  <span className="text-xs text-text-muted ml-2 tabular-nums">
                    {unreadCount} unread
                  </span>
                </div>
                {notifications.length > 0 && (
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:underline whitespace-nowrap"
                      >
                        <CheckCheck size={13} />
                        Mark all read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearAllNotifications}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-text-muted hover:text-danger whitespace-nowrap"
                    >
                      <Trash2 size={12} />
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {pendingCount > 0 && (
                <div className="px-4 py-2.5 bg-accent/5 border-b border-border flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-primary">
                    {pendingCount} queued offline {pendingCount === 1 ? 'record' : 'records'}
                    {failedCount > 0 ? ` (${failedCount} failed)` : ''}
                  </span>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAlertsOpen(false);
                        setIsSyncDrawerOpen(true);
                      }}
                      className="text-xs font-bold text-text-secondary hover:text-primary whitespace-nowrap"
                    >
                      Inspect
                    </button>
                    {isOnline && onSyncNow && (
                      <button
                        type="button"
                        onClick={() => {
                          onSyncNow();
                          setIsAlertsOpen(false);
                        }}
                        className="text-xs font-bold text-accent hover:underline whitespace-nowrap"
                      >
                        Sync Now
                      </button>
                    )}
                  </div>
                </div>
              )}

              {smartPriorityTasks.length > 0 && (
                <div className="px-4 py-2.5 bg-surface-alt/40 border-b border-border space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    <Sparkles size={11} className="text-accent" />
                    <span>Top Actions Today</span>
                  </div>
                  {smartPriorityTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => {
                        setIsAlertsOpen(false);
                        navigate(task.actionRoute);
                      }}
                      className="w-full text-left p-2 rounded-lg bg-surface border border-border/80 hover:border-accent flex items-center justify-between gap-2 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-primary truncate">{task.title}</p>
                        <p className="text-[11px] text-text-muted truncate">{task.detail}</p>
                      </div>
                      <span className="text-[11px] font-bold text-accent inline-flex items-center gap-0.5 shrink-0 whitespace-nowrap">
                        {task.actionLabel}
                        <ArrowRight size={11} />
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="max-h-96 overflow-y-auto divide-y divide-border">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-text-muted">
                    <CheckCircle2 size={26} className="text-accent mx-auto mb-2" />
                    <p className="text-sm font-medium text-primary">All caught up</p>
                    <p className="text-xs mt-0.5">No alerts, billing reminders, or low-stock warnings.</p>
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'p-3.5 flex items-start gap-2.5 transition-colors',
                        !item.read ? 'bg-accent/5' : 'bg-surface opacity-75'
                      )}
                    >
                      <div className="pt-0.5">{renderCategoryIcon(item)}</div>

                      <button
                        type="button"
                        onClick={() => handleNotificationClick(item)}
                        className="min-w-0 flex-1 text-left group"
                      >
                        <div className="flex items-center gap-1.5">
                          {!item.read && (
                            <span
                              className="w-2 h-2 rounded-full bg-accent shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          <p className="text-xs font-bold text-primary truncate group-hover:underline">
                            {item.title}
                          </p>
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                          {item.message}
                        </p>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setNotificationReadState(item, !item.read)}
                          title={item.read ? 'Mark as unread' : 'Mark as read'}
                          aria-label={item.read ? 'Mark as unread' : 'Mark as read'}
                          className="p-1.5 text-text-muted hover:text-accent hover:bg-surface-alt rounded-md transition-colors"
                        >
                          {item.read ? <Mail size={14} /> : <MailOpen size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteNotification(item)}
                          title="Delete notification"
                          aria-label="Delete notification"
                          className="p-1.5 text-text-muted hover:text-danger hover:bg-surface-alt rounded-md transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {canSeeTodaySales && (
          <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-border">
            <div className="text-right">
              <p className="text-sm font-bold text-primary font-mono tabular-nums">
                {formatUGX(todaySalesTotal)}
              </p>
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">
                Today&apos;s Sales
              </p>
            </div>
          </div>
        )}
      </div>

      {isMobileSearchOpen && (
        <div
          ref={mobileSearchRef}
          className="md:hidden absolute left-0 right-0 top-full bg-surface border-b border-border shadow-xl p-3 z-40"
        >
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              size={18}
            />
            <input
              type="text"
              autoFocus
              placeholder="Search products, customers, sales..."
              aria-label="Mobile global search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsMobileSearchOpen(false);
              }}
              className="input pl-10 pr-9 w-full bg-surface-alt"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-primary"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {searchQuery.trim() && (
            <div className="mt-2 border border-border rounded-xl overflow-hidden divide-y divide-border max-h-72 overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="p-4 text-center text-sm text-text-muted">
                  No matches for &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectResult(item.route)}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-surface-alt flex items-center gap-3 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center shrink-0">
                      {item.type === 'Product' ? (
                        <Package size={16} />
                      ) : item.type === 'Customer' ? (
                        <User size={16} />
                      ) : item.type === 'Supplier' ? (
                        <Briefcase size={16} />
                      ) : (
                        <Receipt size={16} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-primary truncate">{item.title}</p>
                      <p className="text-xs text-text-muted truncate">
                        {item.type} · {item.subtitle}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <SyncRecoveryDrawer
        open={isSyncDrawerOpen}
        onClose={() => setIsSyncDrawerOpen(false)}
        onSyncNow={onSyncNow}
      />
    </header>
  );
}
