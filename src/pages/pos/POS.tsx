import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  User,
  CreditCard,
  X,
  Receipt,
  Package,
  Tag,
  Printer,
  CheckCircle2,
  Clock,
  Calculator,
  Camera,
  PauseCircle,
  Play,
  MessageCircle,
  Sparkles,
  KeyRound,
  Mic,
  AlertTriangle,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useInventory } from '../../hooks/useInventory';
import { usePOS } from '../../hooks/usePOS';
import { useCustomers } from '../../hooks/useCustomers';
import { useShifts } from '../../hooks/useShifts';
import { useBranches } from '../../hooks/useBranches';
import { useExpenses } from '../../hooks/useExpenses';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useTeam } from '../../hooks/useTeam';
import { logWorkspaceAudit } from '../../hooks/useAuditLog';
import { useAuthStore } from '../../store/authStore';
import { useCreditPayments } from '../../hooks/useCreditPayments';
import { formatUGX } from '../../utils/format';
import { getEffectiveStock } from '../../utils/branchStock';
import { buildSaleWhatsAppUrl, buildDebtWhatsAppUrl } from '../../utils/whatsapp';
import { canAccessFeature } from '../../utils/planLimits';
import { hashStaffPin, isValidPinFormat, ROLE_META } from '../../utils/rbac';
import { printReceiptDispatch } from '../../utils/thermalPrint';
import { QrCodeImage } from '../../components/shared/QrCodeImage';
import { PosProductGridSkeleton } from '../../components/shared/Skeletons';
import {
  fetchEodOwnerDigest,
  ParsedOrderDraftResult,
  runAiAssistantTool,
} from '../../services/aiService';
import { computeCartUpsellSuggestions } from '../../utils/aiAnalytics';
import { BarcodeScannerModal } from '../../components/shared/BarcodeScannerModal';
import {
  CheckoutCompletionPayload,
  UgandaCheckoutModal,
} from '../../components/checkout/UgandaCheckoutModal';
import { cn } from '../../lib/utils';
import { BusinessRole, EodDigestResult, Sale } from '../../types';
import toast from 'react-hot-toast';

