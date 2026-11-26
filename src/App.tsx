import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/layout/Layout';
import { MasterConsoleLayout } from './components/master/MasterConsoleLayout';
import { TierGate } from './components/shared/TierGate';
import { PageContentSkeleton, WorkspaceBootSkeleton } from './components/shared/Skeletons';
import { routeLoaders, prefetchPermittedRoutes } from './utils/routePrefetch';
import { warmPermittedHookCaches } from './utils/warmHookCache';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import { useAuthObserver } from './hooks/useAuth';
import { usePlatformPlansSync } from './utils/platformPlans';
import { applyTenantTheme } from './utils/branding';
import { getCanonicalPageUrl } from './utils/domain';
import { getDefaultRouteForUser, hasSectionAccess } from './utils/rbac';
import { AppSection } from './types';

const Login = lazy(routeLoaders.login);
const Dashboard = lazy(routeLoaders.dashboard);
const POS = lazy(routeLoaders.pos);
const SalesHistory = lazy(routeLoaders.sales);
const Products = lazy(routeLoaders.inventory);
const Customers = lazy(routeLoaders.customers);
const ShiftsAudit = lazy(routeLoaders.shifts);
const BulkImport = lazy(routeLoaders.bulkImport);
const PurchaseOrders = lazy(routeLoaders.purchases);
const Suppliers = lazy(routeLoaders.suppliers);
const Expenses = lazy(routeLoaders.finance);
const Payroll = lazy(routeLoaders.payroll);
const Reports = lazy(routeLoaders.reports);
const AICopilot = lazy(routeLoaders.ai);
const TeamBranches = lazy(routeLoaders.team);
const Billing = lazy(routeLoaders.billing);
const Settings = lazy(routeLoaders.settings);
const MasterOverview = lazy(routeLoaders.masterOverview);
const MasterMonitoring = lazy(routeLoaders.masterMonitoring);
const MasterUsers = lazy(routeLoaders.masterUsers);
const MasterApprovals = lazy(routeLoaders.masterApprovals);
const MasterTiersUpgrades = lazy(routeLoaders.masterPlans);
const MasterPaymentChannels = lazy(routeLoaders.masterPayments);
const MasterSystemOps = lazy(routeLoaders.masterSystem);

const RouteSuspense = ({
  variant = 'default',
  children,
}: {
  variant?: 'dashboard' | 'table' | 'pos' | 'cards' | 'master' | 'default';
  children: React.ReactNode;
}) => <Suspense fallback={<PageContentSkeleton variant={variant} />}>{children}</Suspense>;

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return <WorkspaceBootSkeleton />;
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

const BusinessRoute = ({ children }: { children: React.ReactNode }) => {
  const { isMasterAdmin } = useAuthStore();
  if (isMasterAdmin) {
    return <Navigate to="/master" replace />;
  }
  return <>{children}</>;
};

const SectionRoute = ({
  section,
  children,
}: {
  section: AppSection;
  children: React.ReactNode;
}) => {
  const { user, isMasterAdmin } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (isMasterAdmin) return <Navigate to="/master" replace />;
  if (!hasSectionAccess(user, section)) {
    const fallback = getDefaultRouteForUser(user, false);
    return <Navigate to={fallback === '/' && section === 'dashboard' ? '/finance' : fallback} replace />;
  }
  return <>{children}</>;
};

const DefaultHomeRedirect = () => {
  const { user, isMasterAdmin } = useAuthStore();
  return <Navigate to={getDefaultRouteForUser(user, isMasterAdmin)} replace />;
};

const MasterRoute = ({ children }: { children: React.ReactNode }) => {
  const { isMasterAdmin, user } = useAuthStore();
  if (!isMasterAdmin) {
    return <Navigate to={getDefaultRouteForUser(user, false)} replace />;
  }
  return <>{children}</>;
};

function CanonicalHeadSync() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    const url = getCanonicalPageUrl(pathname);
    const canonicalEl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonicalEl) canonicalEl.href = url;
    const ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (ogUrl) ogUrl.content = url;
    const twitterUrl = document.querySelector<HTMLMetaElement>('meta[name="twitter:url"]');
    if (twitterUrl) twitterUrl.content = url;
  }, [pathname]);
  return null;
}

