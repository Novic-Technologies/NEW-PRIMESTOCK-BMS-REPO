import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Mic,
  MicOff,
  Camera,
  CheckCircle2,
  ShieldCheck,
  Smartphone,
  FileCheck2,
  Wand2,
  GitMerge,
  BookOpen,
  DollarSign,
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
import { usePurchaseOrders } from '../../hooks/usePurchaseOrders';
import { useStockOperations } from '../../hooks/useStockOperations';
import { useCreditPayments } from '../../hooks/useCreditPayments';
import { useAuditLog, logWorkspaceAudit } from '../../hooks/useAuditLog';
import { usePayroll } from '../../hooks/usePayroll';
import {
  askBusinessCopilot,
  CopilotBusinessContext,
  EnrichedProductSuggestion,
  fetchEodOwnerDigest,
  fetchSmartStocktake,
  fileToBase64,
  generateDebtReminder,
  GuidedSetupSuggestion,
  InvoiceCheckResult,
  MomoMatchResult,
  ParsedOrderDraftResult,
  runAiAssistantTool,
  WhatsappReplyDraftResult,
} from '../../services/aiService';
import {
  AiLanguage,
  buildRoleAwareCopilotContext,
  calculatePromoPayoff,
  computeCustomerRiskAndSegments,
  computeDeadAndSlowStock60d,
  computeDemandAndReorderPlan,
  computeFinanceAndCompliance,
  computeMarginAndPromoChecks,
  computeSalesAnomalies,
  computeSecurityAndActivityDigest,
  computeStockDiscrepanciesAndDuplicates,
  computeSupplierAnalytics,
} from '../../utils/aiAnalytics';
import {
  AIChatMessage,
  EodDigestResult,
  Product,
  SmartStocktakeItemResult,
} from '../../types';
import { formatDate, formatUGX } from '../../utils/format';
import { getEffectiveStock } from '../../utils/branchStock';
import { buildDebtWhatsAppUrl } from '../../utils/whatsapp';
import { stripUndefined } from '../../utils/firestoreUtils';
import { hasSectionAccess } from '../../utils/rbac';
import {
  canAccessFeature,
  canUseAiCall,
  incrementDailyAiUsage,
} from '../../utils/planLimits';
import { TierGate } from '../../components/shared/TierGate';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

type AiTab = 'copilot' | 'inventory' | 'sales' | 'finance';

const QUICK_DATA_PROMPTS = [
  "Give me today's executive profit & cashflow briefing.",
  'Which products are driving the most revenue and which need urgent restock?',
  'Summarize customer credit risk vs supplier payables right now.',
  'Spot any margin leaks, dead stock, or unusual cashier refunds this month.',
];

const QUICK_HELP_PROMPTS = [
  'How do I split a POS checkout between Cash and MTN MoMo?',
  'How do I close a cash register shift and review variance?',
  'How do I upload a multi-page PDF with Smart Import?',
  'How do I set up 4-digit cashier PIN quick-switching?',
];

