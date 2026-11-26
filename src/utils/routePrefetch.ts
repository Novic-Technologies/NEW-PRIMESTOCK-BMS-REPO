import type { ComponentType } from 'react';
import { AppSection, User } from '../types';
import { ALL_SECTIONS, hasSectionAccess } from './rbac';

const CHUNK_RELOAD_KEY = 'primestock_chunk_reload_at';

function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk')
  );
}

// Wraps dynamic imports so stale hashed chunks after a new deploy safely trigger one clean reload.
export function lazyImportWithRetry<T extends { default: ComponentType<any> }>(
  importer: () => Promise<T>
): () => Promise<T> {
  return async () => {
    try {
      return await importer();
    } catch (error) {
      if (typeof window !== 'undefined' && isChunkLoadError(error)) {
        try {
          const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0');
          if (!lastReload || Date.now() - lastReload > 15_000) {
            sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
            window.location.reload();
            return await new Promise<T>(() => {});
          }
        } catch {
          // Ignore storage errors
        }
      }
      throw error;
    }
  };
}

// Centralized lazy route loaders so App.tsx and Sidebar hover/focus/idle prefetch share exact chunks.
export const routeLoaders = {
  login: lazyImportWithRetry(() => import('../pages/auth/Login')),
  dashboard: lazyImportWithRetry(() => import('../pages/dashboard/Dashboard')),
  pos: lazyImportWithRetry(() => import('../pages/pos/POS')),
  sales: lazyImportWithRetry(() => import('../pages/sales/SalesHistory')),
  inventory: lazyImportWithRetry(() => import('../pages/inventory/Products')),
  customers: lazyImportWithRetry(() => import('../pages/customers/Customers')),
  shifts: lazyImportWithRetry(() => import('../pages/shifts/ShiftsAudit')),
  bulkImport: lazyImportWithRetry(() => import('../pages/import/BulkImport')),
  purchases: lazyImportWithRetry(() => import('../pages/purchases/PurchaseOrders')),
  suppliers: lazyImportWithRetry(() => import('../pages/suppliers/Suppliers')),
  finance: lazyImportWithRetry(() => import('../pages/accounting/Expenses')),
  payroll: lazyImportWithRetry(() => import('../pages/payroll/Payroll')),
  reports: lazyImportWithRetry(() => import('../pages/reports/Reports')),
  ai: lazyImportWithRetry(() => import('../pages/ai/AICopilot')),
  team: lazyImportWithRetry(() => import('../pages/team/TeamBranches')),
  billing: lazyImportWithRetry(() => import('../pages/billing/Billing')),
  settings: lazyImportWithRetry(() => import('../pages/settings/Settings')),
  masterOverview: lazyImportWithRetry(() => import('../pages/master/MasterOverview')),
  masterMonitoring: lazyImportWithRetry(() => import('../pages/master/MasterMonitoring')),
  masterUsers: lazyImportWithRetry(() => import('../pages/master/MasterUsers')),
  masterApprovals: lazyImportWithRetry(() => import('../pages/master/MasterApprovals')),
  masterPlans: lazyImportWithRetry(() => import('../pages/master/MasterTiersUpgrades')),
  masterPayments: lazyImportWithRetry(() => import('../pages/master/MasterPaymentChannels')),
  masterSystem: lazyImportWithRetry(() => import('../pages/master/MasterSystemOps')),
} as const;

const PATH_TO_LOADER: Record<string, () => Promise<unknown>> = {
  '/': routeLoaders.dashboard,
  '/pos': routeLoaders.pos,
  '/sales': routeLoaders.sales,
  '/inventory': routeLoaders.inventory,
  '/customers': routeLoaders.customers,
  '/shifts': routeLoaders.shifts,
  '/bulk-import': routeLoaders.bulkImport,
  '/purchases': routeLoaders.purchases,
  '/suppliers': routeLoaders.suppliers,
  '/finance': routeLoaders.finance,
  '/payroll': routeLoaders.payroll,
  '/reports': routeLoaders.reports,
  '/ai': routeLoaders.ai,
  '/team': routeLoaders.team,
  '/billing': routeLoaders.billing,
  '/settings': routeLoaders.settings,
  '/master': routeLoaders.masterOverview,
  '/master/monitoring': routeLoaders.masterMonitoring,
  '/master/users': routeLoaders.masterUsers,
  '/master/approvals': routeLoaders.masterApprovals,
  '/master/plans': routeLoaders.masterPlans,
  '/master/payments': routeLoaders.masterPayments,
  '/master/system': routeLoaders.masterSystem,
};

const prefetchedPaths = new Set<string>();

export function prefetchRoute(path: string): void {
  if (prefetchedPaths.has(path)) return;
  const loader = PATH_TO_LOADER[path];
  if (!loader) return;
  prefetchedPaths.add(path);
  loader().catch(() => {
    prefetchedPaths.delete(path);
  });
}

const SECTION_PATH_MAP: Record<AppSection, string> = ALL_SECTIONS.reduce(
  (acc, item) => {
    acc[item.id] = item.path;
    return acc;
  },
  {} as Record<AppSection, string>
);

export function prefetchPermittedRoutes(
  user: User | null | undefined,
  isMasterAdmin = false
): void {
  if (!user) return;
  if (isMasterAdmin) {
    [
      '/master',
      '/master/monitoring',
      '/master/users',
      '/master/approvals',
      '/master/plans',
      '/master/payments',
      '/master/system',
    ].forEach(prefetchRoute);
    return;
  }

  for (const section of Object.keys(SECTION_PATH_MAP) as AppSection[]) {
    if (hasSectionAccess(user, section)) {
      prefetchRoute(SECTION_PATH_MAP[section]);
    }
  }
}
