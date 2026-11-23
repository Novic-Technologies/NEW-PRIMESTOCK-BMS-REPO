import {
  AuditLog,
  Branch,
  CreditPayment,
  Customer,
  Expense,
  PayrollRun,
  Product,
  PurchaseOrder,
  RegisterShift,
  Sale,
  StockAdjustment,
  Supplier,
  Tenant,
  User,
} from '../types';
import { getEffectiveStock } from './branchStock';
import { getPlanQuota } from './planLimits';
import { hasSectionAccess } from './rbac';
import { computeTrialState } from './trialUtils';
import { formatUGX } from './format';

export type AiLanguage = 'en' | 'lg' | 'sw';

export interface SeasonalFactor {
  label: string;
  multiplier: number;
  reason: string;
}

export interface DemandReorderItem {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  currentStock: number;
  minStockLevel: number;
  unitsSold7d: number;
  unitsSold30d: number;
  dailyVelocity: number;
  projectedNext30dUnits: number;
  estimatedDaysLeft: number;
  suggestedOrderQty: number;
  unitBuyingCost: number;
  estimatedCostUgx: number;
  urgency: 'critical' | 'soon' | 'watch' | 'blocked_expiry';
  expiryBlocked: boolean;
  expiryDate?: string;
  reason: string;
}

export interface ExpiryClearanceItem {
  productId: string;
  productName: string;
  currentStock: number;
  unit: string;
  expiryDate: string;
  daysToExpiry: number;
  estimatedDaysToSellOut: number;
  stockValueAtCostUgx: number;
  suggestedMarkdownPct: number;
  suggestedClearancePriceUgx: number;
  willSellInTime: boolean;
  reason: string;
}

export interface DeadSlowStockItem {
  productId: string;
  productName: string;
  currentStock: number;
  unit: string;
  daysSinceLastSale: number;
  capitalTiedUgx: number;
  marginPercent: number;
  suggestedMarkdownPriceUgx: number;
  recommendationType: 'markdown' | 'bundle' | 'return_supplier';
  reason: string;
}

export interface StockDiscrepancyItem {
  productId: string;
  productName: string;
  shrinkageUnits30d: number;
  shrinkageValueUgx: number;
  correctionCount: number;
  reasonsBreakdown: string;
  severity: 'high' | 'medium';
  reason: string;
}

export interface DuplicateProductPair {
  primaryId: string;
  primaryName: string;
  primaryStock: number;
  duplicateId: string;
  duplicateName: string;
  duplicateStock: number;
  similarityScore: number;
  combinedStock: number;
  reason: string;
}

export interface SupplierComparisonRow {
  productName: string;
  productId?: string;
  bestSupplierId: string;
  bestSupplierName: string;
  bestUnitCostUgx: number;
  highestUnitCostUgx: number;
  potentialSavingsPct: number;
  offersCount: number;
  reason: string;
}

export interface SupplierReliabilityRow {
  supplierId: string;
  supplierName: string;
  totalOrders: number;
  receivedOrders: number;
  cancelledOrders: number;
  lateDeliveries: number;
  onTimeRatePct: number;
  priceCreepPct: number;
  totalSpendUgx: number;
  unpaidBalanceUgx: number;
  reliabilityScore: number;
  marginAlertCount: number;
  negotiationHook: string;
  reason: string;
}

export interface CartUpsellItem {
  product: Product;
  coPurchaseCount: number;
  pairedWithName: string;
  reason: string;
}

export interface SalesAnomalyFlag {
  id: string;
  saleId?: string;
  reference: string;
  type: 'high_discount' | 'cashier_refund_spike' | 'high_void' | 'threshold_cluster';
  severity: 'high' | 'medium';
  actorName: string;
  amountUgx: number;
  createdAt: string;
  reason: string;
}

export interface CustomerRiskSegmentItem {
  customerId: string;
  customerName: string;
  phone: string;
  type: Customer['type'];
  currentBalance: number;
  creditLimit: number;
  utilizationPct: number;
  repaymentCount: number;
  totalSpent90d: number;
  daysSinceLastPurchase: number;
  riskScore: number;
  riskTier: 'high' | 'watch' | 'healthy';
  segment: 'Wholesale Champion' | 'VIP Candidate' | 'Quiet Win-Back' | 'Standard';
  suggestedTone: 'friendly' | 'firm' | 'final';
  reason: string;
}

export interface MarginAlertItem {
  productId: string;
  productName: string;
  buyingPrice: number;
  sellingPrice: number;
  marginPercent: number;
  profitPerUnitUgx: number;
  reason: string;
}

export interface CashflowProjectionResult {
  current30dSalesUgx: number;
  prior30dSalesUgx: number;
  salesDeltaPct: number;
  current30dExpensesUgx: number;
  prior30dExpensesUgx: number;
  expensesDeltaPct: number;
  projected30dInflowUgx: number;
  projected30dOutflowUgx: number;
  projected30dNetUgx: number;
  receivablesUgx: number;
  payablesUgx: number;
  topExpenseDriver: string;
  topRevenueProduct: string;
  expenseAnomalies: Array<{
    expenseId: string;
    category: string;
    description: string;
    amount: number;
    date: string;
    reason: string;
  }>;
  efrisFlags: Array<{
    code: string;
    severity: 'warning' | 'info';
    title: string;
    detail: string;
  }>;
  reason: string;
}

export interface SecurityDigestResult {
  afterHoursEventsCount: number;
  afterHoursItems: Array<{
    id: string;
    timestamp: string;
    actorName: string;
    summary: string;
    kind: 'sale' | 'adjustment' | 'audit';
  }>;
  whatChangedToday: string[];
  reason: string;
}

export interface SmartPriorityTask {
  id: string;
  priority: 1 | 2 | 3;
  category: 'stock' | 'expiry' | 'credit' | 'supplier' | 'security';
  title: string;
  detail: string;
  actionRoute: string;
  actionLabel: string;
}

export interface MasterWorkspaceInsight {
  orgId: string;
  orgName: string;
  plan: Tenant['plan'];
  recommendationType: 'upgrade' | 'churn_risk' | 'trial_converting' | 'healthy';
  headline: string;
  reason: string;
  suggestedPlan?: Tenant['plan'];
}

function daysBetweenMs(earlierMs: number, laterMs: number): number {
  return Math.max(0, Math.round((laterMs - earlierMs) / (24 * 60 * 60 * 1000)));
}

/**
 * Ugandan seasonal demand multiplier (school terms, rainy planting seasons, month-end paydays, Christmas).
 */
export function getUgandanSeasonalFactor(now = new Date()): SeasonalFactor {
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  const isPaydayWindow = day >= 25 || day <= 5;

  if (month === 12) {
    return {
      label: 'December Festive Peak',
      multiplier: 1.35,
      reason: 'December holiday & family shopping typically lifts retail volume +35%.',
    };
  }
  if (month === 1 || month === 5 || month === 9) {
    return {
      label: isPaydayWindow ? 'Back-to-School + Payday Window' : 'Back-to-School Opening',
      multiplier: isPaydayWindow ? 1.25 : 1.18,
      reason: `Term opening month (${now.toLocaleString('en-US', { month: 'short' })}) raises household & school staple demand +${isPaydayWindow ? 25 : 18}%.`,
    };
  }
  if (month === 3 || month === 4 || month === 10 || month === 11) {
    return {
      label: isPaydayWindow ? 'Rainy Season + Month-End Payday' : 'Rainy Season Demand',
      multiplier: isPaydayWindow ? 1.15 : 1.08,
      reason: 'Rainy season shifts demand toward indoor pantry staples, beverages & protective goods.',
    };
  }
  if (isPaydayWindow) {
    return {
      label: 'Month-End Payday Window (25th–5th)',
      multiplier: 1.12,
      reason: 'Payday window (25th–5th) adds ~12% faster basket turnover.',
    };
  }
  return {
    label: 'Standard Trading Week',
    multiplier: 1.0,
    reason: 'Normal baseline week based on trailing 30-day sales velocity.',
  };
}