export default function AICopilot() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenant, user } = useAuthStore();
  const { sales, settlePendingSale } = usePOS();
  const { products, updateProduct } = useInventory();
  const { expenses } = useExpenses();
  const { customers } = useCustomers();
  const { suppliers } = useSuppliers();
  const { activeShift } = useShifts();
  const { activeBranch, activeBranchId } = useBranches();
  const { purchaseOrders } = usePurchaseOrders();
  const { adjustments, recordAdjustment } = useStockOperations();
  const { payments: creditPayments, recordCustomerRepayment } = useCreditPayments();
  const { logs: auditLogs } = useAuditLog();
  const { runs: payrollRuns } = usePayroll();

  const effectiveBranchId = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : null;

  const canSeeInventory = hasSectionAccess(user, 'inventory') || hasSectionAccess(user, 'pos');
  const canSeeSales =
    hasSectionAccess(user, 'pos') ||
    hasSectionAccess(user, 'sales') ||
    hasSectionAccess(user, 'customers');
  const canSeeFinance =
    hasSectionAccess(user, 'finance') ||
    hasSectionAccess(user, 'reports') ||
    hasSectionAccess(user, 'suppliers') ||
    hasSectionAccess(user, 'purchases') ||
    hasSectionAccess(user, 'settings');
  const canSeePayroll = hasSectionAccess(user, 'payroll');

  const initialTab = (searchParams.get('tab') as AiTab) || 'copilot';
  const [activeTab, setActiveTabState] = useState<AiTab>(
    ['copilot', 'inventory', 'sales', 'finance'].includes(initialTab) ? initialTab : 'copilot'
  );

  const setActiveTab = (tab: AiTab) => {
    setActiveTabState(tab);
    setSearchParams({ tab }, { replace: true });
  };

  useEffect(() => {
    const t = searchParams.get('tab') as AiTab | null;
    if (t && ['copilot', 'inventory', 'sales', 'finance'].includes(t) && t !== activeTab) {
      setActiveTabState(t);
    }
  }, [searchParams]);

  // Copilot chat & digest state
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [copilotMode, setCopilotMode] = useState<'ask_data' | 'help'>('ask_data');
  const [language, setLanguage] = useState<AiLanguage>('en');
  const [isAsking, setIsAsking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [eodDigest, setEodDigest] = useState<EodDigestResult | null>(null);
  const [eodLoading, setEodLoading] = useState(false);
  const [aiQuotaTick, setAiQuotaTick] = useState(0);

  // Inventory & Stocktake state
  const [promoProductId, setPromoProductId] = useState('');
  const [promoDiscountPct, setPromoDiscountPct] = useState(15);
  const [stocktakeItems, setStocktakeItems] = useState<
    Array<SmartStocktakeItemResult & { editedCount: number }>
  >([]);
  const [stocktakeNotes, setStocktakeNotes] = useState('');
  const [stocktakeLoading, setStocktakeLoading] = useState(false);
  const [stocktakeApplying, setStocktakeApplying] = useState(false);
  const stocktakeFileRef = useRef<HTMLInputElement>(null);

  const [enrichSuggestions, setEnrichSuggestions] = useState<EnrichedProductSuggestion[]>([]);
  const [selectedEnrichIds, setSelectedEnrichIds] = useState<Record<string, boolean>>({});
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [mergingPairKey, setMergingPairKey] = useState<string | null>(null);

  // Sales, MoMo & WhatsApp state
  const [nlOrderText, setNlOrderText] = useState('');
  const [nlOrderDraft, setNlOrderDraft] = useState<ParsedOrderDraftResult | null>(null);
  const [nlOrderLoading, setNlOrderLoading] = useState(false);

  const [momoSms, setMomoSms] = useState('');
  const [momoMatch, setMomoMatch] = useState<MomoMatchResult | null>(null);
  const [momoLoading, setMomoLoading] = useState(false);
  const [momoApplying, setMomoApplying] = useState(false);

  const [waInquiry, setWaInquiry] = useState('');
  const [waReplyDraft, setWaReplyDraft] = useState<WhatsappReplyDraftResult | null>(null);
  const [waLoading, setWaLoading] = useState(false);

  const [debtDrafts, setDebtDrafts] = useState<Record<string, string>>({});
  const [debtLoadingId, setDebtLoadingId] = useState<string | null>(null);

  // Finance, Invoice Check & Setup Wizard state
  const [checkPoId, setCheckPoId] = useState('');
  const [invoiceText, setInvoiceText] = useState('');
  const [invoiceCheckResult, setInvoiceCheckResult] = useState<InvoiceCheckResult | null>(null);
  const [invoiceCheckLoading, setInvoiceCheckLoading] = useState(false);
  const invoiceFileRef = useRef<HTMLInputElement>(null);

  const [setupDesc, setSetupDesc] = useState('');
  const [setupResult, setSetupResult] = useState<GuidedSetupSuggestion | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

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

  // Rule 3: Role-isolated Copilot context
  const businessContext: CopilotBusinessContext = useMemo(
    () =>
      buildRoleAwareCopilotContext({
        tenant,
        user,
        branch: activeBranch,
        branchId: effectiveBranchId,
        sales,
        products,
        expenses,
        customers,
        suppliers,
        activeShift,
        payrollRuns: canSeePayroll ? payrollRuns : undefined,
      }),
    [
      tenant,
      user,
      activeBranch,
      effectiveBranchId,
      sales,
      products,
      expenses,
      customers,
      suppliers,
      activeShift,
      canSeePayroll,
      payrollRuns,
    ]
  );

  // Rule 1: Deterministic analytics in code
  const demandPlan = useMemo(
    () =>
      computeDemandAndReorderPlan({
        products,
        sales,
        expenses,
        purchaseOrders,
        branchId: effectiveBranchId,
      }),
    [products, sales, expenses, purchaseOrders, effectiveBranchId]
  );

  const deadStock = useMemo(
    () =>
      computeDeadAndSlowStock60d({
        products,
        sales,
        branchId: effectiveBranchId,
      }),
    [products, sales, effectiveBranchId]
  );

  const discrepancyBundle = useMemo(
    () =>
      computeStockDiscrepanciesAndDuplicates({
        products,
        adjustments,
        branchId: effectiveBranchId,
      }),
    [products, adjustments, effectiveBranchId]
  );

  const marginAlerts = useMemo(() => computeMarginAndPromoChecks(products), [products]);

  const supplierAnalytics = useMemo(
    () => computeSupplierAnalytics({ suppliers, purchaseOrders, products }),
    [suppliers, purchaseOrders, products]
  );

  const salesAnomalies = useMemo(() => computeSalesAnomalies({ sales }), [sales]);

  const customerInsights = useMemo(
    () => computeCustomerRiskAndSegments({ customers, sales, creditPayments }),
    [customers, sales, creditPayments]
  );

  const financeInsights = useMemo(
    () =>
      computeFinanceAndCompliance({
        tenant,
        sales,
        expenses,
        customers,
        suppliers,
      }),
    [tenant, sales, expenses, customers, suppliers]
  );

  const securityDigest = useMemo(
    () => computeSecurityAndActivityDigest({ sales, adjustments, auditLogs }),
    [sales, adjustments, auditLogs]
  );

  const promoEval = useMemo(() => {
    const target =
      products.find((p) => p.id === promoProductId) ||
      products.find((p) => p.sellingPrice > 0 && p.buyingPrice > 0) ||
      null;
    if (!target) return null;
    const thirtyAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let sold30d = 0;
    sales.forEach((s) => {
      if (s.status === 'refunded') return;
      if (new Date(s.createdAt).getTime() >= thirtyAgo) {
        s.items.forEach((i) => {
          if (i.productId === target.id) sold30d += i.quantity;
        });
      }
    });
    return {
      product: target,
      ...calculatePromoPayoff({
        sellingPrice: target.sellingPrice,
        buyingPrice: target.buyingPrice,
        currentMonthlyQty: Math.max(1, sold30d),
        discountPct: promoDiscountPct,
      }),
    };
  }, [promoProductId, promoDiscountPct, products, sales]);

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
    await localDb.aiChats.bulkDelete(messages.map((m) => m.id));
    toast.success('Local AI chat history cleared');
  };

  const startVoiceDictation = (onTranscript: (text: string) => void) => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      toast('Voice input is not supported in this browser; please type your prompt.');
      return;
    }
    try {
      const recognition = new SpeechRec();
      recognition.lang = language === 'sw' ? 'sw-KE' : 'en-UG';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || '';
        if (transcript) onTranscript(transcript);
        setIsListening(false);
      };
      recognition.onerror = () => {
        setIsListening(false);
        toast.error('Could not capture voice audio');
      };
      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const sendPrompt = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean || isAsking || !tenant || !user) return;
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(
        `Daily AI limit (${quotaCheck.limit} calls/day) reached on your current pack.`
      );
      return;
    }

    await persistChatMessage({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      userId: user.uid,
      role: 'user',
      text: clean,
      createdAt: new Date().toISOString(),
    });
    setInput('');
    setIsAsking(true);

    try {
      const reply = await askBusinessCopilot({
        prompt: clean,
        history: messages.slice(-12).map((m) => ({ role: m.role, text: m.text })),
        businessContext,
        language,
        mode: copilotMode,
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
      toast.error(error?.message || 'AI Copilot could not respond');
    } finally {
      setIsAsking(false);
    }
  };

  const handleGenerateEodDigest = async () => {
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(`Daily AI limit (${quotaCheck.limit} calls/day) reached.`);
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

  const handleDraftPoFromPlan = (itemsToOrder: typeof demandPlan.reorderPlan) => {
    const prodMap = new Map<string, Product>(products.map((p) => [p.id, p]));
    const prefillItems = itemsToOrder
      .filter((i) => !i.expiryBlocked && i.suggestedOrderQty > 0 && prodMap.has(i.productId))
      .map((i) => ({
        productId: i.productId,
        name: i.productName,
        quantity: i.suggestedOrderQty,
        unitCost: i.unitBuyingCost,
        total: i.suggestedOrderQty * i.unitBuyingCost,
      }));
    if (prefillItems.length === 0) {
      toast.error('No eligible non-blocked SKUs selected to draft a PO.');
      return;
    }
    navigate('/purchases', { state: { prefillItems } });
  };

  // Smart Stocktake upload
  const handleShelfPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(`Daily AI limit (${quotaCheck.limit} calls/day) reached.`);
      return;
    }
    setStocktakeLoading(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const res = await fetchSmartStocktake({
        imageBase64: base64,
        mimeType,
        catalog: products.slice(0, 60).map((p) => ({
          id: p.id,
          name: p.name,
          currentStock: getEffectiveStock(p, effectiveBranchId),
          unit: p.unit || 'pcs',
        })),
      });
      incrementDailyAiUsage(tenant?.id);
      setAiQuotaTick((t) => t + 1);
      setStocktakeNotes(res.summary || '');
      setStocktakeItems(
        (res.items || []).map((it) => ({
          ...it,
          editedCount: it.countedQty,
        }))
      );
      if (!res.items || res.items.length === 0) {
        toast('Could not detect recognizable products on that shelf photo.');
      } else {
        toast.success(`Counted ${res.items.length} item(s) — review before applying`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Shelf photo count failed');
    } finally {
      setStocktakeLoading(false);
      if (stocktakeFileRef.current) stocktakeFileRef.current.value = '';
    }
  };

  const handleApplyApprovedStocktake = async () => {
    const actionable = stocktakeItems.filter((it) => Boolean(it.productId));
    if (actionable.length === 0) {
      toast.error('No catalog-matched items to post.');
      return;
    }
    setStocktakeApplying(true);
    try {
      let updated = 0;
      for (const item of actionable) {
        if (!item.productId) continue;
        await recordAdjustment({
          productId: item.productId,
          newStock: Math.max(0, Number(item.editedCount) || 0),
          reason: 'Stock-Take',
          notes: `AI Shelf Photo Count (AI saw ${item.countedQty}, human approved ${item.editedCount})`,
          branchId: effectiveBranchId || undefined,
        });
        updated++;
      }
      toast.success(`Posted ${updated} approved stock-take adjustment(s)`);
      setStocktakeItems([]);
      setStocktakeNotes('');
    } finally {
      setStocktakeApplying(false);
    }
  };

  // Duplicate Merge (human confirmation)
  const handleMergeDuplicates = async (pair: typeof discrepancyBundle.duplicates[number]) => {
    if (!tenant || !user) return;
    const primary = products.find((p) => p.id === pair.primaryId);
    const duplicate = products.find((p) => p.id === pair.duplicateId);
    if (!primary || !duplicate) return;
    const key = `${pair.primaryId}_${pair.duplicateId}`;
    setMergingPairKey(key);
    try {
      const mergedBranchStock: Record<string, number> = { ...(primary.branchStock || {}) };
      if (duplicate.branchStock) {
        Object.entries(duplicate.branchStock).forEach(([bId, qty]) => {
          mergedBranchStock[bId] = (mergedBranchStock[bId] || 0) + (Number(qty) || 0);
        });
      }
      const zeroBranchStock: Record<string, number> = {};
      if (duplicate.branchStock) {
        Object.keys(duplicate.branchStock).forEach((bId) => {
          zeroBranchStock[bId] = 0;
        });
      }

      await updateProduct(primary.id, {
        currentStock: (primary.currentStock || 0) + (duplicate.currentStock || 0),
        ...(Object.keys(mergedBranchStock).length > 0 ? { branchStock: mergedBranchStock } : {}),
        sku: primary.sku || duplicate.sku,
        barcode: primary.barcode || duplicate.barcode,
      });

      await updateProduct(duplicate.id, {
        status: 'inactive',
        currentStock: 0,
        ...(Object.keys(zeroBranchStock).length > 0 ? { branchStock: zeroBranchStock } : {}),
      });

      void logWorkspaceAudit({
        tenantId: tenant.id,
        branchId: effectiveBranchId || undefined,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'PRODUCT_DUPLICATE_MERGED',
        entityType: 'product',
        entityId: primary.id,
        summary: `Merged duplicate "${duplicate.name}" (${duplicate.currentStock} stock) into "${primary.name}"`,
      });
      toast.success(`Merged "${duplicate.name}" into "${primary.name}"`);
    } finally {
      setMergingPairKey(null);
    }
  };

  // Batch Enrichment (human approval before updating)
  const handleGenerateEnrichments = async () => {
    if (discrepancyBundle.enrichmentCandidates.length === 0) return;
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(`Daily AI limit (${quotaCheck.limit} calls/day) reached.`);
      return;
    }
    setEnrichLoading(true);
    try {
      const res = await runAiAssistantTool<{ suggestions: EnrichedProductSuggestion[] }>(
        'enrich_products',
        {
          items: discrepancyBundle.enrichmentCandidates.map((p) => ({
            productId: p.id,
            name: p.name,
            category: p.category,
            unit: p.unit,
            sku: p.sku,
          })),
        }
      );
      incrementDailyAiUsage(tenant?.id);
      setAiQuotaTick((t) => t + 1);
      const list = res.suggestions || [];
      setEnrichSuggestions(list);
      const initSel: Record<string, boolean> = {};
      list.forEach((s) => {
        if (s.productId) initSel[s.productId] = true;
      });
      setSelectedEnrichIds(initSel);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to enrich products');
    } finally {
      setEnrichLoading(false);
    }
  };

  const handleApplyEnrichments = async () => {
    const selected = enrichSuggestions.filter((s) => s.productId && selectedEnrichIds[s.productId]);
    if (selected.length === 0) {
      toast.error('Select at least one enrichment row to apply');
      return;
    }
    for (const s of selected) {
      if (!s.productId) continue;
      await updateProduct(s.productId, {
        name: s.standardizedName,
        category: s.suggestedCategory,
        sku: s.suggestedSku,
      });
    }
    toast.success(`Updated ${selected.length} product(s)`);
    setEnrichSuggestions([]);
  };

  // Natural-language Order Drafter
  const handleParseNlOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlOrderText.trim()) return;
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(`Daily AI limit (${quotaCheck.limit} calls/day) reached.`);
      return;
    }
    setNlOrderLoading(true);
    try {
      const res = await runAiAssistantTool<ParsedOrderDraftResult>('parse_order', {
        text: nlOrderText.trim(),
        products: products.slice(0, 60).map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
          sellingPrice: p.sellingPrice,
        })),
        customers: customers.slice(0, 40).map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
        })),
      });
      incrementDailyAiUsage(tenant?.id);
      setAiQuotaTick((t) => t + 1);
      setNlOrderDraft(res);
    } catch (err: any) {
      toast.error(err?.message || 'Could not parse order text');
    } finally {
      setNlOrderLoading(false);
    }
  };

  // MoMo SMS Matcher + Human Confirm
  const handleMatchMomoSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!momoSms.trim()) return;
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(`Daily AI limit (${quotaCheck.limit} calls/day) reached.`);
      return;
    }
    setMomoLoading(true);
    try {
      const pendingSales = sales
        .filter((s) => s.status === 'pending')
        .slice(0, 20)
        .map((s) => ({
          id: s.id,
          reference: s.reference,
          total: s.total,
          payerPhone: s.payerPhone,
        }));
      const debtors = customers
        .filter((c) => c.currentBalance > 0)
        .slice(0, 30)
        .map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          currentBalance: c.currentBalance,
        }));

      const res = await runAiAssistantTool<MomoMatchResult>('match_momo_sms', {
        smsText: momoSms.trim(),
        pendingSales,
        customers: debtors,
      });
      incrementDailyAiUsage(tenant?.id);
      setAiQuotaTick((t) => t + 1);
      setMomoMatch(res);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to parse Mobile Money SMS');
    } finally {
      setMomoLoading(false);
    }
  };

  const handleConfirmMomoReconcile = async () => {
    if (!momoMatch || momoMatch.matchType === 'unmatched' || !momoMatch.matchedId) return;
    setMomoApplying(true);
    try {
      const method =
        momoMatch.provider?.toLowerCase().includes('airtel')
          ? 'Airtel Money'
          : 'MTN Mobile Money';
      if (momoMatch.matchType === 'pending_sale') {
        await settlePendingSale(momoMatch.matchedId, method, {
          paymentReference: momoMatch.txId,
          payerPhone: momoMatch.payerPhone,
        });
      } else if (momoMatch.matchType === 'customer_credit') {
        await recordCustomerRepayment({
          customerId: momoMatch.matchedId,
          amount: momoMatch.amountUgx,
          paymentMethod: method,
          reference: momoMatch.txId,
          notes: `Matched from MoMo SMS (${momoMatch.payerName || momoMatch.payerPhone || 'customer'})`,
        });
      }
      setMomoMatch(null);
      setMomoSms('');
    } finally {
      setMomoApplying(false);
    }
  };

  // WhatsApp Customer Inquiry Assistant
  const handleDraftWhatsappReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waInquiry.trim()) return;
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(`Daily AI limit (${quotaCheck.limit} calls/day) reached.`);
      return;
    }
    setWaLoading(true);
    try {
      const res = await runAiAssistantTool<WhatsappReplyDraftResult>('whatsapp_reply', {
        customerMessage: waInquiry.trim(),
        language,
        businessName: tenant?.name || 'Our Shop',
        catalog: products.slice(0, 60).map((p) => ({
          name: p.name,
          sellingPrice: p.sellingPrice,
          currentStock: getEffectiveStock(p, effectiveBranchId),
          unit: p.unit,
        })),
      });
      incrementDailyAiUsage(tenant?.id);
      setAiQuotaTick((t) => t + 1);
      setWaReplyDraft(res);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to draft WhatsApp reply');
    } finally {
      setWaLoading(false);
    }
  };

  // Debt reminder inside Sales & Customers tab
  const handleDraftDebtMessage = async (
    custId: string,
    custName: string,
    amount: number,
    tone: 'friendly' | 'firm' | 'final'
  ) => {
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(`Daily AI limit (${quotaCheck.limit} calls/day) reached.`);
      return;
    }
    setDebtLoadingId(custId);
    try {
      const res = await generateDebtReminder({
        customerName: custName,
        amountOwedUgx: amount,
        businessName: tenant?.name || 'Our Business',
        tone,
        language,
      });
      incrementDailyAiUsage(tenant?.id);
      setAiQuotaTick((t) => t + 1);
      setDebtDrafts((prev) => ({ ...prev, [custId]: res.message }));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to draft reminder');
    } finally {
      setDebtLoadingId(null);
    }
  };

  // Invoice vs PO Checker
  const runInvoiceDiscrepancyCheck = async (opts?: { base64?: string; mimeType?: string }) => {
    const po = purchaseOrders.find((p) => p.id === checkPoId);
    if (!po) {
      toast.error('Select a Purchase Order first');
      return;
    }
    if (!opts?.base64 && !invoiceText.trim()) {
      toast.error('Paste invoice text or upload an invoice photo');
      return;
    }
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(`Daily AI limit (${quotaCheck.limit} calls/day) reached.`);
      return;
    }
    setInvoiceCheckLoading(true);
    try {
      const res = await runAiAssistantTool<InvoiceCheckResult>('check_invoice', {
        poReference: po.reference,
        poItems: po.items,
        invoiceText: invoiceText.trim(),
        imageBase64: opts?.base64,
        mimeType: opts?.mimeType,
      });
      incrementDailyAiUsage(tenant?.id);
      setAiQuotaTick((t) => t + 1);
      setInvoiceCheckResult(res);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to check invoice against PO');
    } finally {
      setInvoiceCheckLoading(false);
    }
  };

  // Guided Setup Wizard
  const handleRunGuidedSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupDesc.trim()) return;
    const quotaCheck = canUseAiCall(tenant);
    if (!quotaCheck.allowed) {
      toast.error(`Daily AI limit (${quotaCheck.limit} calls/day) reached.`);
      return;
    }
    setSetupLoading(true);
    try {
      const res = await runAiAssistantTool<GuidedSetupSuggestion>('guided_setup', {
        businessDescription: setupDesc.trim(),
      });
      incrementDailyAiUsage(tenant?.id);
      setAiQuotaTick((t) => t + 1);
      setSetupResult(res);
    } catch (err: any) {
      toast.error(err?.message || 'Setup advisor failed');
    } finally {
      setSetupLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary">AI Business Intelligence</h1>
          <p className="text-text-muted mt-1 text-sm">
            Verified numbers computed in code · every stock, price, and money action requires your approval.{' '}
            <span className="font-mono tabular-nums font-semibold text-primary">
              ({aiQuota.used}/{Number.isFinite(aiQuota.limit) ? aiQuota.limit : '∞'} AI calls today)
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-surface-alt rounded-lg border border-border self-start max-w-full overflow-x-auto sm:flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('copilot')}
            className={cn(
              'px-3 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap',
              activeTab === 'copilot' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary hover:text-primary'
            )}
          >
            Copilot &amp; Help
          </button>
          {canSeeInventory && (
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={cn(
                'px-3 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap',
                activeTab === 'inventory' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary hover:text-primary'
              )}
            >
              Inventory &amp; Stocktake
            </button>
          )}
          {canSeeSales && (
            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              className={cn(
                'px-3 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap',
                activeTab === 'sales' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary hover:text-primary'
              )}
            >
              Sales, MoMo &amp; WhatsApp
            </button>
          )}
          {canSeeFinance && (
            <button
              type="button"
              onClick={() => setActiveTab('finance')}
              className={cn(
                'px-3 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap',
                activeTab === 'finance' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary hover:text-primary'
              )}
            >
              Finance, Suppliers &amp; Audit
            </button>
          )}
        </div>
      </div>

      {/* Role-scoped Snapshot Bar (Rule 3) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-text-muted">Today&apos;s Sales</p>
          <p className="text-lg font-bold text-primary font-mono tabular-nums mt-1">
            {formatUGX(businessContext.todaySalesUgx)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-text-muted">
            {businessContext.restrictedScopeNote ? 'Scope Access' : 'Monthly Net Estimate'}
          </p>
          {businessContext.restrictedScopeNote ? (
            <p className="text-xs font-semibold text-text-secondary mt-1.5">
              Role-scoped ({businessContext.userRole})
            </p>
          ) : (
            <p
              className={cn(
                'text-lg font-bold font-mono tabular-nums mt-1',
                businessContext.netProfitEstimateUgx >= 0 ? 'text-accent' : 'text-danger'
              )}
            >
              {formatUGX(businessContext.netProfitEstimateUgx)}
            </p>
          )}
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-text-muted">Low Stock SKUs</p>
          <p className="text-lg font-bold text-danger font-mono tabular-nums mt-1">
            {businessContext.lowStockProducts.length} / {businessContext.totalProducts}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-text-muted">Seasonality Multiplier</p>
          <p className="text-sm font-bold text-primary mt-1 truncate">
            {demandPlan.seasonal.multiplier.toFixed(2)}× · {demandPlan.seasonal.label}
          </p>
        </div>
      </div>

      {/* TAB 1: COPILOT & IN-APP HELP */}
      {activeTab === 'copilot' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 card p-0 overflow-hidden flex flex-col min-h-[400px] sm:min-h-[540px]">
            <div className="p-4 sm:p-5 border-b border-border bg-surface-alt/50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                  {copilotMode === 'help' ? <BookOpen size={18} /> : <Sparkles size={18} />}
                </div>
                <div>
                  <h2 className="font-bold text-primary text-base">
                    {copilotMode === 'help' ? 'PrimeStock How-To Guide' : 'PrimeStock Data Copilot'}
                  </h2>
                  <p className="text-xs text-text-muted">
                    Branch: {businessContext.branchName} · Role: {businessContext.userRole}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center p-0.5 bg-white border border-border rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCopilotMode('ask_data')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap',
                      copilotMode === 'ask_data' ? 'bg-primary text-white' : 'text-text-secondary'
                    )}
                  >
                    My Data
                  </button>
                  <button
                    type="button"
                    onClick={() => setCopilotMode('help')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap',
                      copilotMode === 'help' ? 'bg-primary text-white' : 'text-text-secondary'
                    )}
                  >
                    App Help
                  </button>
                </div>

                <select
                  aria-label="Assistant language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as AiLanguage)}
                  className="bg-white border border-border rounded-lg px-2 py-1 text-xs font-semibold text-primary"
                >
                  <option value="en">English</option>
                  <option value="lg">Luganda</option>
                  <option value="sw">Kiswahili</option>
                </select>

                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearChatHistory}
                    className="btn btn-secondary text-xs py-1.5 px-2.5 gap-1 whitespace-nowrap"
                  >
                    <Trash2 size={13} />
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 p-3 sm:p-6 overflow-y-auto space-y-4 max-h-[380px] sm:max-h-[440px]">
              {messages.length === 0 ? (
                <div className="py-4 space-y-5">
                  <div className="text-center max-w-md mx-auto">
                    <Sparkles size={30} className="text-accent mx-auto mb-2.5" />
                    <h3 className="text-lg font-bold text-primary">
                      {copilotMode === 'help'
                        ? 'Ask how to use any PrimeStock screen'
                        : 'Ask anything about your business data'}
                    </h3>
                    <p className="text-sm text-text-muted mt-1">
                      Answers in English, Luganda, or Swahili using your scoped workspace figures.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
                    {(copilotMode === 'help' ? QUICK_HELP_PROMPTS : QUICK_DATA_PROMPTS).map((q) => (
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
                        'max-w-[92%] sm:max-w-[85%] rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm whitespace-pre-wrap leading-relaxed',
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
                    Thinking with live workspace figures...
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendPrompt(input);
              }}
              className="p-3 sm:p-4 border-t border-border bg-white flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => startVoiceDictation((t) => setInput((prev) => (prev ? `${prev} ${t}` : t)))}
                title="Voice input"
                aria-label="Voice input"
                className={cn(
                  'btn btn-secondary px-2.5 sm:px-3 shrink-0',
                  isListening && 'border-danger text-danger bg-danger/5'
                )}
              >
                {isListening ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
              <input
                type="text"
                placeholder={
                  copilotMode === 'help'
                    ? 'Ask how to run stocktakes, split payments, EFRIS TIN...'
                    : 'Ask about revenue, stockouts, cashflow, or balances...'
                }
                className="input min-w-0 flex-1"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={isAsking || !input.trim()}
                className="btn btn-primary gap-1.5 px-3 sm:px-5 whitespace-nowrap shrink-0"
              >
                <Send size={16} />
                <span className="hidden sm:inline">Ask AI</span>
                <span className="sm:hidden">Ask</span>
              </button>
            </form>
          </div>

          <div className="space-y-4 self-start">
            <div className="card space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-primary">Owner EOD Digest</h3>
                  <p className="text-xs text-text-muted">WhatsApp-ready end-of-day briefing</p>
                </div>
                <button
                  type="button"
                  disabled={eodLoading}
                  onClick={handleGenerateEodDigest}
                  className="btn btn-primary text-xs py-2 px-3 whitespace-nowrap shrink-0"
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
                    Tomorrow: {eodDigest.actionForTomorrow}
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
                <div className="p-5 text-center text-xs text-text-muted border border-dashed border-border rounded-xl">
                  Summarize today&apos;s sales, stock alerts, and expected cash drawer.
                </div>
              )}
            </div>

            <div className="card space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-muted">
                <ShieldCheck size={14} className="text-accent" />
                <span>What Changed Today</span>
              </div>
              {securityDigest.whatChangedToday.length === 0 ? (
                <p className="text-xs text-text-muted">No workspace audit actions logged yet today.</p>
              ) : (
                <ul className="space-y-1.5 text-xs text-text-secondary">
                  {securityDigest.whatChangedToday.map((item, idx) => (
                    <li key={idx} className="py-1 border-b border-border/60 last:border-0">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INVENTORY, SEASONAL FORECAST, EXPIRY, DEAD STOCK, DUPLICATES, ENRICHMENT & SMART STOCKTAKE */}
      {activeTab === 'inventory' && canSeeInventory && (
        <div className="space-y-6">
          {/* Smart Shelf Photo Stocktake */}
          <div className="card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-primary">Smart Shelf Photo Stocktake</h2>
                <p className="text-sm text-text-muted">
                  Photograph a shelf to count items vs recorded stock. Nothing updates until you review and approve.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={stocktakeFileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleShelfPhotoUpload}
                />
                <button
                  type="button"
                  disabled={stocktakeLoading}
                  onClick={() => stocktakeFileRef.current?.click()}
                  className="btn btn-primary text-xs sm:text-sm gap-2 whitespace-nowrap shrink-0"
                >
                  <Camera size={16} />
                  {stocktakeLoading ? 'Counting Shelf...' : 'Upload Shelf Photo'}
                </button>
              </div>
            </div>

            {stocktakeItems.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-border">
                {stocktakeNotes && (
                  <p className="text-xs text-text-secondary bg-surface-alt px-3 py-2 rounded-lg border border-border">
                    AI Observation: {stocktakeNotes}
                  </p>
                )}
                {/* Mobile Stocktake Cards */}
                <div className="md:hidden divide-y divide-border border border-border rounded-xl">
                  {stocktakeItems.map((item, idx) => {
                    const variance = item.editedCount - item.systemQty;
                    return (
                      <div key={`mob-${item.productId || item.productName}-${idx}`} className="p-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-primary text-sm">{item.productName}</p>
                            {!item.productId && (
                              <p className="text-[11px] text-danger">No exact catalog match (skipped)</p>
                            )}
                          </div>
                          <span
                            className={cn(
                              'font-mono tabular-nums font-bold text-xs shrink-0 px-2 py-0.5 rounded bg-surface-alt',
                              variance < 0 ? 'text-danger' : variance > 0 ? 'text-accent' : 'text-text-muted'
                            )}
                          >
                            Var: {variance > 0 ? `+${variance}` : variance}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs pt-1">
                          <div>
                            <span className="text-text-muted">System: </span>
                            <span className="font-mono tabular-nums font-semibold text-primary">{item.systemQty}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-text-muted">Count:</label>
                            <input
                              type="number"
                              min={0}
                              value={item.editedCount}
                              onChange={(e) => {
                                const v = Math.max(0, Number(e.target.value) || 0);
                                setStocktakeItems((prev) =>
                                  prev.map((row, rIdx) =>
                                    rIdx === idx ? { ...row, editedCount: v } : row
                                  )
                                );
                              }}
                              className="input-sm w-20 text-right font-mono tabular-nums"
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-text-secondary">
                          {item.confidence.toUpperCase()} — {item.notes}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Stocktake Table */}
                <div className="hidden md:block overflow-x-auto border border-border rounded-xl">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead className="bg-surface-alt/70 border-b border-border text-xs font-bold text-text-muted uppercase">
                      <tr>
                        <th className="px-4 py-3">Matched Product</th>
                        <th className="px-4 py-3 text-right">System Stock</th>
                        <th className="px-4 py-3 text-right">Approved Count</th>
                        <th className="px-4 py-3 text-right">Variance</th>
                        <th className="px-4 py-3">Confidence &amp; Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stocktakeItems.map((item, idx) => {
                        const variance = item.editedCount - item.systemQty;
                        return (
                          <tr key={`${item.productId || item.productName}-${idx}`}>
                            <td className="px-4 py-3">
                              <p className="font-bold text-primary">{item.productName}</p>
                              {!item.productId && (
                                <p className="text-[11px] text-danger">No exact catalog match (skipped)</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                              {item.systemQty}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                value={item.editedCount}
                                onChange={(e) => {
                                  const v = Math.max(0, Number(e.target.value) || 0);
                                  setStocktakeItems((prev) =>
                                    prev.map((row, rIdx) =>
                                      rIdx === idx ? { ...row, editedCount: v } : row
                                    )
                                  );
                                }}
                                className="input-sm w-20 text-right font-mono tabular-nums inline-block"
                              />
                            </td>
                            <td
                              className={cn(
                                'px-4 py-3 text-right font-mono tabular-nums font-bold',
                                variance < 0 ? 'text-danger' : variance > 0 ? 'text-accent' : 'text-text-muted'
                              )}
                            >
                              {variance > 0 ? `+${variance}` : variance}
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary">
                              {item.confidence.toUpperCase()} — {item.notes}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setStocktakeItems([])}
                    className="btn btn-secondary text-xs"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    disabled={stocktakeApplying}
                    onClick={handleApplyApprovedStocktake}
                    className="btn btn-primary text-xs gap-1.5 whitespace-nowrap"
                  >
                    <CheckCircle2 size={15} />
                    {stocktakeApplying ? 'Posting...' : 'Approve & Post Adjustments'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Seasonal Demand Forecast & Reorder Plan */}
          <TierGate feature="aiRestockAndMargin">
            <div className="card p-0 overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-alt/50">
                <div>
                  <h2 className="text-lg font-bold text-primary">
                    Seasonal Demand &amp; Reorder Suggestions
                  </h2>
                  <p className="text-xs text-text-muted mt-0.5">
                    {demandPlan.seasonal.reason} Estimated cash buffer:{' '}
                    <strong className="text-primary font-mono tabular-nums">
                      {formatUGX(demandPlan.estimatedCashBufferUgx)}
                    </strong>{' '}
                    vs proposed PO spend{' '}
                    <strong className="text-primary font-mono tabular-nums">
                      {formatUGX(demandPlan.totalSuggestedSpendUgx)}
                    </strong>
                    .
                  </p>
                </div>
                {demandPlan.reorderPlan.some((r) => !r.expiryBlocked && r.suggestedOrderQty > 0) && (
                  <button
                    type="button"
                    onClick={() => handleDraftPoFromPlan(demandPlan.reorderPlan)}
                    className="btn btn-primary text-xs gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <ShoppingBag size={15} />
                    Draft PO for Eligible Items
                  </button>
                )}
              </div>

              {demandPlan.reorderPlan.length === 0 ? (
                <div className="p-10 text-center text-sm text-text-muted">
                  All active products have healthy stock cover for the next 14 days.
                </div>
              ) : (
                <>
                  {/* Mobile Demand & Reorder Cards */}
                  <div className="md:hidden divide-y divide-border">
                    {demandPlan.reorderPlan.slice(0, 20).map((item) => (
                      <div key={`mob-${item.productId}`} className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-primary text-sm">{item.productName}</p>
                          <span
                            className={cn(
                              'text-[11px] font-bold uppercase shrink-0',
                              item.urgency === 'critical' || item.urgency === 'blocked_expiry'
                                ? 'text-danger'
                                : item.urgency === 'soon'
                                ? 'text-accent-alt'
                                : 'text-accent'
                            )}
                          >
                            {item.urgency === 'blocked_expiry' ? 'HOLD REORDER' : item.urgency}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-[11px] text-text-muted">Stock / Cover</p>
                            <p className="font-mono tabular-nums font-medium text-primary">
                              {item.currentStock} {item.unit} · {item.estimatedDaysLeft}d
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-text-muted">Next 30d Demand</p>
                            <p className="font-mono tabular-nums font-medium text-primary">
                              {item.projectedNext30dUnits} {item.unit}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-text-secondary">{item.reason}</p>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-xs font-mono tabular-nums font-bold text-primary">
                            {item.expiryBlocked ? (
                              <span className="text-danger">Order: 0 (Blocked)</span>
                            ) : (
                              <>Order {item.suggestedOrderQty} · {formatUGX(item.estimatedCostUgx)}</>
                            )}
                          </span>
                          {!item.expiryBlocked && (
                            <button
                              type="button"
                              onClick={() => handleDraftPoFromPlan([item])}
                              className="text-xs font-bold text-accent hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              Draft PO <ArrowRight size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Demand & Reorder Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[820px] text-sm">
                      <thead>
                        <tr className="bg-surface-alt/50 border-b border-border text-xs font-bold text-text-muted uppercase">
                          <th className="px-5 py-3">Product</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3 text-right">Stock / Cover</th>
                          <th className="px-5 py-3 text-right">Next 30d Demand</th>
                          <th className="px-5 py-3 text-right">Order Qty / Cost</th>
                          <th className="px-5 py-3">Reason</th>
                          <th className="px-5 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {demandPlan.reorderPlan.slice(0, 20).map((item) => (
                          <tr key={item.productId} className="hover:bg-surface-alt/30">
                            <td className="px-5 py-3.5 font-bold text-primary">{item.productName}</td>
                            <td className="px-5 py-3.5">
                              <span
                                className={cn(
                                  'text-xs font-bold uppercase',
                                  item.urgency === 'critical' || item.urgency === 'blocked_expiry'
                                    ? 'text-danger'
                                    : item.urgency === 'soon'
                                    ? 'text-accent-alt'
                                    : 'text-accent'
                                )}
                              >
                                {item.urgency === 'blocked_expiry' ? 'HOLD REORDER' : item.urgency}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                              {item.currentStock} {item.unit} · {item.estimatedDaysLeft}d
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                              {item.projectedNext30dUnits} {item.unit}
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono tabular-nums font-bold">
                              {item.expiryBlocked ? (
                                <span className="text-danger">0 (Blocked)</span>
                              ) : (
                                <>
                                  {item.suggestedOrderQty} · {formatUGX(item.estimatedCostUgx)}
                                </>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-xs text-text-secondary max-w-sm">
                              {item.reason}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {!item.expiryBlocked && (
                                <button
                                  type="button"
                                  onClick={() => handleDraftPoFromPlan([item])}
                                  className="text-xs font-bold text-accent hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  Draft PO <ArrowRight size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </TierGate>

          {/* Expiry Clearance + 60-Day Dead Stock + Promo Break-Even */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-primary">Expiry Clearance Alerts</h3>
                <span className="text-xs font-mono tabular-nums text-text-muted">
                  {demandPlan.expiryClearance.length} batch(es)
                </span>
              </div>
              {demandPlan.expiryClearance.length === 0 ? (
                <p className="text-sm text-text-muted py-4">No stocked items expiring within 45 days.</p>
              ) : (
                <div className="divide-y divide-border max-h-80 overflow-y-auto">
                  {demandPlan.expiryClearance.map((exp) => (
                    <div key={exp.productId} className="py-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-primary">{exp.productName}</p>
                        <span className="text-xs font-bold font-mono text-danger whitespace-nowrap">
                          {exp.daysToExpiry <= 0 ? 'EXPIRED' : `${exp.daysToExpiry}d left`}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary">{exp.reason}</p>
                      <p className="text-xs font-semibold text-accent font-mono tabular-nums">
                        Suggested Clearance: {formatUGX(exp.suggestedClearancePriceUgx)} (-{exp.suggestedMarkdownPct}%)
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-primary">60-Day Dead &amp; Slow Stock</h3>
                <span className="text-xs font-bold font-mono tabular-nums text-danger">
                  {formatUGX(deadStock.totalCapitalTiedUgx)} tied
                </span>
              </div>
              {deadStock.items.length === 0 ? (
                <p className="text-sm text-text-muted py-4">No products with 0 sales in 60 days.</p>
              ) : (
                <div className="divide-y divide-border max-h-80 overflow-y-auto">
                  {deadStock.items.slice(0, 10).map((ds) => (
                    <div key={ds.productId} className="py-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-primary">{ds.productName}</p>
                        <span className="text-xs font-bold uppercase text-accent-alt whitespace-nowrap">
                          {ds.recommendationType.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary">{ds.reason}</p>
                      <p className="text-xs font-mono tabular-nums text-primary">
                        Suggested markdown floor: <strong>{formatUGX(ds.suggestedMarkdownPriceUgx)}</strong>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Discount Payoff Simulator */}
          {promoEval && (
            <div className="card space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-primary">Promotion Break-Even Calculator</h3>
                  <p className="text-xs text-text-muted">
                    Checks whether a discount pays off based on actual cost price and monthly volume.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
                  <select
                    aria-label="Select product for promo simulation"
                    className="input-sm w-full sm:w-auto max-w-full"
                    value={promoEval.product.id}
                    onChange={(e) => setPromoProductId(e.target.value)}
                  >
                    {products
                      .filter((p) => p.sellingPrice > 0 && p.buyingPrice > 0)
                      .slice(0, 50)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({formatUGX(p.sellingPrice)})
                        </option>
                      ))}
                  </select>
                  <div className="flex items-center gap-1.5 text-xs shrink-0">
                    <span className="font-semibold text-text-secondary">Discount %</span>
                    <input
                      type="number"
                      min={1}
                      max={80}
                      value={promoDiscountPct}
                      onChange={(e) =>
                        setPromoDiscountPct(Math.min(80, Math.max(1, Number(e.target.value) || 5)))
                      }
                      className="input-sm w-16 text-center font-mono tabular-nums"
                    />
                  </div>
                </div>
              </div>
              <div
                className={cn(
                  'p-3.5 rounded-xl border text-xs font-medium',
                  promoEval.viable
                    ? 'bg-accent/5 border-accent/30 text-primary'
                    : 'bg-danger/5 border-danger/30 text-danger'
                )}
              >
                {promoEval.reason}
              </div>
            </div>
          )}

          {/* Shrinkage Discrepancies & Near-Duplicate Product Merger */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card space-y-3">
              <h3 className="font-bold text-primary">Stock Discrepancy &amp; Shrinkage Detection</h3>
              {discrepancyBundle.discrepancies.length === 0 ? (
                <p className="text-sm text-text-muted py-3">
                  No negative stock-take or loss discrepancies in the last 30 days.
                </p>
              ) : (
                <div className="divide-y divide-border max-h-72 overflow-y-auto">
                  {discrepancyBundle.discrepancies.map((d) => (
                    <div key={d.productId} className="py-2.5 space-y-1">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-bold text-primary">{d.productName}</span>
                        <span className="font-mono tabular-nums font-bold text-danger">
                          -{d.shrinkageUnits30d} units
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary">{d.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-primary">Near-Duplicate SKU Merger</h3>
                <span className="text-xs text-text-muted">Human confirmation required</span>
              </div>
              {discrepancyBundle.duplicates.length === 0 ? (
                <p className="text-sm text-text-muted py-3">No near-duplicate product names detected.</p>
              ) : (
                <div className="divide-y divide-border max-h-72 overflow-y-auto">
                  {discrepancyBundle.duplicates.map((pair) => {
                    const key = `${pair.primaryId}_${pair.duplicateId}`;
                    return (
                      <div key={key} className="py-3 space-y-2">
                        <p className="text-xs text-text-secondary">{pair.reason}</p>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono tabular-nums text-primary font-semibold">
                            Combined stock: {pair.combinedStock}
                          </span>
                          <button
                            type="button"
                            disabled={mergingPairKey === key}
                            onClick={() => handleMergeDuplicates(pair)}
                            className="btn btn-secondary text-xs py-1.5 px-3 gap-1 whitespace-nowrap"
                          >
                            <GitMerge size={13} />
                            {mergingPairKey === key ? 'Merging...' : 'Merge & Archive Duplicate'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Batch Product Enrichment */}
          <div className="card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-primary">
                  Catalog Enrichment ({discrepancyBundle.enrichmentCandidates.length} uncategorized / missing SKU)
                </h3>
                <p className="text-xs text-text-muted">
                  Standardize product names, assign categories, and generate SKUs for review before saving.
                </p>
              </div>
              <button
                type="button"
                disabled={enrichLoading || discrepancyBundle.enrichmentCandidates.length === 0}
                onClick={handleGenerateEnrichments}
                className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap shrink-0"
              >
                <Wand2 size={15} className="text-accent" />
                {enrichLoading ? 'Drafting Suggestions...' : 'Suggest Clean Categories & SKUs'}
              </button>
            </div>

            {enrichSuggestions.length > 0 && (
              <div className="space-y-3">
                {/* Mobile Enrichment Cards */}
                <div className="md:hidden divide-y divide-border border border-border rounded-xl">
                  {enrichSuggestions.map((s) => (
                    <label key={`mob-${s.productId || s.originalName}`} className="flex items-start gap-3 p-3.5 text-xs cursor-pointer">
                      {s.productId && (
                        <input
                          type="checkbox"
                          className="mt-0.5 shrink-0"
                          checked={Boolean(selectedEnrichIds[s.productId])}
                          onChange={(e) =>
                            setSelectedEnrichIds((prev) => ({
                              ...prev,
                              [s.productId!]: e.target.checked,
                            }))
                          }
                        />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-bold text-primary">{s.standardizedName}</p>
                        <p className="text-text-muted">Was: {s.originalName}</p>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-surface-alt border border-border font-semibold text-primary">
                            {s.suggestedCategory}
                          </span>
                          <span className="font-mono text-text-secondary">{s.suggestedSku}</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Desktop Enrichment Table */}
                <div className="hidden md:block overflow-x-auto border border-border rounded-xl">
                  <table className="w-full text-left border-collapse min-w-[600px] text-xs">
                    <thead className="bg-surface-alt/70 border-b border-border uppercase text-text-muted">
                      <tr>
                        <th className="px-3 py-2.5">Apply</th>
                        <th className="px-3 py-2.5">Current Name</th>
                        <th className="px-3 py-2.5">Standardized Name</th>
                        <th className="px-3 py-2.5">Category</th>
                        <th className="px-3 py-2.5">SKU</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {enrichSuggestions.map((s) => (
                        <tr key={s.productId || s.originalName}>
                          <td className="px-3 py-2.5">
                            {s.productId && (
                              <input
                                type="checkbox"
                                checked={Boolean(selectedEnrichIds[s.productId])}
                                onChange={(e) =>
                                  setSelectedEnrichIds((prev) => ({
                                    ...prev,
                                    [s.productId!]: e.target.checked,
                                  }))
                                }
                              />
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-text-muted">{s.originalName}</td>
                          <td className="px-3 py-2.5 font-bold text-primary">{s.standardizedName}</td>
                          <td className="px-3 py-2.5">{s.suggestedCategory}</td>
                          <td className="px-3 py-2.5 font-mono">{s.suggestedSku}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEnrichSuggestions([])}
                    className="btn btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyEnrichments}
                    className="btn btn-primary text-xs gap-1.5 whitespace-nowrap"
                  >
                    <CheckCircle2 size={14} />
                    Apply Selected Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SALES, MOMO SMS MATCHER, ANOMALIES & WHATSAPP */}
      {activeTab === 'sales' && canSeeSales && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Natural Language / Voice Order Drafter */}
            <div className="card space-y-4">
              <div>
                <h3 className="font-bold text-primary">Natural-Language Order Drafter</h3>
                <p className="text-xs text-text-muted">
                  Type or dictate a customer order (e.g. &ldquo;3 bags cement and 2 jerrycans oil for Sarah&rdquo;), preview matches, then load into POS.
                </p>
              </div>
              <form onSubmit={handleParseNlOrder} className="space-y-3">
                <div className="flex flex-wrap sm:flex-nowrap gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => startVoiceDictation((t) => setNlOrderText(t))}
                      className="btn btn-secondary px-3 shrink-0"
                      title="Dictate order"
                    >
                      <Mic size={16} />
                    </button>
                    <input
                      type="text"
                      className="input min-w-0 flex-1 text-sm"
                      placeholder="e.g. 5 sodas, 2 loaves bread for Walk-in"
                      value={nlOrderText}
                      onChange={(e) => setNlOrderText(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={nlOrderLoading || !nlOrderText.trim()}
                    className="btn btn-primary text-xs whitespace-nowrap shrink-0 w-full sm:w-auto"
                  >
                    {nlOrderLoading ? 'Parsing...' : 'Draft Order'}
                  </button>
                </div>
              </form>

              {nlOrderDraft && (
                <div className="p-4 bg-surface-alt rounded-xl border border-border space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-primary">
                      Customer: {nlOrderDraft.matchedCustomerName || 'Walk-in'}
                      {nlOrderDraft.paymentMethod ? ` · ${nlOrderDraft.paymentMethod}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate('/pos', { state: { aiOrderDraft: nlOrderDraft } })}
                      className="btn btn-primary text-xs py-1.5 px-3 gap-1 whitespace-nowrap"
                    >
                      Open Draft in POS <ArrowRight size={13} />
                    </button>
                  </div>
                  {(nlOrderDraft.items || []).length === 0 ? (
                    <p className="text-danger">No catalog items matched.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {nlOrderDraft.items.map((it, idx) => (
                        <li key={idx} className="py-1.5 flex justify-between">
                          <span className="font-medium text-primary">
                            {it.quantity} × {it.productName}
                          </span>
                          <span className="text-text-muted">{it.confidence}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {nlOrderDraft.reason && (
                    <p className="text-text-secondary">{nlOrderDraft.reason}</p>
                  )}
                </div>
              )}
            </div>

            {/* MTN MoMo / Airtel Money SMS Reconciler */}
            <div className="card space-y-4">
              <div className="flex items-center gap-2">
                <Smartphone size={18} className="text-accent" />
                <div>
                  <h3 className="font-bold text-primary">MTN MoMo / Airtel SMS Matcher</h3>
                  <p className="text-xs text-text-muted">
                    Paste a confirmation SMS to match an unpaid POS invoice or customer credit balance. You confirm before any payment settles.
                  </p>
                </div>
              </div>
              <form onSubmit={handleMatchMomoSms} className="space-y-2.5">
                <textarea
                  rows={3}
                  className="input w-full text-xs"
                  placeholder="Paste SMS e.g. 'Yello! You have received UGX 125,000 from GRACE NAMUKASA 0772123456. Tx ID: MP260401.1422'"
                  value={momoSms}
                  onChange={(e) => setMomoSms(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={momoLoading || !momoSms.trim()}
                  className="btn btn-primary text-xs w-full sm:w-auto"
                >
                  {momoLoading ? 'Matching SMS...' : 'Find Matching Invoice / Debt'}
                </button>
              </form>

              {momoMatch && (
                <div className="p-4 bg-surface-alt rounded-xl border border-border space-y-2.5 text-xs">
                  <div className="flex justify-between font-bold text-primary">
                    <span>
                      {momoMatch.provider} · {momoMatch.txId || 'No Tx ID'}
                    </span>
                    <span className="font-mono tabular-nums text-accent">
                      {formatUGX(momoMatch.amountUgx)}
                    </span>
                  </div>
                  <p className="text-text-secondary">{momoMatch.reason}</p>
                  {momoMatch.matchType !== 'unmatched' && momoMatch.matchedId && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={momoApplying}
                        onClick={handleConfirmMomoReconcile}
                        className="btn btn-primary text-xs py-1.5 px-3 gap-1.5 whitespace-nowrap"
                      >
                        <CheckCircle2 size={14} />
                        {momoApplying
                          ? 'Settling...'
                          : momoMatch.matchType === 'pending_sale'
                          ? `Confirm Settle ${momoMatch.matchedLabel}`
                          : `Confirm Credit Repayment (${momoMatch.matchedLabel})`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* WhatsApp Customer Inquiry Assistant + Sales Anomaly Flags */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card space-y-3">
              <h3 className="font-bold text-primary">WhatsApp Inquiry &amp; Order Reply Assistant</h3>
              <form onSubmit={handleDraftWhatsappReply} className="space-y-2.5">
                <textarea
                  rows={3}
                  className="input w-full text-xs"
                  placeholder="Paste customer's WhatsApp message asking for stock, price, or delivery..."
                  value={waInquiry}
                  onChange={(e) => setWaInquiry(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={waLoading || !waInquiry.trim()}
                  className="btn btn-secondary text-xs gap-1.5"
                >
                  <MessageCircle size={14} className="text-accent" />
                  {waLoading ? 'Drafting Reply...' : `Draft Reply (${language.toUpperCase()})`}
                </button>
              </form>
              {waReplyDraft && (
                <div className="p-3.5 bg-surface-alt rounded-xl border border-border space-y-2 text-xs">
                  <p className="text-primary whitespace-pre-wrap">{waReplyDraft.replyText}</p>
                  {waReplyDraft.referencedProducts?.length > 0 && (
                    <p className="text-text-muted">
                      Checked live catalog:{' '}
                      {waReplyDraft.referencedProducts
                        .map(
                          (p) =>
                            `${p.productName} (${formatUGX(p.priceUgx)}, ${p.inStock} in stock)`
                        )
                        .join(' · ')}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(waReplyDraft.replyText);
                      toast.success('Copied reply');
                    }}
                    className="btn btn-secondary text-xs py-1 px-2.5"
                  >
                    Copy Reply
                  </button>
                </div>
              )}
            </div>

            <div className="card space-y-3">
              <h3 className="font-bold text-primary">Discount, Void &amp; Cashier Anomaly Alerts</h3>
              {salesAnomalies.length === 0 ? (
                <p className="text-sm text-text-muted py-4">
                  No unusual discounts (&gt;15%), large voids, or refund spikes in the last 30 days.
                </p>
              ) : (
                <div className="divide-y divide-border max-h-72 overflow-y-auto">
                  {salesAnomalies.map((flag) => (
                    <div key={flag.id} className="py-2.5 space-y-1">
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="font-bold text-primary">
                          {flag.reference} · {flag.actorName}
                        </span>
                        <span
                          className={cn(
                            'font-bold uppercase',
                            flag.severity === 'high' ? 'text-danger' : 'text-accent-alt'
                          )}
                        >
                          {flag.type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary">{flag.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Customer Credit Risk & Win-Back Queue */}
          <div className="card p-0 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border bg-surface-alt/50">
              <h3 className="font-bold text-primary">Customer Credit Risk, Segments &amp; Win-Back</h3>
              <p className="text-xs text-text-muted">
                Risk scored from credit utilization, repayment history, and purchase recency.
              </p>
            </div>
            {/* Mobile Customer Risk Cards */}
            <div className="md:hidden divide-y divide-border">
              {customerInsights.slice(0, 15).map((c) => {
                const draft = debtDrafts[c.customerId];
                return (
                  <div key={`mob-${c.customerId}`} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-primary text-sm">{c.customerName}</p>
                        <p className="text-xs text-text-muted">{c.phone}</p>
                      </div>
                      <span className="font-mono tabular-nums font-bold text-sm text-primary shrink-0">
                        {formatUGX(c.currentBalance)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-primary">{c.segment}</span>
                      <span className="text-text-muted">·</span>
                      <span
                        className={cn(
                          'font-bold uppercase',
                          c.riskTier === 'high'
                            ? 'text-danger'
                            : c.riskTier === 'watch'
                            ? 'text-accent-alt'
                            : 'text-accent'
                        )}
                      >
                        {c.riskTier} risk ({c.riskScore}/100)
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary">{c.reason}</p>
                    <div className="flex items-center justify-end pt-1">
                      {c.currentBalance > 0 ? (
                        <button
                          type="button"
                          disabled={debtLoadingId === c.customerId}
                          onClick={() =>
                            handleDraftDebtMessage(
                              c.customerId,
                              c.customerName,
                              c.currentBalance,
                              c.suggestedTone
                            )
                          }
                          className="btn btn-secondary text-xs py-1.5 px-3 whitespace-nowrap"
                        >
                          {debtLoadingId === c.customerId
                            ? 'Drafting...'
                            : `Draft ${c.suggestedTone} reminder`}
                        </button>
                      ) : c.segment === 'Quiet Win-Back' ? (
                        <a
                          href={buildDebtWhatsAppUrl(
                            c.phone,
                            `Hello ${c.customerName}, we miss seeing you at ${tenant?.name || 'our shop'}! Let us know if you need any restock delivered this week.`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-accent hover:underline whitespace-nowrap"
                        >
                          Send Win-Back →
                        </a>
                      ) : null}
                    </div>
                    {draft && (
                      <div className="p-3 bg-surface-alt rounded-xl border border-border space-y-2">
                        <p className="text-xs text-primary">{draft}</p>
                        <a
                          href={buildDebtWhatsAppUrl(c.phone, draft)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary text-xs py-1.5 px-3 gap-1.5 w-full"
                        >
                          <MessageCircle size={13} />
                          Open WhatsApp
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Customer Risk Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[780px] text-xs sm:text-sm">
                <thead className="bg-surface-alt/50 border-b border-border text-xs font-bold text-text-muted uppercase">
                  <tr>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Segment &amp; Risk</th>
                    <th className="px-5 py-3 text-right">Balance</th>
                    <th className="px-5 py-3">Reason</th>
                    <th className="px-5 py-3 text-right">WhatsApp Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customerInsights.slice(0, 15).map((c) => {
                    const draft = debtDrafts[c.customerId];
                    return (
                      <React.Fragment key={c.customerId}>
                        <tr className="hover:bg-surface-alt/30">
                          <td className="px-5 py-3">
                            <p className="font-bold text-primary">{c.customerName}</p>
                            <p className="text-xs text-text-muted">{c.phone}</p>
                          </td>
                          <td className="px-5 py-3">
                            <p className="font-semibold text-primary text-xs">{c.segment}</p>
                            <p
                              className={cn(
                                'text-xs font-bold uppercase',
                                c.riskTier === 'high'
                                  ? 'text-danger'
                                  : c.riskTier === 'watch'
                                  ? 'text-accent-alt'
                                  : 'text-accent'
                              )}
                            >
                              {c.riskTier} risk ({c.riskScore}/100)
                            </p>
                          </td>
                          <td className="px-5 py-3 text-right font-mono tabular-nums font-bold">
                            {formatUGX(c.currentBalance)}
                          </td>
                          <td className="px-5 py-3 text-xs text-text-secondary max-w-xs">{c.reason}</td>
                          <td className="px-5 py-3 text-right">
                            {c.currentBalance > 0 ? (
                              <button
                                type="button"
                                disabled={debtLoadingId === c.customerId}
                                onClick={() =>
                                  handleDraftDebtMessage(
                                    c.customerId,
                                    c.customerName,
                                    c.currentBalance,
                                    c.suggestedTone
                                  )
                                }
                                className="btn btn-secondary text-xs py-1 px-2.5 whitespace-nowrap"
                              >
                                {debtLoadingId === c.customerId
                                  ? 'Drafting...'
                                  : `Draft ${c.suggestedTone} reminder`}
                              </button>
                            ) : c.segment === 'Quiet Win-Back' ? (
                              <a
                                href={buildDebtWhatsAppUrl(
                                  c.phone,
                                  `Hello ${c.customerName}, we miss seeing you at ${tenant?.name || 'our shop'}! Let us know if you need any restock delivered this week.`
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-bold text-accent hover:underline whitespace-nowrap"
                              >
                                Send Win-Back →
                              </a>
                            ) : (
                              <span className="text-xs text-text-muted">—</span>
                            )}
                          </td>
                        </tr>
                        {draft && (
                          <tr className="bg-surface-alt/50">
                            <td colSpan={5} className="px-5 py-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <p className="text-xs text-primary flex-1">{draft}</p>
                                <a
                                  href={buildDebtWhatsAppUrl(c.phone, draft)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-primary text-xs py-1.5 px-3 gap-1.5 whitespace-nowrap shrink-0"
                                >
                                  <MessageCircle size={13} />
                                  Open WhatsApp
                                </a>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FINANCE, SUPPLIERS, INVOICE CHECK, SECURITY & GUIDED SETUP */}
      {activeTab === 'finance' && canSeeFinance && (
        <div className="space-y-6">
          {/* 30-Day Cashflow Forecast & EFRIS / URA Readiness */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-primary">30-Day Cashflow &amp; Expense Watch</h3>
                  <p className="text-xs text-text-muted">{financeInsights.reason}</p>
                </div>
                <DollarSign size={20} className="text-accent shrink-0" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-surface-alt border border-border">
                  <p className="text-xs text-text-muted">Projected 30d Inflow</p>
                  <p className="text-base font-bold font-mono tabular-nums text-primary mt-0.5">
                    {formatUGX(financeInsights.projected30dInflowUgx)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-surface-alt border border-border">
                  <p className="text-xs text-text-muted">Projected 30d Outflow</p>
                  <p className="text-base font-bold font-mono tabular-nums text-danger mt-0.5">
                    {formatUGX(financeInsights.projected30dOutflowUgx)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-surface-alt border border-border">
                  <p className="text-xs text-text-muted">Projected Net Cash</p>
                  <p
                    className={cn(
                      'text-base font-bold font-mono tabular-nums mt-0.5',
                      financeInsights.projected30dNetUgx >= 0 ? 'text-accent' : 'text-danger'
                    )}
                  >
                    {formatUGX(financeInsights.projected30dNetUgx)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-text-secondary">
                Top Revenue SKU: <strong>{financeInsights.topRevenueProduct}</strong> · Top Expense Driver:{' '}
                <strong>{financeInsights.topExpenseDriver}</strong>
              </p>

              {financeInsights.expenseAnomalies.length > 0 && (
                <div className="pt-2 border-t border-border space-y-1.5">
                  <p className="text-xs font-bold uppercase text-danger">Duplicate / Spike Expense Alerts</p>
                  {financeInsights.expenseAnomalies.slice(0, 4).map((ex) => (
                    <p key={ex.expenseId} className="text-xs text-text-secondary">
                      • <strong>{ex.description}</strong> ({formatDate(ex.date)}): {ex.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="card space-y-3">
              <h3 className="font-bold text-primary">URA &amp; EFRIS Compliance Flags</h3>
              {financeInsights.efrisFlags.length === 0 ? (
                <p className="text-xs text-accent font-semibold py-2">
                  TIN and tax receipt checks look clean for this workspace.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {financeInsights.efrisFlags.map((f) => (
                    <div key={f.code} className="p-3 rounded-xl bg-surface-alt border border-border text-xs space-y-1">
                      <p className={cn('font-bold', f.severity === 'warning' ? 'text-danger' : 'text-primary')}>
                        {f.title}
                      </p>
                      <p className="text-text-secondary">{f.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Thin Margin & Loss-Making SKUs */}
          {marginAlerts.length > 0 && (
            <div className="card space-y-3">
              <h3 className="font-bold text-primary">Thin &amp; Negative Margin SKUs (&le;10%)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {marginAlerts.slice(0, 6).map((m) => (
                  <div key={m.productId} className="p-3 rounded-xl bg-surface-alt border border-border text-xs space-y-1">
                    <div className="flex justify-between font-bold text-primary">
                      <span>{m.productName}</span>
                      <span className={m.marginPercent <= 0 ? 'text-danger' : 'text-accent-alt'}>
                        {m.marginPercent}% margin
                      </span>
                    </div>
                    <p className="text-text-secondary">{m.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supplier Comparison & Reliability Scoring */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card space-y-3">
              <h3 className="font-bold text-primary">Supplier Price Comparison</h3>
              {supplierAnalytics.priceComparisons.length === 0 ? (
                <p className="text-xs text-text-muted py-3">
                  Record POs from at least two suppliers for the same SKU to unlock cost comparison.
                </p>
              ) : (
                <div className="divide-y divide-border max-h-72 overflow-y-auto">
                  {supplierAnalytics.priceComparisons.slice(0, 8).map((row) => (
                    <div key={row.productName} className="py-2.5 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-primary">{row.productName}</span>
                        <span className="font-bold text-accent">Save ~{row.potentialSavingsPct}%</span>
                      </div>
                      <p className="text-xs text-text-secondary">{row.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card space-y-3">
              <h3 className="font-bold text-primary">Supplier Reliability &amp; Negotiation Hooks</h3>
              {supplierAnalytics.reliabilityRows.length === 0 ? (
                <p className="text-xs text-text-muted py-3">No suppliers recorded yet.</p>
              ) : (
                <div className="divide-y divide-border max-h-72 overflow-y-auto">
                  {supplierAnalytics.reliabilityRows.slice(0, 8).map((sup) => (
                    <div key={sup.supplierId} className="py-2.5 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-primary">{sup.supplierName}</span>
                        <span className="font-mono font-bold text-primary">
                          Score: {sup.reliabilityScore}/100
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary">{sup.reason}</p>
                      <p className="text-xs text-accent font-medium">{sup.negotiationHook}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Invoice vs Purchase Order Checker & Security Digest */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card space-y-3">
              <div className="flex items-center gap-2">
                <FileCheck2 size={18} className="text-accent" />
                <div>
                  <h3 className="font-bold text-primary">Invoice vs PO Discrepancy Checker</h3>
                  <p className="text-xs text-text-muted">
                    Compare a supplier invoice against your issued PO to spot short deliveries or unit-cost overcharges.
                  </p>
                </div>
              </div>
              <select
                aria-label="Select purchase order"
                className="input w-full text-xs"
                value={checkPoId}
                onChange={(e) => setCheckPoId(e.target.value)}
              >
                <option value="">Select Purchase Order...</option>
                {purchaseOrders.slice(0, 30).map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.reference} · {po.supplierName} ({formatUGX(po.totalAmount)})
                  </option>
                ))}
              </select>
              <textarea
                rows={3}
                className="input w-full text-xs"
                placeholder="Paste supplier invoice lines/totals, OR upload a photo below..."
                value={invoiceText}
                onChange={(e) => setInvoiceText(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={invoiceFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const b = await fileToBase64(file);
                    void runInvoiceDiscrepancyCheck(b);
                    if (invoiceFileRef.current) invoiceFileRef.current.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={invoiceCheckLoading || !checkPoId}
                  onClick={() => runInvoiceDiscrepancyCheck()}
                  className="btn btn-primary text-xs"
                >
                  {invoiceCheckLoading ? 'Checking...' : 'Compare Text vs PO'}
                </button>
                <button
                  type="button"
                  disabled={invoiceCheckLoading || !checkPoId}
                  onClick={() => invoiceFileRef.current?.click()}
                  className="btn btn-secondary text-xs gap-1.5"
                >
                  <Camera size={14} />
                  Upload Invoice Photo
                </button>
              </div>
              {invoiceCheckResult && (() => {
                const discrepancies = invoiceCheckResult.discrepancies || [];
                const flaggedCount = discrepancies.filter((d) => d.status !== 'matched').length;
                const totalVarianceUgx = discrepancies.reduce(
                  (sum, d) =>
                    sum +
                    ((Number(d.invoiceQty) || 0) * (Number(d.invoiceUnitCostUgx) || 0) -
                      (Number(d.poQty) || 0) * (Number(d.poUnitCostUgx) || 0)),
                  0
                );
                return (
                  <div className="p-3.5 rounded-xl bg-surface-alt border border-border text-xs space-y-2">
                    <div className="flex justify-between font-bold text-primary">
                      <span>
                        Verdict: {flaggedCount === 0 ? 'MATCHED' : `${flaggedCount} ISSUE(S) FLAGGED`}
                      </span>
                      <span className="font-mono tabular-nums">
                        Variance: {totalVarianceUgx > 0 ? '+' : ''}
                        {formatUGX(totalVarianceUgx)}
                      </span>
                    </div>
                    <p className="text-text-secondary">{invoiceCheckResult.summary}</p>
                    {discrepancies.map((d, idx) => (
                      <p
                        key={idx}
                        className={d.status === 'matched' ? 'text-accent' : 'text-danger'}
                      >
                        • <strong>{d.itemName}</strong> ({d.status.replace(/_/g, ' ')}): {d.reason}
                      </p>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="card space-y-3">
              <h3 className="font-bold text-primary">After-Hours &amp; Loss Audit Digest</h3>
              <p className="text-xs text-text-muted">{securityDigest.reason}</p>
              {securityDigest.afterHoursItems.length === 0 ? (
                <p className="text-sm text-accent font-medium py-3">
                  No after-hours POS checkouts (21:00–06:00) or Theft/Loss adjustments flagged in 14d.
                </p>
              ) : (
                <div className="divide-y divide-border max-h-60 overflow-y-auto">
                  {securityDigest.afterHoursItems.map((ev) => (
                    <div key={ev.id} className="py-2 text-xs">
                      <div className="flex justify-between font-bold text-primary">
                        <span>{ev.actorName}</span>
                        <span className="font-mono text-text-muted">{formatDate(ev.timestamp)}</span>
                      </div>
                      <p className="text-text-secondary">{ev.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Guided Workspace Setup Assistant */}
          <div className="card space-y-3">
            <h3 className="font-bold text-primary">Guided Workspace Setup Advisor</h3>
            <p className="text-xs text-text-muted">
              Describe your shop or trade to get tailored categories, pricing tiers, tax setup tips, and staff role recommendations.
            </p>
            <form onSubmit={handleRunGuidedSetup} className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                className="input flex-1 text-sm"
                placeholder="e.g. Wholesale & retail hardware shop in Kampala with 2 branches and 4 cashiers"
                value={setupDesc}
                onChange={(e) => setSetupDesc(e.target.value)}
              />
              <button
                type="submit"
                disabled={setupLoading || !setupDesc.trim()}
                className="btn btn-secondary text-xs whitespace-nowrap shrink-0"
              >
                {setupLoading ? 'Designing Setup...' : 'Generate Setup Blueprint'}
              </button>
            </form>
            {setupResult && (
              <div className="p-4 rounded-xl bg-surface-alt border border-border text-xs space-y-2">
                <p className="font-bold text-primary">{setupResult.businessSummary}</p>
                <p className="text-text-secondary">
                  <strong>Categories:</strong> {setupResult.recommendedCategories.join(' · ')}
                </p>
                <p className="text-text-secondary">
                  <strong>Units:</strong> {setupResult.recommendedUnits.join(', ')} ·{' '}
                  <strong>Pricing:</strong> {setupResult.pricingRuleSuggestion}
                </p>
                {setupResult.roleSuggestions?.length > 0 && (
                  <p className="text-text-secondary">
                    <strong>Staff Roles:</strong>{' '}
                    {setupResult.roleSuggestions.map((r) => `${r.role}: ${r.tip}`).join(' · ')}
                  </p>
                )}
                <p className="text-accent font-medium">{setupResult.reason}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