export default function App() {
  useAuthObserver();
  const { user, tenant, isMasterAdmin } = useAuthStore();
  const { resolvedTheme } = useThemeStore();
  usePlatformPlansSync(Boolean(user));

  React.useEffect(() => {
    applyTenantTheme(tenant);
  }, [tenant]);

  React.useEffect(() => {
    if (!user) return;
    const runWarmup = () => {
      prefetchPermittedRoutes(user, isMasterAdmin);
      if (!isMasterAdmin) {
        void warmPermittedHookCaches(tenant?.id, user);
      }
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(runWarmup, { timeout: 500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(runWarmup, 120);
    return () => window.clearTimeout(timer);
  }, [user, tenant?.id, isMasterAdmin]);

  return (
    <Router>
      <CanonicalHeadSync />
      <Toaster
        position="top-right"
        toastOptions={{
          style:
            resolvedTheme === 'dark'
              ? {
                  background: '#162238',
                  color: '#F1F5F9',
                  border: '1px solid #25344E',
                }
              : {
                  background: '#FFFFFF',
                  color: '#0F1E33',
                  border: '1px solid #D5DEE9',
                },
        }}
      />
      <Suspense fallback={<WorkspaceBootSkeleton />}>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Dedicated Platform Governance Console for Master Admin */}
          <Route
            path="/master"
            element={
              <ProtectedRoute>
                <MasterRoute>
                  <MasterConsoleLayout />
                </MasterRoute>
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <RouteSuspense variant="master">
                  <MasterOverview />
                </RouteSuspense>
              }
            />
            <Route
              path="monitoring"
              element={
                <RouteSuspense variant="master">
                  <MasterMonitoring />
                </RouteSuspense>
              }
            />
            <Route
              path="users"
              element={
                <RouteSuspense variant="master">
                  <MasterUsers />
                </RouteSuspense>
              }
            />
            <Route
              path="approvals"
              element={
                <RouteSuspense variant="master">
                  <MasterApprovals />
                </RouteSuspense>
              }
            />
            <Route
              path="plans"
              element={
                <RouteSuspense variant="default">
                  <MasterTiersUpgrades />
                </RouteSuspense>
              }
            />
            <Route
              path="payments"
              element={
                <RouteSuspense variant="default">
                  <MasterPaymentChannels />
                </RouteSuspense>
              }
            />
            <Route
              path="system"
              element={
                <RouteSuspense variant="default">
                  <MasterSystemOps />
                </RouteSuspense>
              }
            />
            <Route path="*" element={<Navigate to="/master" replace />} />
          </Route>

          {/* Merchant Business Storefront Shell */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <BusinessRoute>
                  <Layout />
                </BusinessRoute>
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <SectionRoute section="dashboard">
                  <RouteSuspense variant="dashboard">
                    <Dashboard />
                  </RouteSuspense>
                </SectionRoute>
              }
            />
            <Route
              path="pos"
              element={
                <SectionRoute section="pos">
                  <RouteSuspense variant="pos">
                    <POS />
                  </RouteSuspense>
                </SectionRoute>
              }
            />
            <Route
              path="sales"
              element={
                <SectionRoute section="sales">
                  <RouteSuspense variant="table">
                    <SalesHistory />
                  </RouteSuspense>
                </SectionRoute>
              }
            />
            <Route
              path="inventory"
              element={
                <SectionRoute section="inventory">
                  <RouteSuspense variant="table">
                    <Products />
                  </RouteSuspense>
                </SectionRoute>
              }
            />
            <Route
              path="customers"
              element={
                <SectionRoute section="customers">
                  <RouteSuspense variant="table">
                    <Customers />
                  </RouteSuspense>
                </SectionRoute>
              }
            />
            <Route
              path="shifts"
              element={
                <SectionRoute section="shifts">
                  <RouteSuspense variant="table">
                    <ShiftsAudit />
                  </RouteSuspense>
                </SectionRoute>
              }
            />
            <Route
              path="bulk-import"
              element={
                <SectionRoute section="bulk_import">
                  <RouteSuspense variant="default">
                    <BulkImport />
                  </RouteSuspense>
                </SectionRoute>
              }
            />
            <Route
              path="purchases"
              element={
                <SectionRoute section="purchases">
                  <TierGate feature="suppliersAndPOs">
                    <RouteSuspense variant="table">
                      <PurchaseOrders />
                    </RouteSuspense>
                  </TierGate>
                </SectionRoute>
              }
            />
            <Route
              path="suppliers"
              element={
                <SectionRoute section="suppliers">
                  <TierGate feature="suppliersAndPOs">
                    <RouteSuspense variant="cards">
                      <Suppliers />
                    </RouteSuspense>
                  </TierGate>
                </SectionRoute>
              }
            />
            <Route
              path="finance"
              element={
                <SectionRoute section="finance">
                  <RouteSuspense variant="table">
                    <Expenses />
                  </RouteSuspense>
                </SectionRoute>
              }
            />
            <Route
              path="payroll"
              element={
                <SectionRoute section="payroll">
                  <TierGate feature="payrollPayeNssf">
                    <RouteSuspense variant="table">
                      <Payroll />
                    </RouteSuspense>
                  </TierGate>
                </SectionRoute>
              }
            />
            <Route
              path="reports"
              element={
                <SectionRoute section="reports">
                  <TierGate feature="advancedReports">
                    <RouteSuspense variant="dashboard">
                      <Reports />
                    </RouteSuspense>
                  </TierGate>
                </SectionRoute>
              }
            />
            <Route
              path="ai"
              element={
                <SectionRoute section="ai">
                  <RouteSuspense variant="dashboard">
                    <AICopilot />
                  </RouteSuspense>
                </SectionRoute>
              }
            />
            <Route
              path="team"
              element={
                <SectionRoute section="team">
                  <RouteSuspense variant="table">
                    <TeamBranches />
                  </RouteSuspense>
                </SectionRoute>
              }
            />
            <Route
              path="billing"
              element={
                <SectionRoute section="billing">
                  <RouteSuspense variant="default">
                    <Billing />
                  </RouteSuspense>
                </SectionRoute>
              }
            />
            <Route
              path="settings"
              element={
                <SectionRoute section="settings">
                  <RouteSuspense variant="default">
                    <Settings />
                  </RouteSuspense>
                </SectionRoute>
              }
            />
            <Route path="*" element={<DefaultHomeRedirect />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}
