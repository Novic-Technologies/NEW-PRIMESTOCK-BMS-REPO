import React, { useMemo, useState } from 'react';
import {
  Search,
  Receipt,
  RotateCcw,
  CheckCircle2,
  Printer,
  MessageCircle,
  X,
  Clock,
  Ban,
} from 'lucide-react';
import { usePOS } from '../../hooks/usePOS';
import { useCustomers } from '../../hooks/useCustomers';
import { useBranches } from '../../hooks/useBranches';
import { useAuthStore } from '../../store/authStore';
import { Sale } from '../../types';
import { formatUGX, formatDate } from '../../utils/format';
import { printViaThermalSerial } from '../../utils/thermalPrint';
import { buildSaleWhatsAppUrl } from '../../utils/whatsapp';
import { canAccessFeature } from '../../utils/planLimits';
import {
  CheckoutCompletionPayload,
  UgandaCheckoutModal,
} from '../../components/checkout/UgandaCheckoutModal';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

export default function SalesHistory() {
  const { user, tenant } = useAuthStore();
  const { sales, refundSale, settlePendingSale } = usePOS();
  const { customers } = useCustomers();
  const { activeBranchId, activeBranch } = useBranches();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Sale['status']>('all');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [refundTarget, setRefundTarget] = useState<Sale | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [settleTarget, setSettleTarget] = useState<Sale | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManageSales = user?.role === 'admin' || user?.role === 'manager';

  const customerMap = useMemo(() => {
    const map = new Map(customers.map((c) => [c.id, c]));
    return map;
  }, [customers]);

  const branchScopedSales = useMemo(() => {
    if (!activeBranchId || activeBranchId === 'ALL') return sales;
    return sales.filter((s) => !s.branchId || s.branchId === activeBranchId);
  }, [sales, activeBranchId]);

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branchScopedSales.filter((s) => {
      const custName = s.customerId ? customerMap.get(s.customerId)?.name || '' : 'Walk-in';
      const matchesSearch =
        !q ||
        s.reference.toLowerCase().includes(q) ||
        custName.toLowerCase().includes(q) ||
        s.paymentMethod.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [branchScopedSales, search, statusFilter, customerMap]);

  const summary = useMemo(() => {
    const completed = branchScopedSales.filter((s) => s.status === 'completed');
    const pending = branchScopedSales.filter((s) => s.status === 'pending');
    const refunded = branchScopedSales.filter((s) => s.status === 'refunded');
    return {
      completedRevenue: completed.reduce((acc, s) => acc + s.total, 0),
      completedCount: completed.length,
      pendingTotal: pending.reduce((acc, s) => acc + s.total, 0),
      pendingCount: pending.length,
      refundedTotal: refunded.reduce((acc, s) => acc + s.total, 0),
      refundedCount: refunded.length,
    };
  }, [branchScopedSales]);

  const handleConfirmRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ok = await refundSale(refundTarget.id, refundReason);
      if (ok) {
        setRefundTarget(null);
        setRefundReason('');
        if (selectedSale?.id === refundTarget.id) setSelectedSale(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSettle = async (payload: CheckoutCompletionPayload) => {
    if (!settleTarget || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ok = await settlePendingSale(settleTarget.id, payload.paymentMethod, {
        paymentProvider: payload.paymentProvider,
        paymentReference: payload.paymentReference,
        payerPhone: payload.payerPhone,
        cashTendered: payload.cashTendered,
        changeGiven: payload.changeGiven,
      });
      if (ok) {
        setSettleTarget(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleThermalPrint = async (sale: Sale) => {
    if (!tenant) return;
    const cust = sale.customerId ? customerMap.get(sale.customerId) || null : null;
    const res = await printViaThermalSerial(sale, tenant, cust);
    if (res.mode === 'serial') {
      toast.success('Sent to thermal ESC/POS printer');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-3xl font-bold text-primary">Sales &amp; Refunds</h1>
          <p className="text-text-muted mt-1">
            {activeBranch ? `${activeBranch.name} · ` : 'All Branches · '}
            Inspect receipts, settle pending invoices, or issue audited refunds.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 no-print">
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-accent rounded-xl text-white shrink-0">
            <CheckCircle2 size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-sm font-medium">Completed Sales ({summary.completedCount})</p>
            <h3 className="text-2xl font-bold text-primary font-mono tabular-nums truncate">
              {formatUGX(summary.completedRevenue)}
            </h3>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-accent-alt rounded-xl text-white shrink-0">
            <Clock size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-sm font-medium">Pending Orders ({summary.pendingCount})</p>
            <h3 className="text-2xl font-bold text-primary font-mono tabular-nums truncate">
              {formatUGX(summary.pendingTotal)}
            </h3>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-danger rounded-xl text-white shrink-0">
            <Ban size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-sm font-medium">Refunded ({summary.refundedCount})</p>
            <h3 className="text-2xl font-bold text-primary font-mono tabular-nums truncate">
              {formatUGX(summary.refundedTotal)}
            </h3>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden no-print">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-alt/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="text"
              placeholder="Search receipt ref, customer, or method..."
              className="input pl-10 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-white border border-border rounded-lg self-start sm:self-auto">
            {(['all', 'completed', 'pending', 'refunded'] as const).map((status) => (
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
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-surface-alt/50 border-b border-border text-xs font-bold text-text-muted uppercase tracking-wider">
                <th className="px-6 py-4">Reference</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Items</th>
                <th className="px-6 py-4">Method</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-text-muted">
                    No matching sales records found
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const cust = sale.customerId ? customerMap.get(sale.customerId) : null;
                  return (
                    <tr key={sale.id} className="hover:bg-surface-alt/30">
                      <td className="px-6 py-4">
                        <p className="font-bold text-primary font-mono">{sale.reference}</p>
                        <p className="text-xs text-text-muted">
                          {formatDate(sale.createdAt)}
                          {sale.branchName ? ` · ${sale.branchName}` : ''}
                        </p>
                      </td>
                      <td className="px-6 py-4 font-medium text-primary">
                        {cust ? cust.name : 'Walk-in Customer'}
                      </td>
                      <td className="px-6 py-4 font-mono tabular-nums text-text-secondary">
                        {sale.items.reduce((acc, i) => acc + i.quantity, 0)} units
                      </td>
                      <td className="px-6 py-4 text-text-secondary">{sale.paymentMethod}</td>
                      <td className="px-6 py-4 font-bold text-primary font-mono tabular-nums">
                        {formatUGX(sale.total)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'text-xs font-bold uppercase',
                            sale.status === 'completed'
                              ? 'text-accent'
                              : sale.status === 'pending'
                              ? 'text-accent-alt'
                              : 'text-danger'
                          )}
                        >
                          {sale.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedSale(sale)}
                            className="btn btn-secondary text-xs py-1.5 px-3 min-h-[32px] whitespace-nowrap"
                          >
                            Receipt
                          </button>
                          {canManageSales && sale.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => setSettleTarget(sale)}
                              className="btn btn-primary text-xs py-1.5 px-3 min-h-[32px] whitespace-nowrap"
                            >
                              Collect Pay
                            </button>
                          )}
                          {canManageSales && sale.status !== 'refunded' && (
                            <button
                              type="button"
                              onClick={() => {
                                setRefundTarget(sale);
                                setRefundReason('');
                              }}
                              aria-label={`Refund ${sale.reference}`}
                              className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg"
                              title="Refund / Void Sale"
                            >
                              <RotateCcw size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Inspection Modal */}
      {selectedSale && tenant && (
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white no-print">
              <div className="flex items-center gap-2">
                <Receipt size={20} />
                <h3 className="text-lg font-bold text-white">Receipt · {selectedSale.reference}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="p-1 hover:bg-white/10 rounded-lg"
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
                {selectedSale.branchName && (
                  <p className="text-xs text-text-muted">Branch: {selectedSale.branchName}</p>
                )}
                <p className="text-xs text-text-muted mt-1">
                  {selectedSale.reference} · {new Date(selectedSale.createdAt).toLocaleString()}
                </p>
                {selectedSale.status === 'refunded' && (
                  <p className="text-xs font-bold text-danger uppercase mt-2">
                    REFUNDED ({selectedSale.refundReason || 'Voided'})
                  </p>
                )}
              </div>

              <div className="space-y-2 text-sm">
                {selectedSale.items.map((item, idx) => (
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

              {selectedSale.splitPayments && selectedSale.splitPayments.length > 0 && (
                <div className="border-t border-border pt-3 space-y-1 text-xs text-text-secondary">
                  <p className="font-bold uppercase tracking-wider text-text-muted">Payment Breakdown</p>
                  {selectedSale.splitPayments.map((part, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{part.method}</span>
                      <span className="font-mono tabular-nums">{formatUGX(part.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-border pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-text-secondary">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatUGX(selectedSale.subtotal)}</span>
                </div>
                {selectedSale.discount > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>Discount</span>
                    <span className="font-mono tabular-nums">-{formatUGX(selectedSale.discount)}</span>
                  </div>
                )}
                {(selectedSale.taxAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-text-secondary">
                    <span>VAT ({selectedSale.taxRate ?? 18}%)</span>
                    <span className="font-mono tabular-nums">{formatUGX(selectedSale.taxAmount || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base text-primary pt-1 border-t border-border">
                  <span>Total ({selectedSale.paymentMethod})</span>
                  <span className="font-mono tabular-nums text-accent">
                    {formatUGX(selectedSale.total)}
                  </span>
                </div>
                {selectedSale.paymentReference && (
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Transaction Ref</span>
                    <span className="font-mono">{selectedSale.paymentReference}</span>
                  </div>
                )}
                {selectedSale.payerPhone && (
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Mobile Number</span>
                    <span className="font-mono">{selectedSale.payerPhone}</span>
                  </div>
                )}
                {typeof selectedSale.cashTendered === 'number' && selectedSale.cashTendered > 0 && (
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Cash Tendered / Change</span>
                    <span className="font-mono tabular-nums">
                      {formatUGX(selectedSale.cashTendered)} / {formatUGX(selectedSale.changeGiven || 0)}
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
              {tenant.preferences?.whatsappReceipts !== false &&
                canAccessFeature(tenant, 'whatsappReceipts') && (
                  <a
                    href={buildSaleWhatsAppUrl(
                      selectedSale,
                      tenant,
                      selectedSale.customerId ? customerMap.get(selectedSale.customerId) || null : null
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary flex-1 gap-1.5 text-xs whitespace-nowrap"
                  >
                    <MessageCircle size={15} className="text-accent" />
                    WhatsApp
                  </a>
                )}
              <button
                type="button"
                onClick={() => handleThermalPrint(selectedSale)}
                className="btn btn-primary flex-1 gap-1.5 text-xs whitespace-nowrap"
              >
                <Printer size={15} />
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Confirmation Modal */}
      {refundTarget && (
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-danger text-white">
              <h3 className="text-lg font-bold text-white">Refund {refundTarget.reference}</h3>
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleConfirmRefund} className="p-6 space-y-4">
              <p className="text-sm text-text-secondary">
                Refunding restores sold item quantities back into branch inventory and reverses any customer
                credit balance of{' '}
                <strong className="font-mono tabular-nums text-primary">
                  {formatUGX(refundTarget.total)}
                </strong>
                .
              </p>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Refund Reason *</label>
                <input
                  type="text"
                  required
                  className="input w-full"
                  placeholder="e.g. Damaged packaging, customer returned item"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRefundTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn bg-danger text-white hover:bg-danger/90 flex-1"
                >
                  {isSubmitting ? 'Processing...' : 'Confirm Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Pending Sale via Uganda Checkout */}
      <UgandaCheckoutModal
        isOpen={Boolean(settleTarget)}
        title={settleTarget ? `Settle Invoice · ${settleTarget.reference}` : 'Settle Invoice'}
        subtitle="Collect payment via Cash, MTN MoMo, Airtel Money, Card, or Bank"
        total={settleTarget?.total || 0}
        tenant={tenant}
        selectedCustomer={
          settleTarget?.customerId ? customerMap.get(settleTarget.customerId) || null : null
        }
        isProcessing={isSubmitting}
        allowSplit={false}
        allowCredit={false}
        allowPending={false}
        onClose={() => setSettleTarget(null)}
        onConfirm={handleConfirmSettle}
      />
    </div>
  );
}