export function computeDemandAndReorderPlan(params: {
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  purchaseOrders?: PurchaseOrder[];
  branchId?: string | null;
  now?: Date;
}): {
  seasonal: SeasonalFactor;
  estimatedCashBufferUgx: number;
  reorderPlan: DemandReorderItem[];
  totalSuggestedSpendUgx: number;
  expiryClearance: ExpiryClearanceItem[];
} {
  const now = params.now || new Date();
  const nowMs = now.getTime();
  const day7Ms = nowMs - 7 * 24 * 60 * 60 * 1000;
  const day30Ms = nowMs - 30 * 24 * 60 * 60 * 1000;
  const seasonal = getUgandanSeasonalFactor(now);

  const validSales = params.sales.filter((s) => {
    if (s.status === 'refunded') return false;
    if (params.branchId && s.branchId && s.branchId !== params.branchId) return false;
    return true;
  });

  const sold7d = new Map<string, number>();
  const sold30d = new Map<string, number>();
  let recentCashInflow = 0;

  for (const s of validSales) {
    const t = new Date(s.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= day30Ms) {
      if (s.paymentMethod !== 'Customer Credit' && s.status === 'completed') {
        recentCashInflow += s.total;
      }
      for (const item of s.items) {
        sold30d.set(item.productId, (sold30d.get(item.productId) || 0) + item.quantity);
        if (t >= day7Ms) {
          sold7d.set(item.productId, (sold7d.get(item.productId) || 0) + item.quantity);
        }
      }
    }
  }

  const recentExpenses = params.expenses
    .filter((e) => {
      const t = new Date(e.expenseDate || e.createdAt).getTime();
      return !Number.isNaN(t) && t >= day30Ms;
    })
    .reduce((sum, e) => sum + e.amount, 0);

  const openPoPayables = (params.purchaseOrders || [])
    .filter((po) => po.status === 'ordered')
    .reduce((sum, po) => sum + Math.max(0, po.totalAmount - (po.paidAmount || 0)), 0);

  const estimatedCashBufferUgx = Math.max(0, recentCashInflow - recentExpenses - openPoPayables);

  const reorderPlan: DemandReorderItem[] = [];
  const expiryClearance: ExpiryClearanceItem[] = [];

  for (const p of params.products) {
    if (p.status === 'inactive') continue;
    const stock = getEffectiveStock(p, params.branchId || null);
    const u7 = sold7d.get(p.id) || 0;
    const u30 = sold30d.get(p.id) || 0;
    const weightedDaily =
      u30 > 0 || u7 > 0 ? Math.max(u30 / 30, (u7 / 7) * 0.85) : 0;
    const adjustedDaily = weightedDaily * seasonal.multiplier;
    const projectedNext30dUnits = Math.round(adjustedDaily * 30);
    const estimatedDaysLeft =
      adjustedDaily > 0.05 ? Math.round(stock / adjustedDaily) : stock > 0 ? 180 : 0;

    let expiryBlocked = false;
    let daysToExpiry: number | null = null;
    if (p.expiryDate) {
      const expMs = new Date(p.expiryDate).getTime();
      if (!Number.isNaN(expMs)) {
        daysToExpiry = Math.round((expMs - nowMs) / (24 * 60 * 60 * 1000));
        if (stock > 0 && daysToExpiry <= 45) {
          const daysToSellOut = adjustedDaily > 0.05 ? Math.round(stock / adjustedDaily) : 999;
          const willSellInTime = daysToSellOut <= Math.max(0, daysToExpiry);
          const suggestedMarkdownPct =
            daysToExpiry <= 7 ? 35 : daysToExpiry <= 21 ? 20 : 12;
          const clearancePrice = Math.max(
            Math.round(p.buyingPrice * 1.02),
            Math.round(p.sellingPrice * (1 - suggestedMarkdownPct / 100))
          );

          if (!willSellInTime || daysToExpiry <= 21) {
            expiryClearance.push({
              productId: p.id,
              productName: p.name,
              currentStock: stock,
              unit: p.unit || 'pcs',
              expiryDate: p.expiryDate,
              daysToExpiry,
              estimatedDaysToSellOut: daysToSellOut,
              stockValueAtCostUgx: stock * (p.buyingPrice || 0),
              suggestedMarkdownPct,
              suggestedClearancePriceUgx: clearancePrice,
              willSellInTime,
              reason:
                daysToExpiry <= 0
                  ? `Expired ${Math.abs(daysToExpiry)}d ago with ${stock} ${p.unit} remaining — quarantine/write off via Stock Adjustment.`
                  : !willSellInTime
                  ? `Expires in ${daysToExpiry}d (${p.expiryDate}), but current pace (~${adjustedDaily.toFixed(1)}/day) needs ${daysToSellOut}d to clear ${stock} ${p.unit}.`
                  : `Expires in ${daysToExpiry}d; bundle or apply ${suggestedMarkdownPct}% clearance to finish all ${stock} ${p.unit}.`,
            });
          }
          if (!willSellInTime && stock > 0) {
            expiryBlocked = true;
          }
        }
      }
    }

    const isBelowMin = stock <= (p.minStockLevel ?? 0);
    const needsCover = adjustedDaily > 0.05 && estimatedDaysLeft <= 14;

    if (!isBelowMin && !needsCover && !expiryBlocked) continue;

    // 14-day safety target plus 3-day supplier lead-time buffer
    const targetUnits = Math.max((p.minStockLevel || 5) * 2, Math.ceil(adjustedDaily * 17));
    const rawOrderQty = expiryBlocked ? 0 : Math.max(1, targetUnits - stock);
    const unitBuyingCost = p.buyingPrice || Math.round((p.sellingPrice || 0) * 0.7);
    const estimatedCostUgx = rawOrderQty * unitBuyingCost;

    let urgency: DemandReorderItem['urgency'] = 'watch';
    if (expiryBlocked) urgency = 'blocked_expiry';
    else if (stock <= 0 || estimatedDaysLeft <= 4) urgency = 'critical';
    else if (isBelowMin || estimatedDaysLeft <= 10) urgency = 'soon';

    const reason = expiryBlocked
      ? `HOLD REORDER: ${stock} ${p.unit} in stock expires ${p.expiryDate} (${daysToExpiry}d), slower than sales speed (${adjustedDaily.toFixed(1)}/day). Clear existing batch first.`
      : `Sold ${u30} in 30d (${u7} in 7d · ~${adjustedDaily.toFixed(1)}/day incl. ${seasonal.label}); ${stock} ${p.unit} left (~${estimatedDaysLeft}d cover, min ${p.minStockLevel}).`;

    reorderPlan.push({
      productId: p.id,
      productName: p.name,
      category: p.category || 'General',
      unit: p.unit || 'pcs',
      currentStock: stock,
      minStockLevel: p.minStockLevel ?? 0,
      unitsSold7d: u7,
      unitsSold30d: u30,
      dailyVelocity: Number(adjustedDaily.toFixed(2)),
      projectedNext30dUnits,
      estimatedDaysLeft,
      suggestedOrderQty: rawOrderQty,
      unitBuyingCost,
      estimatedCostUgx,
      urgency,
      expiryBlocked,
      expiryDate: p.expiryDate,
      reason,
    });
  }

  const urgencyRank: Record<DemandReorderItem['urgency'], number> = {
    critical: 0,
    blocked_expiry: 1,
    soon: 2,
    watch: 3,
  };

  reorderPlan.sort(
    (a, b) =>
      urgencyRank[a.urgency] - urgencyRank[b.urgency] || a.estimatedDaysLeft - b.estimatedDaysLeft
  );
  expiryClearance.sort((a, b) => a.daysToExpiry - b.daysToExpiry);

  const totalSuggestedSpendUgx = reorderPlan.reduce((s, r) => s + r.estimatedCostUgx, 0);

  return {
    seasonal,
    estimatedCashBufferUgx,
    reorderPlan,
    totalSuggestedSpendUgx,
    expiryClearance,
  };
}

