import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  Users,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  ShoppingCart,
  FileText,
  DollarSign,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useInventory } from '../../hooks/useInventory';
import { usePOS } from '../../hooks/usePOS';
import { useCustomers } from '../../hooks/useCustomers';
import { useExpenses } from '../../hooks/useExpenses';
import { useBranches } from '../../hooks/useBranches';
import { formatUGX } from '../../utils/format';
import { getEffectiveStock } from '../../utils/branchStock';
import { downloadCsv } from '../../utils/exportCsv';
import { useAuthStore } from '../../store/authStore';
import { getPlanQuota } from '../../utils/planLimits';
import { hasSectionAccess } from '../../utils/rbac';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

const StatCard = ({ title, value, deltaLabel, isPositive, icon: Icon, color }: any) => (
  <div className="card flex items-start justify-between gap-3">
    <div className="min-w-0">
      <p className="text-text-muted text-sm font-medium mb-1">{title}</p>
      <h3 className="text-xl md:text-2xl font-bold text-primary font-mono tabular-nums truncate">
        {value}
      </h3>
      <div
        className={cn(
          'flex items-center gap-1 text-xs font-semibold mt-2',
          isPositive === null
            ? 'text-text-muted'
            : isPositive
            ? 'text-accent'
            : 'text-danger'
        )}
      >
        {isPositive === true && <ArrowUpRight size={14} />}
        {isPositive === false && <ArrowDownRight size={14} />}
        <span>{deltaLabel}</span>
      </div>
    </div>
    <div className={cn('p-3 rounded-xl shrink-0', color)}>
      <Icon size={24} className="text-white" />
    </div>
  </div>
);

