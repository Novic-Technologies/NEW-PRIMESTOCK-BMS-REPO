import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Plus,
  ClipboardList,
  CheckCircle2,
  X,
  Camera,
  Trash2,
  PackageCheck,
  Ban,
  Sparkles,
  FileCheck2,
} from 'lucide-react';
import { usePurchaseOrders } from '../../hooks/usePurchaseOrders';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useInventory } from '../../hooks/useInventory';
import { useBranches } from '../../hooks/useBranches';
import { useAuthStore } from '../../store/authStore';
import { PurchaseOrder, PurchaseOrderItem } from '../../types';
import { getEffectiveStock } from '../../utils/branchStock';
import {
  fileToBase64,
  InvoiceCheckResult,
  runAiAssistantTool,
  scanDocumentImage,
} from '../../services/aiService';
import { convertCurrencyToUgx } from '../../utils/inventoryMath';
import { canAccessFeature } from '../../utils/planLimits';
import { SmartImportModal } from '../../components/shared/SmartImportModal';
import { MobileListSkeleton, TableRowsSkeleton } from '../../components/shared/Skeletons';
import { formatUGX, formatDate } from '../../utils/format';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

export default function PurchaseOrders() {
  const location = useLocation();
  const { activeBranchId, tenant } = useAuthStore();
  const {
    purchaseOrders,
    isLoading,
    createPurchaseOrder,
    receivePurchaseOrderPartial,
    cancelPurchaseOrder,
    bulkImportPurchaseOrders,
  } = usePurchaseOrders();
  const { suppliers } = useSuppliers();
  const { products } = useInventory();
  const { branches } = useBranches();

  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseOrder['status']>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null);
  const [paidNowInput, setPaidNowInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [grnNotes, setGrnNotes] = useState('');
  const [grnLines, setGrnLines] = useState<
    Record<string, { quantityReceived: number; batchNumber: string; expiryDate: string }>
  >({});

  const [supplierId, setSupplierId] = useState('');
  const [poCurrency, setPoCurrency] = useState<'UGX' | 'USD' | 'KES'>('UGX');
  const [poFxRate, setPoFxRate] = useState('1');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [poItems, setPoItems] = useState<PurchaseOrderItem[]>([]);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemCost, setItemCost] = useState(0);
  const [isScanning, setIsScanning] = useState(false);

  const [checkingPO, setCheckingPO] = useState<PurchaseOrder | null>(null);
  const [invoicePasteText, setInvoicePasteText] = useState('');
  const [invoiceCheckRes, setInvoiceCheckRes] = useState<InvoiceCheckResult | null>(null);
  const [isCheckingInvoice, setIsCheckingInvoice] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const checkFileRef = useRef<HTMLInputElement>(null);

  // Support deep-link prefill from AI Smart Restock Forecast
  useEffect(() => {
    const state = location.state as { prefillItems?: PurchaseOrderItem[] } | null;
    if (state?.prefillItems && state.prefillItems.length > 0) {
      setPoItems(state.prefillItems);
      setIsCreateOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const branchNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach((b) => {
      map[b.id] = b.name;
    });
    return map;
  }, [branches]);

  const scopedPOs = useMemo(() => {
    if (!activeBranchId || activeBranchId === 'ALL') return purchaseOrders;
    return purchaseOrders.filter((po) => !po.branchId || po.branchId === activeBranchId);
  }, [purchaseOrders, activeBranchId]);

  const filteredPOs = useMemo(
    () => scopedPOs.filter((po) => (statusFilter === 'all' ? true : po.status === statusFilter)),
    [scopedPOs, statusFilter]
  );

  const stats = useMemo(() => {
    const openOrders = scopedPOs.filter(
      (p) => p.status === 'ordered' || p.status === 'partially_received'
    );
    const receivedOrders = scopedPOs.filter((p) => p.status === 'received');
    const totalOrderedValue = openOrders.reduce((s, p) => s + p.totalAmount, 0);
    return {
      openCount: openOrders.length,
      receivedCount: receivedOrders.length,
      totalOrderedValue,
    };
  }, [scopedPOs]);

  const handleAddLineItem = () => {
    const prod = products.find((p) => p.id === selectedProdId);
    if (!prod) {
      toast.error('Select a product to add');
      return;
    }
    const qty = Math.max(1, Number(itemQty) || 1);
    const cost = Math.max(0, Number(itemCost) || prod.buyingPrice || 0);
    setPoItems((prev) => {
      const existing = prev.find((i) => i.productId === prod.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === prod.id
            ? {
                ...i,
                quantity: i.quantity + qty,
                unitCost: cost,
                total: (i.quantity + qty) * cost,
              }
            : i
        );
      }
      return [
        ...prev,
        { productId: prod.id, name: prod.name, quantity: qty, unitCost: cost, total: qty * cost },
      ];
    });
    setSelectedProdId('');
    setItemQty(1);
    setItemCost(0);
  };

  const handleScanInvoice = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const scanned = await scanDocumentImage({
        imageBase64: base64,
        mimeType,
        targetType: 'purchase_order',
      });

      if (scanned.vendorName) {
        const matchedSupplier = suppliers.find((s) =>
          s.name.toLowerCase().includes(scanned.vendorName!.toLowerCase()) ||
          scanned.vendorName!.toLowerCase().includes(s.name.toLowerCase())
        );
        if (matchedSupplier) setSupplierId(matchedSupplier.id);
      }
      if (scanned.documentDate) {
        setExpectedDate(scanned.documentDate);
      }
      if (scanned.reference) {
        setNotes((prev) => (prev ? `${prev} · Ref: ${scanned.reference}` : `Invoice Ref: ${scanned.reference}`));
      }

      if (Array.isArray(scanned.items) && scanned.items.length > 0) {
        const matchedItems: PurchaseOrderItem[] = [];
        scanned.items.forEach((line) => {
          const prod = products.find(
            (p) =>
              p.name.toLowerCase().includes(line.name.toLowerCase()) ||
              line.name.toLowerCase().includes(p.name.toLowerCase())
          );
          if (prod) {
            const qty = Math.max(1, Number(line.quantity) || 1);
            const unitCost = Math.max(0, Number(line.unitCost) || prod.buyingPrice || 0);
            matchedItems.push({
              productId: prod.id,
              name: prod.name,
              quantity: qty,
              unitCost,
              total: qty * unitCost,
            });
          }
        });
        if (matchedItems.length > 0) {
          setPoItems((prev) => [...prev, ...matchedItems]);
          toast.success(`Matched ${matchedItems.length} product(s) from invoice`);
        } else {
          toast('Invoice scanned, but line items did not match existing SKUs. Add lines manually.');
        }
      } else {
        toast.success('Invoice scanned');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to scan supplier invoice');
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) {
      toast.error('Please select a supplier');
      return;
    }
    const created = await createPurchaseOrder({
      supplierId: supplier.id,
      supplierName: supplier.name,
      items: poItems,
      expectedDate: expectedDate || undefined,
      notes: notes || undefined,
      currency: poCurrency,
      exchangeRateToUgx: poCurrency === 'UGX' ? 1 : Math.max(1, Number(poFxRate) || 1),
    });
    if (created) {
      setIsCreateOpen(false);
      setSupplierId('');
      setPoCurrency('UGX');
      setPoFxRate('1');
      setExpectedDate('');
      setNotes('');
      setPoItems([]);
    }
  };

  const openReceiveModal = (po: PurchaseOrder) => {
    setReceivingPO(po);
    setGrnNotes('');
    const initLines: Record<string, { quantityReceived: number; batchNumber: string; expiryDate: string }> = {};
    po.items.forEach((item) => {
      const remaining = Math.max(0, item.quantity - (Number(item.receivedQuantity) || 0));
      initLines[item.productId] = {
        quantityReceived: remaining,
        batchNumber: `${po.reference}-LOT`,
        expiryDate: '',
      };
    });
    setGrnLines(initLines);
    setPaidNowInput(String(Math.max(0, po.totalAmount - (po.paidAmount || 0))));
  };

  const handleConfirmReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingPO) return;
    await receivePurchaseOrderPartial({
      poId: receivingPO.id,
      lineReceipts: receivingPO.items.map((item) => ({
        productId: item.productId,
        quantityReceived: Number(grnLines[item.productId]?.quantityReceived) || 0,
        batchNumber: grnLines[item.productId]?.batchNumber || undefined,
        expiryDate: grnLines[item.productId]?.expiryDate || undefined,
      })),
      paidAtReceiving: Number(paidNowInput) || 0,
      paymentMethod,
      notes: grnNotes || undefined,
    });
    setReceivingPO(null);
    setPaidNowInput('');
    setGrnNotes('');
  };

  const handleRunPoInvoiceCheck = async (opts?: { base64?: string; mimeType?: string }) => {
    if (!checkingPO) return;
    if (!opts?.base64 && !invoicePasteText.trim()) {
      toast.error('Paste invoice text or upload an invoice photo to compare');
      return;
    }
    setIsCheckingInvoice(true);
    try {
      const res = await runAiAssistantTool<InvoiceCheckResult>('check_invoice', {
        poReference: checkingPO.reference,
        poItems: checkingPO.items,
        invoiceText: invoicePasteText.trim(),
        imageBase64: opts?.base64,
        mimeType: opts?.mimeType,
      });
      setInvoiceCheckRes(res);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to check invoice against PO');
    } finally {
      setIsCheckingInvoice(false);
    }
  };

  const draftForeignTotal = poItems.reduce((sum, i) => sum + i.total, 0);
  const draftTotalUgx = convertCurrencyToUgx(
    draftForeignTotal,
    poCurrency,
    poCurrency === 'UGX' ? 1 : Math.max(1, Number(poFxRate) || 1)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Purchase Orders</h1>
          <p className="text-text-muted mt-1">
            Order inventory from suppliers, scan invoices with AI, and receive stock live.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              if (!canAccessFeature(tenant, 'suppliersAndPOs')) {
                toast.error('Purchase Orders require Starter plan or higher. Upgrade in Billing.');
                return;
              }
              setIsImportOpen(true);
            }}
            className="btn btn-secondary gap-2 whitespace-nowrap"
          >
            <Sparkles size={17} className="text-accent" />
            Smart Import POs
          </button>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="btn btn-primary gap-2 whitespace-nowrap"
          >
            <Plus size={18} />
            New Purchase Order
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-primary rounded-xl text-white shrink-0">
            <ClipboardList size={24} />
          </div>
          <div>
            <p className="text-text-muted text-sm font-medium">Open Orders</p>
            <h3 className="text-2xl font-bold text-primary font-mono tabular-nums">
              {stats.openCount}
            </h3>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-accent-alt rounded-xl text-white shrink-0">
            <PackageCheck size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-sm font-medium">Pending Stock Value</p>
            <h3 className="text-2xl font-bold text-primary font-mono tabular-nums truncate">
              {formatUGX(stats.totalOrderedValue)}
            </h3>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-accent rounded-xl text-white shrink-0">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-text-muted text-sm font-medium">Orders Received</p>
            <h3 className="text-2xl font-bold text-primary font-mono tabular-nums">
              {stats.receivedCount}
            </h3>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-surface-alt/50">
          <div className="flex items-center gap-1 p-1 bg-surface border border-border rounded-lg max-w-full overflow-x-auto">
            {(['all', 'ordered', 'partially_received', 'received', 'cancelled'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors whitespace-nowrap',
                  statusFilter === status
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-primary'
                )}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="bg-surface-alt/50 border-b border-border text-xs font-bold text-text-muted uppercase tracking-wider">
                <th className="px-6 py-4">Reference</th>
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Items</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {isLoading ? (
                <TableRowsSkeleton rows={6} columns={6} />
              ) : filteredPOs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-text-muted">
                    No purchase orders found. Create your first supplier restock order.
                  </td>
                </tr>
              ) : (
                filteredPOs.map((po) => (
                  <tr key={po.id} className="hover:bg-surface-alt/30">
                    <td className="px-6 py-4">
                      <p className="font-bold text-primary font-mono">{po.reference}</p>
                      <p className="text-xs text-text-muted">
                        {formatDate(po.createdAt)}
                        {po.branchId && branchNameMap[po.branchId]
                          ? ` · ${branchNameMap[po.branchId]}`
                          : ''}
                      </p>
                    </td>
                    <td className="px-6 py-4 font-medium text-primary">{po.supplierName}</td>
                    <td className="px-6 py-4 text-text-secondary font-mono tabular-nums">
                      <p>
                        {po.items.length} SKU(s) ·{' '}
                        {po.items.reduce((s, i) => s + i.quantity, 0)} units
                      </p>
                      {po.grnHistory && po.grnHistory.length > 0 && (
                        <p className="text-[11px] text-accent">
                          {po.grnHistory.length} GRN ({po.items.reduce((s, i) => s + (i.receivedQuantity || 0), 0)}/{po.items.reduce((s, i) => s + i.quantity, 0)} recvd)
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-primary font-mono tabular-nums">
                      <p>{formatUGX(po.totalAmount)}</p>
                      {po.currency && po.currency !== 'UGX' && po.foreignTotalAmount && (
                        <p className="text-[11px] font-normal text-text-muted">
                          {po.currency} {po.foreignTotalAmount.toLocaleString()} @ {po.exchangeRateToUgx}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          'text-xs font-bold uppercase',
                          po.status === 'received'
                            ? 'text-accent'
                            : po.status === 'ordered' || po.status === 'partially_received'
                            ? 'text-accent-alt'
                            : 'text-danger'
                        )}
                      >
                        {po.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {po.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => {
                              setCheckingPO(po);
                              setInvoicePasteText('');
                              setInvoiceCheckRes(null);
                            }}
                            className="btn btn-secondary text-xs py-1.5 px-2.5 min-h-[34px] gap-1 whitespace-nowrap"
                            title="Compare supplier invoice against PO"
                          >
                            <FileCheck2 size={14} className="text-accent" />
                            Check Invoice
                          </button>
                        )}
                        {po.status === 'ordered' || po.status === 'partially_received' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openReceiveModal(po)}
                              className="btn btn-primary text-xs py-1.5 px-3 min-h-[34px] whitespace-nowrap"
                            >
                              {po.status === 'partially_received' ? 'Receive Balance' : 'Receive GRN'}
                            </button>
                            {po.status === 'ordered' && (
                              <button
                                type="button"
                                onClick={() => cancelPurchaseOrder(po.id)}
                                aria-label={`Cancel ${po.reference}`}
                                className="p-2 text-text-muted hover:text-danger rounded-lg hover:bg-danger/10"
                              >
                                <Ban size={16} />
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {po.receivedAt ? `Received ${formatDate(po.receivedAt)}` : 'Closed'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile List View */}
        <div className="md:hidden divide-y divide-border">
          {isLoading ? (
            <MobileListSkeleton cards={5} />
          ) : filteredPOs.length === 0 ? (
            <div className="p-10 text-center text-text-muted text-sm">
              No purchase orders found. Create your first supplier restock order.
            </div>
          ) : (
            filteredPOs.map((po) => (
              <div key={po.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-primary font-mono truncate">{po.reference}</p>
                    <p className="text-xs text-text-muted truncate">
                      {formatDate(po.createdAt)}
                      {po.branchId && branchNameMap[po.branchId]
                        ? ` · ${branchNameMap[po.branchId]}`
                        : ''}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-bold uppercase shrink-0',
                      po.status === 'received'
                        ? 'text-accent'
                        : po.status === 'ordered' || po.status === 'partially_received'
                        ? 'text-accent-alt'
                        : 'text-danger'
                    )}
                  >
                    {po.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{po.supplierName}</p>
                    <p className="text-xs text-text-secondary font-mono tabular-nums">
                      {po.items.length} SKU(s) · {po.items.reduce((s, i) => s + i.quantity, 0)} units
                    </p>
                  </div>
                  <p className="text-base font-bold text-primary font-mono tabular-nums shrink-0">
                    {formatUGX(po.totalAmount)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/60">
                  {po.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => {
                        setCheckingPO(po);
                        setInvoicePasteText('');
                        setInvoiceCheckRes(null);
                      }}
                      className="btn btn-secondary text-xs py-1.5 px-2.5 min-h-[36px] gap-1 whitespace-nowrap"
                    >
                      <FileCheck2 size={14} className="text-accent" />
                      Check Invoice
                    </button>
                  )}
                  {po.status === 'ordered' || po.status === 'partially_received' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openReceiveModal(po)}
                        className="btn btn-primary text-xs py-1.5 px-3 min-h-[36px] whitespace-nowrap"
                      >
                        {po.status === 'partially_received' ? 'Receive Balance' : 'Receive GRN'}
                      </button>
                      {po.status === 'ordered' && (
                        <button
                          type="button"
                          onClick={() => cancelPurchaseOrder(po.id)}
                          aria-label={`Cancel ${po.reference}`}
                          className="btn btn-secondary text-xs py-1.5 px-2.5 min-h-[36px] text-danger hover:bg-danger/10"
                        >
                          <Ban size={14} />
                          Cancel
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-text-muted">
                      {po.receivedAt ? `Received ${formatDate(po.receivedAt)}` : 'Closed'}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Purchase Order Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-border">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <ClipboardList size={22} />
                <h3 className="text-lg font-bold text-white">New Purchase Order</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreatePO} className="p-6 space-y-5 overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-surface-alt rounded-xl border border-border">
                <div>
                  <p className="text-xs font-bold text-primary">AI Supplier Invoice Scanner</p>
                  <p className="text-xs text-text-muted">
                    Upload a photo of a supplier invoice to auto-match products and quantities.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleScanInvoice}
                />
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-secondary text-xs gap-2 whitespace-nowrap"
                >
                  <Camera size={15} />
                  {isScanning ? 'Scanning Invoice...' : 'Scan Invoice Photo'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Supplier *</label>
                  <select
                    required
                    className="input w-full"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  >
                    <option value="">Select supplier...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Expected Delivery</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Order Currency</label>
                  <select
                    className="input w-full"
                    value={poCurrency}
                    onChange={(e) => {
                      const next = e.target.value as 'UGX' | 'USD' | 'KES';
                      setPoCurrency(next);
                      setPoFxRate(next === 'UGX' ? '1' : next === 'USD' ? '3700' : '28.5');
                    }}
                  >
                    <option value="UGX">UGX (Uganda Shillings)</option>
                    <option value="USD">USD (US Dollars)</option>
                    <option value="KES">KES (Kenyan Shillings)</option>
                  </select>
                </div>
                {poCurrency !== 'UGX' && (
                  <div>
                    <label className="block text-sm font-bold text-primary mb-1">
                      FX Rate (1 {poCurrency} to UGX)
                    </label>
                    <input
                      type="number"
                      min={1}
                      step="0.1"
                      className="input w-full font-mono tabular-nums"
                      value={poFxRate}
                      onChange={(e) => setPoFxRate(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="p-4 border border-border rounded-xl space-y-3">
                <p className="text-sm font-bold text-primary">Add Products to Order</p>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <select
                    className="input sm:col-span-5"
                    value={selectedProdId}
                    onChange={(e) => {
                      const prod = products.find((p) => p.id === e.target.value);
                      setSelectedProdId(e.target.value);
                      setItemCost(prod?.buyingPrice || 0);
                    }}
                  >
                    <option value="">Select product...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Stock: {getEffectiveStock(p, activeBranchId)})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    placeholder="Qty"
                    className="input sm:col-span-2 font-mono"
                    value={itemQty}
                    onChange={(e) => setItemQty(Number(e.target.value))}
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Unit Cost"
                    className="input sm:col-span-3 font-mono"
                    value={itemCost}
                    onChange={(e) => setItemCost(Number(e.target.value))}
                  />
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="btn btn-secondary sm:col-span-2 whitespace-nowrap"
                  >
                    Add
                  </button>
                </div>

                {poItems.length > 0 && (
                  <div className="divide-y divide-border pt-2">
                    {poItems.map((item) => (
                      <div key={item.productId} className="py-2 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-primary truncate">{item.name}</p>
                          <p className="text-xs text-text-muted font-mono tabular-nums">
                            {item.quantity} × {formatUGX(item.unitCost)}
                          </p>
                        </div>
                        <span className="font-bold text-primary font-mono tabular-nums">
                          {formatUGX(item.total)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setPoItems((prev) => prev.filter((i) => i.productId !== item.productId))
                          }
                          className="p-1.5 text-text-muted hover:text-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1">Notes</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Optional reference or delivery instructions"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm font-bold text-text-secondary">
                  Order Total {poCurrency !== 'UGX' ? `(${poCurrency} -> UGX)` : ''}
                </span>
                <div className="text-right">
                  {poCurrency !== 'UGX' && (
                    <p className="text-xs text-text-muted font-mono tabular-nums">
                      {poCurrency} {draftForeignTotal.toLocaleString()}
                    </p>
                  )}
                  <span className="text-xl font-bold text-primary font-mono tabular-nums">
                    {formatUGX(draftTotalUgx)}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={poItems.length === 0}
                  className="btn btn-primary flex-1"
                >
                  Issue Purchase Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Purchase Order GRN (Partial & Lot Tracking) Modal */}
      {receivingPO && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90dvh] border border-border">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white truncate pr-2">
                  Goods Received Note · {receivingPO.reference}
                </h3>
                <p className="text-xs text-white/75">{receivingPO.supplierName}</p>
              </div>
              <button
                type="button"
                onClick={() => setReceivingPO(null)}
                className="p-1 hover:bg-white/10 rounded-lg shrink-0"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleConfirmReceive} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-text-secondary">
                  Enter units delivered in this shipment. Remaining units stay open as <strong>Partially Received</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const filled: typeof grnLines = {};
                    receivingPO.items.forEach((it) => {
                      const rem = Math.max(0, it.quantity - (Number(it.receivedQuantity) || 0));
                      filled[it.productId] = {
                        ...(grnLines[it.productId] || { batchNumber: `${receivingPO.reference}-LOT`, expiryDate: '' }),
                        quantityReceived: rem,
                      };
                    });
                    setGrnLines(filled);
                  }}
                  className="text-xs font-bold text-accent hover:underline whitespace-nowrap shrink-0"
                >
                  Fill All Remaining
                </button>
              </div>

              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {receivingPO.items.map((item) => {
                  const already = Number(item.receivedQuantity) || 0;
                  const remaining = Math.max(0, item.quantity - already);
                  const line = grnLines[item.productId] || {
                    quantityReceived: remaining,
                    batchNumber: '',
                    expiryDate: '',
                  };
                  return (
                    <div
                      key={item.productId}
                      className="p-3 rounded-xl bg-surface-alt/50 border border-border space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-primary truncate">{item.name}</span>
                        <span className="font-mono tabular-nums text-text-muted shrink-0">
                          Ordered {item.quantity} · Recvd {already} · Left {remaining}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">
                            Qty Now
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={remaining}
                            className="input-sm w-full font-mono tabular-nums"
                            value={line.quantityReceived}
                            onChange={(e) =>
                              setGrnLines((prev) => ({
                                ...prev,
                                [item.productId]: {
                                  ...line,
                                  quantityReceived: Math.min(remaining, Math.max(0, Number(e.target.value) || 0)),
                                },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">
                            Batch / Lot #
                          </label>
                          <input
                            type="text"
                            placeholder="Optional"
                            className="input-sm w-full font-mono"
                            value={line.batchNumber}
                            onChange={(e) =>
                              setGrnLines((prev) => ({
                                ...prev,
                                [item.productId]: { ...line, batchNumber: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">
                            Expiry Date
                          </label>
                          <input
                            type="date"
                            className="input-sm w-full"
                            value={line.expiryDate}
                            onChange={(e) =>
                              setGrnLines((prev) => ({
                                ...prev,
                                [item.productId]: { ...line, expiryDate: e.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">
                    Amount Paid Now (UGX)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={receivingPO.totalAmount}
                    className="input w-full font-mono tabular-nums"
                    value={paidNowInput}
                    onChange={(e) => setPaidNowInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Payment Method</label>
                  <select
                    className="input w-full"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Mobile Money">Mobile Money</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1">GRN Delivery Note</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Driver name, waybill, or condition note"
                  value={grnNotes}
                  onChange={(e) => setGrnNotes(e.target.value)}
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setReceivingPO(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Confirm GRN &amp; Restock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Invoice vs PO Discrepancy Check Modal */}
      {checkingPO && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col border border-border">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white">Check Supplier Invoice</h3>
                <p className="text-xs text-white/75">
                  {checkingPO.reference} · {checkingPO.supplierName} ({formatUGX(checkingPO.totalAmount)})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCheckingPO(null)}
                className="p-1 hover:bg-white/10 rounded-lg"
                aria-label="Close invoice checker"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto text-sm">
              <p className="text-xs text-text-secondary">
                Paste invoice line items or upload a supplier invoice photo to spot overcharges, missing units, or unexpected items before settling.
              </p>
              <textarea
                rows={4}
                className="input w-full text-xs"
                placeholder="Paste supplier invoice lines, quantities, and unit prices..."
                value={invoicePasteText}
                onChange={(e) => setInvoicePasteText(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={checkFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const data = await fileToBase64(file);
                    void handleRunPoInvoiceCheck(data);
                    if (checkFileRef.current) checkFileRef.current.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={isCheckingInvoice || !invoicePasteText.trim()}
                  onClick={() => handleRunPoInvoiceCheck()}
                  className="btn btn-primary text-xs whitespace-nowrap"
                >
                  {isCheckingInvoice ? 'Checking...' : 'Compare Pasted Invoice'}
                </button>
                <button
                  type="button"
                  disabled={isCheckingInvoice}
                  onClick={() => checkFileRef.current?.click()}
                  className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap"
                >
                  <Camera size={14} />
                  Upload Invoice Photo
                </button>
              </div>

              {invoiceCheckRes && (() => {
                const discrepancies = invoiceCheckRes.discrepancies || [];
                const flaggedCount = discrepancies.filter((d) => d.status !== 'matched').length;
                const totalVarianceUgx = discrepancies.reduce(
                  (sum, d) =>
                    sum +
                    ((Number(d.invoiceQty) || 0) * (Number(d.invoiceUnitCostUgx) || 0) -
                      (Number(d.poQty) || 0) * (Number(d.poUnitCostUgx) || 0)),
                  0
                );
                return (
                  <div className="p-4 rounded-xl bg-surface-alt border border-border space-y-2 text-xs">
                    <div className="flex justify-between font-bold text-primary">
                      <span>
                        Status: {flaggedCount === 0 ? 'MATCHED' : `${flaggedCount} ISSUE(S) FLAGGED`}
                      </span>
                      <span className="font-mono tabular-nums">
                        Variance: {totalVarianceUgx > 0 ? '+' : ''}
                        {formatUGX(totalVarianceUgx)}
                      </span>
                    </div>
                    <p className="text-text-secondary">{invoiceCheckRes.summary}</p>
                    {discrepancies.map((d, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'pt-1.5 border-t border-border/60',
                          d.status === 'matched' ? 'text-accent' : 'text-danger'
                        )}
                      >
                        <strong>{d.itemName}</strong> ({d.status.replace(/_/g, ' ')}): {d.reason}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <SmartImportModal
        isOpen={isImportOpen}
        entityType="purchases"
        onClose={() => setIsImportOpen(false)}
        onCommit={(rows, options) =>
          bulkImportPurchaseOrders(
            rows.map((r) => ({
              reference: r.reference ? String(r.reference) : undefined,
              supplierName: String(r.supplierName || ''),
              supplierPhone: r.supplierPhone ? String(r.supplierPhone) : undefined,
              itemName: String(r.itemName || ''),
              sku: r.sku ? String(r.sku) : undefined,
              quantity: Number(r.quantity) || 1,
              unitCost: Number(r.unitCost) || 0,
              totalAmount: Number(r.totalAmount) || 0,
              paidAmount: Number(r.paidAmount) || 0,
              status:
                r.status === 'received' || r.status === 'cancelled' || r.status === 'ordered'
                  ? r.status
                  : undefined,
              expectedDate: r.expectedDate ? String(r.expectedDate) : undefined,
              notes: r.notes ? String(r.notes) : undefined,
              items: Array.isArray(r.items) ? r.items : undefined,
            })),
            { markReceived: options.markReceived }
          )
        }
      />
    </div>
  );
}