export function computeDeadAndSlowStock60d(params: {
  products: Product[];
  sales: Sale[];
  branchId?: string | null;
  now?: Date;
}): {
  items: DeadSlowStockItem[];
  totalCapitalTiedUgx: number;
} {
  const nowMs = (params.now || new Date()).getTime();
  const cutoff60dMs = nowMs - 60 * 24 * 60 * 60 * 1000;
  const lastSoldMap = new Map<string, number>();
  const sold60dQty = new Map<string, number>();

  for (const s of params.sales) {
    if (s.status === 'refunded') continue;
    if (params.branchId && s.branchId && s.branchId !== params.branchId) continue;
    const t = new Date(s.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    for (const item of s.items) {
      const prev = lastSoldMap.get(item.productId) || 0;
      if (t > prev) lastSoldMap.set(item.productId, t);
      if (t >= cutoff60dMs) {
        sold60dQty.set(item.productId, (sold60dQty.get(item.productId) || 0) + item.quantity);
      }
    }
  }

  const items: DeadSlowStockItem[] = [];
  for (const p of params.products) {
    if (p.status === 'inactive') continue;
    const stock = getEffectiveStock(p, params.branchId || null);
    if (stock <= 0) continue;

    const lastSoldMs = lastSoldMap.get(p.id) || 0;
    const createdMs = new Date(p.createdAt).getTime() || nowMs;
    const ageDays = daysBetweenMs(createdMs, nowMs);
    const daysSinceLastSale = lastSoldMs > 0 ? daysBetweenMs(lastSoldMs, nowMs) : ageDays;
    const q60 = sold60dQty.get(p.id) || 0;

    // Flag if zero movement in 60 days (or old stock with <=1 unit in 60d and high stock)
    if (q60 === 0 && daysSinceLastSale >= 60) {
      const buying = p.buyingPrice || 0;
      const selling = p.sellingPrice || 0;
      const capitalTiedUgx = stock * buying;
      const marginPercent = selling > 0 ? ((selling - buying) / selling) * 100 : 0;
      const markdownFloor = Math.max(Math.round(buying * 1.05), Math.round(selling * 0.85));
      const recommendationType: DeadSlowStockItem['recommendationType'] =
        marginPercent >= 25
          ? 'markdown'
          : stock >= 20
          ? 'return_supplier'
          : 'bundle';

      items.push({
        productId: p.id,
        productName: p.name,
        currentStock: stock,
        unit: p.unit || 'pcs',
        daysSinceLastSale,
        capitalTiedUgx,
        marginPercent,
        suggestedMarkdownPriceUgx: markdownFloor,
        recommendationType,
        reason:
          lastSoldMs === 0
            ? `0 units sold in the last 60 days (${stock} ${p.unit} holding ${formatUGX(capitalTiedUgx)} at cost).`
            : `Last sold ${daysSinceLastSale} days ago; ${stock} ${p.unit} holding ${formatUGX(capitalTiedUgx)} in slow stock.`,
      });
    }
  }

  items.sort((a, b) => b.capitalTiedUgx - a.capitalTiedUgx);
  return {
    items,
    totalCapitalTiedUgx: items.reduce((s, i) => s + i.capitalTiedUgx, 0),
  };
}

function normalizeProductTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/(\d+)\s*(kg|g|ml|l|ltr|pcs|pack)/g, '$1$2')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

function jaccardAndDiceSimilarity(a: string, b: string): number {
  const tokA = normalizeProductTokens(a);
  const tokB = normalizeProductTokens(b);
  if (tokA.length === 0 || tokB.length === 0) return 0;
  const setA = new Set(tokA);
  const setB = new Set(tokB);
  let intersect = 0;
  setA.forEach((t) => {
    if (setB.has(t)) intersect++;
  });
  const dice = (2 * intersect) / (setA.size + setB.size);
  return Number(dice.toFixed(2));
}

export function computeStockDiscrepanciesAndDuplicates(params: {
  products: Product[];
  adjustments: StockAdjustment[];
  branchId?: string | null;
  now?: Date;
}): {
  discrepancies: StockDiscrepancyItem[];
  duplicates: DuplicateProductPair[];
  enrichmentCandidates: Product[];
} {
  const nowMs = (params.now || new Date()).getTime();
  const day30Ms = nowMs - 30 * 24 * 60 * 60 * 1000;
  const productMap = new Map<string, Product>(params.products.map((p) => [p.id, p]));

  const negStats = new Map<
    string,
    { units: number; count: number; reasons: Record<string, number> }
  >();

  for (const adj of params.adjustments) {
    if (params.branchId && adj.branchId && adj.branchId !== params.branchId) continue;
    const t = new Date(adj.createdAt).getTime();
    if (Number.isNaN(t) || t < day30Ms) continue;
    if (adj.delta < 0) {
      const entry = negStats.get(adj.productId) || { units: 0, count: 0, reasons: {} };
      entry.units += Math.abs(adj.delta);
      entry.count += 1;
      entry.reasons[adj.reason] = (entry.reasons[adj.reason] || 0) + Math.abs(adj.delta);
      negStats.set(adj.productId, entry);
    }
  }

  const discrepancies: StockDiscrepancyItem[] = [];
  negStats.forEach((stat, productId) => {
    const prod = productMap.get(productId);
    const unitCost = prod?.buyingPrice || 0;
    const valueUgx = stat.units * unitCost;
    const theftUnits = stat.reasons['Theft/Loss'] || 0;
    const severity: 'high' | 'medium' =
      theftUnits > 0 || valueUgx >= 100000 || stat.units >= 10 ? 'high' : 'medium';

    const reasonsBreakdown = Object.entries(stat.reasons)
      .map(([k, v]) => `${k}: -${v}`)
      .join(', ');

    discrepancies.push({
      productId,
      productName: prod?.name || 'Product',
      shrinkageUnits30d: stat.units,
      shrinkageValueUgx: valueUgx,
      correctionCount: stat.count,
      reasonsBreakdown,
      severity,
      reason: `${stat.units} unit(s) deducted across ${stat.count} stock-take/loss adjustment(s) in 30d (${reasonsBreakdown}) worth ${formatUGX(valueUgx)}.`,
    });
  });

  discrepancies.sort((a, b) => b.shrinkageValueUgx - a.shrinkageValueUgx);

  // Near-duplicate detector
  const duplicates: DuplicateProductPair[] = [];
  const active = params.products.filter((p) => p.status !== 'inactive').slice(0, 200);
  const seenPairs = new Set<string>();

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const score = jaccardAndDiceSimilarity(a.name, b.name);
      if (score >= 0.72) {
        const key = [a.id, b.id].sort().join('__');
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        const stockA = getEffectiveStock(a, params.branchId || null);
        const stockB = getEffectiveStock(b, params.branchId || null);
        duplicates.push({
          primaryId: a.id,
          primaryName: a.name,
          primaryStock: stockA,
          duplicateId: b.id,
          duplicateName: b.name,
          duplicateStock: stockB,
          similarityScore: Math.round(score * 100),
          combinedStock: stockA + stockB,
          reason: `Token match ${Math.round(score * 100)}%: "${a.name}" (${stockA}) & "${b.name}" (${stockB}) likely represent the same SKU.`,
        });
      }
    }
  }

  const enrichmentCandidates = params.products
    .filter(
      (p) =>
        p.status !== 'inactive' &&
        (!p.sku || !p.sku.trim() || !p.category || p.category === 'General' || p.category === 'Uncategorized')
    )
    .slice(0, 20);

  return { discrepancies, duplicates: duplicates.slice(0, 20), enrichmentCandidates };
}

