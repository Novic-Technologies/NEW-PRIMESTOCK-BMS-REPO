import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Download,
  Filter,
  ArrowRight,
  FileSpreadsheet,
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { useInventory } from '../../hooks/useInventory';
import { usePOS } from '../../hooks/usePOS';
import { useExpenses } from '../../hooks/useExpenses';
import { usePurchaseOrders } from '../../hooks/usePurchaseOrders';
import { useBranches } from '../../hooks/useBranches';
import { useAuthStore } from '../../store/authStore';
import { format } from 'date-fns';
import { formatUGX } from '../../utils/format';
import { getEffectiveStock } from '../../utils/branchStock';
import { downloadCsv } from '../../utils/exportCsv';
import { PageContentSkeleton } from '../../components/shared/Skeletons';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

const COLORS = ['#2563EB', '#0F766E', '#D97706', '#DC2626', '#0891B2', '#64748B'];

type DateRangeKey = '7d' | '30d' | '180d' | 'all';
type ChartSeriesFilter = 'both' | 'revenue' | 'expenses';
type ReportTab = 'overview' | 'margin' | 'vat';

function parseSafeDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatTrend(current: number, previous: number, periodLabel: string) {
  if (previous === 0) {
    return {
      text: current > 0 ? `Active in ${periodLabel}` : `No prior ${periodLabel}`,
      up: current > 0 ? true : null,
    };
  }
  const pct = ((current - previous) / previous) * 100;
  return {
    text: `${pct >= 0 ? '+' : '-'}${Math.abs(pct).toFixed(1)}% vs prior`,
    up: pct >= 0,
  };
}

