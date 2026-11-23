import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Gift,
  KeyRound,
  Layers,
  Lock,
  MessageSquare,
  Package,
  Save,
  Send,
  ShieldAlert,
  Trash2,
  Unlock,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { OrgDetailsSnapshot } from '../../hooks/useMasterAdmin';
import { BusinessRole, StaffInvite, Tenant, TenantMember } from '../../types';
import { formatDate, formatUGX } from '../../utils/format';
import { getPlanQuota } from '../../utils/planLimits';
import { PLAN_ORDER, formatLimitDisplay } from '../../utils/platformPlans';
import { ROLE_META } from '../../utils/rbac';
import { computeTrialState } from '../../utils/trialUtils';
import { cn } from '../../lib/utils';
import { InspectorModalSkeleton } from '../../components/shared/Skeletons';
import toast from 'react-hot-toast';

type InspectorTab = 'overview' | 'accounts' | 'branches' | 'subscription';

interface OrgInspectorModalProps {
  org: Tenant | null;
  snapshot: OrgDetailsSnapshot | null;
  isLoading: boolean;
  isActing: boolean;
  onClose: () => void;
  onRefresh: (org: Tenant) => Promise<void>;
  onApprove: (
    target: Tenant,
    options: { plan?: Tenant['plan']; months?: number; customPriceUgx?: number | null }
  ) => Promise<boolean>;
  onToggleDisable: (target: Tenant, disable: boolean, reason?: string) => Promise<boolean>;
  onUpdateSubscription: (
    target: Tenant,
    updates: {
      plan: Tenant['plan'];
      subscribedAt?: string;
      subscriptionEndsAt?: string;
      customPriceUgx?: number | null;
      isComplimentary?: boolean;
      autoRemindersEnabled?: boolean;
    }
  ) => Promise<boolean>;
  onGrantComplimentary: (
    target: Tenant,
    options: { plan: Tenant['plan']; durationDays: number | null; note: string }
  ) => Promise<boolean>;
  onSendReminder: (
    target: Tenant,
    params: { message: string; channel: 'in_app' | 'email' | 'whatsapp' | 'all' }
  ) => Promise<{ ok: boolean; fallbackWhatsappUrl?: string }>;
  onUpdateMember: (
    tenantId: string,
    memberUid: string,
    updates: { role?: BusinessRole; status?: 'active' | 'inactive'; branchId?: string | null }
  ) => Promise<boolean>;
  onRevokeInvite: (invite: StaffInvite) => Promise<boolean>;
  onDeleteWorkspace: (target: Tenant) => Promise<boolean>;
}

