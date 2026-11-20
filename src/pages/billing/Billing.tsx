import React, { useMemo, useState } from 'react';
import {
  CreditCard,
  CheckCircle2,
  History,
  Zap,
  ShieldCheck,
  Package,
  Layers,
  Trash2,
  X,
  Plus,
  Lock,
  Users,
  Building2,
  Smartphone,
  Send,
  RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useBilling } from '../../hooks/useBilling';
import { useTrialGuard } from '../../hooks/useTrialGuard';
import { useTeam } from '../../hooks/useTeam';
import { useInventory } from '../../hooks/useInventory';
import { useBranches } from '../../hooks/useBranches';
import { BillingPaymentMethod, Tenant } from '../../types';
import { PLAN_QUOTAS, getEffectivePlanQuota, getDailyAiUsageCount, getPlanQuota } from '../../utils/planLimits';
import { formatUGX, formatDate } from '../../utils/format';
import { BANKS } from '../../constants';
import { parseUgandaPhone } from '../../utils/ugandaPayments';
import { checkUgandaPaymentStatus, initiateUgandaPayment } from '../../services/aiService';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

interface PlanOption {
  key: Tenant['plan'];
  name: string;
  amountUgx: number;
  period: string;
  description: string;
  features: string[];
  icon: React.ComponentType<{ size?: number }>;
  popular?: boolean;
}

const PLANS: PlanOption[] = [
  {
    key: 'micro',
    name: PLAN_QUOTAS.micro.name,
    amountUgx: PLAN_QUOTAS.micro.monthlyPriceUgx,
    period: '/month',
    description: 'Perfect for small kiosks and individual shops',
    features: PLAN_QUOTAS.micro.highlights,
    icon: Package,
  },
  {
    key: 'starter',
    name: PLAN_QUOTAS.starter.name,
    amountUgx: PLAN_QUOTAS.starter.monthlyPriceUgx,
    period: '/month',
    description: 'For emerging retail shops scaling daily operations',
    features: PLAN_QUOTAS.starter.highlights,
    icon: Layers,
  },
  {
    key: 'business',
    name: PLAN_QUOTAS.business.name,
    amountUgx: PLAN_QUOTAS.business.monthlyPriceUgx,
    period: '/month',
    description: 'Ideal for growing retail stores and multi-branch teams',
    features: PLAN_QUOTAS.business.highlights,
    icon: Zap,
    popular: true,
  },
  {
    key: 'enterprise',
    name: PLAN_QUOTAS.enterprise.name,
    amountUgx: PLAN_QUOTAS.enterprise.monthlyPriceUgx,
    period: '/month',
    description: 'For large businesses with unlimited branches and staff',
    features: PLAN_QUOTAS.enterprise.highlights,
    icon: ShieldCheck,
  },
];

type BillingCheckoutChannel = 'mtn_momo' | 'airtel_money' | 'flutterwave' | 'bank_transfer';

const BILLING_CHANNELS: Array<{
  id: BillingCheckoutChannel;
  label: string;
  paymentMethodName: string;
  sublabel: string;
  dotClass?: string;
}> = [
  {
    id: 'mtn_momo',
    label: 'MTN MoMo',
    paymentMethodName: 'MTN Mobile Money',
    sublabel: '*165*3# / Push',
    dotClass: 'bg-[#FFCC00]',
  },
  {
    id: 'airtel_money',
    label: 'Airtel Money',
    paymentMethodName: 'Airtel Money',
    sublabel: '*185*9# / Push',
    dotClass: 'bg-[#E11D48]',
  },
  {
    id: 'flutterwave',
    label: 'Flutterwave',
    paymentMethodName: 'Flutterwave Card/MoMo',
    sublabel: 'Card / MoMo',
  },
  {
    id: 'bank_transfer',
    label: 'Bank Transfer',
    paymentMethodName: 'Bank Transfer',
    sublabel: 'EFT / RTGS',
  },
];

const METHOD_BADGE: Record<BillingPaymentMethod['type'], string> = {
  mtn_momo: 'MTN MoMo',
  airtel_money: 'Airtel',
  bank_transfer: 'Bank',
  card: 'Card',
};

