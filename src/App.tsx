import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/layout/Layout';
import Dashboard from './pages/dashboard/Dashboard';
import Products from './pages/inventory/Products';
import POS from './pages/pos/POS';
import Customers from './pages/customers/Customers';
import Expenses from './pages/accounting/Expenses';
import SalesHistory from './pages/sales/SalesHistory';
import Suppliers from './pages/suppliers/Suppliers';
import Reports from './pages/reports/Reports';
import Billing from './pages/billing/Billing';
import PurchaseOrders from './pages/purchases/PurchaseOrders';
import AICopilot from './pages/ai/AICopilot';
import TeamBranches from './pages/team/TeamBranches';
import Payroll from './pages/payroll/Payroll';
import ShiftsAudit from './pages/shifts/ShiftsAudit';
import Settings from './pages/settings/Settings';
import MasterDashboard from './pages/master/MasterDashboard';
import Login from './pages/auth/Login';
import { TierGate } from './components/shared/TierGate';
import { useAuthStore } from './store/authStore';
import { useAuthObserver } from './hooks/useAuth';
import { applyTenantTheme } from './utils/branding';
import { getDefaultRouteForUser, hasSectionAccess } from './utils/rbac';
import { AppSection } from './types';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-alt">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-muted font-bold tracking-widest uppercase text-xs">
            Loading Workspace...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

const SectionRoute = ({
  section,
  children,
}: {
  section: AppSection;
  children: React.ReactNode;
}) => {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (!hasSectionAccess(user, section)) {
    const fallback = getDefaultRouteForUser(user);
    return <Navigate to={fallback === '/' && section === 'dashboard' ? '/finance' : fallback} replace />;
  }
  return <>{children}</>;
};

const DefaultHomeRedirect = () => {
  const { user } = useAuthStore();
  return <Navigate to={getDefaultRouteForUser(user)} replace />;
};

const MasterRoute = ({ children }: { children: React.ReactNode }) => {
  const { isMasterAdmin, user } = useAuthStore();
  if (!isMasterAdmin) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }
  return <>{children}</>;
};

export default function App() {
  useAuthObserver();
  const { tenant } = useAuthStore();

  React.useEffect(() => {
    applyTenantTheme(tenant);
  }, [tenant]);

  return (
    <Router>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={
              <SectionRoute section="dashboard">
                <Dashboard />
              </SectionRoute>
            }
          />
          <Route
            path="pos"
            element={
              <SectionRoute section="pos">
                <POS />
              </SectionRoute>
            }
          />
          <Route
            path="sales"
            element={
              <SectionRoute section="sales">
                <SalesHistory />
              </SectionRoute>
            }
          />
          <Route
            path="inventory"
            element={
              <SectionRoute section="inventory">
                <Products />
              </SectionRoute>
            }
          />
          <Route
            path="customers"
            element={
              <SectionRoute section="customers">
                <Customers />
              </SectionRoute>
            }
          />
          <Route
            path="shifts"
            element={
              <SectionRoute section="shifts">
                <ShiftsAudit />
              </SectionRoute>
            }
          />
          <Route
            path="purchases"
            element={
              <SectionRoute section="purchases">
                <TierGate feature="suppliersAndPOs">
                  <PurchaseOrders />
                </TierGate>
              </SectionRoute>
            }
          />
          <Route
            path="suppliers"
            element={
              <SectionRoute section="suppliers">
                <TierGate feature="suppliersAndPOs">
                  <Suppliers />
                </TierGate>
              </SectionRoute>
            }
          />
          <Route
            path="finance"
            element={
              <SectionRoute section="finance">
                <Expenses />
              </SectionRoute>
            }
          />
          <Route
            path="payroll"
            element={
              <SectionRoute section="payroll">
                <TierGate feature="payrollPayeNssf">
                  <Payroll />
                </TierGate>
              </SectionRoute>
            }
          />
          <Route
            path="reports"
            element={
              <SectionRoute section="reports">
                <TierGate feature="advancedReports">
                  <Reports />
                </TierGate>
              </SectionRoute>
            }
          />
          <Route
            path="ai"
            element={
              <SectionRoute section="ai">
                <AICopilot />
              </SectionRoute>
            }
          />
          <Route
            path="team"
            element={
              <SectionRoute section="team">
                <TeamBranches />
              </SectionRoute>
            }
          />
          <Route
            path="billing"
            element={
              <SectionRoute section="billing">
                <Billing />
              </SectionRoute>
            }
          />
          <Route
            path="settings"
            element={
              <SectionRoute section="settings">
                <Settings />
              </SectionRoute>
            }
          />
          <Route
            path="master"
            element={
              <MasterRoute>
                <MasterDashboard />
              </MasterRoute>
            }
          />
          <Route path="*" element={<DefaultHomeRedirect />} />
        </Route>
      </Routes>
    </Router>
  );
}
