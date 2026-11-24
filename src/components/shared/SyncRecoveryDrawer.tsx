import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  RefreshCw,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { localDb } from '../../services/db';
import { useAuthStore } from '../../store/authStore';
import { useSyncStore } from '../../store/syncStore';
import {
  discardSyncItem,
  retryAllFailedSyncItems,
  retrySyncItem,
} from '../../hooks/useSync';
import { SyncRecord } from '../../types';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

interface SyncRecoveryDrawerProps {
  open: boolean;
  onClose: () => void;
  onSyncNow?: () => void;
}

const TABLE_LABELS: Record<string, string> = {
  sales: 'POS Sale / Receipt',
  products: 'Product / Stock',
  customers: 'Customer',
  expenses: 'Expense',
  suppliers: 'Supplier',
  branches: 'Branch',
  shifts: 'Register Shift',
  purchaseOrders: 'Purchase Order',
  creditPayments: 'Credit / Debt Payment',
  billingHistory: 'Billing Record',
  stockTransfers: 'Stock Transfer',
  stockAdjustments: 'Stock Adjustment',
  payrollRuns: 'Payroll Run',
  auditLogs: 'Audit Log',
  aiChats: 'AI Copilot Chat',
};

function getRecordLabel(record: SyncRecord): string {
  const d = record.data || {};
  return (
    d.reference ||
    d.name ||
    d.productName ||
    d.partyName ||
    d.description ||
    d.periodLabel ||
    d.summary ||
    d.id ||
    'Queued Record'
  );
}

