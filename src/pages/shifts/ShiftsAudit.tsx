import React, { useMemo, useState } from 'react';
import { History, ShieldCheck, Printer, Search, X, Clock, Download } from 'lucide-react';
import { useShifts } from '../../hooks/useShifts';
import { useAuditLog } from '../../hooks/useAuditLog';
import { useBranches } from '../../hooks/useBranches';
import { useAuthStore } from '../../store/authStore';
import { RegisterShift } from '../../types';
import { formatUGX, formatDate } from '../../utils/format';
import { MobileListSkeleton, TableRowsSkeleton } from '../../components/shared/Skeletons';
import { cn } from '../../lib/utils';

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: 'bg-primary/10 text-primary border-primary/20',
  manager: 'bg-accent/15 text-accent border-accent/25',
  cashier: 'bg-amber-500/15 text-amber-800 border-amber-500/25',
  accountant: 'bg-indigo-500/15 text-indigo-800 border-indigo-500/25',
  inventory: 'bg-emerald-500/15 text-emerald-800 border-emerald-500/25',
};

export default function ShiftsAudit() {
  const { user, tenant } = useAuthStore();
  const { shifts, isLoading } = useShifts();
  const { logs, isLoading: logsLoading } = useAuditLog();
  const { activeBranchId, branches } = useBranches();

  const canViewAudit = user?.role === 'admin' || user?.role === 'manager';
  const [activeTab, setActiveTab] = useState<'shifts' | 'audit'>('shifts');
  const [auditSearch, setAuditSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [selectedShift, setSelectedShift] = useState<RegisterShift | null>(null);

  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const branchShifts = useMemo(() => {
    if (!activeBranchId || activeBranchId === 'ALL') return shifts;
    return shifts.filter((s) => !s.branchId || s.branchId === activeBranchId);
  }, [shifts, activeBranchId]);

  const filteredLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return logs.filter((l) => {
      if (activeBranchId && activeBranchId !== 'ALL' && l.branchId && l.branchId !== activeBranchId) {
        return false;
      }
      if (roleFilter !== 'all' && l.actorRole.toLowerCase() !== roleFilter) {
        return false;
      }
      if (entityFilter !== 'all' && l.entityType.toLowerCase() !== entityFilter.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      return (
        l.action.toLowerCase().includes(q) ||
        l.summary.toLowerCase().includes(q) ||
        l.actorName.toLowerCase().includes(q) ||
        l.actorRole.toLowerCase().includes(q) ||
        l.entityType.toLowerCase().includes(q)
      );
    });
  }, [logs, auditSearch, activeBranchId, roleFilter, entityFilter]);

  const handleExportAuditCsv = () => {
    if (filteredLogs.length === 0) return;
    const escapeCell = (val: string) => `"${String(val || '').replace(/"/g, '""')}"`;
    const header = ['Timestamp', 'Actor', 'Role', 'Action', 'Entity', 'Details'];
    const rows = filteredLogs.map((l) => [
      escapeCell(new Date(l.createdAt).toISOString()),
      escapeCell(l.actorName),
      escapeCell(l.actorRole),
      escapeCell(l.action),
      escapeCell(l.entityType),
      escapeCell(l.summary),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-trail-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-3xl font-bold text-primary">Shifts &amp; Audit Trail</h1>
          <p className="text-text-muted mt-1">
            Review register cash drawer Z-reports and immutable workspace activity logs.
          </p>
        </div>

        {canViewAudit && (
          <div className="flex items-center gap-1 p-1 bg-surface-alt rounded-lg border border-border self-start max-w-full overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('shifts')}
              className={cn(
                'px-4 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-2',
                activeTab === 'shifts'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-text-secondary hover:text-primary'
              )}
            >
              <Clock size={15} />
              Shifts &amp; Z-Reports
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={cn(
                'px-4 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap flex items-center gap-2',
                activeTab === 'audit'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-text-secondary hover:text-primary'
              )}
            >
              <ShieldCheck size={15} />
              Audit Trail
            </button>
          </div>
        )}
      </div>

      {activeTab === 'shifts' || !canViewAudit ? (
        <div className="card p-0 overflow-hidden no-print">
          <div className="p-5 border-b border-border bg-surface-alt/40 flex items-center gap-2">
            <History size={18} className="text-primary" />
            <h2 className="font-bold text-primary">Register Shifts ({branchShifts.length})</h2>
          </div>
          <div className="md:hidden divide-y divide-border">
            {isLoading ? (
              <MobileListSkeleton cards={4} />
            ) : branchShifts.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-text-muted">
                No cash drawer shifts recorded yet. Open a shift from POS.
              </div>
            ) : (
              branchShifts.map((shift) => (
                <div key={shift.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-primary truncate">{shift.userName}</p>
                      <p className="text-xs text-text-muted">
                        {(shift.branchId && branchMap.get(shift.branchId)) || 'Main Branch'} ·{' '}
                        {shift.salesCount} sales
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-[11px] font-bold uppercase px-2 py-0.5 rounded-md border shrink-0',
                        shift.status === 'open'
                          ? 'bg-accent/10 text-accent border-accent/25'
                          : 'bg-surface-alt text-text-secondary border-border'
                      )}
                    >
                      {shift.status}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary space-y-0.5">
                    <p>Opened: {formatDate(shift.openedAt)}</p>
                    {shift.closedAt && (
                      <p className="text-text-muted">Closed: {formatDate(shift.closedAt)}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-surface-alt/50 border border-border/60 text-xs">
                    <div>
                      <p className="text-[10px] uppercase text-text-muted font-semibold">Float</p>
                      <p className="font-mono tabular-nums font-medium">{formatUGX(shift.openingFloat)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-text-muted font-semibold">Expected</p>
                      <p className="font-mono tabular-nums font-bold text-primary">
                        {formatUGX(shift.expectedCash)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-text-muted font-semibold">Variance</p>
                      {shift.variance === undefined ? (
                        <span className="font-mono text-text-muted">-</span>
                      ) : (
                        <span
                          className={cn(
                            'font-mono tabular-nums font-bold',
                            shift.variance === 0
                              ? 'text-accent'
                              : shift.variance > 0
                              ? 'text-primary'
                              : 'text-danger'
                          )}
                        >
                          {shift.variance >= 0 ? '+' : ''}
                          {formatUGX(shift.variance)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedShift(shift)}
                      className="btn btn-secondary text-xs py-1.5 px-3 min-h-[36px] whitespace-nowrap"
                    >
                      View Z-Report
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[820px]">
              <thead>
                <tr className="bg-surface-alt/50 border-b border-border text-xs font-bold text-text-muted uppercase tracking-wider">
                  <th className="px-6 py-4">Cashier / Branch</th>
                  <th className="px-6 py-4">Opened</th>
                  <th className="px-6 py-4">Float</th>
                  <th className="px-6 py-4">Expected Cash</th>
                  <th className="px-6 py-4">Variance</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Z-Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {isLoading ? (
                  <TableRowsSkeleton rows={5} columns={7} />
                ) : branchShifts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-text-muted">
                      No cash drawer shifts recorded yet. Open a shift from POS.
                    </td>
                  </tr>
                ) : (
                  branchShifts.map((shift) => (
                    <tr key={shift.id} className="hover:bg-surface-alt/30">
                      <td className="px-6 py-4">
                        <p className="font-bold text-primary">{shift.userName}</p>
                        <p className="text-xs text-text-muted">
                          {(shift.branchId && branchMap.get(shift.branchId)) || 'Main Branch'} ·{' '}
                          {shift.salesCount} sales
                        </p>
                      </td>
                      <td className="px-6 py-4 text-xs text-text-secondary">
                        <div>{formatDate(shift.openedAt)}</div>
                        {shift.closedAt && (
                          <div className="text-text-muted">Closed: {formatDate(shift.closedAt)}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono tabular-nums">{formatUGX(shift.openingFloat)}</td>
                      <td className="px-6 py-4 font-mono tabular-nums font-bold text-primary">
                        {formatUGX(shift.expectedCash)}
                      </td>
                      <td className="px-6 py-4 font-mono tabular-nums">
                        {shift.variance === undefined ? (
                          <span className="text-text-muted">-</span>
                        ) : (
                          <span
                            className={cn(
                              'font-bold',
                              shift.variance === 0
                                ? 'text-accent'
                                : shift.variance > 0
                                ? 'text-primary'
                                : 'text-danger'
                            )}
                          >
                            {shift.variance >= 0 ? '+' : ''}
                            {formatUGX(shift.variance)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'text-xs font-bold uppercase',
                            shift.status === 'open' ? 'text-accent' : 'text-text-secondary'
                          )}
                        >
                          {shift.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedShift(shift)}
                          className="btn btn-secondary text-xs py-1.5 px-3 min-h-[32px] whitespace-nowrap"
                        >
                          View Z-Report
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden no-print">
          <div className="p-4 border-b border-border bg-surface-alt/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-primary">Workspace Audit Logs ({filteredLogs.length})</h2>
              <p className="text-xs text-text-muted">
                Every action by Admins, Managers, Cashiers, Accountants, and Inventory Clerks is recorded automatically.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label="Filter audit logs by role"
                className="input-sm flex-1 sm:flex-none sm:min-w-[130px]"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="cashier">Cashier</option>
                <option value="accountant">Accountant</option>
                <option value="inventory">Inventory</option>
              </select>
              <select
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                aria-label="Filter audit logs by module"
                className="input-sm flex-1 sm:flex-none sm:min-w-[140px]"
              >
                <option value="all">All Modules</option>
                <option value="auth">Sign-In &amp; Auth</option>
                <option value="sale">Sales &amp; POS</option>
                <option value="shift">Register Shifts</option>
                <option value="product">Products</option>
                <option value="stock">Stock Ops</option>
                <option value="purchaseOrder">Purchase Orders</option>
                <option value="expense">Expenses</option>
                <option value="creditPayment">Credit Payments</option>
                <option value="customer">Customers</option>
                <option value="supplier">Suppliers</option>
                <option value="payroll">Payroll</option>
                <option value="team">Team &amp; Roles</option>
                <option value="branch">Branches</option>
                <option value="billing">Billing</option>
                <option value="settings">Settings &amp; Profile</option>
              </select>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={15} />
                <input
                  type="text"
                  placeholder="Search actor, action..."
                  className="input-sm pl-8 w-full"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                />
              </div>
              {filteredLogs.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportAuditCsv}
                  className="btn btn-secondary text-xs py-1.5 px-3 min-h-[36px] gap-1.5 whitespace-nowrap"
                >
                  <Download size={14} />
                  Export CSV
                </button>
              )}
            </div>
          </div>

          <div className="md:hidden divide-y divide-border">
            {logsLoading ? (
              <MobileListSkeleton cards={5} />
            ) : filteredLogs.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-text-muted">
                No matching audit events found
              </div>
            ) : (
              filteredLogs.slice(0, 200).map((log) => (
                <div key={log.id} className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-primary truncate">{log.actorName}</p>
                      <p className="text-[11px] font-mono text-text-muted">
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide shrink-0',
                        ROLE_BADGE_CLASSES[log.actorRole.toLowerCase()] ||
                          'bg-surface-alt text-text-secondary border-border'
                      )}
                    >
                      {log.actorRole}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-mono font-bold text-primary">{log.action}</span>
                    <span className="text-[11px] text-text-muted capitalize">· {log.entityType}</span>
                  </div>
                  <p className="text-xs text-text-secondary">{log.summary}</p>
                </div>
              ))
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="bg-surface-alt/50 border-b border-border text-xs font-bold text-text-muted uppercase tracking-wider">
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Actor &amp; Role</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {logsLoading ? (
                  <TableRowsSkeleton rows={6} columns={4} />
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-text-muted">
                      No matching audit events found
                    </td>
                  </tr>
                ) : (
                  filteredLogs.slice(0, 200).map((log) => (
                    <tr key={log.id} className="hover:bg-surface-alt/30">
                      <td className="px-6 py-3.5 text-xs text-text-muted whitespace-nowrap font-mono">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="font-semibold text-primary">{log.actorName}</p>
                        <span
                          className={cn(
                            'inline-block mt-0.5 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide',
                            ROLE_BADGE_CLASSES[log.actorRole.toLowerCase()] ||
                              'bg-surface-alt text-text-secondary border-border'
                          )}
                        >
                          {log.actorRole}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-mono text-xs font-bold text-primary block">
                          {log.action}
                        </span>
                        <span className="text-[11px] text-text-muted capitalize">{log.entityType}</span>
                      </td>
                      <td className="px-6 py-3.5 text-text-secondary">{log.summary}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Printable Z-Report Modal */}
      {selectedShift && (
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white no-print shrink-0">
              <h3 className="text-lg font-bold text-white">Shift Z-Report</h3>
              <button
                type="button"
                onClick={() => setSelectedShift(null)}
                className="p-1 hover:bg-white/10 rounded-lg"
                aria-label="Close Z-Report"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 sm:p-6 space-y-4 print-content text-sm overflow-y-auto flex-1">
              <div className="text-center border-b border-border pb-3">
                <h4 className="font-bold text-lg text-primary">{tenant?.name || 'PRIMESTOCK BMS'}</h4>
                <p className="text-xs text-text-muted">
                  {(selectedShift.branchId && branchMap.get(selectedShift.branchId)) || 'Main Branch'} · Cashier:{' '}
                  {selectedShift.userName}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  Opened: {new Date(selectedShift.openedAt).toLocaleString()}
                </p>
                {selectedShift.closedAt && (
                  <p className="text-xs text-text-muted">
                    Closed: {new Date(selectedShift.closedAt).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Opening Float</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formatUGX(selectedShift.openingFloat)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Cash Sales</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formatUGX(selectedShift.cashSales)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Mobile Money Sales</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formatUGX(selectedShift.mobileMoneySales)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Card / Bank Sales</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formatUGX(selectedShift.cardSales)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Customer Credit Sales</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formatUGX(selectedShift.creditSales)}
                  </span>
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-1.5">
                <div className="flex justify-between font-bold text-primary">
                  <span>Expected Cash in Drawer</span>
                  <span className="font-mono tabular-nums">{formatUGX(selectedShift.expectedCash)}</span>
                </div>
                {selectedShift.closingCash !== undefined && (
                  <div className="flex justify-between font-bold text-primary">
                    <span>Counted Closing Cash</span>
                    <span className="font-mono tabular-nums">{formatUGX(selectedShift.closingCash)}</span>
                  </div>
                )}
                {selectedShift.variance !== undefined && (
                  <div className="flex justify-between font-bold">
                    <span>Cash Variance</span>
                    <span
                      className={cn(
                        'font-mono tabular-nums',
                        selectedShift.variance === 0 ? 'text-accent' : 'text-danger'
                      )}
                    >
                      {selectedShift.variance >= 0 ? '+' : ''}
                      {formatUGX(selectedShift.variance)}
                    </span>
                  </div>
                )}
                {selectedShift.notes && (
                  <p className="text-xs text-text-muted pt-2">Notes: {selectedShift.notes}</p>
                )}
              </div>
            </div>
            <div className="p-4 bg-surface-alt border-t border-border flex gap-3 no-print shrink-0">
              <button
                type="button"
                onClick={() => setSelectedShift(null)}
                className="btn btn-secondary flex-1"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn btn-primary flex-1 gap-2"
              >
                <Printer size={16} />
                Print Z-Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