export default function POS() {
  const location = useLocation();
  const { tenant, user } = useAuthStore();
  const { products, isLoading } = useInventory();
  const { customers } = useCustomers();
  const { suppliers } = useSuppliers();
  const { expenses } = useExpenses();
  const { members } = useTeam();
  const { activeBranchId, activeBranch } = useBranches();
  const { activeShift, openShift, recordSaleOnShift, closeShift } = useShifts();
  const {
    cart,
    heldCarts,
    addToCart,
    removeFromCart,
    updateQuantity,
    parkCurrentCart,
    resumeHeldCart,
    discardHeldCart,
    subtotal,
    taxAmount,
    taxConfig,
    total,
    discount,
    setDiscount,
    customerId,
    setCustomerId,
    selectedCustomerType,
    processSale,
    retryEfrisFiscalization,
    applyOrderDraft,
    sales,
    clearCart,
  } = usePOS();
  useCreditPayments();

  const effectiveBranchId =
    activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user?.branchId || null;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [quickOrderInput, setQuickOrderInput] = useState('');
  const [quickOrderDraft, setQuickOrderDraft] = useState<ParsedOrderDraftResult | null>(null);
  const [isParsingOrder, setIsParsingOrder] = useState(false);
  const [showMobileTools, setShowMobileTools] = useState(false);
  const [showMobileCartSheet, setShowMobileCartSheet] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [completedSaleCustomerId, setCompletedSaleCustomerId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [openingFloatInput, setOpeningFloatInput] = useState('0');
  const [closingCashInput, setClosingCashInput] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [isShiftSubmitting, setIsShiftSubmitting] = useState(false);
  const [eodDigest, setEodDigest] = useState<EodDigestResult | null>(null);
  const [isGeneratingDigest, setIsGeneratingDigest] = useState(false);
  const [isRetryingEfris, setIsRetryingEfris] = useState(false);

  // Cashier Quick-Switch PIN state
  const staffPinsEnabled = Boolean(tenant?.preferences?.staffPinsEnabled);
  const [activeCashier, setActiveCashier] = useState<{
    uid: string;
    name: string;
    role: BusinessRole;
  } | null>(null);
  const [showSwitchCashierModal, setShowSwitchCashierModal] = useState(false);
  const [switchTargetUid, setSwitchTargetUid] = useState('');
  const [switchPinInput, setSwitchPinInput] = useState('');
  const [switchPinError, setSwitchPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  useEffect(() => {
    const state = location.state as { aiOrderDraft?: ParsedOrderDraftResult } | null;
    if (state?.aiOrderDraft) {
      setQuickOrderDraft(state.aiOrderDraft);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (!user) {
      setActiveCashier(null);
      return;
    }
    setActiveCashier((prev) =>
      prev && prev.uid === user.uid ? prev : { uid: user.uid, name: user.name, role: user.role }
    );
  }, [user?.uid, user?.name, user?.role]);

  // Close mobile cart sheet automatically if cart empties
  useEffect(() => {
    if (cart.length === 0) {
      setShowMobileCartSheet(false);
    }
  }, [cart.length]);

  // Fast counter keyboard shortcuts (F2 or '/' focuses search, F9 opens checkout)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'F2' || (e.key === '/' && !isTyping)) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (
        e.key === 'F9' &&
        cart.length > 0 &&
        !showPayment &&
        !showCustomerModal &&
        !showDiscountModal &&
        !showOpenShiftModal &&
        !showCloseShiftModal &&
        !showSwitchCashierModal &&
        !completedSale
      ) {
        e.preventDefault();
        setShowPayment(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    cart.length,
    showPayment,
    showCustomerModal,
    showDiscountModal,
    showOpenShiftModal,
    showCloseShiftModal,
    showSwitchCashierModal,
    completedSale,
  ]);

  const pinEnabledMembers = useMemo(
    () => members.filter((m) => m.status === 'active' && Boolean(m.posPinHash)),
    [members]
  );

  const currentOperator =
    activeCashier || (user ? { uid: user.uid, name: user.name, role: user.role } : null);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category || 'Uncategorized'));
    return ['All', ...Array.from(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q);
      const matchesCategory =
        selectedCategory === 'All' || (p.category || 'Uncategorized') === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, selectedCategory]);

  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(item.id, item.quantity);
    }
    return map;
  }, [cart]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) || null,
    [customers, customerId]
  );

  const receiptCustomer = useMemo(
    () => customers.find((c) => c.id === completedSaleCustomerId) || null,
    [customers, completedSaleCustomerId]
  );

  const filteredCustomers = useMemo(
    () =>
      customers.filter(
        (c) =>
          c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
          c.phone.includes(customerSearch)
      ),
    [customers, customerSearch]
  );

  const cartUpsells = useMemo(
    () =>
      computeCartUpsellSuggestions({
        cartProductIds: cart.map((c) => c.id),
        products,
        sales,
        branchId: effectiveBranchId,
        limit: 3,
      }),
    [cart, products, sales, effectiveBranchId]
  );

  const cartCostTotal = useMemo(
    () => cart.reduce((sum, item) => sum + (Number(item.buyingPrice) || 0) * item.quantity, 0),
    [cart]
  );

  const cartMarginCheck = useMemo(() => {
    const netRevenue = Math.max(0, subtotal - discount);
    if (cart.length === 0 || netRevenue <= 0 || cartCostTotal <= 0) {
      return { warn: false, marginPct: 100, profitUgx: 0 };
    }
    const profitUgx = netRevenue - cartCostTotal;
    const marginPct = (profitUgx / netRevenue) * 100;
    return { warn: marginPct <= 5, marginPct: Number(marginPct.toFixed(1)), profitUgx };
  }, [cart.length, subtotal, discount, cartCostTotal]);

  const handleParseQuickOrder = async () => {
    if (!quickOrderInput.trim() || isParsingOrder) return;
    setIsParsingOrder(true);
    try {
      const draft = await runAiAssistantTool<ParsedOrderDraftResult>('parse_order', {
        text: quickOrderInput.trim(),
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
      setQuickOrderDraft(draft);
      if (!draft.items || draft.items.length === 0) {
        toast('No matching products found in that order phrase.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not parse order');
    } finally {
      setIsParsingOrder(false);
    }
  };

  const handleLoadQuickDraftToCart = async () => {
    if (!quickOrderDraft) return;
    const prodMap = new Map(products.map((p) => [p.id, p]));
    const items = (quickOrderDraft.items || [])
      .map((m) => ({
        product: prodMap.get(m.productId),
        quantity: m.quantity,
      }))
      .filter((x): x is { product: NonNullable<typeof x.product>; quantity: number } =>
        Boolean(x.product)
      );
    const ok = await applyOrderDraft(items, quickOrderDraft.matchedCustomerId || undefined);
    if (ok) {
      setQuickOrderDraft(null);
      setQuickOrderInput('');
    }
  };

  const handleDictateOrder = () => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      toast('Voice dictation is not supported in this browser; type the order instead.');
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'en-UG';
    rec.interimResults = false;
    rec.onresult = (ev: any) => {
      const text = ev?.results?.[0]?.[0]?.transcript || '';
      if (text) setQuickOrderInput(text);
    };
    rec.start();
  };

  const handleBarcodeDetected = (code: string) => {
    const q = code.trim().toLowerCase();
    const matched = products.find(
      (p) => p.barcode?.toLowerCase() === q || p.sku?.toLowerCase() === q
    );
    if (matched) {
      addToCart(matched);
      toast.success(`Added ${matched.name}`);
    } else {
      setSearch(code);
      toast.error(`No exact barcode match for "${code}" — showing search results`);
    }
  };

  const handleCompleteCheckout = async (payload: CheckoutCompletionPayload) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const currentCustomerId = customerId;
    try {
      const sale = await processSale(payload.paymentMethod, activeShift?.id, {
        splitPayments: payload.splitPayments,
        status: payload.status,
        branchName: activeBranch?.name,
        paymentProvider: payload.paymentProvider,
        paymentReference: payload.paymentReference,
        payerPhone: payload.payerPhone,
        cashTendered: payload.cashTendered,
        changeGiven: payload.changeGiven,
        cashierId: currentOperator?.uid,
        cashierName: currentOperator?.name,
        loyaltyPointsToRedeem: payload.loyaltyPointsToRedeem,
      });
      if (sale) {
        if (activeShift && sale.status === 'completed') {
          await recordSaleOnShift(
            activeShift.id,
            payload.paymentMethod,
            sale.total,
            payload.splitPayments
          );
        }
        setShowPayment(false);
        setShowMobileCartSheet(false);
        setCompletedSaleCustomerId(currentCustomerId);
        setCompletedSale(sale);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSwitchCashier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !user || isVerifyingPin) return;
    const pin = switchPinInput.trim();
    if (!isValidPinFormat(pin)) {
      setSwitchPinError('Enter a 4-digit numeric PIN.');
      return;
    }
    setSwitchPinError(null);
    setIsVerifyingPin(true);
    try {
      const candidates = switchTargetUid
        ? pinEnabledMembers.filter((m) => m.uid === switchTargetUid)
        : pinEnabledMembers;

      let matched = null;
      for (const candidate of candidates) {
        const candidateHash = await hashStaffPin(tenant.id, candidate.uid, pin);
        if (candidateHash === candidate.posPinHash) {
          matched = candidate;
          break;
        }
      }

      if (!matched) {
        setSwitchPinError('Incorrect 4-digit PIN. Please check and try again.');
        return;
      }

      const prevName = currentOperator?.name || user.name;
      setActiveCashier({
        uid: matched.uid,
        name: matched.name,
        role: matched.role,
      });
      setShowSwitchCashierModal(false);
      setSwitchPinInput('');
      setSwitchTargetUid('');

      void logWorkspaceAudit({
        tenantId: tenant.id,
        branchId: effectiveBranchId || undefined,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'POS_CASHIER_SWITCHED',
        entityType: 'pos',
        entityId: matched.uid,
        summary: `Quick-switched POS operator from ${prevName} to ${matched.name} (${
          ROLE_META[matched.role]?.label || matched.role
        })`,
      });

      toast.success(`Active cashier: ${matched.name}`);
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isShiftSubmitting) return;
    setIsShiftSubmitting(true);
    try {
      await openShift(Number(openingFloatInput) || 0);
      setShowOpenShiftModal(false);
      setOpeningFloatInput('0');
    } finally {
      setIsShiftSubmitting(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift || isShiftSubmitting) return;
    setIsShiftSubmitting(true);
    try {
      await closeShift(activeShift.id, Number(closingCashInput) || 0, shiftNotes);
      setShowCloseShiftModal(false);
      setClosingCashInput('');
      setShiftNotes('');
      setEodDigest(null);
    } finally {
      setIsShiftSubmitting(false);
    }
  };

  const handleGenerateEodDigest = async () => {
    if (!tenant || isGeneratingDigest) return;
    setIsGeneratingDigest(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const monthPrefix = new Date().toISOString().slice(0, 7);
      const validSales = sales.filter((s) => s.status !== 'refunded');

      const todaySalesUgx = validSales
        .filter((s) => s.createdAt.startsWith(todayStr))
        .reduce((acc, s) => acc + s.total, 0);
      const monthSalesUgx = validSales
        .filter((s) => s.createdAt.startsWith(monthPrefix))
        .reduce((acc, s) => acc + s.total, 0);
      const monthExpensesUgx = expenses
        .filter((e) => (e.expenseDate || e.createdAt).startsWith(monthPrefix))
        .reduce((acc, e) => acc + e.amount, 0);

      const digest = await fetchEodOwnerDigest({
        businessContext: {
          businessName: tenant.name,
          branchName: activeBranch?.name,
          plan: tenant.plan,
          status: tenant.status,
          todaySalesUgx,
          monthSalesUgx,
          monthExpensesUgx,
          netProfitEstimateUgx: monthSalesUgx - monthExpensesUgx,
          totalProducts: products.length,
          lowStockProducts: products
            .filter((p) => getEffectiveStock(p, effectiveBranchId) <= (p.minStockLevel ?? 0))
            .slice(0, 8)
            .map((p) => ({
              name: p.name,
              currentStock: getEffectiveStock(p, effectiveBranchId),
              minStockLevel: p.minStockLevel ?? 0,
              unit: p.unit || 'pcs',
            })),
          topSellingProducts: [],
          customerReceivablesUgx: customers.reduce((s, c) => s + (c.currentBalance || 0), 0),
          supplierPayablesUgx: suppliers.reduce((s, sup) => s + (sup.currentBalance || 0), 0),
          openShiftCashUgx: activeShift ? activeShift.expectedCash : null,
        },
      });
      setEodDigest(digest);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate End-of-Day digest');
    } finally {
      setIsGeneratingDigest(false);
    }
  };

  const handleApplyDiscount = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Math.max(0, Number(discountInput) || 0);
    setDiscount(Math.min(numeric, subtotal));
    setShowDiscountModal(false);
  };

  const handleThermalPrint = async () => {
    if (!completedSale || !tenant) return;
    const res = await printReceiptDispatch(completedSale, tenant, receiptCustomer);
    if (res.mode === 'serial') {
      toast.success('Sent to USB/Serial thermal printer');
    } else if (res.mode === 'bluetooth') {
      toast.success('Sent to Bluetooth thermal printer');
    } else if (res.mode === 'rawbt') {
      toast.success('Opened RawBT print intent');
    }
  };

  const handleRetryEfris = async () => {
    if (!completedSale || isRetryingEfris) return;
    setIsRetryingEfris(true);
    try {
      const updated = await retryEfrisFiscalization(completedSale.id);
      if (updated) setCompletedSale(updated);
    } finally {
      setIsRetryingEfris(false);
    }
  };

  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // Reusable Cart Register Tape body (rendered inside desktop right column and mobile slide-up sheet)
  const renderRegisterCartContent = (isMobileSheet: boolean) => (
    <>
      {/* Line items */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-2.5">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-60 py-16 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-surface-alt border border-border flex items-center justify-center mb-3">
              <ShoppingCart size={28} />
            </div>
            <p className="font-bold text-base text-primary">Register Tape Empty</p>
            <p className="text-xs text-text-muted mt-1">
              Tap a product card, scan a barcode, or use AI Quick Order to start a ticket.
            </p>
          </div>
        ) : (
          cart.map((item) => {
            const lineTotal = item.appliedPrice * item.quantity;
            return (
              <div
                key={item.id}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-alt/60 border border-border/60"
              >
                <div className="w-9 h-9 bg-surface border border-border rounded-lg flex items-center justify-center text-primary font-bold shrink-0 text-xs uppercase">
                  {item.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-primary truncate leading-tight">
                    {item.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-text-muted font-mono tabular-nums">
                    <span>{formatUGX(item.appliedPrice)}</span>
                    {item.priceTier !== 'retail' && (
                      <span className="px-1.5 py-0.2 rounded bg-accent/15 text-accent text-[9px] font-sans font-bold uppercase">
                        {item.priceTier}
                      </span>
                    )}
                    <span className="text-text-secondary font-semibold ml-auto">
                      {formatUGX(lineTotal)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 bg-surface border border-border rounded-lg p-0.5 shrink-0">
                  <button
                    type="button"
                    aria-label={`Decrease ${item.name} quantity`}
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="w-8 h-8 flex items-center justify-center hover:bg-surface-alt rounded transition-colors text-text-muted hover:text-primary"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-xs font-bold w-6 text-center text-primary font-mono tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase ${item.name} quantity`}
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="w-8 h-8 flex items-center justify-center hover:bg-surface-alt rounded transition-colors text-text-muted hover:text-primary"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => removeFromCart(item.id)}
                  className="p-1.5 min-w-[34px] min-h-[34px] flex items-center justify-center text-text-muted hover:text-danger rounded-lg hover:bg-danger/10 transition-colors shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })
        )}

        {cart.length > 0 && cartUpsells.length > 0 && (
          <div className="pt-2.5 border-t border-border space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Quick Add-Ons
            </p>
            <div className="space-y-1.5">
              {cartUpsells.map((u) => (
                <div
                  key={u.product.id}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface-alt border border-border/70 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-primary truncate">{u.product.name}</p>
                    <p className="text-[10px] text-text-muted truncate">{u.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addToCart(u.product)}
                    className="btn btn-secondary py-1 px-2.5 text-[11px] font-bold whitespace-nowrap shrink-0 font-mono tabular-nums"
                  >
                    + {formatUGX(u.product.sellingPrice)}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Totals & Checkout Footer */}
      <div
        className={cn(
          'p-4 bg-surface-alt border-t border-border space-y-3 shrink-0',
          isMobileSheet && 'pb-[max(1rem,env(safe-area-inset-bottom))]'
        )}
      >
        {cartMarginCheck.warn && (
          <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            <span>
              Margin alert: {cartMarginCheck.marginPct}% gross margin (
              {formatUGX(cartMarginCheck.profitUgx)}) after discount.
            </span>
          </div>
        )}

        <div className="space-y-1.5 text-xs sm:text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Subtotal</span>
            <span className="font-semibold text-primary font-mono tabular-nums">
              {formatUGX(subtotal)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Discount</span>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => {
                setDiscountInput(discount > 0 ? String(discount) : '');
                setShowDiscountModal(true);
              }}
              className="text-accent font-bold hover:underline flex items-center gap-1 font-mono tabular-nums disabled:opacity-40"
            >
              <Tag size={12} />
              {discount > 0 ? `-${formatUGX(discount)}` : 'Add Discount'}
            </button>
          </div>
          {taxConfig.enabled && (
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">
                VAT ({taxConfig.rate}%{taxConfig.inclusive ? ' incl.' : ''})
              </span>
              <span className="font-semibold text-primary font-mono tabular-nums">
                {formatUGX(taxAmount)}
              </span>
            </div>
          )}
        </div>

        <div className="pt-2.5 border-t border-border flex items-center justify-between">
          <span className="font-bold text-primary uppercase tracking-wider text-xs">
            Total Due
          </span>
          <span className="text-2xl font-extrabold text-accent font-mono tabular-nums">
            {formatUGX(total)}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 pt-1">
          <button
            type="button"
            onClick={clearCart}
            disabled={cart.length === 0}
            className="btn btn-secondary py-2.5 text-xs font-bold col-span-1"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              parkCurrentCart(selectedCustomer?.name);
              setShowMobileCartSheet(false);
            }}
            disabled={cart.length === 0}
            className="btn btn-secondary py-2.5 text-xs font-bold gap-1 col-span-1"
            title="Hold / Park Cart"
          >
            <PauseCircle size={14} />
            Park
          </button>
          <button
            type="button"
            onClick={() => setShowPayment(true)}
            disabled={cart.length === 0}
            className="btn btn-primary py-2.5 text-xs sm:text-sm font-bold gap-1.5 shadow-lg shadow-accent/20 col-span-2"
          >
            <CreditCard size={15} />
            Pay Now
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-88px)] md:h-[calc(100dvh-140px)] min-h-[520px] overflow-hidden">
      <div className="flex flex-col md:flex-row gap-4 lg:gap-5 flex-1 min-h-0 overflow-hidden no-print">
        {/* Left: Catalog & Counter Command Workspace */}
        <div className="flex-1 flex flex-col gap-2.5 sm:gap-3 min-h-0 min-w-0">
          {/* Compact Top Command Strip */}
          <div className="bg-surface border border-border rounded-xl p-2.5 sm:p-3 space-y-2.5 shrink-0 shadow-xs">
            {/* Search + Barcode + Customer + Mobile Register Tools Toggle */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                  size={16}
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search item, SKU or barcode (F2)..."
                  className="input pl-9 pr-8 py-2 text-sm w-full"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="btn btn-secondary px-2.5 sm:px-3 py-2 gap-1.5 text-xs whitespace-nowrap shrink-0"
                title="Scan Barcode with Camera"
                aria-label="Scan Barcode"
              >
                <Camera size={16} />
                <span className="hidden sm:inline">Scan</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCustomerModal(true)}
                className={cn(
                  'btn py-2 px-2.5 sm:px-3 gap-1.5 text-xs whitespace-nowrap shrink-0',
                  selectedCustomer ? 'btn-primary' : 'btn-secondary'
                )}
                title="Assign Customer / Pricing Tier"
              >
                <User size={15} />
                <span className="hidden sm:inline truncate max-w-[130px]">
                  {selectedCustomer
                    ? `${selectedCustomer.name}${
                        selectedCustomer.type === 'Wholesale' || selectedCustomer.type === 'VIP'
                          ? ` · ${selectedCustomer.type}`
                          : ''
                      }`
                    : 'Customer'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowMobileTools((v) => !v)}
                aria-expanded={showMobileTools}
                title="Shift, Cashier PIN & AI Quick Order"
                className={cn(
                  'lg:hidden btn py-2 px-2.5 gap-1.5 text-xs shrink-0 relative',
                  showMobileTools ? 'btn-primary' : 'btn-secondary'
                )}
              >
                <SlidersHorizontal size={15} />
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    activeShift ? 'bg-accent' : 'bg-amber-500'
                  )}
                />
                {heldCarts.length > 0 && (
                  <span className="font-mono text-[10px] font-bold">({heldCarts.length})</span>
                )}
              </button>
            </div>

            {/* Register Status + AI Quick Order Strip (always visible on lg+, toggled on < lg unless draft active) */}
            <div
              className={cn(
                'space-y-2 pt-1 border-t border-border/60',
                showMobileTools || quickOrderDraft ? 'block' : 'hidden lg:block'
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px]',
                      activeShift ? 'text-accent' : 'text-amber-600'
                    )}
                  >
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        activeShift ? 'bg-accent' : 'bg-amber-500'
                      )}
                    />
                    {activeShift ? 'Shift Open' : 'No Open Shift'}
                  </span>
                  <span className="text-text-secondary">
                    Cashier:{' '}
                    <strong className="text-primary">
                      {currentOperator?.name || user?.name || 'Operator'}
                    </strong>
                  </span>
                  {activeShift && (
                    <>
                      <span className="text-text-secondary">
                        Drawer:{' '}
                        <strong className="text-primary font-mono tabular-nums">
                          {formatUGX(activeShift.expectedCash)}
                        </strong>
                      </span>
                      <span className="text-text-muted font-mono tabular-nums">
                        {activeShift.salesCount} {activeShift.salesCount === 1 ? 'sale' : 'sales'}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {staffPinsEnabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setSwitchPinInput('');
                        setSwitchTargetUid('');
                        setSwitchPinError(null);
                        setShowSwitchCashierModal(true);
                      }}
                      className="btn btn-secondary py-1 px-2.5 text-[11px] gap-1 whitespace-nowrap"
                    >
                      <KeyRound size={12} className="text-accent" />
                      Switch Cashier
                    </button>
                  )}
                  {activeShift ? (
                    <button
                      type="button"
                      onClick={() => {
                        setClosingCashInput(String(activeShift.expectedCash));
                        setEodDigest(null);
                        setShowCloseShiftModal(true);
                      }}
                      className="btn btn-secondary py-1 px-2.5 text-[11px] gap-1 whitespace-nowrap"
                    >
                      <Calculator size={12} />
                      Close Shift
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOpeningFloatInput('0');
                        setShowOpenShiftModal(true);
                      }}
                      className="btn btn-primary py-1 px-2.5 text-[11px] gap-1 whitespace-nowrap"
                    >
                      <Clock size={12} />
                      Open Shift
                    </button>
                  )}
                </div>
              </div>

              {/* Held / Parked Carts Pills */}
              {heldCarts.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted shrink-0">
                    Parked ({heldCarts.length}):
                  </span>
                  {heldCarts.map((held) => (
                    <div
                      key={held.id}
                      className="inline-flex items-center gap-1.5 bg-surface-alt border border-border rounded-lg px-2 py-1 text-[11px] shrink-0"
                    >
                      <button
                        type="button"
                        onClick={() => resumeHeldCart(held.id)}
                        className="font-bold text-primary hover:text-accent inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Play size={11} className="text-accent" />
                        {held.label} ({held.items.reduce((s, i) => s + i.quantity, 0)})
                      </button>
                      <button
                        type="button"
                        onClick={() => discardHeldCart(held.id)}
                        aria-label={`Discard ${held.label}`}
                        className="text-text-muted hover:text-danger ml-0.5"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* AI Quick Order Input */}
              <div className="flex items-center gap-2 bg-surface-alt/70 border border-border rounded-lg px-2.5 py-1">
                <Sparkles size={14} className="text-accent shrink-0" />
                <input
                  type="text"
                  placeholder="AI Quick Order: e.g. '3 sugar & 2 oil for Sarah'..."
                  className="flex-1 text-xs bg-transparent outline-none text-primary placeholder:text-text-muted py-0.5 min-w-0"
                  value={quickOrderInput}
                  onChange={(e) => setQuickOrderInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleParseQuickOrder();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleDictateOrder}
                  title="Dictate order by voice"
                  aria-label="Dictate order by voice"
                  className="p-1 text-text-muted hover:text-primary rounded"
                >
                  <Mic size={14} />
                </button>
                <button
                  type="button"
                  disabled={isParsingOrder || !quickOrderInput.trim()}
                  onClick={handleParseQuickOrder}
                  className="text-[11px] font-bold text-accent hover:underline whitespace-nowrap shrink-0 disabled:opacity-40"
                >
                  {isParsingOrder ? 'Parsing...' : 'Draft'}
                </button>
              </div>

              {quickOrderDraft && (
                <div className="p-2.5 bg-surface-alt border border-accent/40 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-primary">
                      Draft ({quickOrderDraft.matchedCustomerName || 'Walk-in'}):{' '}
                      {(quickOrderDraft.items || [])
                        .map((i) => `${i.quantity}× ${i.productName}`)
                        .join(', ') || 'No matches'}
                    </p>
                    {quickOrderDraft.reason && (
                      <p className="text-[11px] text-text-secondary">{quickOrderDraft.reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setQuickOrderDraft(null)}
                      className="px-2 py-1 text-text-muted hover:text-primary"
                    >
                      Dismiss
                    </button>
                    {(quickOrderDraft.items || []).length > 0 && (
                      <button
                        type="button"
                        onClick={handleLoadQuickDraftToCart}
                        className="btn btn-primary py-1 px-2.5 text-[11px] whitespace-nowrap"
                      >
                        Load Cart
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Category Filter Tabs */}
            <div className="flex items-center overflow-x-auto gap-1.5 no-scrollbar pt-0.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border shrink-0',
                    selectedCategory === cat
                      ? 'bg-accent border-accent text-white shadow-xs'
                      : 'bg-surface-alt/60 border-border text-text-secondary hover:border-accent/40 hover:text-primary'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Active Tier Pricing Indicator */}
          {selectedCustomer &&
            (selectedCustomer.type === 'Wholesale' || selectedCustomer.type === 'VIP') && (
              <div className="px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/25 text-xs flex items-center justify-between gap-2 shrink-0">
                <span className="font-semibold text-primary">
                  <span className="text-accent font-bold uppercase tracking-wider mr-1.5">
                    {selectedCustomer.type} Tier Active
                  </span>
                  · {selectedCustomer.name}
                </span>
                <button
                  type="button"
                  onClick={() => setCustomerId(null)}
                  className="text-[11px] font-bold text-text-muted hover:text-primary"
                >
                  Reset
                </button>
              </div>
            )}

          {/* Products Scrollable Grid */}
          <div className="flex-1 overflow-y-auto pr-0.5 pb-24 md:pb-2">
            {isLoading ? (
              <PosProductGridSkeleton count={8} />
            ) : filteredProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-text-muted py-16 text-center">
                <Package size={44} className="mb-3 opacity-35" />
                <p className="font-bold text-primary">No matching products</p>
                <p className="text-xs text-text-muted mt-1">
                  Try another search term or clear category filters.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
                {filteredProducts.map((product) => {
                  const branchStock = getEffectiveStock(product, effectiveBranchId);
                  const isOut = branchStock <= 0;
                  const isLow = !isOut && branchStock <= (product.minStockLevel ?? 0);
                  const inCartQty = cartQtyMap.get(product.id) || 0;
                  const displayPrice =
                    selectedCustomerType === 'Wholesale' && product.wholesalePrice
                      ? product.wholesalePrice
                      : selectedCustomerType === 'VIP' && product.vipPrice
                      ? product.vipPrice
                      : product.sellingPrice;

                  return (
                    <div
                      key={product.id}
                      role="button"
                      tabIndex={isOut ? -1 : 0}
                      aria-disabled={isOut}
                      onClick={() => {
                        if (!isOut) addToCart(product);
                      }}
                      onKeyDown={(e) => {
                        if (!isOut && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          addToCart(product);
                        }
                      }}
                      className={cn(
                        'bg-surface border rounded-xl p-3 flex flex-col justify-between transition-all select-none',
                        isOut
                          ? 'opacity-50 cursor-not-allowed border-border'
                          : inCartQty > 0
                          ? 'border-accent ring-1 ring-accent/30 bg-accent/[0.03] cursor-pointer shadow-xs'
                          : 'border-border hover:border-accent/60 hover:shadow-md cursor-pointer active:scale-[0.99]'
                      )}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="w-9 h-9 rounded-lg bg-surface-alt border border-border/70 flex items-center justify-center text-primary font-bold text-xs uppercase shrink-0">
                            {product.name.slice(0, 2)}
                          </div>
                          <span
                            className={cn(
                              'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded tabular-nums shrink-0',
                              isOut
                                ? 'bg-danger/15 text-danger'
                                : isLow
                                ? 'bg-amber-500/15 text-amber-600'
                                : 'bg-accent/12 text-accent'
                            )}
                          >
                            {isOut ? 'Out' : `${branchStock} ${product.unit || 'pcs'}`}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <p className="font-bold text-primary text-xs sm:text-sm leading-snug line-clamp-2">
                            {product.name}
                          </p>
                          {product.sku && (
                            <p className="text-[10px] text-text-muted font-mono truncate mt-0.5">
                              {product.sku}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between gap-1.5">
                        <span className="text-accent font-extrabold text-xs sm:text-sm font-mono tabular-nums truncate">
                          {formatUGX(displayPrice)}
                        </span>

                        {inCartQty > 0 ? (
                          <div
                            className="flex items-center gap-0.5 bg-surface border border-border rounded-lg p-0.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              aria-label={`Decrease ${product.name}`}
                              onClick={() => updateQuantity(product.id, inCartQty - 1)}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-alt text-primary"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="text-xs font-extrabold px-1 text-primary font-mono tabular-nums">
                              {inCartQty}
                            </span>
                            <button
                              type="button"
                              aria-label={`Increase ${product.name}`}
                              onClick={() => updateQuantity(product.id, inCartQty + 1)}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-alt text-accent"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        ) : (
                          !isOut && (
                            <span className="w-7 h-7 rounded-lg bg-surface-alt border border-border flex items-center justify-center text-accent shrink-0">
                              <Plus size={14} />
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Desktop Persistent Split-Pane Register Tape */}
        <div className="hidden md:flex md:w-[350px] lg:w-[400px] xl:w-[420px] shrink-0 flex-col min-h-0">
          <div className="bg-surface border border-border rounded-2xl flex-1 flex flex-col overflow-hidden shadow-sm">
            <div className="px-4 py-3.5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <ShoppingCart size={18} className="shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-white leading-tight">Register Ticket</h3>
                  <button
                    type="button"
                    onClick={() => setShowCustomerModal(true)}
                    className="text-[11px] text-white/75 hover:text-white truncate block text-left"
                  >
                    {selectedCustomer
                      ? `${selectedCustomer.name} · ${selectedCustomer.type}`
                      : 'Walk-in Customer (tap to assign)'}
                  </button>
                </div>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/15 text-white tabular-nums shrink-0 font-mono">
                {cartItemCount} {cartItemCount === 1 ? 'item' : 'items'}
              </span>
            </div>

            {renderRegisterCartContent(false)}
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom Checkout Dock */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-primary text-white border-t border-white/15 px-3.5 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3 shadow-2xl z-30 no-print">
        <button
          type="button"
          onClick={() => setShowMobileCartSheet((v) => !v)}
          className="flex items-center gap-2.5 min-w-0 text-left flex-1 py-1"
        >
          <div className="relative w-10 h-10 rounded-xl bg-white/12 border border-white/15 flex items-center justify-center shrink-0">
            <ShoppingCart size={18} />
            {cartItemCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-accent text-white text-[10px] font-extrabold flex items-center justify-center font-mono tabular-nums">
                {cartItemCount}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-white/70 tracking-wider">
              <span>{cartItemCount > 0 ? 'Tap to Review Ticket' : 'Ticket Empty'}</span>
              {cartItemCount > 0 &&
                (showMobileCartSheet ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
            </div>
            <p className="text-lg font-extrabold text-white font-mono tabular-nums truncate">
              {formatUGX(total)}
            </p>
          </div>
        </button>

        <button
          type="button"
          disabled={cartItemCount === 0}
          onClick={() => setShowPayment(true)}
          className="bg-accent hover:bg-accent/90 disabled:opacity-40 text-white font-bold px-5 py-3 rounded-xl text-sm flex items-center gap-1.5 shadow-lg shrink-0 transition-opacity"
        >
          <CreditCard size={16} />
          <span>Checkout</span>
        </button>
      </div>

      {/* Mobile Slide-Up Cart Bottom Sheet */}
      {showMobileCartSheet && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end no-print">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setShowMobileCartSheet(false)}
          />
          <div className="relative z-10 bg-surface border-t border-border rounded-t-2xl shadow-2xl flex flex-col max-h-[86dvh] overflow-hidden">
            <div className="px-4 py-3 bg-primary text-white flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-white">
                  Current Ticket · {cartItemCount} {cartItemCount === 1 ? 'item' : 'items'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(true)}
                  className="text-[11px] text-white/75 underline"
                >
                  {selectedCustomer
                    ? `${selectedCustomer.name} (${selectedCustomer.type})`
                    : 'Walk-in Customer — Change'}
                </button>
              </div>
              <button
                type="button"
                aria-label="Close ticket sheet"
                onClick={() => setShowMobileCartSheet(false)}
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X size={19} />
              </button>
            </div>
            {renderRegisterCartContent(true)}
          </div>
        </div>
      )}

      {/* Camera Barcode Scanner */}
      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onDetected={handleBarcodeDetected}
      />

      {/* Select Customer Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <h3 className="text-lg font-bold text-white">Select Customer</h3>
              <button
                type="button"
                onClick={() => setShowCustomerModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  className="input pl-9"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-border">
                <button
                  type="button"
                  onClick={() => {
                    setCustomerId(null);
                    setShowCustomerModal(false);
                  }}
                  className={cn(
                    'w-full px-3 py-3 text-left flex items-center justify-between hover:bg-surface-alt rounded-lg',
                    !customerId && 'bg-accent/10'
                  )}
                >
                  <div>
                    <p className="text-sm font-bold text-primary">Walk-in Customer</p>
                    <p className="text-xs text-text-muted">Default retail pricing</p>
                  </div>
                  {!customerId && <CheckCircle2 size={18} className="text-accent" />}
                </button>

                {filteredCustomers.map((cust) => (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => {
                      setCustomerId(cust.id);
                      setShowCustomerModal(false);
                    }}
                    className={cn(
                      'w-full px-3 py-3 text-left flex items-center justify-between hover:bg-surface-alt rounded-lg',
                      customerId === cust.id && 'bg-accent/10'
                    )}
                  >
                    <div>
                      <p className="text-sm font-bold text-primary">{cust.name}</p>
                      <p className="text-xs text-text-muted">
                        {cust.phone} · {cust.type}
                        {cust.currentBalance > 0
                          ? ` · Debt: ${formatUGX(cust.currentBalance)}`
                          : ''}
                      </p>
                    </div>
                    {customerId === cust.id && <CheckCircle2 size={18} className="text-accent" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Discount Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[90dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <h3 className="text-lg font-bold text-white">Apply Discount</h3>
              <button
                type="button"
                onClick={() => setShowDiscountModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleApplyDiscount} className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">
                  Discount Amount (UGX)
                </label>
                <input
                  type="number"
                  min={0}
                  max={subtotal}
                  placeholder="0"
                  className="input"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-text-muted mt-1 font-mono tabular-nums">
                  Max subtotal: {formatUGX(subtotal)} · Cost floor: {formatUGX(cartCostTotal)}
                </p>
                {subtotal - (Number(discountInput) || 0) < cartCostTotal && cartCostTotal > 0 && (
                  <p className="text-xs font-semibold text-danger mt-1">
                    Warning: this discount drops total below cost price ({formatUGX(cartCostTotal)}).
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDiscount(0);
                    setShowDiscountModal(false);
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Remove
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Uganda Multi-Channel POS Checkout Modal */}
      <UgandaCheckoutModal
        isOpen={showPayment}
        title="POS Checkout · Uganda Payment Rails"
        total={total}
        tenant={tenant}
        selectedCustomer={selectedCustomer}
        isProcessing={isProcessing}
        onClose={() => setShowPayment(false)}
        onConfirm={handleCompleteCheckout}
      />

      {/* Sale Completed / Print / WhatsApp Receipt Modal */}
      {completedSale && tenant && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-surface border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0 no-print">
              <div className="flex items-center gap-2">
                <Receipt size={20} />
                <h3 className="text-lg font-bold text-white">Sale Receipt</h3>
              </div>
              <button
                type="button"
                onClick={() => setCompletedSale(null)}
                className="hover:bg-white/10 p-1.5 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 print-content overflow-y-auto flex-1">
              <div className="text-center border-b border-border pb-4">
                {tenant.logo && (
                  <img
                    src={tenant.logo}
                    alt={`${tenant.name} logo`}
                    className="w-12 h-12 rounded-xl object-contain mx-auto mb-2 border border-border bg-white p-1"
                  />
                )}
                <h4 className="text-lg font-bold text-primary">{tenant.name}</h4>
                {tenant.branding?.tagline && (
                  <p className="text-xs text-text-secondary italic">{tenant.branding.tagline}</p>
                )}
                {tenant.branding?.receiptHeader && (
                  <p className="text-xs font-medium text-primary mt-0.5">{tenant.branding.receiptHeader}</p>
                )}
                {tenant.tin && <p className="text-xs text-text-muted">TIN: {tenant.tin}</p>}
                {tenant.branding?.supportPhone && (
                  <p className="text-xs text-text-muted">Tel: {tenant.branding.supportPhone}</p>
                )}
                {completedSale.branchName && (
                  <p className="text-xs text-text-muted">Branch: {completedSale.branchName}</p>
                )}
                {completedSale.cashierName && (
                  <p className="text-xs text-text-muted">Cashier: {completedSale.cashierName}</p>
                )}
                <p className="text-xs text-text-muted mt-1">
                  Ref: {completedSale.reference} · {new Date(completedSale.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="space-y-2 text-sm">
                {completedSale.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span className="text-primary truncate">
                      {item.quantity} × {item.name}
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-primary shrink-0">
                      {formatUGX(item.total)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-text-secondary">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatUGX(completedSale.subtotal)}</span>
                </div>
                {completedSale.discount > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>Discount</span>
                    <span className="font-mono tabular-nums">-{formatUGX(completedSale.discount)}</span>
                  </div>
                )}
                {(completedSale.loyaltyDiscountUgx ?? 0) > 0 && (
                  <div className="flex justify-between text-accent">
                    <span>Loyalty Redeemed ({completedSale.loyaltyPointsRedeemed || 0} pts)</span>
                    <span className="font-mono tabular-nums">
                      -{formatUGX(completedSale.loyaltyDiscountUgx || 0)}
                    </span>
                  </div>
                )}
                {(completedSale.taxAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-text-secondary">
                    <span>VAT ({completedSale.taxRate ?? 18}%)</span>
                    <span className="font-mono tabular-nums">{formatUGX(completedSale.taxAmount || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base text-primary pt-1 border-t border-border">
                  <span>Total ({completedSale.paymentMethod})</span>
                  <span className="font-mono tabular-nums text-accent">
                    {formatUGX(completedSale.total)}
                  </span>
                </div>
                {completedSale.paymentReference && (
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Transaction Ref</span>
                    <span className="font-mono">{completedSale.paymentReference}</span>
                  </div>
                )}
                {completedSale.payerPhone && (
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Mobile Number</span>
                    <span className="font-mono">{completedSale.payerPhone}</span>
                  </div>
                )}
                {typeof completedSale.cashTendered === 'number' && completedSale.cashTendered > 0 && (
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Cash Tendered / Change</span>
                    <span className="font-mono tabular-nums">
                      {formatUGX(completedSale.cashTendered)} / {formatUGX(completedSale.changeGiven || 0)}
                    </span>
                  </div>
                )}
                {(completedSale.loyaltyPointsEarned ?? 0) > 0 && (
                  <div className="flex justify-between text-xs text-accent font-semibold">
                    <span>Loyalty Points Earned</span>
                    <span className="font-mono tabular-nums">+{completedSale.loyaltyPointsEarned} pts</span>
                  </div>
                )}

                {(completedSale.efrisFdn || tenant.preferences?.efrisEnabled) && (
                  <div className="mt-3 p-3 rounded-xl border border-border bg-surface-alt/70 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-primary uppercase tracking-wider text-[11px]">
                        URA EFRIS Fiscal Verification
                      </span>
                      {completedSale.efrisFdn ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-accent/15 text-accent uppercase">
                          {completedSale.efrisStatus === 'sandbox' ? 'Sandbox' : 'Fiscalized'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-accent-alt/15 text-accent-alt uppercase">
                          {completedSale.efrisStatus || 'Pending'}
                        </span>
                      )}
                    </div>
                    {completedSale.efrisFdn ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-0.5 min-w-0 font-mono text-[11px]">
                          <p className="text-primary truncate">FDN: {completedSale.efrisFdn}</p>
                          {completedSale.efrisVerificationCode && (
                            <p className="text-text-secondary truncate">
                              Code: {completedSale.efrisVerificationCode}
                            </p>
                          )}
                        </div>
                        {completedSale.efrisQrData && (
                          <QrCodeImage
                            value={completedSale.efrisQrData}
                            size={80}
                            alt={`EFRIS QR ${completedSale.efrisFdn}`}
                            className="shrink-0"
                          />
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 no-print">
                        <span className="text-text-muted">Not yet synced with URA EFRIS.</span>
                        <button
                          type="button"
                          disabled={isRetryingEfris}
                          onClick={handleRetryEfris}
                          className="btn btn-secondary py-1 px-2.5 text-[11px] whitespace-nowrap"
                        >
                          {isRetryingEfris ? 'Fiscalizing...' : 'Fiscalize EFRIS'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="text-center pt-3 border-t border-dashed border-border space-y-1">
                  {tenant.preferences?.receiptFooter && (
                    <p className="text-xs text-text-muted">{tenant.preferences.receiptFooter}</p>
                  )}
                  <p className="text-[10px] text-text-muted">Built &amp; managed by Novic Technologies</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-surface-alt border-t border-border flex flex-wrap gap-2 shrink-0 no-print">
              <button
                type="button"
                onClick={() => setCompletedSale(null)}
                className="btn btn-secondary text-xs px-4"
              >
                Close
              </button>
              {tenant.preferences?.whatsappReceipts !== false &&
                canAccessFeature(tenant, 'whatsappReceipts') && (
                  <a
                    href={buildSaleWhatsAppUrl(completedSale, tenant, receiptCustomer)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary flex-1 gap-1.5 text-xs whitespace-nowrap"
                  >
                    <MessageCircle size={16} className="text-accent" />
                    WhatsApp
                  </a>
                )}
              <button
                type="button"
                onClick={handleThermalPrint}
                className="btn btn-primary flex-1 gap-1.5 text-xs whitespace-nowrap"
              >
                <Printer size={16} />
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Shift Modal */}
      {showOpenShiftModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[90dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <h3 className="text-lg font-bold text-white">Open Cash Drawer Shift</h3>
              <button
                type="button"
                onClick={() => setShowOpenShiftModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleOpenShift} className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">
                  Opening Cash Float (UGX)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  className="input font-mono tabular-nums"
                  value={openingFloatInput}
                  onChange={(e) => setOpeningFloatInput(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-text-muted mt-1">
                  Enter the cash amount currently inside the register drawer.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowOpenShiftModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isShiftSubmitting} className="btn btn-primary flex-1">
                  {isShiftSubmitting ? 'Opening...' : 'Start Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Shift Reconciliation + AI EOD Owner Digest Modal */}
      {showCloseShiftModal && activeShift && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <h3 className="text-lg font-bold text-white">Close &amp; Reconcile Shift</h3>
              <button
                type="button"
                onClick={() => setShowCloseShiftModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCloseShift} className="p-5 space-y-4 overflow-y-auto">
              <div className="bg-surface-alt rounded-xl p-4 space-y-2 text-sm border border-border">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Opening Float</span>
                  <span className="font-mono tabular-nums font-semibold text-primary">
                    {formatUGX(activeShift.openingFloat)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Cash Sales</span>
                  <span className="font-mono tabular-nums font-semibold text-primary">
                    {formatUGX(activeShift.cashSales)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Mobile Money</span>
                  <span className="font-mono tabular-nums font-semibold text-primary">
                    {formatUGX(activeShift.mobileMoneySales)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Card / Bank</span>
                  <span className="font-mono tabular-nums font-semibold text-primary">
                    {formatUGX(activeShift.cardSales)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Customer Credit</span>
                  <span className="font-mono tabular-nums font-semibold text-primary">
                    {formatUGX(activeShift.creditSales)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border font-bold">
                  <span className="text-primary">Expected Cash in Drawer</span>
                  <span className="font-mono tabular-nums text-accent">
                    {formatUGX(activeShift.expectedCash)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1">
                  Actual Counted Cash (UGX) *
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  className="input font-mono tabular-nums"
                  value={closingCashInput}
                  onChange={(e) => setClosingCashInput(e.target.value)}
                />
                {closingCashInput !== '' && (
                  <p
                    className={cn(
                      'text-xs font-bold mt-1 font-mono tabular-nums',
                      Number(closingCashInput) - activeShift.expectedCash === 0
                        ? 'text-accent'
                        : Number(closingCashInput) - activeShift.expectedCash > 0
                        ? 'text-primary'
                        : 'text-danger'
                    )}
                  >
                    Variance:{' '}
                    {Number(closingCashInput) - activeShift.expectedCash >= 0 ? '+' : ''}
                    {formatUGX(Number(closingCashInput) - activeShift.expectedCash)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1">
                  Reconciliation Notes (optional)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Any variance reason or handover note"
                  value={shiftNotes}
                  onChange={(e) => setShiftNotes(e.target.value)}
                />
              </div>

              {/* AI EOD Owner Digest */}
              <div className="p-3.5 rounded-xl bg-accent/5 border border-accent/20 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <Sparkles size={14} className="text-accent" />
                    AI End-of-Day Owner Digest
                  </span>
                  <button
                    type="button"
                    disabled={isGeneratingDigest}
                    onClick={handleGenerateEodDigest}
                    className="text-xs font-bold text-accent hover:underline whitespace-nowrap"
                  >
                    {isGeneratingDigest ? 'Drafting...' : eodDigest ? 'Refresh' : 'Generate Digest'}
                  </button>
                </div>
                {eodDigest && (
                  <div className="text-xs text-text-secondary space-y-1.5 pt-1">
                    <p className="font-bold text-primary">{eodDigest.headline}</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {eodDigest.highlights.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                    <p className="text-primary font-medium">Next: {eodDigest.actionForTomorrow}</p>
                    <a
                      href={buildDebtWhatsAppUrl(
                        undefined,
                        `${tenant?.name} — End of Day Digest\n${eodDigest.headline}\n${eodDigest.highlights
                          .map((h) => `• ${h}`)
                          .join('\n')}\nTomorrow: ${eodDigest.actionForTomorrow}`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent font-bold hover:underline pt-1"
                    >
                      <MessageCircle size={13} />
                      Share Digest to WhatsApp
                    </a>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCloseShiftModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isShiftSubmitting} className="btn btn-primary flex-1">
                  {isShiftSubmitting ? 'Closing...' : 'Confirm & Close Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick-Switch Cashier 4-Digit PIN Modal */}
      {showSwitchCashierModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[90dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <div className="flex items-center gap-2">
                <KeyRound size={18} />
                <div>
                  <h3 className="text-base font-bold text-white">Switch Counter Cashier</h3>
                  <p className="text-[11px] text-white/75">
                    Current: {currentOperator?.name || user?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSwitchCashierModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSwitchCashier} className="p-5 space-y-4 overflow-y-auto">
              {pinEnabledMembers.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-surface-alt border border-border text-xs text-text-secondary space-y-2">
                  <p className="font-bold text-primary">No 4-digit staff PINs configured yet.</p>
                  <p>
                    Go to Team &amp; Branches and assign a 4-digit POS PIN to each cashier so they can swap shifts instantly.
                  </p>
                  <Link
                    to="/team"
                    onClick={() => setShowSwitchCashierModal(false)}
                    className="inline-block font-bold text-accent hover:underline"
                  >
                    Open Team &amp; Branches &rarr;
                  </Link>
                </div>
              ) : (
                <>
                  {switchPinError && (
                    <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/25 text-danger text-xs font-medium">
                      {switchPinError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-primary mb-1">
                      Operator (Optional — or enter PIN directly)
                    </label>
                    <select
                      className="input w-full text-sm"
                      value={switchTargetUid}
                      onChange={(e) => setSwitchTargetUid(e.target.value)}
                    >
                      <option value="">Auto-detect by 4-digit PIN</option>
                      {pinEnabledMembers.map((m) => (
                        <option key={m.uid} value={m.uid}>
                          {m.name} ({ROLE_META[m.role]?.label || m.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-primary mb-1">
                      4-Digit Counter PIN *
                    </label>
                    <input
                      required
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      pattern="\d{4}"
                      placeholder="••••"
                      className="input w-full font-mono text-center text-2xl tracking-[0.55em]"
                      value={switchPinInput}
                      onChange={(e) => {
                        setSwitchPinError(null);
                        setSwitchPinInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                      }}
                      autoFocus
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSwitchCashierModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                {pinEnabledMembers.length > 0 && (
                  <button
                    type="submit"
                    disabled={isVerifyingPin || switchPinInput.length !== 4}
                    className="btn btn-primary flex-1"
                  >
                    {isVerifyingPin ? 'Verifying...' : 'Unlock Cashier'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