export function computeSupplierAnalytics(params: {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  products: Product[];
}): {
  priceComparisons: SupplierComparisonRow[];
  reliabilityRows: SupplierReliabilityRow[];
} {
  const productMap = new Map<string, Product>(params.products.map((p) => [p.id, p]));
  const productOffers = new Map<
    string,
    Map<string, { supplierName: string; latestCost: number; latestDate: string; count: number }>
  >();

  const supplierStats = new Map<
    string,
    {
      supplierName: string;
      totalOrders: number;
      receivedOrders: number;
      cancelledOrders: number;
      lateDeliveries: number;
      totalSpendUgx: number;
      costHistoryByProduct: Map<string, Array<{ date: string; cost: number }>>;
      thinMarginProducts: Set<string>;
    }
  >();

  for (const s of params.suppliers) {
    supplierStats.set(s.id, {
      supplierName: s.name,
      totalOrders: 0,
      receivedOrders: 0,
      cancelledOrders: 0,
      lateDeliveries: 0,
      totalSpendUgx: 0,
      costHistoryByProduct: new Map(),
      thinMarginProducts: new Set(),
    });
  }

  const sortedPos = [...params.purchaseOrders].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  for (const po of sortedPos) {
    const stat = supplierStats.get(po.supplierId) || {
      supplierName: po.supplierName,
      totalOrders: 0,
      receivedOrders: 0,
      cancelledOrders: 0,
      lateDeliveries: 0,
      totalSpendUgx: 0,
      costHistoryByProduct: new Map(),
      thinMarginProducts: new Set(),
    };
    stat.totalOrders += 1;
    if (po.status === 'received') {
      stat.receivedOrders += 1;
      stat.totalSpendUgx += po.totalAmount || 0;
      if (po.expectedDate && po.receivedAt) {
        const exp = new Date(po.expectedDate).getTime();
        const rec = new Date(po.receivedAt).getTime();
        if (!Number.isNaN(exp) && !Number.isNaN(rec) && rec > exp + 24 * 60 * 60 * 1000) {
          stat.lateDeliveries += 1;
        }
      }
    } else if (po.status === 'cancelled') {
      stat.cancelledOrders += 1;
    }

    for (const item of po.items) {
      if (item.unitCost > 0) {
        const key = item.name.trim().toLowerCase();
        const offers = productOffers.get(key) || new Map();
        const prevOffer = offers.get(po.supplierId);
        offers.set(po.supplierId, {
          supplierName: po.supplierName,
          latestCost: item.unitCost,
          latestDate: po.createdAt,
          count: (prevOffer?.count || 0) + 1,
        });
        productOffers.set(key, offers);

        const hist = stat.costHistoryByProduct.get(key) || [];
        hist.push({ date: po.createdAt, cost: item.unitCost });
        stat.costHistoryByProduct.set(key, hist);

        const catalogProd = productMap.get(item.productId);
        if (catalogProd && catalogProd.sellingPrice > 0) {
          const margin = ((catalogProd.sellingPrice - item.unitCost) / catalogProd.sellingPrice) * 100;
          if (margin < 15) {
            stat.thinMarginProducts.add(catalogProd.name);
          }
        }
      }
    }

    supplierStats.set(po.supplierId, stat);
  }

  const priceComparisons: SupplierComparisonRow[] = [];
  productOffers.forEach((offers, prodKey) => {
    if (offers.size < 2) return;
    const list = Array.from(offers.entries()).map(([supplierId, data]) => ({
      supplierId,
      ...data,
    }));
    list.sort((a, b) => a.latestCost - b.latestCost);
    const best = list[0];
    const worst = list[list.length - 1];
    if (worst.latestCost <= best.latestCost) return;
    const savingsPct = Math.round(((worst.latestCost - best.latestCost) / worst.latestCost) * 100);
    const matchedProd = params.products.find((p) => p.name.trim().toLowerCase() === prodKey);

    priceComparisons.push({
      productName: matchedProd?.name || prodKey,
      productId: matchedProd?.id,
      bestSupplierId: best.supplierId,
      bestSupplierName: best.supplierName,
      bestUnitCostUgx: best.latestCost,
      highestUnitCostUgx: worst.latestCost,
      potentialSavingsPct: savingsPct,
      offersCount: list.length,
      reason: `${best.supplierName} quoted ${formatUGX(best.latestCost)} vs ${worst.supplierName} at ${formatUGX(worst.latestCost)} (${savingsPct}% cheaper across ${list.length} suppliers).`,
    });
  });

  priceComparisons.sort((a, b) => b.potentialSavingsPct - a.potentialSavingsPct);

  const reliabilityRows: SupplierReliabilityRow[] = [];
  const supLookup = new Map<string, Supplier>(params.suppliers.map((s) => [s.id, s]));

  supplierStats.forEach((stat, supplierId) => {
    const sup = supLookup.get(supplierId);
    const unpaidBalanceUgx = sup?.currentBalance || 0;
    const deliveredOrCancelled = stat.receivedOrders + stat.cancelledOrders;
    const onTimeCount = Math.max(0, stat.receivedOrders - stat.lateDeliveries);
    const onTimeRatePct =
      deliveredOrCancelled > 0 ? Math.round((onTimeCount / deliveredOrCancelled) * 100) : 100;

    let creepSum = 0;
    let creepItems = 0;
    stat.costHistoryByProduct.forEach((hist) => {
      if (hist.length >= 2) {
        const first = hist[0].cost;
        const latest = hist[hist.length - 1].cost;
        if (first > 0) {
          creepSum += ((latest - first) / first) * 100;
          creepItems += 1;
        }
      }
    });
    const priceCreepPct = creepItems > 0 ? Number((creepSum / creepItems).toFixed(1)) : 0;

    let score = onTimeRatePct;
    if (priceCreepPct > 5) score -= Math.min(20, Math.round(priceCreepPct));
    if (stat.cancelledOrders > 0) score -= Math.min(15, stat.cancelledOrders * 5);
    score = Math.max(0, Math.min(100, score));

    const negotiationHook =
      stat.totalOrders > 0
        ? `Ordered ${stat.totalOrders}x totaling ${formatUGX(stat.totalSpendUgx)}${
            priceCreepPct > 4 ? `; prices rose +${priceCreepPct}% — request volume lock` : '; ask for 3–5% early-payment discount'
          }.`
        : 'No PO history yet — request proforma quotes before issuing first PO.';

    reliabilityRows.push({
      supplierId,
      supplierName: stat.supplierName,
      totalOrders: stat.totalOrders,
      receivedOrders: stat.receivedOrders,
      cancelledOrders: stat.cancelledOrders,
      lateDeliveries: stat.lateDeliveries,
      onTimeRatePct,
      priceCreepPct,
      totalSpendUgx: stat.totalSpendUgx,
      unpaidBalanceUgx,
      reliabilityScore: score,
      marginAlertCount: stat.thinMarginProducts.size,
      negotiationHook,
      reason: `${stat.receivedOrders}/${stat.totalOrders} POs received (${onTimeRatePct}% on-time, ${stat.lateDeliveries} late), avg price change ${priceCreepPct >= 0 ? '+' : ''}${priceCreepPct}%, spend ${formatUGX(stat.totalSpendUgx)}.`,
    });
  });

  reliabilityRows.sort((a, b) => b.totalSpendUgx - a.totalSpendUgx);
  return { priceComparisons, reliabilityRows };
}

export function computeCartUpsellSuggestions(params: {
  cartProductIds: string[];
  products: Product[];
  sales: Sale[];
  branchId?: string | null;
  limit?: number;
}): CartUpsellItem[] {
  if (params.cartProductIds.length === 0) return [];
  const inCartSet = new Set(params.cartProductIds);
  const productMap = new Map<string, Product>(params.products.map((p) => [p.id, p]));
  const coCounts = new Map<string, { count: number; pairedWithId: string }>();

  for (const s of params.sales) {
    if (s.status === 'refunded' || s.items.length < 2) continue;
    const itemIds = s.items.map((i) => i.productId);
    const matchingCartItem = itemIds.find((id) => inCartSet.has(id));
    if (!matchingCartItem) continue;

    for (const otherId of itemIds) {
      if (inCartSet.has(otherId)) continue;
      const prod = productMap.get(otherId);
      if (!prod || getEffectiveStock(prod, params.branchId || null) <= 0) continue;
      const prev = coCounts.get(otherId) || { count: 0, pairedWithId: matchingCartItem };
      coCounts.set(otherId, { count: prev.count + 1, pairedWithId: matchingCartItem });
    }
  }

  return Array.from(coCounts.entries())
    .map(([productId, info]) => {
      const product = productMap.get(productId)!;
      const pairedName = productMap.get(info.pairedWithId)?.name || 'cart item';
      return {
        product,
        coPurchaseCount: info.count,
        pairedWithName: pairedName,
        reason: `Bought together with ${pairedName} ${info.count} time${info.count === 1 ? '' : 's'}`,
      };
    })
    .sort((a, b) => b.coPurchaseCount - a.coPurchaseCount)
    .slice(0, params.limit ?? 4);
}

