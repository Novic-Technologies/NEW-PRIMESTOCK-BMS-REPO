import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Phone,
  RefreshCw,
  Send,
  Smartphone,
  Split,
  UserCheck,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Customer, SplitPaymentPart, Tenant } from '../../types';
import { BANKS, PAYMENT_METHODS } from '../../constants';
import { formatUGX } from '../../utils/format';
import {
  UGX_CASH_NOTES,
  buildAirtelMerchantUssd,
  buildMtnMerchantUssd,
  parseUgandaPhone,
} from '../../utils/ugandaPayments';
import { checkUgandaPaymentStatus, initiateUgandaPayment } from '../../services/aiService';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

export interface CheckoutCompletionPayload {
  paymentMethod: string;
  paymentProvider?: string;
  paymentReference?: string;
  payerPhone?: string;
  cashTendered?: number;
  changeGiven?: number;
  splitPayments?: SplitPaymentPart[];
  status: 'completed' | 'pending';
}

interface UgandaCheckoutModalProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  total: number;
  tenant: Tenant | null;
  selectedCustomer: Customer | null;
  isProcessing: boolean;
  allowSplit?: boolean;
  allowCredit?: boolean;
  allowPending?: boolean;
  onClose: () => void;
  onConfirm: (payload: CheckoutCompletionPayload) => Promise<void> | void;
}

type ChannelTab =
  | 'cash'
  | 'mtn_momo'
  | 'airtel_money'
  | 'flutterwave'
  | 'bank'
  | 'credit'
  | 'split';