export default function Billing() {
  const { tenant, user } = useAuthStore();
  const { history, isLoading, isUpdating, selectPlan, savePaymentMethods } = useBilling();
  const trialState = useTrialGuard();
  const { members, invites } = useTeam();
  const { products } = useInventory();
  const { branches } = useBranches();

  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [isMethodModalOpen, setIsMethodModalOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<PlanOption | null>(null);
  const [checkoutChannel, setCheckoutChannel] = useState<BillingCheckoutChannel>('mtn_momo');
  const [checkoutPhone, setCheckoutPhone] = useState('');
  const [checkoutBank, setCheckoutBank] = useState(BANKS[0]);
  const [checkoutRef, setCheckoutRef] = useState('');
  const [checkoutTxId, setCheckoutTxId] = useState('');
  const [checkoutFeedback, setCheckoutFeedback] = useState<string | null>(null);
  const [isPrompting, setIsPrompting] = useState(false);

  const [newMethod, setNewMethod] = useState<{
    type: BillingPaymentMethod['type'];
    label: string;
    accountRef: string;
  }>({
    type: 'mtn_momo',
    label: 'MTN Mobile Money',
    accountRef: '',
  });

  const isAdmin = user?.role === 'admin';
  const currentQuota = getEffectivePlanQuota(tenant);
  const subscribedQuota = getPlanQuota(tenant?.plan);
  const aiUsedToday = getDailyAiUsageCount(tenant?.id);

  const activeUsersCount = useMemo(
    () =>
      members.filter((m) => m.status === 'active').length +
      invites.filter((i) => i.status === 'pending').length,
    [members, invites]
  );

  const paymentMethods = tenant?.billingPaymentMethods || [];
  const visibleHistory = showAllInvoices ? history : history.slice(0, 5);
  const parsedCheckoutPhone = useMemo(() => parseUgandaPhone(checkoutPhone), [checkoutPhone]);

  const getSavedRefForChannel = (channel: BillingCheckoutChannel): string => {
    const primary = paymentMethods.find((m) => m.isPrimary);
    if (channel === 'mtn_momo' || channel === 'airtel_money') {
      const match =
        paymentMethods.find((m) => m.type === channel) ||
        (primary && (primary.type === 'mtn_momo' || primary.type === 'airtel_money') ? primary : undefined);
      return match?.accountRef || user?.phone || '';
    }
    return '';
  };

  const openCheckoutModal = (plan: PlanOption) => {
    if (!isAdmin) {
      toast.error('Only business admins can change the subscription plan');
      return;
    }
    const primary = paymentMethods.find((m) => m.isPrimary);
    const defaultChannel: BillingCheckoutChannel =
      primary?.type === 'airtel_money'
        ? 'airtel_money'
        : primary?.type === 'bank_transfer'
        ? 'bank_transfer'
        : primary?.type === 'card'
        ? 'flutterwave'
        : 'mtn_momo';

    setCheckoutPlan(plan);
    setCheckoutChannel(defaultChannel);
    setCheckoutPhone(getSavedRefForChannel(defaultChannel));
    setCheckoutBank(BANKS[0]);
    setCheckoutRef('');
    setCheckoutTxId('');
    setCheckoutFeedback(null);
  };

  const handleChannelChange = (channel: BillingCheckoutChannel) => {
    setCheckoutChannel(channel);
    setCheckoutFeedback(null);
    if (channel === 'mtn_momo' || channel === 'airtel_money') {
      const saved = getSavedRefForChannel(channel);
      if (saved && !checkoutPhone.trim()) {
        setCheckoutPhone(saved);
      }
    }
  };

  const handleSendBillingPrompt = async () => {
    if (!checkoutPlan || (checkoutChannel !== 'mtn_momo' && checkoutChannel !== 'airtel_money')) return;
    if (!parsedCheckoutPhone.valid) {
      toast.error('Enter a valid Ugandan phone number (e.g. 0772 123 456)');
      return;
    }
    if (checkoutChannel === 'mtn_momo' && parsedCheckoutPhone.carrier === 'AIRTEL') {
      toast.error('That number is an Airtel Uganda line (070/075/074). Switch to Airtel Money or enter an MTN number.');
      return;
    }
    if (checkoutChannel === 'airtel_money' && parsedCheckoutPhone.carrier === 'MTN') {
      toast.error('That number is an MTN Uganda line (077/078/076). Switch to MTN MoMo or enter an Airtel number.');
      return;
    }

    setIsPrompting(true);
    setCheckoutFeedback(null);
    const clientRef = `SUB-${checkoutPlan.key.toUpperCase()}-${Date.now().toString().slice(-6)}`;
    try {
      const res = await initiateUgandaPayment({
        provider: checkoutChannel,
        phone: parsedCheckoutPhone.e164,
        amountUgx: checkoutPlan.amountUgx,
        reference: clientRef,
        customerName: tenant?.name || user?.name,
        email: user?.email,
      });

      setCheckoutFeedback(res.message);
      if (res.transactionId) {
        setCheckoutTxId(res.transactionId);
      }
      if (res.reference && !checkoutRef.trim()) {
        setCheckoutRef(res.reference);
      }
      if (res.initiated) {
        toast.success('Payment prompt sent to phone');
      } else {
        toast(res.message, { icon: 'ℹ️' });
      }
    } catch (err: any) {
      toast.error(err?.message || 'Unable to send mobile money prompt');
    } finally {
      setIsPrompting(false);
    }
  };

  const handleCheckBillingGateway = async () => {
    if (!checkoutTxId.trim()) return;
    setIsPrompting(true);
    try {
      const statusRes = await checkUgandaPaymentStatus(checkoutTxId.trim());
      if (statusRes.status === 'successful') {
        setCheckoutRef(statusRes.reference);
        setCheckoutFeedback(`Confirmed paid via gateway (${statusRes.reference}). Click Verify & Activate below.`);
        toast.success('Gateway payment confirmed!');
      } else {
        setCheckoutFeedback(`Gateway status: ${statusRes.status}. Complete PIN approval on phone and re-check.`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Status check failed');
    } finally {
      setIsPrompting(false);
    }
  };

  const handleConfirmCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPlan || isUpdating) return;
    const cleanRef = checkoutRef.trim();
    if (cleanRef.length < 4) {
      toast.error('Enter a valid payment reference / transaction ID (min 4 characters)');
      return;
    }
    if ((checkoutChannel === 'mtn_momo' || checkoutChannel === 'airtel_money') && checkoutPhone.trim() && !parsedCheckoutPhone.valid) {
      toast.error('Enter a valid 10-digit Ugandan phone number or clear the phone field');
      return;
    }

    const activeChannel = BILLING_CHANNELS.find((c) => c.id === checkoutChannel)!;
    const methodLabel =
      checkoutChannel === 'bank_transfer' ? `${activeChannel.paymentMethodName} (${checkoutBank})` : activeChannel.paymentMethodName;

    const ok = await selectPlan(checkoutPlan.key, checkoutPlan.name, checkoutPlan.amountUgx, {
      paymentMethod: methodLabel,
      reference: cleanRef,
      transactionId: checkoutTxId.trim() || undefined,
      provider: checkoutChannel,
      payerPhone: parsedCheckoutPhone.valid ? parsedCheckoutPhone.e164 : undefined,
    });
    if (ok) {
      setCheckoutPlan(null);
    }
  };

  const handleAddMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Only business admins can manage billing payment methods');
      return;
    }
    if (!newMethod.label.trim() || !newMethod.accountRef.trim()) {
      toast.error('Enter both label and account/phone reference');
      return;
    }

    const created: BillingPaymentMethod = {
      id: crypto.randomUUID(),
      type: newMethod.type,
      label: newMethod.label.trim(),
      accountRef: newMethod.accountRef.trim(),
      isPrimary: paymentMethods.length === 0,
      createdAt: new Date().toISOString(),
    };

    const ok = await savePaymentMethods([...paymentMethods, created]);
    if (ok) {
      setIsMethodModalOpen(false);
      setNewMethod({ type: 'mtn_momo', label: 'MTN Mobile Money', accountRef: '' });
    }
  };

  const handleSetPrimary = async (methodId: string) => {
    if (!isAdmin) {
      toast.error('Only business admins can update payment methods');
      return;
    }
    const updated = paymentMethods.map((m) => ({ ...m, isPrimary: m.id === methodId }));
    await savePaymentMethods(updated);
  };

  const handleRemoveMethod = async (methodId: string) => {
    if (!isAdmin) {
      toast.error('Only business admins can update payment methods');
      return;
    }
    const remaining = paymentMethods.filter((m) => m.id !== methodId);
    if (remaining.length > 0 && !remaining.some((m) => m.isPrimary)) {
      remaining[0] = { ...remaining[0], isPrimary: true };
    }
    await savePaymentMethods(remaining);
  };

  const formatLimit = (val: number) => (Number.isFinite(val) ? val.toLocaleString() : '∞');

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Billing &amp; Subscription</h1>
          <p className="text-text-muted mt-1">Manage your business plan, quotas, payment methods, and invoices</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {trialState.isPendingApproval || tenant?.pendingPlan ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-accent-alt/10 text-primary rounded-lg border border-accent-alt/30 text-sm font-semibold">
              <ShieldCheck size={17} className="text-accent-alt" />
              <span>Pending Master Admin Approval</span>
            </div>
          ) : trialState.isComplimentary ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-lg border border-accent/25 text-sm font-semibold">
              <CheckCircle2 size={18} />
              <span>
                Complimentary Free · {PLANS.find((p) => p.key === tenant?.plan)?.name || tenant?.plan}
              </span>
            </div>
          ) : trialState.isSoftLocked ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger rounded-lg border border-danger/25 text-sm font-semibold">
              <Lock size={16} />
              <span>
                {trialState.isSuspended
                  ? 'Workspace Disabled'
                  : !trialState.isTrial && trialState.effectiveEndsAt
                  ? 'Subscription Expired — Renewal Required'
                  : 'Trial Expired — Upgrade Required'}
              </span>
            </div>
          ) : trialState.isTrial && !trialState.isSoftLocked ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-lg border border-accent/20 text-sm font-semibold">
              <CheckCircle2 size={18} />
              <span>
                Trial Active:{' '}
                {trialState.daysRemaining > 0
                  ? `${trialState.daysRemaining} day${trialState.daysRemaining === 1 ? '' : 's'} remaining`
                  : `${trialState.hoursRemaining} hours remaining`}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 text-primary rounded-lg border border-border text-sm font-semibold">
              <CheckCircle2 size={18} className="text-accent" />
              <span>
                Active: {PLANS.find((p) => p.key === tenant?.plan)?.name || tenant?.plan}
                {trialState.effectiveEndsAt
                  ? ` · Expires ${formatDate(trialState.effectiveEndsAt.toISOString())}`
                  : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {(trialState.isPendingApproval || tenant?.pendingPlan) && (
        <div className="card border-accent-alt/30 bg-accent-alt/10 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-primary">
              Subscription Payment Submitted — Awaiting Master Admin Approval
            </h2>
            <p className="text-sm text-text-secondary">
              Requested Pack: <strong>{(tenant?.pendingPlan || tenant?.plan || '').toUpperCase()}</strong> ·
              Ref <strong className="font-mono">{tenant?.pendingPaymentRef || 'Submitted'}</strong> ·
              Amount <strong className="font-mono tabular-nums">{formatUGX(tenant?.pendingAmountUgx || 0)}</strong>.
              Your workspace activates automatically as soon as Novic Technologies verifies and approves your payment.
            </p>
          </div>
        </div>
      )}

      {trialState.isSoftLocked && !trialState.isPendingApproval && (
        <div className="card border-danger/30 bg-danger/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-danger text-white rounded-xl shrink-0">
              <Lock size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-primary">
                {trialState.isSuspended
                  ? 'Your workspace has been disabled by the platform administrator'
                  : !trialState.isTrial && trialState.effectiveEndsAt
                  ? 'Your subscription period has ended — your business data is safe'
                  : 'Your 14-day free trial has ended — your business data is safe'}
              </h2>
              <p className="text-sm text-text-secondary mt-0.5">
                {trialState.isSuspended && tenant?.disabledReason
                  ? tenant.disabledReason
                  : 'All products, sales history, customer debts, and shift logs remain preserved. Submit checkout on any plan below for Master Admin approval to unlock POS, Inventory, and AI Copilot.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plan Quota Usage Panel */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-primary">Current Workspace Quota Usage</h2>
            <p className="text-xs text-text-muted">
              {trialState.isTrial && !trialState.isSoftLocked
                ? `14-Day Trial (Evaluating ${currentQuota.name} features)`
                : `Limits enforced for ${subscribedQuota.name} (${formatUGX(subscribedQuota.monthlyPriceUgx)}/month)`}
              {trialState.subscribedAt ? ` · Subscribed ${formatDate(trialState.subscribedAt.toISOString())}` : ''}
              {trialState.subscriptionEndsAt ? ` · Renews ${formatDate(trialState.subscriptionEndsAt.toISOString())}` : ''}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-surface-alt/60 border border-border flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary text-white">
              <Users size={18} />
            </div>
            <div>
              <p className="text-xs text-text-muted font-semibold uppercase">Staff &amp; Invites</p>
              <p className="text-lg font-bold text-primary font-mono tabular-nums">
                {activeUsersCount} / {formatLimit(currentQuota.maxUsers)}
              </p>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface-alt/60 border border-border flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-accent text-white">
              <Package size={18} />
            </div>
            <div>
              <p className="text-xs text-text-muted font-semibold uppercase">Product SKUs</p>
              <p className="text-lg font-bold text-primary font-mono tabular-nums">
                {products.length} / {formatLimit(currentQuota.maxProducts)}
              </p>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface-alt/60 border border-border flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary text-white">
              <Building2 size={18} />
            </div>
            <div>
              <p className="text-xs text-text-muted font-semibold uppercase">Branches</p>
              <p className="text-lg font-bold text-primary font-mono tabular-nums">
                {branches.length} / {formatLimit(currentQuota.maxBranches)}
              </p>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-surface-alt/60 border border-border flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-accent text-white">
              <Zap size={18} />
            </div>
            <div>
              <p className="text-xs text-text-muted font-semibold uppercase">AI Calls Today</p>
              <p className="text-lg font-bold text-primary font-mono tabular-nums">
                {aiUsedToday} / {formatLimit(currentQuota.aiDailyAllowance)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {PLANS.map((plan) => {
          const isCurrentPlan = tenant?.plan === plan.key;
          const isPendingThisPlan = tenant?.pendingPlan === plan.key;
          const isCurrentComplimentaryActive =
            isCurrentPlan &&
            trialState.isComplimentary &&
            (!trialState.effectiveEndsAt || trialState.daysRemaining > 7);
          const isCurrentActiveFarFromExpiry =
            isCurrentPlan &&
            trialState.isActive &&
            !trialState.isComplimentary &&
            trialState.effectiveEndsAt !== null &&
            trialState.daysRemaining > 7;
          const isLockedButton =
            isUpdating ||
            isPendingThisPlan ||
            isCurrentComplimentaryActive ||
            isCurrentActiveFarFromExpiry;
          const effectivePlanPrice =
            isCurrentPlan && typeof tenant?.customPriceUgx === 'number'
              ? tenant.customPriceUgx
              : plan.amountUgx;

          const buttonLabel = isPendingThisPlan
            ? 'Pending Approval'
            : isCurrentComplimentaryActive
            ? 'Complimentary Active'
            : isCurrentActiveFarFromExpiry
            ? 'Current Plan'
            : isCurrentPlan && trialState.isActive && trialState.daysRemaining <= 7
            ? 'Renew Plan (+1 Month)'
            : isCurrentPlan && trialState.isExpired
            ? 'Renew & Unlock'
            : isCurrentPlan
            ? 'Activate Plan'
            : 'Select Plan';

          return (
            <div
              key={plan.key}
              className={cn(
                'relative card flex flex-col justify-between transition-all hover:shadow-md',
                isPendingThisPlan
                  ? 'border-accent-alt ring-2 ring-accent-alt/20'
                  : plan.popular
                  ? 'border-accent ring-2 ring-accent/15'
                  : 'border-border'
              )}
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-primary/5 text-primary">
                    <plan.icon size={22} />
                  </div>
                  {isPendingThisPlan ? (
                    <span className="text-[11px] font-bold text-accent-alt uppercase tracking-wider">
                      Pending Approval
                    </span>
                  ) : plan.popular ? (
                    <span className="text-[11px] font-bold text-accent uppercase tracking-wider">
                      Most Popular
                    </span>
                  ) : null}
                </div>
                <h3 className="text-xl font-bold text-primary mb-1">{plan.name}</h3>
                <p className="text-text-muted text-sm mb-5 min-h-[40px]">{plan.description}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-2xl font-bold text-primary font-mono tabular-nums">
                    {formatUGX(effectivePlanPrice)}
                  </span>
                  <span className="text-text-muted text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm text-text-secondary">
                      <CheckCircle2 size={16} className="text-accent shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                disabled={isLockedButton}
                onClick={() => openCheckoutModal({ ...plan, amountUgx: effectivePlanPrice })}
                className={cn(
                  'btn w-full py-3 font-bold whitespace-nowrap',
                  isPendingThisPlan || isCurrentComplimentaryActive || isCurrentActiveFarFromExpiry
                    ? 'btn-secondary opacity-70 cursor-default'
                    : plan.popular || (isCurrentPlan && trialState.isExpired)
                    ? 'btn-primary'
                    : 'btn-secondary'
                )}
              >
                {buttonLabel}
              </button>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-surface-alt rounded-xl text-primary">
                <CreditCard size={22} />
              </div>
              <h3 className="text-lg font-bold text-primary">Payment Methods</h3>
            </div>
          </div>

          <div className="space-y-3">
            {paymentMethods.length === 0 ? (
              <div className="p-6 border border-dashed border-border rounded-xl text-center text-sm text-text-muted">
                No payment methods saved yet. Add MTN MoMo, Airtel Money, bank, or card details below.
              </div>
            ) : (
              paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className={cn(
                    'flex items-center justify-between gap-3 p-4 border rounded-xl',
                    method.isPrimary ? 'border-accent/40 bg-accent/5' : 'border-border'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="px-2.5 py-1.5 bg-white border border-border rounded text-xs font-bold text-primary shrink-0">
                      {METHOD_BADGE[method.type]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-primary truncate">{method.label}</p>
                      <p className="text-xs text-text-muted font-mono truncate">{method.accountRef}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {method.isPrimary ? (
                      <span className="text-xs font-bold text-accent uppercase">Primary</span>
                    ) : (
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleSetPrimary(method.id)}
                        className="text-xs font-bold text-text-secondary hover:text-primary uppercase whitespace-nowrap"
                      >
                        Set Primary
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleRemoveMethod(method.id)}
                      aria-label={`Remove ${method.label}`}
                      className="p-1.5 text-text-muted hover:text-danger rounded"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}

            <button
              type="button"
              onClick={() => setIsMethodModalOpen(true)}
              className="w-full py-3 border-2 border-dashed border-border rounded-xl text-text-secondary font-medium hover:border-accent hover:text-primary transition-all flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              Add New Payment Method
            </button>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-surface-alt rounded-xl text-primary">
              <History size={22} />
            </div>
            <h3 className="text-lg font-bold text-primary">Billing History</h3>
          </div>
          <div className="space-y-3">
            {isLoading ? (
              <div className="py-8 text-center">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : visibleHistory.length > 0 ? (
              visibleHistory.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 p-3 border-b border-border last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-primary truncate">{inv.reference}</p>
                    <p className="text-xs text-text-muted">
                      {formatDate(inv.createdAt)}
                      {inv.plan ? ` • ${inv.plan.toUpperCase()}` : ''}
                      {inv.paymentMethod ? ` · ${inv.paymentMethod}` : ''}
                      {inv.payerPhone ? ` · ${inv.payerPhone}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-primary font-mono tabular-nums">
                      {formatUGX(inv.amount)}
                    </p>
                    <span
                      className={cn(
                        'text-xs font-semibold',
                        inv.status === 'Paid' || inv.status === 'Complimentary'
                          ? 'text-accent'
                          : inv.status === 'Rejected'
                          ? 'text-danger'
                          : 'text-accent-alt'
                      )}
                    >
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-text-muted text-sm">
                No billing history found yet. Activating a plan generates a verified invoice record here.
              </div>
            )}

            {history.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllInvoices((v) => !v)}
                className="w-full text-accent text-sm font-bold hover:underline py-2"
              >
                {showAllInvoices ? 'Show Latest 5 Invoices' : `View All ${history.length} Invoices`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Plan Activation Checkout Modal (Uganda Providers) */}
      {checkoutPlan && (
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-5 sm:p-6 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white">Uganda Subscription Checkout</h3>
                <p className="text-xs text-white/75">
                  {checkoutPlan.name} · {formatUGX(checkoutPlan.amountUgx)}/month
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutPlan(null)}
                className="hover:bg-white/10 p-1.5 rounded-lg"
                aria-label="Close checkout modal"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleConfirmCheckout} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
              <div className="p-3.5 rounded-xl bg-surface-alt border border-border flex items-center justify-between">
                <span className="text-xs font-bold text-text-muted uppercase">Amount Due</span>
                <span className="text-xl font-black text-primary font-mono tabular-nums">
                  {formatUGX(checkoutPlan.amountUgx)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-primary uppercase tracking-wider mb-2">
                  Select Ugandan Payment Channel
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {BILLING_CHANNELS.map((ch) => {
                    const active = checkoutChannel === ch.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => handleChannelChange(ch.id)}
                        className={cn(
                          'p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1',
                          active
                            ? 'border-accent bg-accent/5 ring-2 ring-accent/20'
                            : 'border-border bg-white hover:bg-surface-alt/60'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          {ch.id === 'mtn_momo' || ch.id === 'airtel_money' ? (
                            <Smartphone size={15} className={active ? 'text-accent' : 'text-primary'} />
                          ) : ch.id === 'flutterwave' ? (
                            <CreditCard size={15} className={active ? 'text-accent' : 'text-primary'} />
                          ) : (
                            <Building2 size={15} className={active ? 'text-accent' : 'text-primary'} />
                          )}
                          {ch.dotClass && <span className={cn('w-2.5 h-2.5 rounded-full', ch.dotClass)} />}
                        </div>
                        <span className="text-xs font-bold text-primary leading-tight">{ch.label}</span>
                        <span className="text-[10px] text-text-muted leading-tight">{ch.sublabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(checkoutChannel === 'mtn_momo' || checkoutChannel === 'airtel_money') && (
                <div className="p-3.5 rounded-xl bg-surface-alt/50 border border-border space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-primary">
                      {checkoutChannel === 'mtn_momo' ? 'MTN MoMo Pay (*165*3#)' : 'Airtel Money Pay (*185*9#)'}
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {checkoutChannel === 'mtn_momo' ? '077 / 078 / 076' : '070 / 075 / 074'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-primary mb-1">
                      Payer {checkoutChannel === 'mtn_momo' ? 'MTN' : 'Airtel'} Phone Number
                    </label>
                    <input
                      type="tel"
                      className="input w-full bg-white font-mono"
                      placeholder={checkoutChannel === 'mtn_momo' ? '0772 123 456' : '0752 123 456'}
                      value={checkoutPhone}
                      onChange={(e) => setCheckoutPhone(e.target.value)}
                    />
                    {checkoutPhone.trim().length > 0 && (
                      <p
                        className={cn(
                          'text-[11px] mt-1 font-medium',
                          !parsedCheckoutPhone.valid
                            ? 'text-danger'
                            : (checkoutChannel === 'mtn_momo' && parsedCheckoutPhone.carrier === 'AIRTEL') ||
                              (checkoutChannel === 'airtel_money' && parsedCheckoutPhone.carrier === 'MTN')
                            ? 'text-accent-alt'
                            : 'text-accent'
                        )}
                      >
                        {!parsedCheckoutPhone.valid
                          ? 'Enter 10-digit Ugandan phone (e.g. 0772123456)'
                          : `${parsedCheckoutPhone.localDisplay} · ${parsedCheckoutPhone.carrier} Uganda`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isPrompting || !parsedCheckoutPhone.valid}
                      onClick={handleSendBillingPrompt}
                      className="btn btn-secondary text-xs py-2 px-3 gap-1.5 whitespace-nowrap"
                    >
                      <Send size={13} />
                      {isPrompting ? 'Sending...' : 'Send Payment Prompt'}
                    </button>
                    {checkoutTxId && (
                      <button
                        type="button"
                        disabled={isPrompting}
                        onClick={handleCheckBillingGateway}
                        className="btn btn-secondary text-xs py-2 px-3 gap-1.5 whitespace-nowrap"
                      >
                        <RefreshCw size={13} />
                        Check Gateway Status
                      </button>
                    )}
                  </div>
                  {checkoutFeedback && (
                    <div className="p-2.5 rounded-lg bg-white border border-border text-xs text-text-secondary">
                      {checkoutFeedback}
                    </div>
                  )}
                </div>
              )}

              {checkoutChannel === 'bank_transfer' && (
                <div>
                  <label className="block text-xs font-bold text-primary mb-1">Ugandan Bank *</label>
                  <select
                    className="input w-full"
                    value={checkoutBank}
                    onChange={(e) => setCheckoutBank(e.target.value)}
                  >
                    {BANKS.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-primary mb-1">
                  Payment Reference / MoMo Transaction ID *
                </label>
                <input
                  required
                  minLength={4}
                  type="text"
                  className="input w-full font-mono"
                  placeholder={
                    checkoutChannel === 'mtn_momo'
                      ? 'e.g. MP250411.1234.C56789'
                      : checkoutChannel === 'airtel_money'
                      ? 'e.g. AM250411.9812.B441'
                      : checkoutChannel === 'bank_transfer'
                      ? 'e.g. STANBIC-EFT-882410'
                      : 'e.g. FLW-TX-902814'
                  }
                  value={checkoutRef}
                  onChange={(e) => setCheckoutRef(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-primary mb-1">
                  Flutterwave Numeric Transaction ID (optional)
                </label>
                <input
                  type="text"
                  className="input w-full font-mono"
                  placeholder="Optional for live Flutterwave verification"
                  value={checkoutTxId}
                  onChange={(e) => setCheckoutTxId(e.target.value)}
                />
                <p className="text-[11px] text-text-muted mt-1">
                  Submitted to the Master Account for verification &amp; approval before activating your plan.
                </p>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setCheckoutPlan(null)}
                  className="btn btn-secondary flex-1 whitespace-nowrap"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isUpdating} className="btn btn-primary flex-1 whitespace-nowrap">
                  {isUpdating ? 'Submitting...' : 'Submit for Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isMethodModalOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between bg-primary text-white">
              <div className="flex items-center gap-3">
                <CreditCard size={22} />
                <h3 className="text-lg font-bold text-white">Add Payment Method</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMethodModalOpen(false)}
                className="hover:bg-white/10 p-1 rounded-lg"
                aria-label="Close modal"
              >
                <X size={22} />
              </button>
            </div>
            <form onSubmit={handleAddMethod} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Method Type</label>
                <select
                  className="input w-full"
                  value={newMethod.type}
                  onChange={(e) => {
                    const type = e.target.value as BillingPaymentMethod['type'];
                    const defaultLabels: Record<BillingPaymentMethod['type'], string> = {
                      mtn_momo: 'MTN Mobile Money',
                      airtel_money: 'Airtel Money',
                      bank_transfer: 'Bank Account',
                      card: 'Debit / Credit Card',
                    };
                    setNewMethod({ ...newMethod, type, label: defaultLabels[type] });
                  }}
                >
                  <option value="mtn_momo">MTN Mobile Money</option>
                  <option value="airtel_money">Airtel Money</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="card">Visa / Mastercard</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Label *</label>
                <input
                  required
                  type="text"
                  className="input w-full"
                  placeholder="e.g. Business MTN MoMo"
                  value={newMethod.label}
                  onChange={(e) => setNewMethod({ ...newMethod, label: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">
                  Phone / Account / Card Last 4 *
                </label>
                <input
                  required
                  type="text"
                  className="input w-full"
                  placeholder="e.g. 0772 123 456 or •••• 4242"
                  value={newMethod.accountRef}
                  onChange={(e) => setNewMethod({ ...newMethod, accountRef: e.target.value })}
                />
              </div>
              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsMethodModalOpen(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isUpdating} className="btn btn-primary flex-1">
                  {isUpdating ? 'Saving...' : 'Save Method'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