export function computeSalesAnomalies(params: {
  sales: Sale[];
  now?: Date;
}): SalesAnomalyFlag[] {
  const nowMs = (params.now || new Date()).getTime();
  const day30Ms = nowMs - 30 * 24 * 60 * 60 * 1000;
  const flags: SalesAnomalyFlag[] = [];

  const refundsByCashier = new Map<string, { count: number; value: number; actorName: string }>();

  for (const s of params.sales) {
    const t = new Date(s.createdAt).getTime();
    if (Number.isNaN(t) || t < day30Ms) continue;

    if (s.subtotal > 0 && s.discount > 0) {
      const discPct = (s.discount / s.subtotal) * 100;
      if (discPct > 15) {
        flags.push({
          id: `disc_${s.id}`,
          saleId: s.id,
          reference: s.reference,
          type: 'high_discount',
          severity: discPct >= 30 ? 'high' : 'medium',
          actorName: s.cashierName || 'Staff',
          amountUgx: s.discount,
          createdAt: s.createdAt,
          reason: `Discount of ${formatUGX(s.discount)} (${discPct.toFixed(1)}% of ${formatUGX(s.subtotal)} subtotal) exceeds 15% review rule.`,
        });
      }
    }

    if (s.status === 'refunded') {
      const actorId = s.cashierId || s.userId || 'unknown';
      const prev = refundsByCashier.get(actorId) || {
        count: 0,
        value: 0,
        actorName: s.cashierName || 'Cashier',
      };
      prev.count += 1;
      prev.value += s.total;
      refundsByCashier.set(actorId, prev);

      if (s.total >= 150000) {
        flags.push({
          id: `void_${s.id}`,
          saleId: s.id,
          reference: s.reference,
          type: 'high_void',
          severity: 'high',
          actorName: s.cashierName || 'Staff',
          amountUgx: s.total,
          createdAt: s.createdAt,
          reason: `High-value sale (${formatUGX(s.total)}) refunded — reason: "${s.refundReason || 'Not specified'}".`,
        });
      }
    }
  }

  refundsByCashier.forEach((stat, actorId) => {
    if (stat.count >= 3) {
      flags.push({
        id: `cashier_ref_${actorId}`,
        reference: `${stat.count} refunds / 30d`,
        type: 'cashier_refund_spike',
        severity: stat.count >= 5 ? 'high' : 'medium',
        actorName: stat.actorName,
        amountUgx: stat.value,
        createdAt: new Date(nowMs).toISOString(),
        reason: `${stat.actorName} processed ${stat.count} refunded sales totaling ${formatUGX(stat.value)} in the last 30 days.`,
      });
    }
  });

  return flags.sort((a, b) => b.amountUgx - a.amountUgx).slice(0, 20);
}