function calculatePercentDelta(current: number, previous: number, periodLabel: string) {
  if (previous === 0) {
    return {
      label: current > 0 ? `New activity ${periodLabel}` : `No prior ${periodLabel} baseline`,
      isPositive: current > 0 ? true : null,
    };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.abs(pct).toFixed(1);
  return {
    label: `${pct >= 0 ? '+' : '-'}${rounded}% vs ${periodLabel}`,
    isPositive: pct >= 0,
  };
}

export default function Dashboard() {
  const { user, tenant } = useAuthStore();
  const { products } = useInventory();
  const { sales } = usePOS();
  const { customers } = useCustomers();
  const { expenses } = useExpenses();
  const { activeBranchId, activeBranch } = useBranches();
  const [chartDays, setChartDays] = useState<7 | 30>(7);

  const effectiveBranchId = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : null;

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const productBuyingMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => map.set(p.id, p.buyingPrice || 0));
    return map;
  }, [products]);

  const validBranchSales = useMemo(() => {
    return sales.filter((s) => {
      if (s.status === 'refunded') return false;
      if (effectiveBranchId && s.branchId && s.branchId !== effectiveBranchId) return false;
      return true;
    });
  }, [sales, effectiveBranchId]);

  const branchExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (effectiveBranchId && e.branchId && e.branchId !== effectiveBranchId) return false;
      return true;
    });
  }, [expenses, effectiveBranchId]);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

  const todaySalesTotal = useMemo(
    () =>
      validBranchSales
        .filter((s) => s.createdAt.startsWith(todayStr))
        .reduce((acc, s) => acc + s.total, 0),
    [validBranchSales, todayStr]
  );

  const yesterdaySalesTotal = useMemo(
    () =>
      validBranchSales
        .filter((s) => s.createdAt.startsWith(yesterdayStr))
        .reduce((acc, s) => acc + s.total, 0),
    [validBranchSales, yesterdayStr]
  );

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);

  const monthlySalesList = useMemo(
    () =>
      validBranchSales.filter((s) => {
        const d = new Date(s.createdAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }),
    [validBranchSales, currentMonth, currentYear]
  );

  const monthlyRevenue = useMemo(
    () => monthlySalesList.reduce((acc, s) => acc + s.total, 0),
    [monthlySalesList]
  );

  const monthlyCogs = useMemo(() => {
    return monthlySalesList.reduce((acc, s) => {
      const saleCost = (s.items || []).reduce((itemSum, item) => {
        const unitCost =
          item.costPrice !== undefined ? item.costPrice : productBuyingMap.get(item.productId) || 0;
        return itemSum + unitCost * item.quantity;
      }, 0);
      return acc + saleCost;
    }, 0);
  }, [monthlySalesList, productBuyingMap]);

  const monthlyExpensesTotal = useMemo(
    () =>
      branchExpenses
        .filter((e) => {
          const d = new Date(e.expenseDate || e.createdAt);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((acc, e) => acc + e.amount, 0),
    [branchExpenses, currentMonth, currentYear]
  );

  const monthlyGrossProfit = monthlyRevenue - monthlyCogs;
  const grossMarginPct =
    monthlyRevenue > 0 ? ((monthlyGrossProfit / monthlyRevenue) * 100).toFixed(1) : '0.0';

  const prevMonthlyRevenue = useMemo(
    () =>
      validBranchSales
        .filter((s) => {
          const d = new Date(s.createdAt);
          return (
            d.getMonth() === prevMonthDate.getMonth() &&
            d.getFullYear() === prevMonthDate.getFullYear()
          );
        })
        .reduce((acc, s) => acc + s.total, 0),
    [validBranchSales, prevMonthDate]
  );

  const lowStockCount = useMemo(
    () =>
      products.filter((p) => getEffectiveStock(p, effectiveBranchId) <= (p.minStockLevel ?? 0))
        .length,
    [products, effectiveBranchId]
  );

  const todayDelta = calculatePercentDelta(todaySalesTotal, yesterdaySalesTotal, 'yesterday');
  const monthDelta = calculatePercentDelta(monthlyRevenue, prevMonthlyRevenue, 'last month');

  // Dynamic chart data (Last 7 Days or Last 30 Days)
  const chartData = useMemo(() => {
    return Array.from({ length: chartDays }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (chartDays - 1 - i));
      const dateStr = d.toISOString().split('T')[0];
      const daySales = validBranchSales.filter((s) => s.createdAt.startsWith(dateStr));
      return {
        name:
          chartDays === 7
            ? d.toLocaleDateString('en-US', { weekday: 'short' })
            : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        sales: daySales.reduce((acc, s) => acc + s.total, 0),
      };
    });
  }, [validBranchSales, chartDays]);

  // Top products calculation
  const topProducts = useMemo(() => {
    const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};

    validBranchSales.forEach((sale) => {
      if (sale.items) {
        sale.items.forEach((item) => {
          if (!productSales[item.productId]) {
            productSales[item.productId] = { name: item.name, quantity: 0, revenue: 0 };
          }
          productSales[item.productId].quantity += item.quantity;
          productSales[item.productId].revenue += item.total;
        });
      }
    });

    return Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [validBranchSales]);

  const handleExportDashboard = () => {
    if (validBranchSales.length === 0) {
      toast('No sales records to export yet');
      return;
    }
    downloadCsv(
      `dashboard-sales-${todayStr}.csv`,
      ['Reference', 'Date', 'Branch', 'Customer', 'Payment Method', 'Total (UGX)', 'Status'],
      validBranchSales.map((s) => [
        s.reference,
        s.createdAt,
        s.branchName || 'Main',
        (s.customerId && customerMap.get(s.customerId)) || 'Walk-in Customer',
        s.paymentMethod,
        s.total,
        s.status,
      ])
    );
    toast.success('Sales report exported');
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {tenant?.logo && (
            <img
              src={tenant.logo}
              alt={tenant.name}
              className="w-12 h-12 rounded-xl object-cover border border-border bg-white shrink-0"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold truncate">
              {tenant?.name || 'Dashboard'}
            </h1>
            <p className="text-text-muted text-sm mt-0.5 truncate">
              Welcome back, {user?.name?.split(' ')[0] || 'User'} ·{' '}
              {activeBranch ? activeBranch.name : 'All Branches'} ·{' '}
              {getPlanQuota(tenant?.plan).name} Pack
              {tenant?.branding?.tagline ? ` · ${tenant.branding.tagline}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleExportDashboard}
            className="btn btn-secondary gap-2 text-xs sm:text-sm flex-1 sm:flex-none justify-center whitespace-nowrap"
          >
            <FileText size={18} />
            <span className="hidden xs:inline">Export Report</span>
          </button>
          {hasSectionAccess(user, 'pos') && (
            <Link
              to="/pos"
              className="btn btn-primary gap-2 text-xs sm:text-sm flex-1 sm:flex-none justify-center whitespace-nowrap"
            >
              <Plus size={18} />
              <span>New Sale</span>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard
          title="Today's Sales"
          value={formatUGX(todaySalesTotal)}
          deltaLabel={todayDelta.label}
          isPositive={todayDelta.isPositive}
          icon={ShoppingCart}
          color="bg-accent"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatUGX(monthlyRevenue)}
          deltaLabel={monthDelta.label}
          isPositive={monthDelta.isPositive}
          icon={TrendingUp}
          color="bg-primary"
        />
        <StatCard
          title="Monthly Gross Profit"
          value={formatUGX(monthlyGrossProfit)}
          deltaLabel={`${grossMarginPct}% margin · Exp ${formatUGX(monthlyExpensesTotal)}`}
          isPositive={monthlyGrossProfit >= 0}
          icon={DollarSign}
          color="bg-accent-alt"
        />
        <StatCard
          title="Low Stock Items"
          value={lowStockCount}
          deltaLabel={
            lowStockCount > 0 ? `${lowStockCount} need restocking` : `${customers.length} customers active`
          }
          isPositive={lowStockCount === 0}
          icon={lowStockCount > 0 ? AlertTriangle : Users}
          color={lowStockCount > 0 ? 'bg-danger' : 'bg-accent'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="flex items-center justify-between mb-6 gap-4">
            <h3 className="font-bold text-lg">Revenue Overview</h3>
            <select
              aria-label="Revenue overview timeframe"
              value={chartDays}
              onChange={(e) => setChartDays(Number(e.target.value) as 7 | 30)}
              className="bg-surface-alt border border-border rounded-md text-xs font-bold px-3 py-1.5 outline-none"
            >
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
            </select>
          </div>
          <div className="h-[250px] sm:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-accent, #00C37F)" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="var(--color-accent, #00C37F)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10 }} width={45} />
                <Tooltip
                  formatter={(value: number) => [formatUGX(value), 'Sales']}
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="var(--color-accent, #00C37F)"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorSales)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="font-bold text-lg mb-6">Top Selling Products</h3>
          <div className="space-y-6">
            {topProducts.map((product, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-surface-alt rounded-lg flex items-center justify-center font-bold text-primary shrink-0">
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-primary truncate">{product.name}</p>
                    <p className="text-xs text-text-muted tabular-nums">{product.quantity} units sold</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-accent font-mono tabular-nums shrink-0">
                  {formatUGX(product.revenue)}
                </p>
              </div>
            ))}
            {topProducts.length === 0 && (
              <div className="text-center py-8">
                <p className="text-text-muted text-sm">No sales data available</p>
              </div>
            )}
          </div>
          {hasSectionAccess(user, 'reports') && (
            <Link to="/reports" className="btn btn-ghost w-full mt-6 text-sm font-bold">
              View Detailed Report
            </Link>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-lg">Recent Sales</h3>
          {hasSectionAccess(user, 'sales') && (
            <Link to="/sales" className="text-accent text-sm font-bold hover:underline">
              View All
            </Link>
          )}
        </div>
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Reference</th>
                <th className="py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Customer</th>
                <th className="py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Amount</th>
                <th className="py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Method</th>
                <th className="py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {validBranchSales.slice(0, 5).map((sale) => (
                <tr key={sale.id} className="hover:bg-surface-alt transition-colors">
                  <td className="py-4 text-sm font-bold text-primary font-mono">{sale.reference}</td>
                  <td className="py-4 text-sm text-text-secondary">
                    {(sale.customerId && customerMap.get(sale.customerId)) || 'Walk-in Customer'}
                  </td>
                  <td className="py-4 text-sm font-bold text-accent font-mono tabular-nums">
                    {formatUGX(sale.total)}
                  </td>
                  <td className="py-4 text-xs font-medium text-text-secondary">
                    {sale.paymentMethod}
                  </td>
                  <td className="py-4 text-sm text-text-muted tabular-nums">
                    {new Date(sale.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {validBranchSales.length === 0 && (
            <div className="text-center py-12">
              <p className="text-text-muted">No recent sales found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