export function UgandaCheckoutModal({
  isOpen,
  title = 'Uganda POS Checkout',
  subtitle,
  total,
  tenant,
  selectedCustomer,
  isProcessing,
  allowSplit = true,
  allowCredit = true,
  allowPending = true,
  onClose,
  onConfirm,
}: UgandaCheckoutModalProps) {
  const mtnEnabled = tenant?.preferences?.mtnMomoEnabled ?? true;
  const airtelEnabled = tenant?.preferences?.airtelMoneyEnabled ?? true;

  const [tab, setTab] = useState<ChannelTab>('cash');

  // Cash state
  const [cashTenderedInput, setCashTenderedInput] = useState(String(total));

  // Mobile money / gateway state
  const [momoSubMode, setMomoSubMode] = useState<'merchant_ussd' | 'stk_push'>('merchant_ussd');
  const [payerPhone, setPayerPhone] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [gatewayTxId, setGatewayTxId] = useState('');
  const [gatewayFeedback, setGatewayFeedback] = useState<string | null>(null);
  const [isPrompting, setIsPrompting] = useState(false);

  // Bank / Cheque state
  const [selectedBank, setSelectedBank] = useState(BANKS[0]);
  const [bankInstrument, setBankInstrument] = useState<'Bank Transfer' | 'Cheque'>('Bank Transfer');

  // Split state
  const [splitParts, setSplitParts] = useState<SplitPaymentPart[]>([
    { method: 'Cash', amount: total },
    { method: 'MTN Mobile Money', amount: 0 },
  ]);

  useEffect(() => {
    if (!isOpen) return;
    setTab('cash');
    setCashTenderedInput(String(total));
    setPayerPhone(selectedCustomer?.phone || '');
    setPaymentReference('');
    setGatewayTxId('');
    setGatewayFeedback(null);
    setMomoSubMode('merchant_ussd');
    setSelectedBank(BANKS[0]);
    setBankInstrument('Bank Transfer');
    setSplitParts([
      { method: 'Cash', amount: total },
      { method: 'MTN Mobile Money', amount: 0 },
    ]);
  }, [isOpen, total, selectedCustomer?.phone]);

  const parsedPhone = useMemo(() => parseUgandaPhone(payerPhone), [payerPhone]);
  const cashTendered = Math.max(0, Number(cashTenderedInput) || 0);
  const cashChange = Math.max(0, cashTendered - total);
  const cashShortfall = Math.max(0, total - cashTendered);

  const splitAllocated = splitParts.reduce((sum, part) => sum + (Number(part.amount) || 0), 0);
  const splitRemaining = total - splitAllocated;

  const availableCredit = useMemo(() => {
    if (!selectedCustomer) return 0;
    if (!selectedCustomer.creditLimit || selectedCustomer.creditLimit <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, selectedCustomer.creditLimit - (selectedCustomer.currentBalance || 0));
  }, [selectedCustomer]);

  const creditAllowed = Boolean(
    selectedCustomer &&
      (!selectedCustomer.creditLimit ||
        selectedCustomer.creditLimit <= 0 ||
        (selectedCustomer.currentBalance || 0) + total <= selectedCustomer.creditLimit)
  );

  if (!isOpen) return null;

  const mtnUssd = buildMtnMerchantUssd(tenant?.preferences?.mtnMerchantCode, total);
  const airtelUssd = buildAirtelMerchantUssd(tenant?.preferences?.airtelMerchantCode, total);

  const handleTriggerPrompt = async (provider: 'mtn_momo' | 'airtel_money') => {
    if (!parsedPhone.valid) {
      toast.error('Enter a valid Ugandan phone number (e.g. 0772 123 456)');
      return;
    }
    if (provider === 'mtn_momo' && parsedPhone.carrier === 'AIRTEL') {
      toast.error('That looks like an Airtel number (070/075/074). Switch to Airtel Money or enter an MTN number.');
      return;
    }
    if (provider === 'airtel_money' && parsedPhone.carrier === 'MTN') {
      toast.error('That looks like an MTN number (077/078/076). Switch to MTN MoMo or enter an Airtel number.');
      return;
    }

    setIsPrompting(true);
    setGatewayFeedback(null);
    const clientRef = `${provider === 'mtn_momo' ? 'MOMO' : 'AIRTEL'}-${Date.now().toString().slice(-6)}`;
    try {
      const res = await initiateUgandaPayment({
        provider,
        phone: parsedPhone.e164,
        amountUgx: total,
        reference: clientRef,
        customerName: selectedCustomer?.name,
        email: selectedCustomer?.email,
      });

      setGatewayFeedback(res.message);
      if (res.transactionId) {
        setGatewayTxId(res.transactionId);
      }
      if (res.reference && !paymentReference.trim()) {
        setPaymentReference(res.reference);
      }
      if (res.initiated) {
        toast.success('Prompt sent to customer phone');
      } else {
        toast(res.message, { icon: 'ℹ️' });
      }
    } catch (err: any) {
      toast.error(err?.message || 'Unable to initiate mobile money prompt');
    } finally {
      setIsPrompting(false);
    }
  };

  const handleCheckGatewayStatus = async () => {
    if (!gatewayTxId.trim()) return;
    setIsPrompting(true);
    try {
      const statusRes = await checkUgandaPaymentStatus(gatewayTxId.trim());
      if (statusRes.status === 'successful') {
        setPaymentReference(statusRes.reference);
        setGatewayFeedback(`Confirmed paid via gateway (${statusRes.reference}). Completing sale...`);
        toast.success('Mobile Money payment confirmed!');
      } else {
        setGatewayFeedback(`Gateway status: ${statusRes.status}. Wait for customer PIN entry and re-check.`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Status check failed');
    } finally {
      setIsPrompting(false);
    }
  };

  const handleConfirmSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;

    if (tab === 'cash') {
      if (cashTendered < total) {
        toast.error(`Cash tendered must be at least ${formatUGX(total)}`);
        return;
      }
      await onConfirm({
        paymentMethod: 'Cash',
        paymentProvider: 'cash',
        cashTendered,
        changeGiven: cashChange,
        status: 'completed',
      });
      return;
    }

    if (tab === 'mtn_momo' || tab === 'airtel_money') {
      if (payerPhone.trim() && !parsedPhone.valid) {
        toast.error('Enter a valid Ugandan phone number or leave it blank');
        return;
      }
      const methodLabel = tab === 'mtn_momo' ? 'MTN Mobile Money' : 'Airtel Money';
      const fallbackRef = `${tab === 'mtn_momo' ? 'MTN' : 'AIR'}-${Date.now().toString().slice(-6)}`;
      await onConfirm({
        paymentMethod: methodLabel,
        paymentProvider: tab,
        paymentReference: paymentReference.trim() || fallbackRef,
        payerPhone: parsedPhone.valid ? parsedPhone.e164 : undefined,
        status: 'completed',
      });
      return;
    }

    if (tab === 'flutterwave') {
      await onConfirm({
        paymentMethod: 'Flutterwave',
        paymentProvider: 'flutterwave',
        paymentReference: paymentReference.trim() || `FLW-${Date.now().toString().slice(-6)}`,
        status: 'completed',
      });
      return;
    }

    if (tab === 'bank') {
      await onConfirm({
        paymentMethod: bankInstrument,
        paymentProvider: bankInstrument === 'Cheque' ? 'cheque' : 'bank',
        paymentReference:
          paymentReference.trim() || `${selectedBank.split(' ')[0].toUpperCase()}-${Date.now().toString().slice(-5)}`,
        status: 'completed',
      });
      return;
    }

    if (tab === 'credit') {
      if (!selectedCustomer) {
        toast.error('Select a customer on the POS before recording Customer Credit');
        return;
      }
      if (!creditAllowed) {
        toast.error('This sale exceeds the customer’s credit limit');
        return;
      }
      await onConfirm({
        paymentMethod: 'Customer Credit',
        paymentProvider: 'credit',
        status: 'completed',
      });
      return;
    }

    if (tab === 'split') {
      const validParts = splitParts.filter((p) => p.amount > 0);
      if (validParts.length === 0) {
        toast.error('Enter amounts for at least one payment tender');
        return;
      }
      if (Math.abs(splitRemaining) > 1) {
        toast.error(`Split amounts must equal ${formatUGX(total)}`);
        return;
      }
      await onConfirm({
        paymentMethod: 'Split Payment',
        paymentProvider: 'split',
        paymentReference: paymentReference.trim() || undefined,
        splitPayments: validParts,
        status: 'completed',
      });
    }
  };

  const channelButtons: Array<{
    id: ChannelTab;
    label: string;
    sublabel: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    accentDot?: string;
    hidden?: boolean;
  }> = [
    { id: 'cash', label: 'Cash UGX', sublabel: 'Drawer & change', icon: Banknote },
    {
      id: 'mtn_momo',
      label: 'MTN MoMo',
      sublabel: '*165*3# / Push',
      icon: Smartphone,
      accentDot: 'bg-[#FFCC00]',
      hidden: !mtnEnabled,
    },
    {
      id: 'airtel_money',
      label: 'Airtel Money',
      sublabel: '*185*9# / Push',
      icon: Smartphone,
      accentDot: 'bg-[#E11D48]',
      hidden: !airtelEnabled,
    },
    { id: 'flutterwave', label: 'Card / MoMo', sublabel: 'Flutterwave', icon: CreditCard },
    { id: 'bank', label: 'Bank / Cheque', sublabel: 'EFT / RTGS', icon: Building2 },
    {
      id: 'credit',
      label: 'Credit',
      sublabel: 'Customer tab',
      icon: UserCheck,
      hidden: !allowCredit,
    },
    {
      id: 'split',
      label: 'Split Pay',
      sublabel: 'Multi-tender',
      icon: Split,
      hidden: !allowSplit,
    },
  ];

  return (
    <div className="fixed inset-0 bg-primary/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
      <div className="bg-white w-full max-w-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
          <div>
            <h3 className="text-lg font-bold text-white leading-tight">{title}</h3>
            <p className="text-xs text-white/75 mt-0.5">
              {subtitle ||
                (selectedCustomer
                  ? `Customer: ${selectedCustomer.name} (${selectedCustomer.phone})`
                  : 'Walk-in Customer · Select Ugandan payment channel')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout"
            className="hover:bg-white/10 p-2 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleConfirmSingle} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Amount Due Summary */}
          <div className="p-4 bg-surface-alt rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Total Amount Payable
              </p>
              {selectedCustomer && (
                <p className="text-xs text-text-secondary mt-0.5">
                  Client: <strong className="text-primary">{selectedCustomer.name}</strong>
                </p>
              )}
            </div>
            <p className="text-3xl font-black text-primary font-mono tabular-nums">
              {formatUGX(total)}
            </p>
          </div>

          {/* Payment Channel Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {channelButtons
              .filter((c) => !c.hidden)
              .map((channel) => {
                const active = tab === channel.id;
                const Icon = channel.icon;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => {
                      setTab(channel.id);
                      setGatewayFeedback(null);
                    }}
                    className={cn(
                      'p-3 rounded-xl border text-left transition-all flex flex-col gap-1',
                      active
                        ? 'border-accent bg-accent/5 ring-2 ring-accent/20'
                        : 'border-border bg-white hover:bg-surface-alt/60'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <Icon size={17} className={active ? 'text-accent' : 'text-primary'} />
                      {channel.accentDot && (
                        <span className={cn('w-2.5 h-2.5 rounded-full', channel.accentDot)} />
                      )}
                    </div>
                    <span className="text-xs font-bold text-primary leading-tight">{channel.label}</span>
                    <span className="text-[10px] text-text-muted leading-tight">{channel.sublabel}</span>
                  </button>
                );
              })}
          </div>

          {/* Channel-Specific Checkout Panel */}
          {tab === 'cash' && (
            <div className="p-4 rounded-xl border border-border bg-surface-alt/40 space-y-4">
              <div>
                <label className="block text-xs font-bold text-primary uppercase tracking-wider mb-2">
                  Quick UGX Banknote Tender
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCashTenderedInput(String(total))}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap',
                      cashTendered === total
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-primary border-border hover:border-accent'
                    )}
                  >
                    Exact ({formatUGX(total)})
                  </button>
                  {UGX_CASH_NOTES.map((note) => (
                    <button
                      key={note}
                      type="button"
                      onClick={() => setCashTenderedInput(String(note))}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-bold font-mono tabular-nums border transition-colors whitespace-nowrap',
                        cashTendered === note
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-primary border-border hover:border-accent'
                      )}
                    >
                      {note.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-bold text-primary mb-1">
                    Cash Tendered by Customer (UGX) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    className="input w-full text-lg font-bold font-mono tabular-nums bg-white"
                    value={cashTenderedInput}
                    onChange={(e) => setCashTenderedInput(e.target.value)}
                    autoFocus
                  />
                </div>
                <div
                  className={cn(
                    'p-3 rounded-xl border flex items-center justify-between',
                    cashShortfall > 0
                      ? 'bg-danger/10 border-danger/25 text-danger'
                      : 'bg-accent/10 border-accent/25 text-accent'
                  )}
                >
                  <span className="text-xs font-bold uppercase">
                    {cashShortfall > 0 ? 'Shortfall' : 'Change Due'}
                  </span>
                  <span className="text-xl font-black font-mono tabular-nums">
                    {formatUGX(cashShortfall > 0 ? cashShortfall : cashChange)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {(tab === 'mtn_momo' || tab === 'airtel_money') && (
            <div className="p-4 rounded-xl border border-border bg-surface-alt/40 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'w-3 h-3 rounded-full shrink-0',
                      tab === 'mtn_momo' ? 'bg-[#FFCC00]' : 'bg-[#E11D48]'
                    )}
                  />
                  <div>
                    <p className="text-sm font-bold text-primary">
                      {tab === 'mtn_momo' ? 'MTN MoMo Uganda' : 'Airtel Money Uganda'}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {tab === 'mtn_momo'
                        ? 'Prefixes: 077 / 078 / 076 / 039'
                        : 'Prefixes: 070 / 075 / 074 / 020'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 p-1 bg-white rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setMomoSubMode('merchant_ussd')}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-bold rounded transition-colors whitespace-nowrap',
                      momoSubMode === 'merchant_ussd'
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:text-primary'
                    )}
                  >
                    Merchant Pay ({tab === 'mtn_momo' ? '*165*3#' : '*185*9#'})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMomoSubMode('stk_push')}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-bold rounded transition-colors whitespace-nowrap',
                      momoSubMode === 'stk_push'
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:text-primary'
                    )}
                  >
                    Mobile Prompt Push
                  </button>
                </div>
              </div>

              {momoSubMode === 'merchant_ussd' && (
                <div className="p-3.5 rounded-xl bg-white border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5 text-xs">
                    <p className="font-bold text-primary">
                      {tab === 'mtn_momo' ? 'MoMoPay Merchant Till' : 'Airtel Money Merchant Pay'}
                    </p>
                    <p className="text-text-secondary font-mono">
                      Dial <strong className="text-primary">{tab === 'mtn_momo' ? mtnUssd : airtelUssd}</strong>
                      {tab === 'mtn_momo' && tenant?.preferences?.mtnMerchantCode
                        ? ` · Code: ${tenant.preferences.mtnMerchantCode}`
                        : tab === 'airtel_money' && tenant?.preferences?.airtelMerchantCode
                        ? ` · Code: ${tenant.preferences.airtelMerchantCode}`
                        : ' (Set Merchant Code in Settings)'}
                    </p>
                  </div>
                  <a
                    href={`tel:${encodeURIComponent(tab === 'mtn_momo' ? mtnUssd : airtelUssd)}`}
                    className="btn btn-secondary text-xs py-1.5 px-3 gap-1.5 whitespace-nowrap self-start sm:self-auto"
                  >
                    <Phone size={13} />
                    Dial USSD
                  </a>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-primary mb-1">
                    Customer {tab === 'mtn_momo' ? 'MTN' : 'Airtel'} Phone{' '}
                    {momoSubMode === 'stk_push' ? '*' : '(optional)'}
                  </label>
                  <input
                    type="tel"
                    className="input w-full bg-white font-mono"
                    placeholder={tab === 'mtn_momo' ? '0772 123 456' : '0752 123 456'}
                    value={payerPhone}
                    onChange={(e) => setPayerPhone(e.target.value)}
                  />
                  {payerPhone.trim().length > 0 && (
                    <p
                      className={cn(
                        'text-[11px] mt-1 font-medium',
                        !parsedPhone.valid
                          ? 'text-danger'
                          : (tab === 'mtn_momo' && parsedPhone.carrier === 'AIRTEL') ||
                            (tab === 'airtel_money' && parsedPhone.carrier === 'MTN')
                          ? 'text-accent-alt'
                          : 'text-accent'
                      )}
                    >
                      {!parsedPhone.valid
                        ? 'Enter 10-digit Ugandan number (e.g. 0772123456)'
                        : `${parsedPhone.localDisplay} · Detected ${parsedPhone.carrier} Uganda`}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-primary mb-1">
                    SMS Transaction ID / Ref (optional)
                  </label>
                  <input
                    type="text"
                    className="input w-full bg-white font-mono"
                    placeholder={
                      tab === 'mtn_momo' ? 'e.g. MP250411.1234.C56789' : 'e.g. AM250411.9812.B441'
                    }
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </div>
              </div>

              {momoSubMode === 'stk_push' && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isPrompting || !parsedPhone.valid}
                    onClick={() => handleTriggerPrompt(tab)}
                    className="btn btn-secondary text-xs py-2 px-3 gap-1.5 whitespace-nowrap"
                  >
                    <Send size={13} />
                    {isPrompting ? 'Sending Prompt...' : 'Send Payment Prompt'}
                  </button>
                  {gatewayTxId && (
                    <button
                      type="button"
                      disabled={isPrompting}
                      onClick={handleCheckGatewayStatus}
                      className="btn btn-secondary text-xs py-2 px-3 gap-1.5 whitespace-nowrap"
                    >
                      <RefreshCw size={13} />
                      Verify Gateway Status
                    </button>
                  )}
                </div>
              )}

              {gatewayFeedback && (
                <div className="p-3 rounded-lg bg-white border border-border text-xs text-text-secondary">
                  {gatewayFeedback}
                </div>
              )}
            </div>
          )}

          {tab === 'flutterwave' && (
            <div className="p-4 rounded-xl border border-border bg-surface-alt/40 space-y-3">
              <p className="text-xs text-text-secondary">
                Accept Visa, Mastercard, or Mobile Money via Flutterwave Uganda. Enter the POS terminal
                or Flutterwave transaction reference to attach it to the receipt.
              </p>
              <div>
                <label className="block text-xs font-bold text-primary mb-1">
                  Flutterwave / Card Reference
                </label>
                <input
                  type="text"
                  className="input w-full bg-white font-mono"
                  placeholder="e.g. FLW-TX-902814 (optional)"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </div>
            </div>
          )}

          {tab === 'bank' && (
            <div className="p-4 rounded-xl border border-border bg-surface-alt/40 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-primary mb-1">Instrument</label>
                  <select
                    className="input w-full bg-white"
                    value={bankInstrument}
                    onChange={(e) => setBankInstrument(e.target.value as 'Bank Transfer' | 'Cheque')}
                  >
                    <option value="Bank Transfer">Bank Transfer (EFT / RTGS)</option>
                    <option value="Cheque">Cheque Payment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-primary mb-1">Ugandan Bank</label>
                  <select
                    className="input w-full bg-white"
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                  >
                    {BANKS.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-primary mb-1">
                  Deposit Slip / Cheque / EFT Reference
                </label>
                <input
                  type="text"
                  className="input w-full bg-white font-mono"
                  placeholder="e.g. STANBIC-882410"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </div>
            </div>
          )}

          {tab === 'credit' && (
            <div className="p-4 rounded-xl border border-border bg-surface-alt/40 space-y-3">
              {!selectedCustomer ? (
                <div className="flex items-start gap-2.5 text-xs text-danger">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <p>
                    Close this window and click <strong>Select Customer</strong> on the POS bar before
                    recording a Customer Credit sale.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Customer</span>
                    <span className="font-bold text-primary">{selectedCustomer.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Current Outstanding Debt</span>
                    <span className="font-mono tabular-nums font-semibold text-primary">
                      {formatUGX(selectedCustomer.currentBalance || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Credit Limit</span>
                    <span className="font-mono tabular-nums font-semibold text-primary">
                      {selectedCustomer.creditLimit > 0
                        ? formatUGX(selectedCustomer.creditLimit)
                        : 'Unlimited'}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border">
                    <span className="font-bold text-primary">Available Credit After Sale</span>
                    <span
                      className={cn(
                        'font-mono tabular-nums font-bold',
                        creditAllowed ? 'text-accent' : 'text-danger'
                      )}
                    >
                      {Number.isFinite(availableCredit)
                        ? formatUGX(availableCredit - total)
                        : 'Unlimited'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'split' && (
            <div className="p-4 rounded-xl border border-border bg-surface-alt/40 space-y-3">
              {splitParts.map((part, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    className="input col-span-5 text-xs py-2 bg-white"
                    value={part.method}
                    onChange={(e) =>
                      setSplitParts((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, method: e.target.value } : p))
                      )
                    }
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    className="input col-span-4 text-xs py-2 bg-white font-mono tabular-nums"
                    value={part.amount || ''}
                    placeholder="0"
                    onChange={(e) =>
                      setSplitParts((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, amount: Math.max(0, Number(e.target.value) || 0) } : p
                        )
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const otherSum = splitParts.reduce(
                        (sum, p, i) => (i === idx ? sum : sum + (Number(p.amount) || 0)),
                        0
                      );
                      const needed = Math.max(0, total - otherSum);
                      setSplitParts((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, amount: needed } : p))
                      );
                    }}
                    className="col-span-2 text-[11px] font-bold text-accent hover:underline whitespace-nowrap"
                  >
                    Fill
                  </button>
                  {splitParts.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setSplitParts((prev) => prev.filter((_, i) => i !== idx))}
                      className="col-span-1 text-text-muted hover:text-danger"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-2">
                {splitParts.length < 4 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSplitParts((prev) => [...prev, { method: 'Airtel Money', amount: 0 }])
                    }
                    className="text-xs font-bold text-accent hover:underline"
                  >
                    + Add Tender Line
                  </button>
                )}
                <p className="text-xs font-mono tabular-nums ml-auto">
                  Remaining:{' '}
                  <strong className={splitRemaining === 0 ? 'text-accent' : 'text-danger'}>
                    {formatUGX(splitRemaining)}
                  </strong>
                </p>
              </div>

              <input
                type="text"
                className="input w-full bg-white text-xs font-mono"
                placeholder="Combined MoMo / EFT Reference (optional)"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </div>
          )}

          {/* Submit Row */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            {allowPending && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() =>
                  onConfirm({
                    paymentMethod: 'Pending Invoice',
                    status: 'pending',
                  })
                }
                className="btn btn-secondary py-3 px-4 text-xs gap-1.5 whitespace-nowrap"
              >
                <Clock size={15} />
                Save as Pending Order
              </button>
            )}
            <button
              type="submit"
              disabled={
                isProcessing ||
                (tab === 'cash' && cashTendered < total) ||
                (tab === 'credit' && !creditAllowed) ||
                (tab === 'split' && Math.abs(splitRemaining) > 1)
              }
              className="btn btn-primary flex-1 py-3 font-bold gap-2 whitespace-nowrap"
            >
              <CheckCircle2 size={17} />
              {isProcessing ? 'Completing...' : `Confirm ${formatUGX(total)} Payment`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