export function computeCustomerRiskAndSegments(params: {
  customers: Customer[];
  sales: Sale[];
  creditPayments: CreditPayment[];
  now?: Date;
}): CustomerRiskSegmentItem[] {
  const nowMs = (params.now || new Date()).getTime();
  const day90Ms = nowMs - 90 * 24 * 60 * 60 * 1000;

  const customerSales90d = new Map<string, number>();
  const lastPurchaseMap = new Map<string, number>();
  for (const s of params.sales) {
    if (s.status === 'refunded' || !s.customerId) continue;
    const t = new Date(s.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    if (t > (lastPurchaseMap.get(s.customerId) || 0)) {
      lastPurchaseMap.set(s.customerId, t);
    }
    if (t >= day90Ms) {
      customerSales90d.set(s.customerId, (customerSales90d.get(s.customerId) || 0) + s.total);
    }
  }

  const repaymentCounts = new Map<string, number>();
  for (const p of params.creditPayments) {
    if (p.partyType === 'customer') {
      repaymentCounts.set(p.partyId, (repaymentCounts.get(p.partyId) || 0) + 1);
    }
  }

  return params.customers
    .map((c) => {
      const utilizationPct =
        c.creditLimit > 0
          ? Math.round((c.currentBalance / c.creditLimit) * 100)
          : c.currentBalance > 0
          ? 100
          : 0;
      const repayments = repaymentCounts.get(c.id) || 0;
      const spent90d = customerSales90d.get(c.id) || 0;
      const lastBuyMs = lastPurchaseMap.get(c.id) || new Date(c.createdAt).getTime() || nowMs;
      const daysSinceLastPurchase = daysBetweenMs(lastBuyMs, nowMs);

      let riskScore = 0;
      if (c.currentBalance > 0) {
        riskScore += Math.min(50, Math.round(utilizationPct * 0.5));
        if (repayments === 0) riskScore += 25;
        if (daysSinceLastPurchase >= 30) riskScore += 20;
        if (c.creditLimit > 0 && c.currentBalance > c.creditLimit) riskScore += 15;
      }
      riskScore = Math.min(100, riskScore);

      const riskTier: CustomerRiskSegmentItem['riskTier'] =
        riskScore >= 65 ? 'high' : riskScore >= 35 ? 'watch' : 'healthy';

      const suggestedTone: CustomerRiskSegmentItem['suggestedTone'] =
        riskScore >= 70 ? 'final' : riskScore >= 40 ? 'firm' : 'friendly';

      let segment: CustomerRiskSegmentItem['segment'] = 'Standard';
      if (c.type === 'Wholesale' || spent90d >= 2000000) segment = 'Wholesale Champion';
      else if (c.type === 'VIP' || c.loyaltyPoints >= 100) segment = 'VIP Candidate';
      else if (daysSinceLastPurchase >= 45 && c.currentBalance === 0) segment = 'Quiet Win-Back';

      const reason =
        c.currentBalance > 0
          ? `Owes ${formatUGX(c.currentBalance)} (${utilizationPct}% of ${c.creditLimit > 0 ? formatUGX(c.creditLimit) : 'no set'} limit); ${repayments} repayment(s) on file; last active ${daysSinceLastPurchase}d ago.`
          : segment === 'Quiet Win-Back'
          ? `Zero balance; inactive for ${daysSinceLastPurchase} days — candidate for WhatsApp win-back offer.`
          : `${segment}: ${formatUGX(spent90d)} spent in last 90d, ${c.loyaltyPoints} loyalty pts.`;

      return {
        customerId: c.id,
        customerName: c.name,
        phone: c.phone,
        type: c.type,
        currentBalance: c.currentBalance || 0,
        creditLimit: c.creditLimit || 0,
        utilizationPct,
        repaymentCount: repayments,
        totalSpent90d: spent90d,
        daysSinceLastPurchase,
        riskScore,
        riskTier,
        segment,
        suggestedTone,
        reason,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore || b.currentBalance - a.currentBalance);
}

export function computeMarginAndPromoChecks(products: Product[]): MarginAlertItem[] {
  const alerts: MarginAlertItem[] = [];
  for (const p of products) {
    if (p.status === 'inactive' || p.sellingPrice <= 0) continue;
    const profit = p.sellingPrice - (p.buyingPrice || 0);
    const marginPct = (profit / p.sellingPrice) * 100;
    if (p.buyingPrice > 0 && marginPct <= 10) {
      alerts.push({
        productId: p.id,
        productName: p.name,
        buyingPrice: p.buyingPrice,
        sellingPrice: p.sellingPrice,
        marginPercent: Number(marginPct.toFixed(1)),
        profitPerUnitUgx: profit,
        reason:
          profit <= 0
            ? `Selling at ${formatUGX(p.sellingPrice)} vs buying cost ${formatUGX(p.buyingPrice)} (${formatUGX(profit)} loss per ${p.unit}).`
            : `Thin ${marginPct.toFixed(1)}% margin (${formatUGX(profit)} per ${p.unit} profit) before rent & expenses.`,
      });
    }
  }
  return alerts.sort((a, b) => a.marginPercent - b.marginPercent);
}

export function calculatePromoPayoff(params: {
  sellingPrice: number;
  buyingPrice: number;
  currentMonthlyQty: number;
  discountPct: number;
}): {
  discountedPriceUgx: number;
  newProfitPerUnitUgx: number;
  currentMonthlyProfitUgx: number;
  breakEvenQty: number;
  requiredVolumeLiftPct: number;
  viable: boolean;
  reason: string;
} {
  const discountedPriceUgx = Math.round(params.sellingPrice * (1 - params.discountPct / 100));
  const oldUnitProfit = params.sellingPrice - params.buyingPrice;
  const newProfitPerUnitUgx = discountedPriceUgx - params.buyingPrice;
  const qty = Math.max(1, params.currentMonthlyQty);
  const currentMonthlyProfitUgx = oldUnitProfit * qty;

  if (newProfitPerUnitUgx <= 0) {
    return {
      discountedPriceUgx,
      newProfitPerUnitUgx,
      currentMonthlyProfitUgx,
      breakEvenQty: Infinity,
      requiredVolumeLiftPct: Infinity,
      viable: false,
      reason: `A ${params.discountPct}% discount drops price to ${formatUGX(discountedPriceUgx)}, at or below cost (${formatUGX(params.buyingPrice)}). Every unit loses or makes zero gross profit.`,
    };
  }

  const breakEvenQty = Math.ceil(currentMonthlyProfitUgx / newProfitPerUnitUgx);
  const requiredVolumeLiftPct = Math.round(((breakEvenQty - qty) / qty) * 100);
  const viable = requiredVolumeLiftPct <= 60;

  return {
    discountedPriceUgx,
    newProfitPerUnitUgx,
    currentMonthlyProfitUgx,
    breakEvenQty,
    requiredVolumeLiftPct,
    viable,
    reason: `At ${formatUGX(discountedPriceUgx)} (-${params.discountPct}%), unit margin is ${formatUGX(newProfitPerUnitUgx)}. You must sell ${breakEvenQty} units (+${requiredVolumeLiftPct}% vs current ${qty}/mo) to earn the same ${formatUGX(currentMonthlyProfitUgx)} gross profit.`,
  };
}

export function computeFinanceAndCompliance(params: {
  tenant: Tenant | null;
  sales: Sale[];
  expenses: Expense[];
  customers: Customer[];
  suppliers: Supplier[];
  now?: Date;
}): CashflowProjectionResult {
  const nowMs = (params.now || new Date()).getTime();
  const d30 = nowMs - 30 * 24 * 60 * 60 * 1000;
  const d60 = nowMs - 60 * 24 * 60 * 60 * 1000;

  const validSales = params.sales.filter((s) => s.status !== 'refunded');
  let current30dSalesUgx = 0;
  let prior30dSalesUgx = 0;
  const prodRev = new Map<string, number>();

  for (const s of validSales) {
    const t = new Date(s.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= d30) {
      current30dSalesUgx += s.total;
      for (const i of s.items) {
        prodRev.set(i.name, (prodRev.get(i.name) || 0) + i.total);
      }
    } else if (t >= d60) {
      prior30dSalesUgx += s.total;
    }
  }

  let current30dExpensesUgx = 0;
  let prior30dExpensesUgx = 0;
  const expByCat = new Map<string, number>();
  const recentExpenseItems: Expense[] = [];

  for (const e of params.expenses) {
    const t = new Date(e.expenseDate || e.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= d30) {
      current30dExpensesUgx += e.amount;
      expByCat.set(e.category || 'General', (expByCat.get(e.category || 'General') || 0) + e.amount);
      recentExpenseItems.push(e);
    } else if (t >= d60) {
      prior30dExpensesUgx += e.amount;
    }
  }

  const salesDeltaPct =
    prior30dSalesUgx > 0
      ? Number((((current30dSalesUgx - prior30dSalesUgx) / prior30dSalesUgx) * 100).toFixed(1))
      : 0;
  const expensesDeltaPct =
    prior30dExpensesUgx > 0
      ? Number((((current30dExpensesUgx - prior30dExpensesUgx) / prior30dExpensesUgx) * 100).toFixed(1))
      : 0;

  const receivablesUgx = params.customers.reduce((s, c) => s + (c.currentBalance || 0), 0);
  const payablesUgx = params.suppliers.reduce((s, sup) => s + (sup.currentBalance || 0), 0);

  // Conservative 30-day projection: sales run-rate + 40% expected credit collection vs expenses + 50% payables settlement
  const projected30dInflowUgx = current30dSalesUgx + Math.round(receivablesUgx * 0.4);
  const projected30dOutflowUgx = current30dExpensesUgx + Math.round(payablesUgx * 0.5);
  const projected30dNetUgx = projected30dInflowUgx - projected30dOutflowUgx;

  // Duplicate or spike expense detection
  const expenseAnomalies: CashflowProjectionResult['expenseAnomalies'] = [];
  const seenKey = new Map<string, Expense>();
  const avgExp =
    recentExpenseItems.length > 0 ? current30dExpensesUgx / recentExpenseItems.length : 0;

  for (const e of recentExpenseItems) {
    const dedupKey = `${e.category}_${e.amount}_${(e.expenseDate || e.createdAt).slice(0, 10)}`;
    if (seenKey.has(dedupKey)) {
      expenseAnomalies.push({
        expenseId: e.id,
        category: e.category,
        description: e.description,
        amount: e.amount,
        date: (e.expenseDate || e.createdAt).slice(0, 10),
        reason: `Possible duplicate entry: same category (${e.category}) and exact amount (${formatUGX(e.amount)}) recorded twice on ${(e.expenseDate || e.createdAt).slice(0, 10)}.`,
      });
    } else {
      seenKey.set(dedupKey, e);
      if (avgExp > 0 && e.amount > avgExp * 3 && e.amount >= 200000) {
        expenseAnomalies.push({
          expenseId: e.id,
          category: e.category,
          description: e.description,
          amount: e.amount,
          date: (e.expenseDate || e.createdAt).slice(0, 10),
          reason: `Unusually large expense (${formatUGX(e.amount)}) is ${(e.amount / avgExp).toFixed(1)}× your 30-day average transaction.`,
        });
      }
    }
  }

  // URA / EFRIS readiness checks
  const efrisFlags: CashflowProjectionResult['efrisFlags'] = [];
  if (!params.tenant?.tin || params.tenant.tin.trim().length < 8) {
    efrisFlags.push({
      code: 'MISSING_TIN',
      severity: 'warning',
      title: 'Business TIN Missing or Incomplete',
      detail: 'Add your 10-digit URA TIN in Settings so POS receipts & tax summaries comply with EFRIS invoicing.',
    });
  }
  const highValueUnidentified = validSales.filter(
    (s) => s.total >= 1000000 && !s.customerId && new Date(s.createdAt).getTime() >= d30
  );
  if (highValueUnidentified.length > 0) {
    efrisFlags.push({
      code: 'HIGH_VALUE_ANON_SALES',
      severity: 'warning',
      title: `${highValueUnidentified.length} High-Value Sale(s) ≥ UGX 1M Without Customer Record`,
      detail: 'URA EFRIS B2B/high-value receipts should attach the buyer customer record.',
    });
  }
  if (!params.tenant?.preferences?.taxEnabled && current30dSalesUgx * 12 >= 150000000) {
    efrisFlags.push({
      code: 'VAT_THRESHOLD_CHECK',
      severity: 'info',
      title: 'Annualized Revenue Approaching/Exceeding UGX 150M VAT Threshold',
      detail: 'Enable 18% VAT calculation in Settings > Tax & Receipts if VAT-registered with URA.',
    });
  }

  const topExpenseEntry = Array.from(expByCat.entries()).sort((a, b) => b[1] - a[1])[0];
  const topProdEntry = Array.from(prodRev.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    current30dSalesUgx,
    prior30dSalesUgx,
    salesDeltaPct,
    current30dExpensesUgx,
    prior30dExpensesUgx,
    expensesDeltaPct,
    projected30dInflowUgx,
    projected30dOutflowUgx,
    projected30dNetUgx,
    receivablesUgx,
    payablesUgx,
    topExpenseDriver: topExpenseEntry
      ? `${topExpenseEntry[0]} (${formatUGX(topExpenseEntry[1])})`
      : 'None recorded',
    topRevenueProduct: topProdEntry
      ? `${topProdEntry[0]} (${formatUGX(topProdEntry[1])})`
      : 'None recorded',
    expenseAnomalies: expenseAnomalies.slice(0, 10),
    efrisFlags,
    reason: `30d sales ${salesDeltaPct >= 0 ? '+' : ''}${salesDeltaPct}% (${formatUGX(current30dSalesUgx)} vs ${formatUGX(prior30dSalesUgx)} prior); expenses ${expensesDeltaPct >= 0 ? '+' : ''}${expensesDeltaPct}%.`,
  };
}

export function computeSecurityAndActivityDigest(params: {
  sales: Sale[];
  adjustments: StockAdjustment[];
  auditLogs: AuditLog[];
  now?: Date;
}): SecurityDigestResult {
  const now = params.now || new Date();
  const todayPrefix = now.toISOString().split('T')[0];
  const d14Ms = now.getTime() - 14 * 24 * 60 * 60 * 1000;

  const isAfterHours = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()) || d.getTime() < d14Ms) return false;
    const hr = d.getHours();
    return hr >= 21 || hr < 6;
  };

  const afterHoursItems: SecurityDigestResult['afterHoursItems'] = [];
  for (const s of params.sales) {
    if (isAfterHours(s.createdAt)) {
      afterHoursItems.push({
        id: s.id,
        timestamp: s.createdAt,
        actorName: s.cashierName || 'Cashier',
        summary: `After-hours POS sale ${s.reference} (${formatUGX(s.total)})`,
        kind: 'sale',
      });
    }
  }
  for (const adj of params.adjustments) {
    if (isAfterHours(adj.createdAt) || adj.reason === 'Theft/Loss') {
      afterHoursItems.push({
        id: adj.id,
        timestamp: adj.createdAt,
        actorName: adj.adjustedByName || 'Staff',
        summary: `${adj.reason}: ${adj.productName} (${adj.delta >= 0 ? '+' : ''}${adj.delta})`,
        kind: 'adjustment',
      });
    }
  }

  afterHoursItems.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const todayLogs = params.auditLogs.filter((l) => l.createdAt.startsWith(todayPrefix));
  const whatChangedToday = todayLogs.slice(0, 6).map(
    (l) => `${l.actorName} (${l.actorRole}): ${l.summary}`
  );

  return {
    afterHoursEventsCount: afterHoursItems.length,
    afterHoursItems: afterHoursItems.slice(0, 12),
    whatChangedToday,
    reason: `${afterHoursItems.length} after-hours (21:00–06:00) or loss events in last 14d; ${todayLogs.length} audit trail events logged today.`,
  };
}

