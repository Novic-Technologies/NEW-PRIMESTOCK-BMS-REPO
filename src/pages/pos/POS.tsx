import React, { useState, useMemo } from 'react';
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
  Split,
} from 'lucide-react';
import { useInventory } from '../../hooks/useInventory';
import { usePOS } from '../../hooks/usePOS';
import { useCustomers } from '../../hooks/useCustomers';
import { useShifts } from '../../hooks/useShifts';
import { useBranches } from '../../hooks/useBranches';
import { useExpenses } from '../../hooks/useExpenses';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useAuthStore } from '../../store/authStore';
import { formatUGX } from '../../utils/format';
import { getEffectiveStock } from '../../utils/branchStock';
import { buildSaleWhatsAppUrl, buildDebtWhatsAppUrl } from '../../utils/whatsapp';
import { canAccessFeature } from '../../utils/planLimits';
import { printViaThermalSerial } from '../../utils/thermalPrint';
import { fetchEodOwnerDigest } from '../../services/aiService';
import { BarcodeScannerModal } from '../../components/shared/BarcodeScannerModal';
import {
  CheckoutCompletionPayload,
  UgandaCheckoutModal,
} from '../../components/checkout/UgandaCheckoutModal';
import { cn } from '../../lib/utils';
import { EodDigestResult, Sale } from '../../types';
import toast from 'react-hot-toast';