export function SyncRecoveryDrawer({ open, onClose, onSyncNow }: SyncRecoveryDrawerProps) {
  const { tenant } = useAuthStore();
  const { isOnline, pendingCount, failedCount, lastSyncedAt } = useSyncStore();
  const [queueItems, setQueueItems] = useState<SyncRecord[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isRetryingAll, setIsRetryingAll] = useState(false);
  const [confirmDiscardId, setConfirmDiscardId] = useState<number | null>(null);

  const loadQueueItems = useCallback(async () => {
    if (!open || !tenant?.id) {
      setQueueItems([]);
      return;
    }
    const rows = await localDb.syncQueue
      .where('status')
      .anyOf(['pending', 'error'])
      .filter((r) => !r.tenantId || r.tenantId === tenant.id)
      .toArray();
    setQueueItems(rows.sort((a, b) => b.createdAt - a.createdAt));
  }, [open, tenant?.id]);

  useEffect(() => {
    void loadQueueItems();
  }, [loadQueueItems, pendingCount, failedCount, lastSyncedAt]);

  if (!open) return null;

  const errorItems = queueItems.filter((item) => item.status === 'error');
  const pendingItems = queueItems.filter((item) => item.status === 'pending');

  const handleRetryOne = async (item: SyncRecord) => {
    if (!tenant?.id || item.id === undefined) return;
    if (!isOnline) {
      toast.error('Connect to the internet first to retry sync');
      return;
    }
    setBusyId(item.id);
    try {
      await retrySyncItem(item.id, tenant.id);
      await loadQueueItems();
      toast.success(`Retried ${getRecordLabel(item)}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleRetryAll = async () => {
    if (!tenant?.id) return;
    if (!isOnline) {
      toast.error('Connect to the internet first to retry failed records');
      return;
    }
    setIsRetryingAll(true);
    try {
      await retryAllFailedSyncItems(tenant.id);
      await loadQueueItems();
      onSyncNow?.();
      toast.success('Retry sweep complete');
    } finally {
      setIsRetryingAll(false);
    }
  };

  const handleDiscard = async (item: SyncRecord) => {
    if (item.id === undefined) return;
    await discardSyncItem(item.id);
    setConfirmDiscardId(null);
    await loadQueueItems();
    toast.success('Queued record removed from offline queue');
  };

  const handleExportBackup = () => {
    if (queueItems.length === 0) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      tenantId: tenant?.id,
      tenantName: tenant?.name,
      records: queueItems,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `primestock-sync-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${queueItems.length} offline queue records as JSON`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Offline Sync Queue and Recovery"
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs"
    >
      <div className="flex-1" onClick={onClose} aria-hidden="true" />
      <div className="w-full max-w-lg bg-surface border-l border-border h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 bg-surface-alt/50">
          <div>
            <h2 className="text-base font-bold text-primary flex items-center gap-2">
              {errorItems.length > 0 ? (
                <AlertTriangle size={18} className="text-danger shrink-0" />
              ) : (
                <RefreshCw size={18} className="text-accent shrink-0" />
              )}
              Offline Sync &amp; Recovery Queue
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Inspect pending writes, resolve sync errors, or download a JSON safety backup.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sync drawer"
            className="p-2 rounded-lg text-text-muted hover:text-primary hover:bg-surface-alt transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary & Bulk Controls */}
        <div className="p-4 border-b border-border space-y-3 bg-canvas/40">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-surface border border-border">
              <p className="text-[10px] font-bold uppercase text-text-muted">Network</p>
              <p
                className={cn(
                  'text-xs font-bold mt-0.5',
                  isOnline ? 'text-accent' : 'text-danger'
                )}
              >
                {isOnline ? 'Online' : 'Offline'}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-surface border border-border">
              <p className="text-[10px] font-bold uppercase text-text-muted">Pending</p>
              <p className="text-xs font-bold font-mono tabular-nums text-primary mt-0.5">
                {pendingItems.length}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-surface border border-border">
              <p className="text-[10px] font-bold uppercase text-text-muted">Failed</p>
              <p
                className={cn(
                  'text-xs font-bold font-mono tabular-nums mt-0.5',
                  errorItems.length > 0 ? 'text-danger' : 'text-accent'
                )}
              >
                {errorItems.length}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!isOnline || isRetryingAll || queueItems.length === 0}
              onClick={handleRetryAll}
              className="btn btn-primary text-xs py-2 px-3 flex-1 gap-1.5 whitespace-nowrap"
            >
              <RefreshCw size={13} className={isRetryingAll ? 'animate-spin' : ''} />
              {isRetryingAll ? 'Retrying...' : 'Retry All Queued'}
            </button>
            <button
              type="button"
              disabled={queueItems.length === 0}
              onClick={handleExportBackup}
              className="btn btn-secondary text-xs py-2 px-3 gap-1.5 whitespace-nowrap"
            >
              <Download size={13} />
              Export JSON
            </button>
          </div>

          {!isOnline && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-primary flex items-center gap-2">
              <WifiOff size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span>You are currently offline. Queued records are safe in IndexedDB and will auto-sync once connected.</span>
            </div>
          )}
        </div>

        {/* Queue List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {queueItems.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 size={34} className="text-accent mx-auto mb-3" />
              <p className="text-sm font-bold text-primary">All offline changes synced</p>
              <p className="text-xs text-text-muted mt-1 max-w-xs mx-auto">
                There are no pending or failed records waiting in your local IndexedDB queue.
              </p>
            </div>
          ) : (
            queueItems.map((item) => {
              const isError = item.status === 'error';
              const isBusy = busyId === item.id;
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-xl border p-3.5 space-y-2.5 bg-surface',
                    isError ? 'border-danger/40 bg-danger/5' : 'border-border'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                            isError
                              ? 'bg-danger/15 text-danger'
                              : 'bg-accent/15 text-accent'
                          )}
                        >
                          {isError ? 'Sync Failed' : 'Pending'}
                        </span>
                        <span className="text-[11px] font-semibold text-text-secondary">
                          {TABLE_LABELS[item.table] || item.table} ({item.action})
                        </span>
                      </div>
                      <p className="text-sm font-bold text-primary truncate mt-1">
                        {getRecordLabel(item)}
                      </p>
                      <p className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5">
                        <Clock size={11} />
                        Queued {new Date(item.createdAt).toLocaleString()}
                        {typeof item.retryCount === 'number' && item.retryCount > 0 && (
                          <span> · {item.retryCount} retries</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {isError && (
                    <div className="p-2.5 rounded-lg bg-surface-alt border border-danger/20 text-[11px] font-mono text-danger break-words">
                      {item.errorMessage || 'Write rejected or timed out. Check permissions or network connection.'}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    {confirmDiscardId === item.id ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-danger font-semibold">Discard permanently?</span>
                        <button
                          type="button"
                          onClick={() => handleDiscard(item)}
                          className="px-2.5 py-1 rounded-md bg-danger text-white font-bold hover:opacity-90"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDiscardId(null)}
                          className="px-2.5 py-1 rounded-md bg-surface-alt text-text-secondary font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirmDiscardId(item.id ?? null)}
                          className="btn btn-secondary text-[11px] py-1.5 px-2.5 min-h-[30px] text-danger gap-1"
                        >
                          <Trash2 size={12} />
                          Discard
                        </button>
                        <button
                          type="button"
                          disabled={!isOnline || isBusy}
                          onClick={() => handleRetryOne(item)}
                          className="btn btn-primary text-[11px] py-1.5 px-3 min-h-[30px] gap-1"
                        >
                          <RefreshCw size={12} className={isBusy ? 'animate-spin' : ''} />
                          Retry
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