export function computeSmartPrioritizedTasks(params: {
  products: Product[];
  sales: Sale[];
  customers: Customer[];
  purchaseOrders: PurchaseOrder[];
  adjustments: StockAdjustment[];
  branchId?: string | null;
  user?: User | null;
}): SmartPriorityTask[] {
  const tasks: SmartPriorityTask[] = [];
  const { user } = params;

  if (hasSectionAccess(user, 'inventory') || hasSectionAccess(user, 'pos')) {
    const demand = computeDemandAndReorderPlan({
      products: params.products,
      sales: params.sales,
      expenses: [],
      purchaseOrders: params.purchaseOrders,
      branchId: params.branchId,
    });
    const criticalStock = demand.reorderPlan.filter((r) => r.urgency === 'critical');
    if (criticalStock.length > 0) {
      tasks.push({
        id: 'task_critical_stock',
        priority: 1,
        category: 'stock',
        title: `${criticalStock.length} SKU${criticalStock.length === 1 ? '' : 's'} at Risk of Stockout (≤4d)`,
        detail: `${criticalStock
          .slice(0, 3)
          .map((c) => `${c.productName} (${c.currentStock} left)`)
          .join(', ')}`,
        actionRoute: '/ai',
        actionLabel: 'Review Reorder Draft',
      });
    }

    if (demand.expiryClearance.length > 0) {
      const topExp = demand.expiryClearance[0];
      tasks.push({
        id: 'task_expiry_clearance',
        priority: 1,
        category: 'expiry',
        title: `${demand.expiryClearance.length} Batch${demand.expiryClearance.length === 1 ? '' : 'es'} Expiring Before Sell-Through`,
        detail: `${topExp.productName} expires ${topExp.expiryDate} (${topExp.daysToExpiry}d left).`,
        actionRoute: '/ai',
        actionLabel: 'Plan Clearance',
      });
    }
  }

  if (hasSectionAccess(user, 'customers')) {
    const highDebtors = params.customers
      .filter((c) => c.currentBalance > 0)
      .sort((a, b) => b.currentBalance - a.currentBalance);
    if (highDebtors.length > 0) {
      const totalCredit = highDebtors.reduce((s, c) => s + c.currentBalance, 0);
      tasks.push({
        id: 'task_collections',
        priority: 2,
        category: 'credit',
        title: `Collect ${formatUGX(totalCredit)} Across ${highDebtors.length} Credit Customer${highDebtors.length === 1 ? '' : 's'}`,
        detail: `Top balance: ${highDebtors[0].name} (${formatUGX(highDebtors[0].currentBalance)}).`,
        actionRoute: '/customers',
        actionLabel: 'Open Collections',
      });
    }
  }

  if (hasSectionAccess(user, 'purchases')) {
    const nowMs = Date.now();
    const overduePos = params.purchaseOrders.filter(
      (po) =>
        po.status === 'ordered' &&
        po.expectedDate &&
        new Date(po.expectedDate).getTime() < nowMs
    );
    if (overduePos.length > 0) {
      tasks.push({
        id: 'task_late_po',
        priority: 2,
        category: 'supplier',
        title: `${overduePos.length} Overdue Supplier Delivery`,
        detail: `${overduePos[0].reference} from ${overduePos[0].supplierName} expected ${overduePos[0].expectedDate}.`,
        actionRoute: '/purchases',
        actionLabel: 'Check POs',
      });
    }
  }

  if (hasSectionAccess(user, 'shifts')) {
    const disc = computeStockDiscrepanciesAndDuplicates({
      products: params.products,
      adjustments: params.adjustments,
      branchId: params.branchId,
    });
    const highShrink = disc.discrepancies.filter((d) => d.severity === 'high');
    if (highShrink.length > 0) {
      tasks.push({
        id: 'task_shrinkage',
        priority: 3,
        category: 'security',
        title: `Inspect Stock Shrinkage (${highShrink.length} SKU${highShrink.length === 1 ? '' : 's'})`,
        detail: highShrink[0].reason,
        actionRoute: '/ai',
        actionLabel: 'Inspect Audit',
      });
    }
  }

  return tasks.sort((a, b) => a.priority - b.priority);
}

/**
 * Role-isolated Copilot context builder (Rule 3: never pass confidential company P&L or payroll to restricted roles).
 */