export function OrgInspectorModal({
  org,
  snapshot,
  isLoading,
  isActing,
  onClose,
  onRefresh,
  onApprove,
  onToggleDisable,
  onUpdateSubscription,
  onGrantComplimentary,
  onSendReminder,
  onUpdateMember,
  onRevokeInvite,
  onDeleteWorkspace,
}: OrgInspectorModalProps) {
  const [tab, setTab] = useState<InspectorTab>('overview');
  const [editPlan, setEditPlan] = useState<Tenant['plan']>('micro');
  const [editSubStart, setEditSubStart] = useState('');
  const [editSubEnd, setEditSubEnd] = useState('');
  const [editCustomPrice, setEditCustomPrice] = useState('');
  const [editAutoRemind, setEditAutoRemind] = useState(true);

  const [disableReason, setDisableReason] = useState('');
  const [freeDays, setFreeDays] = useState('30');
  const [freeNote, setFreeNote] = useState('Complimentary free access granted by Novic Technologies');
  const [reminderMsg, setReminderMsg] = useState('');
  const [reminderChannel, setReminderChannel] = useState<'all' | 'in_app' | 'email' | 'whatsapp'>('all');
  const [purgeConfirmName, setPurgeConfirmName] = useState('');

  useEffect(() => {
    if (!org) return;
    setTab('overview');
    setEditPlan(org.plan);
    setEditSubStart(org.subscribedAt ? org.subscribedAt.slice(0, 10) : '');
    setEditSubEnd(org.subscriptionEndsAt ? org.subscriptionEndsAt.slice(0, 10) : '');
    setEditCustomPrice(typeof org.customPriceUgx === 'number' ? String(org.customPriceUgx) : '');
    setEditAutoRemind(org.autoRemindersEnabled !== false);
    setDisableReason(org.disabledReason || '');
    setPurgeConfirmName('');
    const quota = getPlanQuota(org.plan);
    setReminderMsg(
      `Hello ${org.ownerName || org.name}, your PrimeStock ${quota.name} subscription (${formatUGX(
        typeof org.customPriceUgx === 'number' ? org.customPriceUgx : quota.monthlyPriceUgx
      )}/month) is due for renewal. Pay in Billing via MTN MoMo or Airtel Money to keep your POS active.`
    );
  }, [org?.id]);

  if (!org) return null;

  const quota = getPlanQuota(org.plan);
  const tState = computeTrialState(org);
  const activeMembers = (snapshot?.members || []).filter((m) => m.status === 'active').length;

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onUpdateSubscription(org, {
      plan: editPlan,
      subscribedAt: editSubStart ? new Date(`${editSubStart}T00:00:00Z`).toISOString() : undefined,
      subscriptionEndsAt: editSubEnd ? new Date(`${editSubEnd}T23:59:59Z`).toISOString() : undefined,
      customPriceUgx: editCustomPrice.trim() !== '' ? Math.max(0, Number(editCustomPrice) || 0) : null,
      autoRemindersEnabled: editAutoRemind,
    });
    if (ok) await onRefresh(org);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-[#FBFDFF] rounded-xl border border-[#D5DEE9] shadow-2xl w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-[#0B1F3A] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate">{org.name}</h2>
            <p className="text-xs text-slate-300 truncate">
              {org.ownerEmail || 'No email'} · {quota.name} ·{' '}
              {org.locked ? 'Locked' : tState.isComplimentary ? 'Complimentary' : org.status}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
            aria-label="Close inspector"
          >
            <X size={19} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 py-2.5 border-b border-[#D5DEE9] bg-[#F1F5F9] flex items-center gap-2 overflow-x-auto shrink-0">
          {(
            [
              { id: 'overview', label: 'Quotas & Reminders' },
              { id: 'accounts', label: `Sub-Accounts (${snapshot?.members.length ?? 0})` },
              { id: 'branches', label: `Branches (${snapshot?.branches.length ?? 0})` },
              { id: 'subscription', label: 'Controls, Billing & Danger' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors',
                tab === t.id
                  ? 'bg-[#0B1F3A] text-white'
                  : 'bg-[#FBFDFF] border border-[#D5DEE9] text-[#475569] hover:text-[#0F1E33]'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {isLoading ? (
            <InspectorModalSkeleton />
          ) : (
            <>
              {tab === 'overview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-lg border border-[#D5DEE9] bg-[#F1F5F9]">
                      <p className="text-[11px] font-semibold uppercase text-[#64748B]">Staff Seats</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-[#0F1E33] mt-1">
                        {activeMembers} / {formatLimitDisplay(quota.maxUsers)}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-lg border border-[#D5DEE9] bg-[#F1F5F9]">
                      <p className="text-[11px] font-semibold uppercase text-[#64748B]">Products / SKUs</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-[#0F1E33] mt-1">
                        {snapshot?.productsCount ?? 0} / {formatLimitDisplay(quota.maxProducts)}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-lg border border-[#D5DEE9] bg-[#F1F5F9]">
                      <p className="text-[11px] font-semibold uppercase text-[#64748B]">Branches</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-[#0F1E33] mt-1">
                        {snapshot?.branches.length ?? 0} / {formatLimitDisplay(quota.maxBranches)}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-lg border border-[#D5DEE9] bg-[#F1F5F9]">
                      <p className="text-[11px] font-semibold uppercase text-[#64748B]">Total Sales</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-[#0F1E33] mt-1">
                        {snapshot?.salesCount ?? 0}
                      </p>
                    </div>
                  </div>

                  {/* Send Reminder */}
                  <div className="p-4 rounded-xl border border-[#D5DEE9] space-y-3">
                    <h3 className="text-sm font-bold text-[#0F1E33] flex items-center gap-2">
                      <MessageSquare size={16} className="text-[#0F766E]" />
                      Dispatch Subscription Notice / Reminder
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {(['all', 'in_app', 'email', 'whatsapp'] as const).map((ch) => (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => setReminderChannel(ch)}
                          className={cn(
                            'px-3 py-1 rounded-md text-xs font-semibold border',
                            reminderChannel === ch
                              ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                              : 'bg-[#FBFDFF] text-[#475569] border-[#D5DEE9]'
                          )}
                        >
                          {ch === 'all' ? 'All Channels' : ch === 'in_app' ? 'In-App Only' : ch}
                        </button>
                      ))}
                    </div>
                    <textarea
                      rows={3}
                      className="input w-full text-xs"
                      value={reminderMsg}
                      onChange={(e) => setReminderMsg(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={async () => {
                          const res = await onSendReminder(org, {
                            message: reminderMsg,
                            channel: reminderChannel,
                          });
                          if (res.ok && res.fallbackWhatsappUrl) {
                            toast((t) => (
                              <span className="text-xs flex items-center gap-2">
                                Open WhatsApp:{' '}
                                <a
                                  href={res.fallbackWhatsappUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => toast.dismiss(t.id)}
                                  className="underline font-bold text-[#0F766E]"
                                >
                                  Send via wa.me
                                </a>
                              </span>
                            ));
                          }
                        }}
                        className="btn btn-primary text-xs gap-1.5 whitespace-nowrap"
                      >
                        <Send size={14} />
                        Send Notice
                      </button>
                    </div>
                  </div>

                  {/* Invoice History */}
                  <div className="border border-[#D5DEE9] rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#F1F5F9] border-b border-[#D5DEE9] text-xs font-bold text-[#0F1E33]">
                      Recent Subscription Invoices ({snapshot?.billingHistory.length ?? 0})
                    </div>
                    <div className="divide-y divide-[#D5DEE9] max-h-48 overflow-y-auto">
                      {(snapshot?.billingHistory || []).length === 0 ? (
                        <p className="p-4 text-xs text-[#64748B]">No invoices recorded yet.</p>
                      ) : (
                        snapshot?.billingHistory.map((inv) => (
                          <div key={inv.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-semibold text-[#0F1E33]">
                                {inv.reference} · {(inv.plan || org.plan).toUpperCase()}
                              </p>
                              <p className="text-[11px] text-[#64748B]">
                                {formatDate(inv.createdAt)} · {inv.paymentMethod || 'Manual'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono tabular-nums font-bold text-[#0F1E33]">
                                {formatUGX(inv.amount)}
                              </p>
                              <p className="text-[11px] font-semibold text-[#0F766E]">{inv.status}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'accounts' && (
                <div className="space-y-4">
                  <div className="border border-[#D5DEE9] rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse min-w-[600px]">
                      <thead className="bg-[#F1F5F9] border-b border-[#D5DEE9]">
                        <tr>
                          <th className="p-3 font-bold text-[#475569] uppercase">Sub-Account</th>
                          <th className="p-3 font-bold text-[#475569] uppercase">Role</th>
                          <th className="p-3 font-bold text-[#475569] uppercase">Branch</th>
                          <th className="p-3 font-bold text-[#475569] uppercase">Status</th>
                          <th className="p-3 font-bold text-[#475569] uppercase text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D5DEE9]">
                        {(snapshot?.members || []).map((m: TenantMember) => (
                          <tr key={m.uid}>
                            <td className="p-3">
                              <p className="font-semibold text-[#0F1E33]">{m.name}</p>
                              <p className="text-[11px] text-[#64748B]">{m.email}</p>
                            </td>
                            <td className="p-3">
                              <select
                                className="input text-xs py-1 px-2"
                                value={m.role}
                                disabled={isActing}
                                onChange={async (e) => {
                                  const ok = await onUpdateMember(org.id, m.uid, {
                                    role: e.target.value as BusinessRole,
                                  });
                                  if (ok) await onRefresh(org);
                                }}
                              >
                                {(['admin', 'manager', 'cashier', 'accountant', 'inventory'] as BusinessRole[]).map(
                                  (r) => (
                                    <option key={r} value={r}>
                                      {ROLE_META[r].label}
                                    </option>
                                  )
                                )}
                              </select>
                            </td>
                            <td className="p-3">
                              <select
                                className="input text-xs py-1 px-2"
                                value={m.branchId || ''}
                                disabled={isActing}
                                onChange={async (e) => {
                                  const ok = await onUpdateMember(org.id, m.uid, {
                                    branchId: e.target.value || null,
                                  });
                                  if (ok) await onRefresh(org);
                                }}
                              >
                                <option value="">Unassigned</option>
                                {(snapshot?.branches || []).map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-3">
                              <span
                                className={cn(
                                  'font-semibold',
                                  m.status === 'active' ? 'text-[#0F766E]' : 'text-red-600'
                                )}
                              >
                                {m.status === 'active' ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={async () => {
                                  const ok = await onUpdateMember(org.id, m.uid, {
                                    status: m.status === 'active' ? 'inactive' : 'active',
                                  });
                                  if (ok) await onRefresh(org);
                                }}
                                className="text-xs font-semibold text-[#0F1E33] hover:underline whitespace-nowrap"
                              >
                                {m.status === 'active' ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {(snapshot?.invites || []).filter((i) => i.status === 'pending').length > 0 && (
                    <div className="border border-[#D5DEE9] rounded-xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-[#F1F5F9] border-b border-[#D5DEE9] text-xs font-bold text-[#0F1E33]">
                        Pending Staff Invites
                      </div>
                      <div className="divide-y divide-[#D5DEE9]">
                        {snapshot?.invites
                          .filter((i) => i.status === 'pending')
                          .map((inv) => (
                            <div
                              key={inv.id}
                              className="px-4 py-2.5 flex items-center justify-between text-xs"
                            >
                              <div>
                                <p className="font-semibold text-[#0F1E33]">
                                  {inv.name} ({inv.email})
                                </p>
                                <p className="text-[11px] text-[#64748B]">
                                  Role: {ROLE_META[inv.role]?.label || inv.role}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={async () => {
                                  const ok = await onRevokeInvite(inv);
                                  if (ok) await onRefresh(org);
                                }}
                                className="text-red-600 font-semibold hover:underline"
                              >
                                Revoke
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'branches' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(snapshot?.branches || []).map((b) => (
                    <div
                      key={b.id}
                      className="p-4 rounded-xl border border-[#D5DEE9] bg-[#F1F5F9] flex items-start justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-bold text-[#0F1E33]">{b.name}</p>
                        <p className="text-xs text-[#64748B]">{b.location}</p>
                        {b.phone && <p className="text-xs font-mono text-[#475569] mt-1">{b.phone}</p>}
                      </div>
                      <span className="text-[11px] font-semibold text-[#0F766E]">
                        {b.isDefault ? 'Default' : b.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'subscription' && (
                <div className="space-y-5">
                  {org.pendingPlan && (
                    <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-xs">
                        <p className="font-bold text-amber-900">
                          Pending Upgrade Request: {getPlanQuota(org.pendingPlan).name}
                        </p>
                        <p className="text-amber-800 font-mono">
                          Ref: {org.pendingPaymentRef || '—'} ·{' '}
                          {formatUGX(org.pendingAmountUgx || getPlanQuota(org.pendingPlan).monthlyPriceUgx)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={async () => {
                          const ok = await onApprove(org, { plan: org.pendingPlan, months: 1 });
                          if (ok) await onRefresh(org);
                        }}
                        className="btn btn-primary text-xs gap-1.5 whitespace-nowrap"
                      >
                        <CheckCircle2 size={14} />
                        Approve &amp; Activate
                      </button>
                    </div>
                  )}

                  {/* Edit Subscription */}
                  <form
                    onSubmit={handleSaveSubscription}
                    className="p-4 rounded-xl border border-[#D5DEE9] space-y-3"
                  >
                    <h3 className="text-sm font-bold text-[#0F1E33] flex items-center gap-2">
                      <Layers size={15} className="text-[#0F766E]" />
                      Override Plan &amp; Billing Dates
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-[#475569] mb-1">
                          Active Plan
                        </label>
                        <select
                          className="input w-full text-xs"
                          value={editPlan}
                          onChange={(e) => setEditPlan(e.target.value as Tenant['plan'])}
                        >
                          {PLAN_ORDER.map((p) => (
                            <option key={p} value={p}>
                              {getPlanQuota(p).name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#475569] mb-1">
                          Subscribed Start
                        </label>
                        <input
                          type="date"
                          className="input w-full text-xs"
                          value={editSubStart}
                          onChange={(e) => setEditSubStart(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#475569] mb-1">
                          Subscription Expiry
                        </label>
                        <input
                          type="date"
                          className="input w-full text-xs"
                          value={editSubEnd}
                          onChange={(e) => setEditSubEnd(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#475569] mb-1">
                          Custom Price (UGX)
                        </label>
                        <input
                          type="number"
                          min="0"
                          className="input w-full text-xs font-mono"
                          placeholder="Standard rate"
                          value={editCustomPrice}
                          onChange={(e) => setEditCustomPrice(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <label className="flex items-center gap-2 text-xs text-[#334155]">
                        <input
                          type="checkbox"
                          checked={editAutoRemind}
                          onChange={(e) => setEditAutoRemind(e.target.checked)}
                        />
                        Auto-reminders &amp; auto-lock sweep enabled
                      </label>
                      <button
                        type="submit"
                        disabled={isActing}
                        className="btn btn-primary text-xs gap-1.5 whitespace-nowrap"
                      >
                        <Save size={14} />
                        Save Subscription
                      </button>
                    </div>
                  </form>

                  {/* Grant Complimentary */}
                  <div className="p-4 rounded-xl border border-[#D5DEE9] space-y-3">
                    <h3 className="text-sm font-bold text-[#0F1E33] flex items-center gap-2">
                      <Gift size={15} className="text-[#0F766E]" />
                      Grant Complimentary Free Access
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="number"
                        className="input text-xs font-mono"
                        placeholder="Days (blank = unlimited)"
                        value={freeDays}
                        onChange={(e) => setFreeDays(e.target.value)}
                      />
                      <input
                        type="text"
                        className="input text-xs sm:col-span-2"
                        value={freeNote}
                        onChange={(e) => setFreeNote(e.target.value)}
                        placeholder="Grant note"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={async () => {
                          const days = freeDays.trim() ? Number(freeDays) : null;
                          const ok = await onGrantComplimentary(org, {
                            plan: editPlan,
                            durationDays: days && days > 0 ? days : null,
                            note: freeNote,
                          });
                          if (ok) await onRefresh(org);
                        }}
                        className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap"
                      >
                        <Gift size={14} />
                        Grant Free ({getPlanQuota(editPlan).name})
                      </button>
                    </div>
                  </div>

                  {/* Lock / Suspend & Purge */}
                  <div className="p-4 rounded-xl border border-red-200 bg-red-50/40 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#0F1E33] flex items-center gap-1.5">
                          <ShieldAlert size={15} className="text-red-600" />
                          Workspace Access Lock
                        </p>
                        <p className="text-xs text-[#64748B]">
                          {org.locked || org.status === 'suspended'
                            ? 'Currently locked. Unlock to immediately restore storefront access.'
                            : 'Suspending prevents merchant logins & writes while preserving data.'}
                        </p>
                      </div>
                      {org.locked || org.status === 'suspended' ? (
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={async () => {
                            const ok = await onToggleDisable(org, false);
                            if (ok) await onRefresh(org);
                          }}
                          className="btn btn-primary text-xs gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <Unlock size={14} />
                          Unlock Workspace
                        </button>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                          <input
                            type="text"
                            className="input-sm w-full sm:w-48 bg-[#FBFDFF]"
                            placeholder="Suspension reason..."
                            value={disableReason}
                            onChange={(e) => setDisableReason(e.target.value)}
                          />
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={async () => {
                              const ok = await onToggleDisable(org, true, disableReason);
                              if (ok) await onRefresh(org);
                            }}
                            className="btn bg-red-600 text-white hover:bg-red-700 text-xs gap-1.5 whitespace-nowrap shrink-0"
                          >
                            <Lock size={14} />
                            Lock
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-xs">
                        <p className="font-bold text-red-900">Permanently Purge Workspace</p>
                        <p className="text-red-700">
                          Type <strong>{org.name}</strong> to permanently wipe all subcollections &amp; free email locks.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                        <input
                          type="text"
                          className="input-sm w-full sm:w-44 bg-[#FBFDFF]"
                          placeholder={org.name}
                          value={purgeConfirmName}
                          onChange={(e) => setPurgeConfirmName(e.target.value)}
                        />
                        <button
                          type="button"
                          disabled={isActing || purgeConfirmName.trim() !== org.name.trim()}
                          onClick={async () => {
                            const ok = await onDeleteWorkspace(org);
                            if (ok) onClose();
                          }}
                          className="btn bg-red-700 text-white hover:bg-red-800 disabled:opacity-40 text-xs gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <Trash2 size={14} />
                          Purge
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
