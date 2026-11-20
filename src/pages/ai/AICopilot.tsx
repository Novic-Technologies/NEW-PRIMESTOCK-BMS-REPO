import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { doc, setDoc } from 'firebase/firestore';
import {
  Sparkles,
  Send,
  TrendingUp,
  Package,
  RefreshCw,
  ShoppingBag,
  AlertTriangle,
  ArrowRight,
  Trash2,
  TrendingDown,
  MessageCircle,
} from 'lucide-react';
import { db } from '../../firebase';
import { localDb } from '../../services/db';
import { useAuthStore } from '../../store/authStore';
import { usePOS } from '../../hooks/usePOS';
import { useInventory } from '../../hooks/useInventory';
import { useExpenses } from '../../hooks/useExpenses';
import { useCustomers } from '../../hooks/useCustomers';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useShifts } from '../../hooks/useShifts';
import { useBranches } from '../../hooks/useBranches';
import {
  askBusinessCopilot,
  CopilotBusinessContext,
  fetchDeadStockMarginAnalysis,
  fetchEodOwnerDigest,
  fetchRestockForecast,
} from '../../services/aiService';
import {
  AIChatMessage,
  DeadStockMarginResult,
  EodDigestResult,
  Product,
  RestockRecommendation,
} from '../../types';
import { formatUGX } from '../../utils/format';
import { getEffectiveStock } from '../../utils/branchStock';
import { buildDebtWhatsAppUrl } from '../../utils/whatsapp';
import { stripUndefined } from '../../utils/firestoreUtils';
import {
  canAccessFeature,
  canUseAiCall,
  incrementDailyAiUsage,
} from '../../utils/planLimits';
import { TierGate } from '../../components/shared/TierGate';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

const QUICK_PROMPTS = [
  "Give me today's executive profit & cashflow briefing.",
  'Which products are driving the most revenue and which are low on stock?',
  'Summarize customer credit receivables vs supplier payables.',
  'Suggest 3 practical ways to cut overheads or boost margin this week.',
];