export function buildRoleAwareCopilotContext(params: {
  tenant: Tenant | null;
  user: User | null;
  branch?: Branch | null;
  branchId?: string | null;
  sales: Sale[];
  products: Product[];
  expenses: Expense[];
  customers: Customer[];
  suppliers: Supplier[];
  activeShift: RegisterShift | null;
  payrollRuns?: PayrollRun[];
}) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const monthPrefix = now.toISOString().slice(0, 7);
  const { user, tenant, branchId } = params;

  const canSeeSales =
    hasSectionAccess(user, 'dashboard') ||
    hasSectionAccess(user, 'pos') ||
    hasSectionAccess(user, 'sales') ||
    hasSectionAccess(user, 'reports');
  const canSeeFinance =
    hasSectionAccess(user, 'dashboard') ||
    hasSectionAccess(user, 'finance') ||
    hasSectionAccess(user, 'reports');
  const canSeeInventory =
    hasSectionAccess(user, 'inventory') || hasSectionAccess(user, 'pos');
  const canSeeCustomers = hasSectionAccess(user, 'customers');
  const canSeeSuppliers = hasSectionAccess(user, 'suppliers') || hasSectionAccess(user, 'purchases');
  const canSeePayroll = hasSectionAccess(user, 'payroll');

  const validSales = params.sales.filter((s) => {
    if (s.status === 'refunded') return false;
    if (branchId && s.branchId && s.branchId !== branchId) return false;
    return true;
  });

  const todaySalesUgx = canSeeSales
    ? validSales.filter((s) => s.createdAt.startsWith(todayStr)).reduce((sum, s) => sum + s.total, 0)
    : 0;
  const monthSales = canSeeSales
    ? validSales.filter((s) => s.createdAt.startsWith(monthPrefix))
    : [];
  const monthSalesUgx = monthSales.reduce((sum, s) => sum + s.total, 0);
  const monthCogsUgx = canSeeFinance
    ? monthSales.reduce(
        (sum, s) =>
          sum + s.items.reduce((isum, i) => isum + (i.costPrice ?? 0) * i.quantity, 0),
        0
      )
    : 0;
  const monthExpensesUgx = canSeeFinance
    ? params.expenses
        .filter((e) => (e.expenseDate || e.createdAt).startsWith(monthPrefix))
        .reduce((sum, e) => sum + e.amount, 0)
    : 0;

  const lowStockProducts = canSeeInventory
    ? params.products
        .filter((p) => getEffectiveStock(p, branchId || null) <= (p.minStockLevel ?? 0))
        .slice(0, 12)
        .map((p) => ({
          name: p.name,
          currentStock: getEffectiveStock(p, branchId || null),
          minStockLevel: p.minStockLevel ?? 0,
          unit: p.unit || 'pcs',
        }))
    : [];

  const cutoff = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const expiringSoonProducts = canSeeInventory
    ? params.products
        .filter(
          (p) =>
            p.expiryDate &&
            getEffectiveStock(p, branchId || null) > 0 &&
            new Date(p.expiryDate).getTime() <= cutoff
        )
        .slice(0, 8)
        .map((p) => ({
          name: p.name,
          expiryDate: p.expiryDate!,
          currentStock: getEffectiveStock(p, branchId || null),
        }))
    : [];

  const productVelocity = new Map<string, { name: string; unitsSold: number; revenueUgx: number }>();
  if (canSeeSales) {
    validSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const prev = productVelocity.get(item.productId) || {
          name: item.name,
          unitsSold: 0,
          revenueUgx: 0,
        };
        productVelocity.set(item.productId, {
          name: item.name,
          unitsSold: prev.unitsSold + item.quantity,
          revenueUgx: prev.revenueUgx + item.total,
        });
      });
    });
  }

  return {
    businessName: tenant?.name || 'Business',
    branchName: params.branch?.name || 'All Branches',
    plan: tenant?.plan,
    status: tenant?.status,
    userRole: user?.role || 'staff',
    restrictedScopeNote: !canSeeFinance
      ? 'Financial P&L, expenses, and payroll totals are hidden for this staff role.'
      : undefined,
    todaySalesUgx,
    monthSalesUgx,
    monthGrossProfitUgx: canSeeFinance ? monthSalesUgx - monthCogsUgx : undefined,
    monthExpensesUgx,
    netProfitEstimateUgx: canSeeFinance ? monthSalesUgx - monthCogsUgx - monthExpensesUgx : 0,
    totalProducts: canSeeInventory ? params.products.length : 0,
    lowStockProducts,
    expiringSoonProducts,
    topSellingProducts: Array.from(productVelocity.values())
      .sort((a, b) => b.revenueUgx - a.revenueUgx)
      .slice(0, 8),
    customerReceivablesUgx: canSeeCustomers
      ? params.customers.reduce((sum, c) => sum + (c.currentBalance || 0), 0)
      : 0,
    supplierPayablesUgx: canSeeSuppliers
      ? params.suppliers.reduce((sum, s) => sum + (s.currentBalance || 0), 0)
      : 0,
    payrollLatestRunUgx:
      canSeePayroll && params.payrollRuns && params.payrollRuns.length > 0
        ? params.payrollRuns[0].totalGrossUgx
        : undefined,
    openShiftCashUgx: params.activeShift ? params.activeShift.expectedCash : null,
  };
}

export function computeMasterWorkspaceInsights(params: {
  organizations: Tenant[];
  usageMap: Record<
    string,
    {
      productsCount: number;
      activeUsersCount: number;
      branchesCount: number;
      salesCount: number;
    }
  >;
}): MasterWorkspaceInsight[] {
  const planSequence: Tenant['plan'][] = ['micro', 'starter', 'business', 'enterprise'];
  const insights: MasterWorkspaceInsight[] = [];

  for (const org of params.organizations) {
    const usage = params.usageMap[org.id];
    const quota = getPlanQuota(org.plan);
    const trial = computeTrialState(org);
    const nextPlanIdx = planSequence.indexOf(org.plan) + 1;
    const nextPlan = nextPlanIdx < planSequence.length ? planSequence[nextPlanIdx] : undefined;

    if (usage && nextPlan) {
      const prodRatio = Number.isFinite(quota.maxProducts) ? usage.productsCount / quota.maxProducts : 0;
      const userRatio = Number.isFinite(quota.maxUsers) ? usage.activeUsersCount / quota.maxUsers : 0;
      const branchRatio = Number.isFinite(quota.maxBranches) ? usage.branchesCount / quota.maxBranches : 0;
      if (prodRatio >= 0.85 || userRatio >= 0.85 || branchRatio >= 0.9) {
        insights.push({
          orgId: org.id,
          orgName: org.name,
          plan: org.plan,
          recommendationType: 'upgrade',
          suggestedPlan: nextPlan,
          headline: `Ready for ${getPlanQuota(nextPlan).name} upgrade`,
          reason: `Using ${usage.productsCount}/${Number.isFinite(quota.maxProducts) ? quota.maxProducts : '∞'} SKUs, ${usage.activeUsersCount}/${Number.isFinite(quota.maxUsers) ? quota.maxUsers : '∞'} staff seats, ${usage.branchesCount}/${Number.isFinite(quota.maxBranches) ? quota.maxBranches : '∞'} branches.`,
        });
        continue;
      }
    }

    if (trial.isTrial && !trial.isExpired && trial.daysRemaining <= 4 && (usage?.salesCount || 0) >= 5) {
      insights.push({
        orgId: org.id,
        orgName: org.name,
        plan: org.plan,
        recommendationType: 'trial_converting',
        headline: `High-engagement trial ends in ${trial.daysRemaining}d`,
        reason: `${usage?.salesCount || 0} recorded sales & ${usage?.productsCount || 0} SKUs during trial — send renewal nudge before lock.`,
      });
      continue;
    }

    const ageDays = daysBetweenMs(new Date(org.createdAt).getTime() || Date.now(), Date.now());
    if (usage && ageDays >= 7 && usage.salesCount === 0 && !trial.isLocked) {
      insights.push({
        orgId: org.id,
        orgName: org.name,
        plan: org.plan,
        recommendationType: 'churn_risk',
        headline: 'Onboarding Stall / Churn Risk',
        reason: `Created ${ageDays}d ago with ${usage.productsCount} SKUs and 0 POS sales recorded — offer onboarding help.`,
      });
    }
  }

  return insights;
}