export default function Reports() {
  const { tenant } = useAuthStore();
  const { products, isLoading: productsLoading } = useInventory();
  const { sales, isLoading: salesLoading } = usePOS();
  const { expenses, isLoading: expensesLoading } = useExpenses();
  const { purchaseOrders } = usePurchaseOrders();
  const { activeBranchId, activeBranch } = useBranches();
  const isInitialLoading = productsLoading || salesLoading || expensesLoading;

  const [reportTab, setReportTab] = useState<ReportTab>('overview');
  const [dateRange, setDateRange] = useState<DateRangeKey>('30d');
  const [seriesFilter, setSeriesFilter] = useState<ChartSeriesFilter>('both');
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  const effectiveBranchId = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : null;

  const productBuyingMap = useMemo(
    () => new Map(products.map((p) => [p.id, p.buyingPrice || 0])),
    [products]
  );

  const branchSales = useMemo(
    () =>
      sales.filter((s) => {
        if (s.status === 'refunded') return false;
        if (effectiveBranchId && s.branchId && s.branchId !== effectiveBranchId) return false;
        return true;
      }),
    [sales, effectiveBranchId]
  );

  const branchExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        if (effectiveBranchId && e.branchId && e.branchId !== effectiveBranchId) return false;
        return true;
      }),
    [expenses, effectiveBranchId]
  );

  const branchPOs = useMemo(
    () =>
      purchaseOrders.filter((po) => {
        if (po.status !== 'received') return false;
        if (effectiveBranchId && po.branchId && po.branchId !== effectiveBranchId) return false;
        return true;
      }),
    [purchaseOrders, effectiveBranchId]
  );

  const rangeDays = useMemo(() => {
    if (dateRange === '7d') return 7;
    if (dateRange === '30d') return 30;
    if (dateRange === '180d') return 180;
    return null;
  }, [dateRange]);

  const { filteredSales, filteredExpenses, filteredPOs, prevSales, prevExpenses } = useMemo(() => {
    if (!rangeDays) {
      return {
        filteredSales: branchSales,
        filteredExpenses: branchExpenses,
        filteredPOs: branchPOs,
        prevSales: [],
        prevExpenses: [],
      };
    }

    const nowMs = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    const currentCutoff = nowMs - rangeDays * msPerDay;
    const prevCutoff = nowMs - rangeDays * 2 * msPerDay;

    const currS = branchSales.filter((s) => {
      const d = parseSafeDate(s.createdAt);
      return d ? d.getTime() >= currentCutoff : false;
    });
    const prevS = branchSales.filter((s) => {
      const d = parseSafeDate(s.createdAt);
      return d ? d.getTime() >= prevCutoff && d.getTime() < currentCutoff : false;
    });

    const currE = branchExpenses.filter((e) => {
      const d = parseSafeDate(e.expenseDate || e.createdAt);
      return d ? d.getTime() >= currentCutoff : false;
    });
    const prevE = branchExpenses.filter((e) => {
      const d = parseSafeDate(e.expenseDate || e.createdAt);
      return d ? d.getTime() >= prevCutoff && d.getTime() < currentCutoff : false;
    });

    const currPO = branchPOs.filter((po) => {
      const d = parseSafeDate(po.receivedAt || po.createdAt);
      return d ? d.getTime() >= currentCutoff : false;
    });

    return {
      filteredSales: currS,
      filteredExpenses: currE,
      filteredPOs: currPO,
      prevSales: prevS,
      prevExpenses: prevE,
    };
  }, [branchSales, branchExpenses, branchPOs, rangeDays]);

  const marginSummary = useMemo(() => {
    const byProduct = new Map<
      string,
      { name: string; qty: number; revenue: number; cogs: number; profit: number }
    >();
    let totalCogs = 0;

    filteredSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const unitCost =
          item.costPrice !== undefined ? item.costPrice : productBuyingMap.get(item.productId) || 0;
        const lineCogs = unitCost * item.quantity;
        totalCogs += lineCogs;

        const prev = byProduct.get(item.productId) || {
          name: item.name,
          qty: 0,
          revenue: 0,
          cogs: 0,
          profit: 0,
        };
        prev.qty += item.quantity;
        prev.revenue += item.total;
        prev.cogs += lineCogs;
        prev.profit = prev.revenue - prev.cogs;
        byProduct.set(item.productId, prev);
      });
    });

    const totalRevenue = filteredSales.reduce((s, sale) => s + sale.total, 0);
    const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);
    const grossProfit = totalRevenue - totalCogs;
    const netProfit = grossProfit - totalExpenses;

    return {
      totalRevenue,
      totalCogs,
      grossProfit,
      totalExpenses,
      netProfit,
      productRows: Array.from(byProduct.values()).sort((a, b) => b.profit - a.profit),
    };
  }, [filteredSales, filteredExpenses, productBuyingMap]);

  const vatSummary = useMemo(() => {
    const defaultRate = Number(tenant?.preferences?.taxRate ?? 18);
    const outputVatUgx = filteredSales.reduce((sum, s) => sum + (s.taxAmount || 0), 0);
    const taxableSalesTotal = filteredSales
      .filter((s) => (s.taxAmount || 0) > 0)
      .reduce((sum, s) => sum + s.total, 0);

    const purchaseSpend = filteredPOs.reduce((sum, po) => sum + po.totalAmount, 0);
    const estimatedInputVatUgx =
      defaultRate > 0
        ? Math.round(purchaseSpend - purchaseSpend / (1 + defaultRate / 100))
        : 0;

    return {
      rate: defaultRate,
      taxableSalesCount: filteredSales.filter((s) => (s.taxAmount || 0) > 0).length,
      taxableSalesTotal,
      outputVatUgx,
      purchaseSpend,
      estimatedInputVatUgx,
      netVatPayableUgx: outputVatUgx - estimatedInputVatUgx,
    };
  }, [filteredSales, filteredPOs, tenant?.preferences?.taxRate]);

  const stats = useMemo(() => {
    const totalRevenue = marginSummary.totalRevenue;
    const totalExpenses = marginSummary.totalExpenses;
    const netProfit = marginSummary.netProfit;
    const totalStockValue = products.reduce(
      (sum, p) => sum + (p.buyingPrice || 0) * getEffectiveStock(p, effectiveBranchId),
      0
    );
    const lowStockCount = products.filter(
      (p) => getEffectiveStock(p, effectiveBranchId) <= p.minStockLevel
    ).length;

    const prevRevenue = prevSales.reduce((sum, s) => sum + s.total, 0);
    const prevExpenseTotal = prevExpenses.reduce((sum, e) => sum + e.amount, 0);
    const prevProfit = prevRevenue - prevExpenseTotal;

    const rangeLabel =
      dateRange === '7d'
        ? '7 days'
        : dateRange === '30d'
        ? '30 days'
        : dateRange === '180d'
        ? '6 months'
        : 'all time';

    const revTrend =
      dateRange === 'all'
        ? { text: `${filteredSales.length} total sales`, up: totalRevenue > 0 ? true : null }
        : formatTrend(totalRevenue, prevRevenue, rangeLabel);

    const expTrend =
      dateRange === 'all'
        ? { text: `${filteredExpenses.length} entries`, up: null }
        : formatTrend(totalExpenses, prevExpenseTotal, rangeLabel);

    const profitTrend =
      dateRange === 'all'
        ? {
            text:
              totalRevenue > 0
                ? `${((netProfit / totalRevenue) * 100).toFixed(1)}% net margin`
                : 'No revenue yet',
            up: netProfit > 0 ? true : netProfit < 0 ? false : null,
          }
        : formatTrend(netProfit, prevProfit, rangeLabel);

    return [
      {
        label: 'Total Revenue',
        value: totalRevenue,
        icon: DollarSign,
        color: 'text-accent',
        bg: 'bg-accent/10',
        trend: revTrend.text,
        trendUp: revTrend.up,
      },
      {
        label: 'COGS + Expenses',
        value: marginSummary.totalCogs + totalExpenses,
        icon: TrendingDown,
        color: 'text-danger',
        bg: 'bg-danger/10',
        trend: expTrend.text,
        trendUp: expTrend.up === null ? null : !expTrend.up,
      },
      {
        label: 'True Net Profit',
        value: netProfit,
        icon: TrendingUp,
        color: 'text-primary',
        bg: 'bg-primary/10',
        trend: profitTrend.text,
        trendUp: profitTrend.up,
      },
      {
        label: 'Inventory Value',
        value: totalStockValue,
        icon: Package,
        color: 'text-accent-alt',
        bg: 'bg-accent-alt/10',
        trend: lowStockCount > 0 ? `${lowStockCount} low stock` : `${products.length} active SKUs`,
        trendUp: lowStockCount === 0 ? true : false,
      },
    ];
  }, [marginSummary, prevSales, prevExpenses, products, dateRange, filteredSales.length, filteredExpenses.length, effectiveBranchId]);

  const revenueVsExpensesData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (5 - i));
      return {
        key: format(d, 'yyyy-MM'),
        label: format(d, 'MMM'),
      };
    });

    return months.map(({ key, label }) => {
      const monthSales = branchSales.filter((s) => {
        const d = parseSafeDate(s.createdAt);
        return d ? format(d, 'yyyy-MM') === key : false;
      });
      const monthExpenses = branchExpenses.filter((e) => {
        const d = parseSafeDate(e.expenseDate || e.createdAt);
        return d ? format(d, 'yyyy-MM') === key : false;
      });

      return {
        name: label,
        revenue: monthSales.reduce((sum, s) => sum + s.total, 0),
        expenses: monthExpenses.reduce((sum, e) => sum + e.amount, 0),
      };
    });
  }, [branchSales, branchExpenses]);

  const inventoryDistribution = useMemo(() => {
    const categories: Record<string, number> = {};
    products.forEach((p) => {
      const cat = p.category || 'Uncategorized';
      categories[cat] = (categories[cat] || 0) + 1;
    });
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [products]);

  const unifiedTransactions = useMemo(() => {
    const saleRows = filteredSales.map((s) => {
      const d = parseSafeDate(s.createdAt);
      return {
        id: `sale-${s.id}`,
        reference: s.reference,
        timestamp: d ? d.getTime() : 0,
        dateLabel: d ? format(d, 'MMM dd, yyyy HH:mm') : s.createdAt,
        type: 'Sale' as const,
        amount: s.total,
        status: s.status,
      };
    });

    const expenseRows = filteredExpenses.map((e) => {
      const d = parseSafeDate(e.expenseDate || e.createdAt);
      return {
        id: `exp-${e.id}`,
        reference: `${e.category} — ${e.description}`,
        timestamp: d ? d.getTime() : 0,
        dateLabel: d ? format(d, 'MMM dd, yyyy') : e.expenseDate,
        type: 'Expense' as const,
        amount: e.amount,
        status: e.paymentMethod,
      };
    });

    return [...saleRows, ...expenseRows].sort((a, b) => b.timestamp - a.timestamp);
  }, [filteredSales, filteredExpenses]);

  const visibleTransactions = showAllTransactions
    ? unifiedTransactions
    : unifiedTransactions.slice(0, 10);

  const handleExport = () => {
    if (reportTab === 'vat') {
      downloadCsv(
        `ura-efris-vat-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`,
        ['Receipt Reference', 'Date', 'Branch', 'Gross Total (UGX)', 'VAT Rate (%)', 'Output VAT (UGX)'],
        filteredSales.map((s) => [
          s.reference,
          s.createdAt,
          s.branchName || 'Main',
          s.total,
          s.taxRate ?? vatSummary.rate,
          s.taxAmount || 0,
        ])
      );
      toast.success('Exported URA EFRIS VAT schedule');
      return;
    }

    if (unifiedTransactions.length === 0) {
      toast.error('No transactions in the selected period to export');
      return;
    }
    const headers = ['Date', 'Type', 'Reference', 'Amount (UGX)', 'Status / Method'];
    const rows = unifiedTransactions.map((tx) => [
      tx.dateLabel,
      tx.type,
      tx.reference,
      tx.amount,
      tx.status,
    ]);
    downloadCsv(`financial-report-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast.success(`Exported ${unifiedTransactions.length} report rows`);
  };

  const cycleSeriesFilter = () => {
    setSeriesFilter((prev) =>
      prev === 'both' ? 'revenue' : prev === 'revenue' ? 'expenses' : 'both'
    );
  };

  if (isInitialLoading && products.length === 0 && sales.length === 0 && expenses.length === 0) {
    return <PageContentSkeleton variant="dashboard" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Reports &amp; Analytics</h1>
          <p className="text-text-muted mt-1">
            {activeBranch ? `${activeBranch.name} · ` : 'All Branches · '}
            COGS Profit &amp; Loss, sales trends, and URA VAT compliance.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Calendar
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
            />
            <select
              aria-label="Select report date range"
              className="input pl-9 pr-8 w-full sm:w-44"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRangeKey)}
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="180d">Last 6 Months</option>
              <option value="all">All Time</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="btn btn-primary gap-2 flex-1 sm:flex-none whitespace-nowrap"
          >
            <Download size={18} />
            {reportTab === 'vat' ? 'Export EFRIS CSV' : 'Export'}
          </button>
        </div>
      </div>

      {/* Report Mode Tabs */}
      <div className="flex items-center gap-1 p-1 bg-surface-alt rounded-lg border border-border self-start w-fit max-w-full overflow-x-auto">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'margin', label: 'Profit & Margin (COGS)' },
          { key: 'vat', label: 'URA VAT Return' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setReportTab(tab.key as ReportTab)}
            className={cn(
              'px-4 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap',
              reportTab === tab.key
                ? 'bg-surface text-primary shadow-sm'
                : 'text-text-secondary hover:text-primary'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {reportTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {stats.map((stat, i) => (
              <div key={i} className="card p-5 sm:p-6">
                <div className="flex justify-between items-start gap-2 mb-4">
                  <div className={cn('p-3 rounded-xl shrink-0', stat.bg, stat.color)}>
                    <stat.icon size={24} />
                  </div>
                  <div
                    className={cn(
                      'flex items-center gap-1 text-xs font-semibold text-right',
                      stat.trendUp === null
                        ? 'text-text-muted'
                        : stat.trendUp
                        ? 'text-accent'
                        : 'text-danger'
                    )}
                  >
                    {stat.trendUp === true && <ArrowUpRight size={14} />}
                    {stat.trendUp === false && <ArrowDownRight size={14} />}
                    <span>{stat.trend}</span>
                  </div>
                </div>
                <p className="text-text-muted text-xs font-bold uppercase tracking-widest">{stat.label}</p>
                <h3 className="text-xl sm:text-2xl font-bold text-primary mt-1 font-mono tabular-nums truncate">
                  {formatUGX(stat.value)}
                </h3>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-4 sm:p-6">
              <div className="flex justify-between items-center mb-8 gap-2">
                <div>
                  <h3 className="font-bold text-primary">Revenue vs Expenses</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Last 6 months ({seriesFilter === 'both' ? 'All series' : `${seriesFilter} only`})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cycleSeriesFilter}
                  className="btn btn-secondary text-xs gap-1.5 px-3 py-1.5 min-h-[36px] whitespace-nowrap"
                >
                  <Filter size={14} />
                  {seriesFilter === 'both'
                    ? 'Both'
                    : seriesFilter === 'revenue'
                    ? 'Revenue'
                    : 'Expenses'}
                </button>
              </div>
              <div className="h-64 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueVsExpensesData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0F766E" stopOpacity={0.16} />
                        <stop offset="95%" stopColor="#0F766E" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#DC2626" stopOpacity={0.16} />
                        <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600 }}
                      dy={10}
                    />
                    <YAxis
                      width={52}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600 }}
                      tickFormatter={(val) =>
                        val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${Math.round(val / 1000)}k`
                      }
                    />
                    <Tooltip
                      formatter={(value: any) => formatUGX(Number(value || 0))}
                      contentStyle={{
                        borderRadius: '12px',
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        boxShadow: 'var(--shadow-soft)',
                        padding: '10px 12px',
                      }}
                      itemStyle={{ color: 'var(--color-text-primary)' }}
                      labelStyle={{ color: 'var(--color-text-secondary)' }}
                    />
                    {(seriesFilter === 'both' || seriesFilter === 'revenue') && (
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue"
                        stroke="#0F766E"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                      />
                    )}
                    {(seriesFilter === 'both' || seriesFilter === 'expenses') && (
                      <Area
                        type="monotone"
                        dataKey="expenses"
                        name="Expenses"
                        stroke="#DC2626"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorExpenses)"
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-4 sm:p-6">
              <div className="flex justify-between items-center mb-8 gap-2">
                <div>
                  <h3 className="font-bold text-primary">Inventory Distribution</h3>
                  <p className="text-xs text-text-muted mt-0.5">Products by category</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-accent whitespace-nowrap">
                  <Package size={15} />
                  <span className="font-mono tabular-nums">{products.length} Products</span>
                </div>
              </div>
              {inventoryDistribution.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-text-muted text-sm">
                  Add products to view category distribution
                </div>
              ) : (
                <div className="h-auto flex flex-col sm:flex-row items-center gap-8">
                  <div className="w-full sm:w-1/2 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={inventoryDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={6}
                          dataKey="value"
                          stroke="none"
                        >
                          {inventoryDistribution.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: '12px',
                            backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-primary)',
                            boxShadow: 'var(--shadow-soft)',
                          }}
                          itemStyle={{ color: 'var(--color-text-primary)' }}
                          labelStyle={{ color: 'var(--color-text-secondary)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full sm:w-1/2 space-y-2 max-h-64 overflow-y-auto pr-2">
                    {inventoryDistribution.map((entry, index) => (
                      <div
                        key={entry.name}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-alt transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-xs font-bold text-primary truncate">{entry.name}</span>
                        </div>
                        <span className="text-xs font-bold text-accent font-mono tabular-nums">
                          {entry.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between bg-surface-alt/30">
              <h3 className="font-bold text-primary">
                Recent Transactions ({unifiedTransactions.length})
              </h3>
              {unifiedTransactions.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowAllTransactions((v) => !v)}
                  className="text-xs font-bold text-accent hover:underline flex items-center gap-1 whitespace-nowrap"
                >
                  {showAllTransactions ? 'Show Top 10' : 'View All'} <ArrowRight size={14} />
                </button>
              )}
            </div>
            <div className="md:hidden divide-y divide-border">
              {visibleTransactions.length === 0 ? (
                <div className="px-4 py-10 text-center text-text-muted text-sm">
                  No transactions recorded for this period
                </div>
              ) : (
                visibleTransactions.map((tx) => (
                  <div key={tx.id} className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-primary text-sm min-w-0 break-words">
                        {tx.reference}
                      </p>
                      <span className="font-mono tabular-nums font-bold text-sm text-primary shrink-0">
                        {formatUGX(tx.amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-text-muted">
                      <span>{tx.dateLabel}</span>
                      <div className="flex items-center gap-2 uppercase font-bold">
                        <span className={tx.type === 'Sale' ? 'text-accent' : 'text-danger'}>
                          {tx.type}
                        </span>
                        <span className="text-text-secondary">· {tx.status}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left min-w-[700px]">
                <thead>
                  <tr className="bg-surface-alt/50 text-text-muted text-[11px] font-bold uppercase tracking-widest">
                    <th className="px-6 py-4">Reference</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-text-muted text-sm">
                        No transactions recorded for this period
                      </td>
                    </tr>
                  ) : (
                    visibleTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-surface-alt/20 transition-colors">
                        <td className="px-6 py-4 font-bold text-primary text-sm">{tx.reference}</td>
                        <td className="px-6 py-4 text-xs text-text-muted font-medium whitespace-nowrap">
                          {tx.dateLabel}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              'text-xs font-bold uppercase',
                              tx.type === 'Sale' ? 'text-accent' : 'text-danger'
                            )}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-primary font-mono tabular-nums whitespace-nowrap">
                          {formatUGX(tx.amount)}
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-text-secondary uppercase">
                          {tx.status}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {reportTab === 'margin' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5">
              <p className="text-xs font-bold uppercase text-text-muted">Gross Revenue</p>
              <h3 className="text-xl font-bold text-primary font-mono tabular-nums mt-1">
                {formatUGX(marginSummary.totalRevenue)}
              </h3>
            </div>
            <div className="card p-5">
              <p className="text-xs font-bold uppercase text-text-muted">Cost of Goods Sold (COGS)</p>
              <h3 className="text-xl font-bold text-danger font-mono tabular-nums mt-1">
                {formatUGX(marginSummary.totalCogs)}
              </h3>
            </div>
            <div className="card p-5">
              <p className="text-xs font-bold uppercase text-text-muted">Gross Profit</p>
              <h3 className="text-xl font-bold text-accent font-mono tabular-nums mt-1">
                {formatUGX(marginSummary.grossProfit)}
              </h3>
            </div>
            <div className="card p-5">
              <p className="text-xs font-bold uppercase text-text-muted">Net Profit (After Expenses)</p>
              <h3
                className={cn(
                  'text-xl font-bold font-mono tabular-nums mt-1',
                  marginSummary.netProfit >= 0 ? 'text-accent' : 'text-danger'
                )}
              >
                {formatUGX(marginSummary.netProfit)}
              </h3>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="p-5 border-b border-border bg-surface-alt/40">
              <h3 className="font-bold text-primary">Product Profit &amp; Margin Leaderboard</h3>
            </div>
            <div className="md:hidden divide-y divide-border">
              {marginSummary.productRows.length === 0 ? (
                <div className="px-4 py-10 text-center text-text-muted text-sm">
                  No completed product sales in this date range
                </div>
              ) : (
                marginSummary.productRows.map((row, idx) => {
                  const pct = row.revenue > 0 ? ((row.profit / row.revenue) * 100).toFixed(1) : '0.0';
                  return (
                    <div key={idx} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-primary text-sm">{row.name}</p>
                        <span
                          className={cn(
                            'font-mono tabular-nums font-bold text-sm shrink-0',
                            row.profit >= 0 ? 'text-accent' : 'text-danger'
                          )}
                        >
                          {formatUGX(row.profit)} ({pct}%)
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-text-secondary font-mono tabular-nums">
                        <span>Qty: {row.qty}</span>
                        <span>Rev: {formatUGX(row.revenue)}</span>
                        <span className="text-right">COGS: {formatUGX(row.cogs)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-surface-alt/50 border-b border-border text-xs font-bold text-text-muted uppercase tracking-wider">
                    <th className="px-6 py-4">Product</th>
                    <th className="px-6 py-4">Units Sold</th>
                    <th className="px-6 py-4">Revenue</th>
                    <th className="px-6 py-4">COGS</th>
                    <th className="px-6 py-4">Gross Profit</th>
                    <th className="px-6 py-4">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {marginSummary.productRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-text-muted">
                        No completed product sales in this date range
                      </td>
                    </tr>
                  ) : (
                    marginSummary.productRows.map((row, idx) => {
                      const pct = row.revenue > 0 ? ((row.profit / row.revenue) * 100).toFixed(1) : '0.0';
                      return (
                        <tr key={idx} className="hover:bg-surface-alt/30">
                          <td className="px-6 py-4 font-bold text-primary">{row.name}</td>
                          <td className="px-6 py-4 font-mono tabular-nums">{row.qty}</td>
                          <td className="px-6 py-4 font-mono tabular-nums">{formatUGX(row.revenue)}</td>
                          <td className="px-6 py-4 font-mono tabular-nums text-text-secondary">
                            {formatUGX(row.cogs)}
                          </td>
                          <td
                            className={cn(
                              'px-6 py-4 font-mono tabular-nums font-bold',
                              row.profit >= 0 ? 'text-accent' : 'text-danger'
                            )}
                          >
                            {formatUGX(row.profit)}
                          </td>
                          <td className="px-6 py-4 font-mono tabular-nums">{pct}%</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {reportTab === 'vat' && (
        <div className="space-y-6">
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 text-primary rounded-xl">
                <FileSpreadsheet size={22} />
              </div>
              <div>
                <h3 className="font-bold text-lg text-primary">URA Monthly VAT Return Summary</h3>
                <p className="text-xs text-text-muted">
                  TIN: {tenant?.tin || 'Not configured in Settings'} · Standard Rate: {vatSummary.rate}%
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-surface-alt border border-border">
                <p className="text-xs font-bold uppercase text-text-muted">Output VAT (Sales)</p>
                <p className="text-2xl font-bold text-primary font-mono tabular-nums mt-1">
                  {formatUGX(vatSummary.outputVatUgx)}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  From {vatSummary.taxableSalesCount} taxable receipts ({formatUGX(vatSummary.taxableSalesTotal)})
                </p>
              </div>
              <div className="p-4 rounded-xl bg-surface-alt border border-border">
                <p className="text-xs font-bold uppercase text-text-muted">Est. Input VAT (Received POs)</p>
                <p className="text-2xl font-bold text-accent font-mono tabular-nums mt-1">
                  {formatUGX(vatSummary.estimatedInputVatUgx)}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  From {formatUGX(vatSummary.purchaseSpend)} received stock purchases
                </p>
              </div>
              <div className="p-4 rounded-xl bg-surface-alt border border-border">
                <p className="text-xs font-bold uppercase text-text-muted">Net VAT Position</p>
                <p
                  className={cn(
                    'text-2xl font-bold font-mono tabular-nums mt-1',
                    vatSummary.netVatPayableUgx >= 0 ? 'text-danger' : 'text-accent'
                  )}
                >
                  {formatUGX(vatSummary.netVatPayableUgx)}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {vatSummary.netVatPayableUgx >= 0 ? 'Net payable to URA' : 'VAT credit carry-forward'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
