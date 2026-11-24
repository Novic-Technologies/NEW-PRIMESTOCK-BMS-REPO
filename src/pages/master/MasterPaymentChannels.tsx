import React, { useEffect, useState } from 'react';
import { CreditCard, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useMasterAdmin } from '../../hooks/useMasterAdmin';
import { PlatformBillingConfig, PlatformPaymentChannelConfig } from '../../types';
import {
  DEFAULT_PLATFORM_BILLING_CONFIG,
  normalizePlatformBillingConfig,
  usePlatformBillingConfig,
} from '../../utils/platformBilling';
import { formatDate } from '../../utils/format';
import { cn } from '../../lib/utils';

const BUILT_IN_IDS = new Set([
  'mtn_momo',
  'airtel_money',
  'flutterwave',
  'bank_transfer',
]);

export default function MasterPaymentChannels() {
  const { isActing, savePlatformBillingConfig } = useMasterAdmin();
  const { config: liveBilling, isLoading } = usePlatformBillingConfig();

  const [draft, setDraft] = useState<PlatformBillingConfig>(() =>
    normalizePlatformBillingConfig(DEFAULT_PLATFORM_BILLING_CONFIG)
  );
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isLoading && !isDirty) {
      setDraft(normalizePlatformBillingConfig(liveBilling));
    }
  }, [liveBilling, isLoading, isDirty]);

  const updateChannel = (
    idx: number,
    patch: Partial<PlatformPaymentChannelConfig>
  ) => {
    setIsDirty(true);
    setDraft((prev) => ({
      ...prev,
      channels: prev.channels.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  };

  const addCustomChannel = () => {
    if (draft.channels.length >= 15) return;
    setIsDirty(true);
    const id = `custom_${Date.now().toString().slice(-6)}`;
    setDraft((prev) => ({
      ...prev,
      channels: [
        ...prev.channels,
        {
          id,
          label: 'New Channel',
          paymentMethodName: 'Custom Transfer',
          sublabel: 'Manual Reference',
          enabled: true,
          accountName: 'Novic Technologies Ltd',
          accountNumber: '',
          instructions: 'Send payment and enter your transaction reference for verification.',
        },
      ],
    }));
  };

  const removeCustomChannel = (idx: number) => {
    setIsDirty(true);
    setDraft((prev) => ({
      ...prev,
      channels: prev.channels.filter((_, i) => i !== idx),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await savePlatformBillingConfig(draft);
    if (ok) setIsDirty(false);
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">
            Subscription Payment Channels
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Set the official MoMo codes, Airtel Merchant IDs, Flutterwave channels, and Bank accounts businesses pay into when upgrading.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isActing}
            onClick={() => {
              setDraft(normalizePlatformBillingConfig(DEFAULT_PLATFORM_BILLING_CONFIG));
              setIsDirty(true);
            }}
            className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap"
          >
            <RotateCcw size={14} />
            Reset Defaults
          </button>
          <button
            type="submit"
            disabled={isActing}
            className="btn btn-primary text-xs gap-1.5 whitespace-nowrap"
          >
            <Save size={14} />
            {isActing ? 'Saving...' : 'Save Payment Channels'}
          </button>
        </div>
      </div>

      {/* Platform Support Contacts */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-primary">
              Platform Billing Support Contacts
            </h2>
            <p className="text-xs text-text-muted">
              Displayed inside merchant Billing checkout screens for payment assistance.
            </p>
          </div>
          {draft.updatedAt && (
            <span className="text-[11px] font-mono text-text-muted">
              Synced {formatDate(draft.updatedAt)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-primary mb-1">
              Support Email
            </label>
            <input
              type="email"
              className="input w-full text-xs"
              placeholder="davidmagero22@gmail.com"
              value={draft.supportEmail || ''}
              onChange={(e) => {
                setIsDirty(true);
                setDraft((p) => ({ ...p, supportEmail: e.target.value }));
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-primary mb-1">
              Support Phone
            </label>
            <input
              type="tel"
              className="input w-full text-xs font-mono"
              placeholder="+256 772 000 000"
              value={draft.supportPhone || ''}
              onChange={(e) => {
                setIsDirty(true);
                setDraft((p) => ({ ...p, supportPhone: e.target.value }));
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-primary mb-1">
              Billing WhatsApp Number
            </label>
            <input
              type="tel"
              className="input w-full text-xs font-mono"
              placeholder="+256 772 000 000"
              value={draft.supportWhatsapp || ''}
              onChange={(e) => {
                setIsDirty(true);
                setDraft((p) => ({ ...p, supportWhatsapp: e.target.value }));
              }}
            />
          </div>
        </div>
      </div>

      {/* Channels List */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-primary flex items-center gap-2">
              <CreditCard size={16} className="text-accent" />
              Configured Channels ({draft.channels.length} / 15)
            </h2>
            <p className="text-xs text-text-muted">
              Enable/disable channels and edit account numbers or USSD dial prefixes.
            </p>
          </div>
          <button
            type="button"
            disabled={draft.channels.length >= 15}
            onClick={addCustomChannel}
            className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap"
          >
            <Plus size={14} />
            Add Custom Channel
          </button>
        </div>

        <div className="space-y-4">
          {draft.channels.map((ch, idx) => {
            const isBuiltIn = BUILT_IN_IDS.has(ch.id);
            return (
              <div
                key={ch.id}
                className={cn(
                  'p-4 rounded-xl border space-y-3',
                  ch.enabled
                    ? 'border-border bg-surface'
                    : 'border-border bg-surface-alt opacity-80'
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ch.enabled}
                      onChange={(e) => updateChannel(idx, { enabled: e.target.checked })}
                    />
                    <span className="text-sm font-bold text-primary">
                      {ch.label || ch.id}
                    </span>
                    <span className="text-[11px] font-mono text-text-muted">({ch.id})</span>
                  </label>

                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'text-xs font-semibold',
                        ch.enabled ? 'text-accent' : 'text-text-muted'
                      )}
                    >
                      {ch.enabled ? 'Active for Businesses' : 'Hidden'}
                    </span>
                    {!isBuiltIn && (
                      <button
                        type="button"
                        onClick={() => removeCustomChannel(idx)}
                        className="p-1 text-text-muted hover:text-danger"
                        aria-label={`Delete ${ch.label}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-text-secondary mb-1">
                      Button Label *
                    </label>
                    <input
                      required
                      type="text"
                      maxLength={60}
                      className="input w-full text-xs"
                      value={ch.label}
                      onChange={(e) => updateChannel(idx, { label: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-text-secondary mb-1">
                      Invoice Method Name *
                    </label>
                    <input
                      required
                      type="text"
                      maxLength={80}
                      className="input w-full text-xs"
                      value={ch.paymentMethodName}
                      onChange={(e) =>
                        updateChannel(idx, { paymentMethodName: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-text-secondary mb-1">
                      Sublabel
                    </label>
                    <input
                      type="text"
                      maxLength={60}
                      className="input w-full text-xs"
                      value={ch.sublabel}
                      onChange={(e) => updateChannel(idx, { sublabel: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-text-secondary mb-1">
                      Account / Merchant Name
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      className="input w-full text-xs"
                      value={ch.accountName || ''}
                      onChange={(e) => updateChannel(idx, { accountName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-text-secondary mb-1">
                      Merchant Code / Account No.
                    </label>
                    <input
                      type="text"
                      maxLength={80}
                      className="input w-full text-xs font-mono"
                      placeholder="e.g. 0772 000 000 or 449201"
                      value={ch.accountNumber || ''}
                      onChange={(e) => updateChannel(idx, { accountNumber: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-text-secondary mb-1">
                        Bank Name
                      </label>
                      <input
                        type="text"
                        maxLength={80}
                        className="input w-full text-xs"
                        value={ch.bankName || ''}
                        onChange={(e) => updateChannel(idx, { bankName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-text-secondary mb-1">
                        USSD Prefix
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        className="input w-full text-xs font-mono"
                        placeholder="*165*3#"
                        value={ch.ussdPrefix || ''}
                        onChange={(e) => updateChannel(idx, { ussdPrefix: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-text-secondary mb-1">
                    Checkout Instructions
                  </label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    className="input w-full text-xs"
                    value={ch.instructions || ''}
                    onChange={(e) => updateChannel(idx, { instructions: e.target.value })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </form>
  );
}