export default function POS() {
  const { tenant, user } = useAuthStore();
  const { products, isLoading } = useInventory();
  const { customers } = useCustomers();
  const { suppliers } = useSuppliers();
  const { expenses } = useExpenses();
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
    sales,
    clearCart,
  } = usePOS();

  const effectiveBranchId =
    activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user?.branchId || null;

  const [search, setSearch] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [completedSaleCustomerId, setCompletedSaleCustomerId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'products' | 'cart'>('products');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [openingFloatInput, setOpeningFloatInput] = useState('0');
  const [closingCashInput, setClosingCashInput] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [isShiftSubmitting, setIsShiftSubmitting] = useState(false);
  const [eodDigest, setEodDigest] = useState<EodDigestResult | null>(null);
  const [isGeneratingDigest, setIsGeneratingDigest] = useState(false);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category || 'Uncategorized'));
    return ['All', ...Array.from(cats)];
  }, [products]);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      selectedCategory === 'All' || (p.category || 'Uncategorized') === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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
      });
      if (sale) {
        if (activeShift && sale.status === 'completed') {
          await recordSaleOnShift(activeShift.id, payload.paymentMethod, sale.total, payload.splitPayments);
        }
        setShowPayment(false);
        setActiveTab('products');
        setCompletedSaleCustomerId(currentCustomerId);
        setCompletedSale(sale);
      }
    } finally {
      setIsProcessing(false);
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
    const res = await printViaThermalSerial(completedSale, tenant, receiptCustomer);
    if (res.mode === 'serial') {
      toast.success('Sent to thermal ESC/POS printer');
    }
  };

  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-160px)] overflow-hidden pb-16 lg:pb-0">
      {/* Mobile Tabs */}
      <div className="lg:hidden flex border-b border-border bg-white sticky top-0 z-10 no-print">
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={cn(
            'flex-1 py-4 font-bold text-sm transition-colors relative',
            activeTab === 'products' ? 'text-accent' : 'text-text-muted'
          )}
        >
          Products
          {activeTab === 'products' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-accent" />}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cart')}
          className={cn(
            'flex-1 py-4 font-bold text-sm transition-colors relative flex items-center justify-center gap-2',
            activeTab === 'cart' ? 'text-accent' : 'text-text-muted'
          )}
        >
          Cart
          {cartItemCount > 0 && (
            <span className="bg-accent text-white text-[10px] px-1.5 py-0.5 rounded-full tabular-nums">
              {cartItemCount}
            </span>
          )}
          {activeTab === 'cart' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-accent" />}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden p-4 lg:p-0 no-print">
        {/* Product Grid Section */}
        <div
          className={cn(
            'flex-1 flex flex-col gap-4 min-h-0',
            activeTab !== 'products' && 'hidden lg:flex'
          )}
        >
          {/* Shift Cash Drawer + Held Carts + Search and Customer */}
          <div className="space-y-3">
            <div className="card px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 bg-surface-alt/70">
              {activeShift ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-bold text-accent uppercase tracking-wider">
                      <Clock size={14} />
                      Shift Open
                    </span>
                    <span className="text-text-secondary">
                      Cashier: <strong className="text-primary">{activeShift.userName}</strong>
                    </span>
                    <span className="text-text-secondary">
                      Expected Drawer:{' '}
                      <strong className="text-primary font-mono tabular-nums">
                        {formatUGX(activeShift.expectedCash)}
                      </strong>
                    </span>
                    <span className="text-text-muted font-mono tabular-nums">
                      ({activeShift.salesCount} sales)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setClosingCashInput(String(activeShift.expectedCash));
                      setEodDigest(null);
                      setShowCloseShiftModal(true);
                    }}
                    className="btn btn-secondary py-1.5 px-3 text-xs gap-1.5 whitespace-nowrap"
                  >
                    <Calculator size={14} />
                    Close Shift
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Clock size={14} />
                    <span>No active cash drawer shift open. Open a shift to track float &amp; variance.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpeningFloatInput('0');
                      setShowOpenShiftModal(true);
                    }}
                    className="btn btn-primary py-1.5 px-3 text-xs gap-1.5 whitespace-nowrap"
                  >
                    <Clock size={14} />
                    Open Shift
                  </button>
                </>
              )}
            </div>

            {heldCarts.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted shrink-0">
                  Parked ({heldCarts.length}):
                </span>
                {heldCarts.map((held) => (
                  <div
                    key={held.id}
                    className="inline-flex items-center gap-1.5 bg-white border border-border rounded-lg px-2.5 py-1 text-xs shrink-0"
                  >
                    <button
                      type="button"
                      onClick={() => resumeHeldCart(held.id)}
                      className="font-bold text-primary hover:text-accent inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Play size={12} className="text-accent" />
                      {held.label} ({held.items.reduce((s, i) => s + i.quantity, 0)})
                    </button>
                    <button
                      type="button"
                      onClick={() => discardHeldCart(held.id)}
                      aria-label={`Discard ${held.label}`}
                      className="text-text-muted hover:text-danger ml-1"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="card p-3 flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    type="text"
                    placeholder="Search products by name, SKU, or barcode..."
                    className="input pl-10 py-2.5 text-base w-full"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="btn btn-secondary px-3 py-2.5 gap-1.5 text-xs whitespace-nowrap"
                  title="Scan Barcode with Camera"
                >
                  <Camera size={17} />
                  <span className="hidden sm:inline">Scan</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerModal(true)}
                className={cn(
                  'btn py-2.5 px-4 gap-2 w-full sm:w-auto text-sm whitespace-nowrap',
                  selectedCustomer ? 'btn-primary' : 'btn-secondary'
                )}
              >
                <User size={18} />
                <span className="truncate max-w-[160px]">
                  {selectedCustomer
                    ? `${selectedCustomer.name}${
                        selectedCustomer.type === 'Wholesale' || selectedCustomer.type === 'VIP'
                          ? ` (${selectedCustomer.type})`
                          : ''
                      }`
                    : 'Select Customer'}
                </span>
              </button>
            </div>

            {/* Category Filter */}
            <div className="flex overflow-x-auto pb-2 gap-2 no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all border',
                    selectedCategory === cat
                      ? 'bg-accent border-accent text-white shadow-sm'
                      : 'bg-white border-border text-text-muted hover:border-accent/50'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Products Scrollable Area */}
          <div className="flex-1 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="h-full flex items-center justify-center py-20">
                <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-text-muted py-20">
                <Package size={48} className="mb-4 opacity-40" />
                <p className="font-bold">No products found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {filteredProducts.map((product) => {
                  const branchStock = getEffectiveStock(product, effectiveBranchId);
                  const isOut = branchStock <= 0;
                  const isLow = branchStock <= (product.minStockLevel ?? 0);
                  const displayPrice =
                    selectedCustomerType === 'Wholesale' && product.wholesalePrice
                      ? product.wholesalePrice
                      : selectedCustomerType === 'VIP' && product.vipPrice
                      ? product.vipPrice
                      : product.sellingPrice;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={isOut}
                      onClick={() => addToCart(product)}
                      className={cn(
                        'card p-3 sm:p-4 text-left transition-all group relative overflow-hidden flex flex-col h-full',
                        isOut ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent hover:shadow-lg'
                      )}
                    >
                      <div className="w-full aspect-square bg-surface-alt rounded-lg mb-3 flex items-center justify-center text-primary font-bold text-xl sm:text-2xl group-hover:scale-105 transition-transform shrink-0">
                        {product.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-primary truncate text-sm sm:text-base leading-tight">
                          {product.name}
                        </p>
                        <p className="text-accent font-bold mt-1 text-sm sm:text-base font-mono tabular-nums">
                          {formatUGX(displayPrice)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50 text-[10px] font-bold uppercase tabular-nums">
                        <span className={isLow ? 'text-danger' : 'text-accent'}>
                          {isOut ? 'Out of stock' : `${branchStock} in stock`}
                        </span>
                        <span className="text-text-muted">{product.unit || 'pcs'}</span>
                      </div>

                      {!isOut && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex">
                          <div className="w-8 h-8 bg-accent text-white rounded-full flex items-center justify-center shadow-lg">
                            <Plus size={18} />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cart / Checkout Section */}
        <div
          className={cn(
            'w-full lg:w-[380px] xl:w-[420px] flex flex-col min-h-0',
            activeTab !== 'cart' && 'hidden lg:flex'
          )}
        >
          <div className="card flex-1 flex flex-col p-0 overflow-hidden border-accent/20">
            <div className="p-4 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <ShoppingCart size={20} className="shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-bold text-white leading-tight">Current Cart</h3>
                  <p className="text-xs text-white/70 truncate">
                    {selectedCustomer
                      ? `${selectedCustomer.name} · ${selectedCustomer.type}`
                      : 'Walk-in Customer'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-accent uppercase tracking-wider tabular-nums shrink-0">
                {cartItemCount} {cartItemCount === 1 ? 'Item' : 'Items'}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-50 py-20">
                  <ShoppingCart size={56} className="mb-4" />
                  <p className="font-bold text-lg">Cart is empty</p>
                  <p className="text-sm">Add products or scan barcode to start a sale</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 group">
                    <div className="w-10 h-10 bg-surface-alt rounded-lg flex items-center justify-center text-primary font-bold shrink-0 text-sm">
                      {item.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-primary truncate">{item.name}</p>
                      <p className="text-xs text-text-muted font-mono tabular-nums">
                        {formatUGX(item.appliedPrice)}
                        {item.priceTier !== 'retail' && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase text-accent">
                            {item.priceTier}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 bg-surface-alt rounded-lg p-0.5">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.name} quantity`}
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-7 h-7 flex items-center justify-center hover:bg-white rounded transition-colors text-text-muted hover:text-primary"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="text-sm font-bold w-6 text-center text-primary tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${item.name} quantity`}
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-7 h-7 flex items-center justify-center hover:bg-white rounded transition-colors text-text-muted hover:text-primary"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => removeFromCart(item.id)}
                      className="p-2 text-text-muted hover:text-danger transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-5 bg-surface-alt border-t border-border space-y-3 shrink-0">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Subtotal</span>
                  <span className="font-bold text-primary font-mono tabular-nums">
                    {formatUGX(subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Discount</span>
                  <button
                    type="button"
                    disabled={cart.length === 0}
                    onClick={() => {
                      setDiscountInput(discount > 0 ? String(discount) : '');
                      setShowDiscountModal(true);
                    }}
                    className="text-accent font-bold hover:underline flex items-center gap-1 font-mono tabular-nums disabled:opacity-50"
                  >
                    <Tag size={12} />
                    {discount > 0 ? `-${formatUGX(discount)}` : 'Add Discount'}
                  </button>
                </div>
                {taxConfig.enabled && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">
                      VAT ({taxConfig.rate}%{taxConfig.inclusive ? ' incl.' : ''})
                    </span>
                    <span className="font-bold text-primary font-mono tabular-nums">
                      {formatUGX(taxAmount)}
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between">
                <span className="font-bold text-primary uppercase tracking-wider text-xs">
                  Total Amount
                </span>
                <span className="text-2xl font-bold text-accent font-mono tabular-nums">
                  {formatUGX(total)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                <button
                  type="button"
                  onClick={clearCart}
                  disabled={cart.length === 0}
                  className="btn btn-secondary py-3 text-xs font-bold"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => parkCurrentCart(selectedCustomer?.name)}
                  disabled={cart.length === 0}
                  className="btn btn-secondary py-3 text-xs font-bold gap-1"
                  title="Hold / Park Cart"
                >
                  <PauseCircle size={15} />
                  Park
                </button>
                <button
                  type="button"
                  onClick={() => setShowPayment(true)}
                  disabled={cart.length === 0}
                  className="btn btn-primary py-3 text-xs font-bold gap-1.5 shadow-lg shadow-accent/20"
                >
                  <CreditCard size={15} />
                  Checkout
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Summary Bar */}
      {activeTab === 'products' && cartItemCount > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-primary text-white px-4 py-3 flex items-center justify-between shadow-2xl z-30 no-print">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-white/60 tracking-widest">
              Total Amount
            </span>
            <span className="text-xl font-bold text-accent font-mono tabular-nums">
              {formatUGX(total)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('cart')}
            className="btn btn-primary py-2.5 px-5 gap-2 font-bold text-sm"
          >
            <ShoppingCart size={18} />
            View Cart ({cartItemCount})
          </button>
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
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white">
              <h3 className="text-lg font-bold text-white">Select Customer</h3>
              <button
                type="button"
                onClick={() => setShowCustomerModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
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
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white">
              <h3 className="text-lg font-bold text-white">Apply Discount</h3>
              <button
                type="button"
                onClick={() => setShowDiscountModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleApplyDiscount} className="p-5 space-y-4">
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
                  Max subtotal: {formatUGX(subtotal)}
                </p>
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
        <div className="fixed inset-0 bg-primary/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white no-print">
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

            <div className="p-6 space-y-4 print-content">
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
                <div className="text-center pt-3 border-t border-dashed border-border space-y-1">
                  {tenant.preferences?.receiptFooter && (
                    <p className="text-xs text-text-muted">{tenant.preferences.receiptFooter}</p>
                  )}
                  <p className="text-[10px] text-text-muted">Built &amp; managed by Novic Technologies</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-surface-alt border-t border-border flex flex-wrap gap-2 no-print">
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
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white">
              <h3 className="text-lg font-bold text-white">Open Cash Drawer Shift</h3>
              <button
                type="button"
                onClick={() => setShowOpenShiftModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleOpenShift} className="p-5 space-y-4">
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
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
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
    </div>
  );
}
