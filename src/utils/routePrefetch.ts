import { AppSection, User } from '../types';
import { ALL_SECTIONS, hasSectionAccess } from './rbac';

// Centralized lazy route loaders so App.tsx and Sidebar hover/focus/idle prefetch share exact chunks.
export const routeLoaders = {
  login: () => import('../pages/auth/Login'),
  dashboard: () => import('../pages/dashboard/Dashboard'),
  pos: () => import('../pages/pos/POS'),
  sales: () => import('../pages/sales/SalesHistory'),
  inventory: () => import('../pages/inventory/Products'),
  customers: () => import('../pages/customers/Customers'),
  shifts: () => import('../pages/shifts/ShiftsAudit'),
  bulkImport: () => import('../pages/import/BulkImport'),
  purchases: () => import('../pages/purchases/PurchaseOrders'),
  suppliers: () => import('../pages/suppliers/Suppliers'),
  finance: () => import('../pages/accounting/Expenses'),
  payroll: () => import('../pages/payroll/Payroll'),
  reports: () => import('../pages/reports/Reports'),
  ai: () => import('../pages/ai/AICopilot'),
  team: () => import('../pages/team/TeamBranches'),
  billing: () => import('../pages/billing/Billing'),
  settings: () => import('../pages/settings/Settings'),
  masterOverview: () => import('../pages/master/MasterOverview'),
  masterMonitoring: () => import('../pages/master/MasterMonitoring'),
  masterApprovals: () => import('../pages/master/MasterApprovals'),
  masterPlans: () => import('../pages/master/MasterTiersUpgrades'),
  masterPayments: () => import('../pages/master/MasterPaymentChannels'),
  masterSystem: () => import('../pages/master/MasterSystemOps'),
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