export default function AICopilot() {
  const navigate = useNavigate();
  const { tenant, user } = useAuthStore();
  const { sales } = usePOS();
  const { products } = useInventory();
  const { expenses } = useExpenses();
  const { customers } = useCustomers();
  const { suppliers } = useSuppliers();
  const { activeShift } = useShifts();
  const { activeBranch, activeBranchId } = useBranches();

  const effectiveBranchId = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : null;

  const [activeTab, setActiveTab] = useState<'copilot' | 'restock' | 'deadstock'>('copilot');
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);

  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastSummary, setForecastSummary] = useState('');
  const [recommendations, setRecommendations] = useState<RestockRecommendation[]>([]);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const [deadStockLoading, setDeadStockLoading] = useState(false);
  const [deadStockResult, setDeadStockResult] = useState<DeadStockMarginResult | null>(null);

  const [eodDigest, setEodDigest] = useState<EodDigestResult | null>(null);
  const [eodLoading, setEodLoading] = useState(false);
  const [aiQuotaTick, setAiQuotaTick] = useState(0);

  const aiQuota = useMemo(() => canUseAiCall(tenant), [tenant, aiQuotaTick]);
  const hasRestockAccess = canAccessFeature(tenant, 'aiRestockAndMargin');

  useEffect(() => {
    if (!tenant || !user) {
      setMessages([]);
      return;
    }

    const sub = liveQuery(() =>
      localDb.aiChats.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const userMsgs = items
          .filter((m) => m.userId === user.uid)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        setMessages(userMsgs);
      },
    });

    return () => sub.unsubscribe();
  }, [tenant?.id, user?.uid]);

  const persistChatMessage = async (msg: AIChatMessage) => {
    if (!tenant) return;
    const cleaned = stripUndefined(msg);
    await localDb.aiChats.put(cleaned);
    if (navigator.onLine) {
      try {
        await setDoc(doc(db, `tenants/${tenant.id}/aiChats`, cleaned.id), cleaned);
      } catch {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table: 'aiChats',
          action: 'create',
          data: cleaned,
          status: 'pending',
          createdAt: Date.now(),
        });
      }
    } else {
      await localDb.syncQueue.add({
        tenantId: tenant.id,
        table: 'aiChats',
        action: 'create',
        data: cleaned,
        status: 'pending',
        createdAt: Date.now(),
      });
    }
  };

  const handleClearChatHistory = async () => {
    if (!tenant || !user) return;
    const toDelete = messages.map((m) => m.id);
    await localDb.aiChats.bulkDelete(toDelete);
    toast.success('Local AI chat history cleared');
  };

  const businessContext: CopilotBusinessContext = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const monthPrefix = now.toISOString().slice(0, 7);
    const validSales = sales.filter((s) => s.status !== 'refunded');

    const todaySalesUgx = validSales
      .filter((s) => s.createdAt.startsWith(todayStr))
      .reduce((sum, s) => sum + s.total, 0);

    const monthSales = validSales.filter((s) => s.createdAt.startsWith(monthPrefix));
    const monthSalesUgx = monthSales.reduce((sum, s) => sum + s.total, 0);

    const monthCogsUgx = monthSales.reduce((sum, s) => {
      return (
        sum +
        s.items.reduce((isum, i) => isum + (i.costPrice ?? 0) * i.quantity, 0)
      );
    }, 0);

    const monthExpensesUgx = expenses
      .filter((e) => (e.expenseDate || e.createdAt).startsWith(monthPrefix))
      .reduce((sum, e) => sum + e.amount, 0);

    const lowStockProducts = products
      .filter((p) => getEffectiveStock(p, effectiveBranchId) <= (p.minStockLevel ?? 0))
      .slice(0, 12)
      .map((p) => ({
        name: p.name,
        currentStock: getEffectiveStock(p, effectiveBranchId),
        minStockLevel: p.minStockLevel ?? 0,
        unit: p.unit || 'pcs',
      }));

    const cutoff = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const expiringSoonProducts = products
      .filter(
        (p) =>
          p.expiryDate &&
          getEffectiveStock(p, effectiveBranchId) > 0 &&
          new Date(p.expiryDate).getTime() <= cutoff
      )
      .slice(0, 8)
      .map((p) => ({
        name: p.name,
        expiryDate: p.expiryDate!,
        currentStock: getEffectiveStock(p, effectiveBranchId),
      }));

    const productVelocity = new Map<string, { name: string; unitsSold: number; revenueUgx: number }>();
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

    const topSellingProducts = Array.from(productVelocity.values())
      .sort((a, b) => b.revenueUgx - a.revenueUgx)
      .slice(0, 8);

    const customerReceivablesUgx = customers.reduce((sum, c) => sum + (c.currentBalance || 0), 0);
    const supplierPayablesUgx = suppliers.reduce((sum, s) => sum + (s.currentBalance || 0), 0);

    return {
      businessName: tenant?.name || 'Business',
      branchName: activeBranch?.name || 'All Branches',
      plan: tenant?.plan,
      status: tenant?.status,
      todaySalesUgx,
      monthSalesUgx,
      monthGrossProfitUgx: monthSalesUgx - monthCogsUgx,
      monthExpensesUgx,
      netProfitEstimateUgx: monthSalesUgx - monthCogsUgx - monthExpensesUgx,
      totalProducts: products.length,
      lowStockProducts,
      expiringSoonProducts,
      topSellingProducts,
      customerReceivablesUgx,
      supplierPayablesUgx,
      openShiftCashUgx: activeShift ? activeShift.expectedCash : null,
    };
  }, [tenant, activeBranch, sales, products, expenses, customers, suppliers, activeShift, effectiveBranchId]);

  const sendPrompt = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean || isAsking || !tenant || !user) return;

    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(
        `Daily AI Copilot limit (${quotaCheck.limit} calls/day) reached on your current pack. Upgrade in Billing for higher limits.`
      );
      return;
    }

    const userMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      userId: user.uid,
      role: 'user',
      text: clean,
      createdAt: new Date().toISOString(),
    };
    await persistChatMessage(userMsg);
    setInput('');
    setIsAsking(true);

    try {
      const reply = await askBusinessCopilot({
        prompt: clean,
        history: messages.slice(-12).map((m) => ({ role: m.role, text: m.text })),
        businessContext,
      });
      incrementDailyAiUsage(tenant.id);
      setAiQuotaTick((t) => t + 1);
      await persistChatMessage({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        userId: user.uid,
        role: 'assistant',
        text: reply,
        createdAt: new Date().toISOString(),
      });
    } catch (error: any) {
      const msg = error?.message || 'AI Copilot could not respond';
      toast.error(msg);
    } finally {
      setIsAsking(false);
    }
  };

  const handleRunRestockForecast = async () => {
    if (!hasRestockAccess) {
      toast.error('AI Smart Restock requires Business Growth or Enterprise plan.');
      return;
    }
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(`Daily AI limit (${quotaCheck.limit} calls/day) reached. Upgrade in Billing.`);
      return;
    }
    if (products.length === 0) {
      toast.error('Add inventory products before running a restock forecast');
      return;
    }

    setForecastLoading(true);
    setForecastError(null);

    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const units30d = new Map<string, number>();
    sales
      .filter((s) => s.status !== 'refunded')
      .forEach((s) => {
        const t = new Date(s.createdAt).getTime();
        if (!Number.isNaN(t) && t >= thirtyDaysAgoMs) {
          s.items.forEach((item) => {
            units30d.set(item.productId, (units30d.get(item.productId) || 0) + item.quantity);
          });
        }
      });

    try {
      const result = await fetchRestockForecast({
        businessName: tenant?.name || 'Business',
        items: products.map((p) => ({
          productId: p.id,
          productName: p.name,
          currentStock: getEffectiveStock(p, effectiveBranchId),
          minStockLevel: p.minStockLevel ?? 0,
          buyingPrice: p.buyingPrice,
          sellingPrice: p.sellingPrice,
          unitsSoldLast30Days: units30d.get(p.id) || 0,
        })),
      });
      incrementDailyAiUsage(tenant?.id);
      setAiQuotaTick((t) => t + 1);
      setForecastSummary(result.summary);
      setRecommendations(result.recommendations);
      toast.success('Restock forecast updated');
    } catch (error: any) {
      const msg = error?.message || 'Failed to generate restock forecast';
      setForecastError(msg);
      toast.error(msg);
    } finally {
      setForecastLoading(false);
    }
  };

  const handleRunDeadStockAnalysis = async () => {
    if (!hasRestockAccess) {
      toast.error('Dead Stock & Margin Optimizer requires Business Growth or Enterprise plan.');
      return;
    }
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(`Daily AI limit (${quotaCheck.limit} calls/day) reached. Upgrade in Billing.`);
      return;
    }
    if (products.length === 0) {
      toast.error('Add inventory products first');
      return;
    }
    setDeadStockLoading(true);
    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const units30d = new Map<string, number>();
    sales
      .filter((s) => s.status !== 'refunded')
      .forEach((s) => {
        const t = new Date(s.createdAt).getTime();
        if (!Number.isNaN(t) && t >= thirtyDaysAgoMs) {
          s.items.forEach((item) => {
            units30d.set(item.productId, (units30d.get(item.productId) || 0) + item.quantity);
          });
        }
      });

    try {
      const result = await fetchDeadStockMarginAnalysis({
        businessName: tenant?.name || 'Business',
        items: products.map((p) => ({
          productId: p.id,
          productName: p.name,
          currentStock: getEffectiveStock(p, effectiveBranchId),
          buyingPrice: p.buyingPrice,
          sellingPrice: p.sellingPrice,
          unitsSoldLast30Days: units30d.get(p.id) || 0,
        })),
      });
      incrementDailyAiUsage(tenant?.id);
      setAiQuotaTick((t) => t + 1);
      setDeadStockResult(result);
      toast.success('Dead stock & margin analysis ready');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to run dead stock analysis');
    } finally {
      setDeadStockLoading(false);
    }
  };

  const handleGenerateEodDigest = async () => {
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(`Daily AI limit (${quotaCheck.limit} calls/day) reached. Upgrade in Billing.`);
      return;
    }
    setEodLoading(true);
    try {
      const digest = await fetchEodOwnerDigest({ businessContext });
      incrementDailyAiUsage(tenant?.id);
      setAiQuotaTick((t) => t + 1);
      setEodDigest(digest);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate End-of-Day digest');
    } finally {
      setEodLoading(false);
    }
  };

  const handleDraftPurchaseOrder = (recs: RestockRecommendation[]) => {
    const productMap = new Map<string, Product>(products.map((p) => [p.id, p]));
    const prefillItems = recs
      .filter((r) => r.suggestedOrderQty > 0 && productMap.has(r.productId))
      .map((r) => {
        const prod = productMap.get(r.productId)!;
        const qty = Math.max(1, r.suggestedOrderQty);
        const unitCost = prod.buyingPrice || 0;
        return {
          productId: prod.id,
          name: prod.name,
          quantity: qty,
          unitCost,
          total: qty * unitCost,
        };
      });

    if (prefillItems.length === 0) {
      toast.error('No matched inventory products to draft into a Purchase Order');
      return;
    }
    navigate('/purchases', { state: { prefillItems } });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">AI Business Intelligence</h1>
          <p className="text-text-muted mt-1">
            Persistent business copilot, demand restock forecasting, and dead-stock capital optimizer.{' '}
            <span className="font-mono tabular-nums font-semibold text-primary">
              ({aiQuota.used}/{Number.isFinite(aiQuota.limit) ? aiQuota.limit : '∞'} AI calls today)
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-surface-alt rounded-lg border border-border self-start flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('copilot')}
            className={cn(
              'px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap',
              activeTab === 'copilot'
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-secondary hover:text-primary'
            )}
          >
            Business Copilot
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('restock')}
            className={cn(
              'px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap',
              activeTab === 'restock'
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-secondary hover:text-primary'
            )}
          >
            Smart Restock
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('deadstock')}
            className={cn(
              'px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap',
              activeTab === 'deadstock'
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-secondary hover:text-primary'
            )}
          >
            Dead Stock &amp; Margin
          </button>
        </div>
      </div>

      {/* Live Snapshot Context Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-text-muted">Today&apos;s Sales</p>
          <p className="text-lg font-bold text-primary font-mono tabular-nums mt-1">
            {formatUGX(businessContext.todaySalesUgx)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-text-muted">Monthly Net Estimate</p>
          <p
            className={cn(
              'text-lg font-bold font-mono tabular-nums mt-1',
              businessContext.netProfitEstimateUgx >= 0 ? 'text-accent' : 'text-danger'
            )}
          >
            {formatUGX(businessContext.netProfitEstimateUgx)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-text-muted">Low Stock SKUs</p>
          <p className="text-lg font-bold text-danger font-mono tabular-nums mt-1">
            {businessContext.lowStockProducts.length} / {businessContext.totalProducts}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-text-muted">Receivables / Payables</p>
          <p className="text-sm font-bold text-primary font-mono tabular-nums mt-1 truncate">
            {formatUGX(businessContext.customerReceivablesUgx)} /{' '}
            {formatUGX(businessContext.supplierPayablesUgx)}
          </p>
        </div>
      </div>

      {activeTab === 'copilot' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 card p-0 overflow-hidden flex flex-col min-h-[520px]">
            <div className="p-4 sm:p-5 border-b border-border bg-surface-alt/50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h2 className="font-bold text-primary text-base">PrimeStock AI Copilot</h2>
                  <p className="text-xs text-text-muted">
                    Saved chat history synced across your devices
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearChatHistory}
                    className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap"
                  >
                    <Trash2 size={14} />
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  disabled={isAsking}
                  onClick={() => sendPrompt("Give me today's executive profit & cashflow briefing.")}
                  className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap"
                >
                  <TrendingUp size={15} />
                  Daily Briefing
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 max-h-[440px]">
              {messages.length === 0 ? (
                <div className="py-6 space-y-6">
                  <div className="text-center max-w-md mx-auto">
                    <Sparkles size={32} className="text-accent mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-primary">Ask anything about your business</h3>
                    <p className="text-sm text-text-muted mt-1">
                      Every answer uses live metrics from your workspace in UGX.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
                    {QUICK_PROMPTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => sendPrompt(q)}
                        className="p-3.5 text-left rounded-xl border border-border hover:border-accent hover:bg-accent/5 text-sm font-medium text-primary transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed',
                        m.role === 'user'
                          ? 'bg-primary text-white'
                          : 'bg-surface-alt border border-border text-primary'
                      )}
                    >
                      {m.text}
                    </div>
                  </div>
                ))
              )}
              {isAsking && (
                <div className="flex justify-start">
                  <div className="bg-surface-alt border border-border rounded-2xl px-4 py-3 text-sm text-text-muted flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin text-accent" />
                    Analyzing live business data...
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendPrompt(input);
              }}
              className="p-4 border-t border-border bg-white flex gap-3"
            >
              <input
                type="text"
                placeholder="Ask about sales trends, low stock, cashflow, or customer debts..."
                className="input flex-1"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={isAsking || !input.trim()}
                className="btn btn-primary gap-2 px-5 whitespace-nowrap"
              >
                <Send size={16} />
                Ask AI
              </button>
            </form>
          </div>

          {/* End-of-Day Owner Digest Card */}
          <div className="card space-y-4 self-start">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-primary">Owner EOD Digest</h3>
                <p className="text-xs text-text-muted">One-click WhatsApp-ready daily summary</p>
              </div>
              <button
                type="button"
                disabled={eodLoading}
                onClick={handleGenerateEodDigest}
                className="btn btn-primary text-xs py-2 px-3 whitespace-nowrap"
              >
                {eodLoading ? 'Generating...' : 'Generate'}
              </button>
            </div>

            {eodDigest ? (
              <div className="p-4 bg-surface-alt rounded-xl border border-border space-y-3 text-sm">
                <p className="font-bold text-primary">{eodDigest.headline}</p>
                <ul className="space-y-1.5 text-xs text-text-secondary list-disc list-inside">
                  {eodDigest.highlights.map((h, idx) => (
                    <li key={idx}>{h}</li>
                  ))}
                </ul>
                <p className="text-xs font-semibold text-primary pt-1 border-t border-border">
                  Priority Tomorrow: {eodDigest.actionForTomorrow}
                </p>
                <a
                  href={buildDebtWhatsAppUrl(
                    undefined,
                    `${tenant?.name} — Daily Owner Briefing\n${eodDigest.headline}\n${eodDigest.highlights
                      .map((h) => `• ${h}`)
                      .join('\n')}\nTomorrow: ${eodDigest.actionForTomorrow}`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary w-full text-xs gap-1.5"
                >
                  <MessageCircle size={15} className="text-accent" />
                  Send to Owner WhatsApp
                </a>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-text-muted border border-dashed border-border rounded-xl">
                Click Generate to summarize today&apos;s revenue, margins, stock alerts, and cash drawer
                status.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'restock' && (
        <TierGate feature="aiRestockAndMargin">
          <div className="space-y-6">
            <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-primary">AI Demand &amp; Restock Forecast</h2>
              <p className="text-sm text-text-muted">
                Evaluates current stock against 30-day sales velocity to recommend reorder quantities.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {recommendations.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleDraftPurchaseOrder(recommendations)}
                  className="btn btn-secondary gap-2 text-sm whitespace-nowrap"
                >
                  <ShoppingBag size={16} />
                  Draft PO for All
                </button>
              )}
              <button
                type="button"
                disabled={forecastLoading}
                onClick={handleRunRestockForecast}
                className="btn btn-primary gap-2 text-sm whitespace-nowrap"
              >
                <RefreshCw size={16} className={forecastLoading ? 'animate-spin' : ''} />
                {forecastLoading ? 'Forecasting...' : 'Generate Forecast'}
              </button>
            </div>
          </div>

          {forecastError && (
            <div className="card border-danger/30 bg-danger/5 text-danger text-sm flex items-center gap-2">
              <AlertTriangle size={18} className="shrink-0" />
              <span>{forecastError}</span>
            </div>
          )}

          {forecastSummary && (
            <div className="card bg-primary/5 border-border">
              <p className="text-xs font-bold uppercase tracking-wider text-text-muted mb-1">
                Forecast Summary
              </p>
              <p className="text-sm font-medium text-primary">{forecastSummary}</p>
            </div>
          )}

          {recommendations.length === 0 ? (
            <div className="card p-12 text-center text-text-muted">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-primary">No forecast generated yet</p>
              <p className="text-sm mt-1">
                Click &ldquo;Generate Forecast&rdquo; to analyze your {products.length} inventory items.
              </p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[760px]">
                  <thead>
                    <tr className="bg-surface-alt/50 border-b border-border text-xs font-bold text-text-muted uppercase tracking-wider">
                      <th className="px-6 py-4">Product</th>
                      <th className="px-6 py-4">Urgency</th>
                      <th className="px-6 py-4">Est. Days Left</th>
                      <th className="px-6 py-4">Suggested Qty</th>
                      <th className="px-6 py-4">Est. Cost</th>
                      <th className="px-6 py-4">AI Reasoning</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm">
                    {recommendations.map((rec) => (
                      <tr key={rec.productId} className="hover:bg-surface-alt/30">
                        <td className="px-6 py-4 font-bold text-primary">{rec.productName}</td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              'text-xs font-bold uppercase',
                              rec.urgency === 'critical'
                                ? 'text-danger'
                                : rec.urgency === 'soon'
                                ? 'text-accent-alt'
                                : 'text-accent'
                            )}
                          >
                            {rec.urgency}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono tabular-nums text-primary">
                          {rec.estimatedDaysLeft}d
                        </td>
                        <td className="px-6 py-4 font-mono tabular-nums font-bold text-primary">
                          {rec.suggestedOrderQty}
                        </td>
                        <td className="px-6 py-4 font-mono tabular-nums text-primary">
                          {formatUGX(rec.estimatedCostUgx)}
                        </td>
                        <td className="px-6 py-4 text-xs text-text-secondary max-w-xs">
                          {rec.reason}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleDraftPurchaseOrder([rec])}
                            className="text-xs font-bold text-accent hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            Draft PO <ArrowRight size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </div>
        </TierGate>
      )}

      {activeTab === 'deadstock' && (
        <TierGate feature="aiRestockAndMargin">
          <div className="space-y-6">
            <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-primary">Dead Stock &amp; Margin Optimizer</h2>
              <p className="text-sm text-text-muted">
                Identifies slow-moving capital and low-margin SKUs with actionable markdown prices.
              </p>
            </div>
            <button
              type="button"
              disabled={deadStockLoading}
              onClick={handleRunDeadStockAnalysis}
              className="btn btn-primary gap-2 text-sm whitespace-nowrap"
            >
              <TrendingDown size={16} />
              {deadStockLoading ? 'Analyzing...' : 'Analyze Dead Stock'}
            </button>
          </div>

          {!deadStockResult ? (
            <div className="card p-12 text-center text-text-muted">
              <TrendingDown size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-primary">No margin analysis generated yet</p>
              <p className="text-sm mt-1">
                Click &ldquo;Analyze Dead Stock&rdquo; to spot cash tied up in slow inventory.
              </p>
            </div>
          ) : (
            <>
              <div className="card bg-primary/5 border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-text-muted mb-1">
                    Optimization Summary
                  </p>
                  <p className="text-sm font-medium text-primary">{deadStockResult.summary}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold uppercase text-text-muted">Capital Tied Up</p>
                  <p className="text-xl font-bold text-danger font-mono tabular-nums">
                    {formatUGX(deadStockResult.totalCapitalTiedUgx)}
                  </p>
                </div>
              </div>

              <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[760px]">
                    <thead>
                      <tr className="bg-surface-alt/50 border-b border-border text-xs font-bold text-text-muted uppercase tracking-wider">
                        <th className="px-6 py-4">Product</th>
                        <th className="px-6 py-4">Capital Tied</th>
                        <th className="px-6 py-4">Current Margin</th>
                        <th className="px-6 py-4">Suggested Promo Price</th>
                        <th className="px-6 py-4">AI Recommendation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm">
                      {deadStockResult.insights.map((item) => (
                        <tr key={item.productId} className="hover:bg-surface-alt/30">
                          <td className="px-6 py-4 font-bold text-primary">{item.productName}</td>
                          <td className="px-6 py-4 font-mono tabular-nums text-danger font-bold">
                            {formatUGX(item.capitalTiedUgx)}
                          </td>
                          <td className="px-6 py-4 font-mono tabular-nums">
                            {item.marginPercent.toFixed(1)}%
                          </td>
                          <td className="px-6 py-4 font-mono tabular-nums font-bold text-accent">
                            {formatUGX(item.suggestedPromoPriceUgx)}
                          </td>
                          <td className="px-6 py-4 text-xs text-text-secondary">
                            {item.recommendation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          </div>
        </TierGate>
      )}
    </div>
  );
}
