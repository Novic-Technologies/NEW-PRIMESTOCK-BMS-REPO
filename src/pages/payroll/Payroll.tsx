import React, { useMemo, useState } from 'react';
import {
  Wallet,
  Users,
  CheckCircle2,
  Printer,
  Edit2,
  X,
  History,
  FileText,
} from 'lucide-react';
import { useTeam } from '../../hooks/useTeam';
import { usePayroll } from '../../hooks/usePayroll';
import { useAuthStore } from '../../store/authStore';
import { calculatePayrollEntry } from '../../utils/payrollUg';
import { formatUGX, formatDate } from '../../utils/format';
import { PayrollEntry, PayrollRun, TenantMember } from '../../types';
import { MobileListSkeleton, TableRowsSkeleton } from '../../components/shared/Skeletons';
import toast from 'react-hot-toast';

export default function Payroll() {
  const { user, tenant } = useAuthStore();
  const { members, updateMember } = useTeam();
  const { runs, isLoading, processPayrollRun } = usePayroll();

  const currentMonthLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, []);

  const [periodLabel, setPeriodLabel] = useState(currentMonthLabel);
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [isProcessing, setIsProcessing] = useState(false);

  const [editingMember, setEditingMember] = useState<TenantMember | null>(null);
  const [salaryInput, setSalaryInput] = useState('');
  const [nssfInput, setNssfInput] = useState('');
  const [tinInput, setTinInput] = useState('');

  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);

  const isAdmin = user?.role === 'admin';
  const canRunPayroll = user?.role === 'admin' || user?.role === 'accountant';

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === 'active'),
    [members]
  );

  const previewEntries: PayrollEntry[] = useMemo(() => {
    return activeMembers.map((m) =>
      calculatePayrollEntry({
        memberUid: m.uid,
        memberName: m.name,
        role: m.role,
        grossSalaryUgx: m.baseSalaryUgx || 0,
      })
    );
  }, [activeMembers]);

  const totals = useMemo(() => {
    return previewEntries.reduce(
      (acc, e) => ({
        gross: acc.gross + e.grossSalaryUgx,
        paye: acc.paye + e.payeTaxUgx,
        nssfEmp: acc.nssfEmp + e.nssfEmployeeUgx,
        nssfEmpr: acc.nssfEmpr + e.nssfEmployerUgx,
        net: acc.net + e.netPayUgx,
      }),
      { gross: 0, paye: 0, nssfEmp: 0, nssfEmpr: 0, net: 0 }
    );
  }, [previewEntries]);

  const openSalaryEditor = (member: TenantMember) => {
    setEditingMember(member);
    setSalaryInput(member.baseSalaryUgx ? String(member.baseSalaryUgx) : '');
    setNssfInput(member.nssfNumber || '');
    setTinInput(member.tinNumber || '');
  };

  const handleSaveSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    await updateMember(editingMember.uid, {
      baseSalaryUgx: Math.max(0, Number(salaryInput) || 0),
      nssfNumber: nssfInput.trim() || undefined,
      tinNumber: tinInput.trim() || undefined,
    });
    setEditingMember(null);
  };

  const handleProcessPayroll = async () => {
    if (isProcessing) return;
    if (!periodLabel.trim()) {
      toast.error('Enter a payroll period label');
      return;
    }
    setIsProcessing(true);
    try {
      await processPayrollRun({
        periodLabel,
        paymentMethod,
        entries: previewEntries,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-3xl font-bold text-primary">Uganda PAYE &amp; NSSF Payroll</h1>
          <p className="text-text-muted mt-1">
            Automated URA progressive PAYE, 5% employee NSSF, and 10% employer NSSF contribution runs.
          </p>
        </div>
        {canRunPayroll && (
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <input
              type="text"
              aria-label="Payroll period"
              className="input-sm w-full sm:w-44"
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
            />
            <select
              aria-label="Payroll payment method"
              className="input-sm flex-1 sm:flex-none sm:w-40"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Mobile Money">Mobile Money</option>
              <option value="Cash">Cash</option>
            </select>
            <button
              type="button"
              disabled={isProcessing || totals.gross <= 0}
              onClick={handleProcessPayroll}
              className="btn btn-primary text-xs sm:text-sm gap-2 whitespace-nowrap flex-1 sm:flex-none"
            >
              <CheckCircle2 size={16} />
              {isProcessing ? 'Processing...' : 'Run Payroll'}
            </button>
          </div>
        )}
      </div>

      {/* Totals KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-primary rounded-xl text-white shrink-0">
            <Users size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-xs font-medium uppercase">Monthly Gross</p>
            <h3 className="text-xl font-bold text-primary font-mono tabular-nums truncate">
              {formatUGX(totals.gross)}
            </h3>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-danger rounded-xl text-white shrink-0">
            <FileText size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-xs font-medium uppercase">URA PAYE Tax</p>
            <h3 className="text-xl font-bold text-primary font-mono tabular-nums truncate">
              {formatUGX(totals.paye)}
            </h3>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-accent-alt rounded-xl text-white shrink-0">
            <Wallet size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-xs font-medium uppercase">Total NSSF (15%)</p>
            <h3 className="text-xl font-bold text-primary font-mono tabular-nums truncate">
              {formatUGX(totals.nssfEmp + totals.nssfEmpr)}
            </h3>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-accent rounded-xl text-white shrink-0">
            <CheckCircle2 size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-xs font-medium uppercase">Net Take-Home</p>
            <h3 className="text-xl font-bold text-accent font-mono tabular-nums truncate">
              {formatUGX(totals.net)}
            </h3>
          </div>
        </div>
      </div>

      {/* Staff Salary & Live Calculation Table */}
      <div className="card p-0 overflow-hidden no-print">
        <div className="p-5 border-b border-border bg-surface-alt/40 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-primary">Staff Compensation &amp; Statutory Breakdown</h2>
            <p className="text-xs text-text-muted">
              Set monthly gross salaries to preview exact URA PAYE and NSSF deductions.
            </p>
          </div>
        </div>
        <div className="md:hidden divide-y divide-border">
          {activeMembers.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-text-muted">
              No active staff members found
            </div>
          ) : (
            activeMembers.map((member, idx) => {
              const calc = previewEntries[idx];
              return (
                <div key={member.uid} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-primary truncate">{member.name}</p>
                      <p className="text-xs text-text-muted capitalize">
                        {member.role} · TIN: {member.tinNumber || '-'} · NSSF: {member.nssfNumber || '-'}
                      </p>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => openSalaryEditor(member)}
                        className="p-2 text-text-muted hover:text-primary hover:bg-surface-alt rounded-lg shrink-0"
                        aria-label={`Edit salary for ${member.name}`}
                      >
                        <Edit2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-surface-alt/50 border border-border/60 text-xs">
                    <div>
                      <p className="text-[10px] uppercase text-text-muted font-semibold">Gross Pay</p>
                      <p className="font-mono tabular-nums font-semibold text-primary">
                        {formatUGX(calc.grossSalaryUgx)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-text-muted font-semibold">Net Pay</p>
                      <p className="font-mono tabular-nums font-bold text-accent">
                        {formatUGX(calc.netPayUgx)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-text-muted font-semibold">URA PAYE</p>
                      <p className="font-mono tabular-nums text-danger">{formatUGX(calc.payeTaxUgx)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-text-muted font-semibold">NSSF (5% / 10%)</p>
                      <p className="font-mono tabular-nums text-text-secondary">
                        {formatUGX(calc.nssfEmployeeUgx)} / {formatUGX(calc.nssfEmployerUgx)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[880px]">
            <thead>
              <tr className="bg-surface-alt/50 border-b border-border text-xs font-bold text-text-muted uppercase tracking-wider">
                <th className="px-6 py-4">Staff Member</th>
                <th className="px-6 py-4">IDs (TIN / NSSF)</th>
                <th className="px-6 py-4">Gross Pay</th>
                <th className="px-6 py-4">PAYE (URA)</th>
                <th className="px-6 py-4">NSSF (5% EE)</th>
                <th className="px-6 py-4">NSSF (10% ER)</th>
                <th className="px-6 py-4">Net Pay</th>
                {isAdmin && <th className="px-6 py-4 text-right">Edit</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {activeMembers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-text-muted">
                    No active staff members found
                  </td>
                </tr>
              ) : (
                activeMembers.map((member, idx) => {
                  const calc = previewEntries[idx];
                  return (
                    <tr key={member.uid} className="hover:bg-surface-alt/30">
                      <td className="px-6 py-4">
                        <p className="font-bold text-primary">{member.name}</p>
                        <p className="text-xs text-text-muted capitalize">{member.role}</p>
                      </td>
                      <td className="px-6 py-4 text-xs text-text-secondary font-mono">
                        <div>TIN: {member.tinNumber || '-'}</div>
                        <div>NSSF: {member.nssfNumber || '-'}</div>
                      </td>
                      <td className="px-6 py-4 font-mono tabular-nums font-semibold text-primary">
                        {formatUGX(calc.grossSalaryUgx)}
                      </td>
                      <td className="px-6 py-4 font-mono tabular-nums text-danger">
                        {formatUGX(calc.payeTaxUgx)}
                      </td>
                      <td className="px-6 py-4 font-mono tabular-nums text-text-secondary">
                        {formatUGX(calc.nssfEmployeeUgx)}
                      </td>
                      <td className="px-6 py-4 font-mono tabular-nums text-text-secondary">
                        {formatUGX(calc.nssfEmployerUgx)}
                      </td>
                      <td className="px-6 py-4 font-mono tabular-nums font-bold text-accent">
                        {formatUGX(calc.netPayUgx)}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => openSalaryEditor(member)}
                            className="p-2 text-text-muted hover:text-primary hover:bg-surface-alt rounded-lg"
                            aria-label={`Edit salary for ${member.name}`}
                          >
                            <Edit2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payroll History */}
      <div className="card p-0 overflow-hidden no-print">
        <div className="p-5 border-b border-border bg-surface-alt/40 flex items-center gap-2">
          <History size={18} className="text-primary" />
          <h2 className="font-bold text-primary">Processed Payroll Runs ({runs.length})</h2>
        </div>
        <div className="md:hidden divide-y divide-border">
          {isLoading ? (
            <MobileListSkeleton cards={4} />
          ) : runs.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-text-muted">
              No payroll runs processed yet.
            </div>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-primary truncate">{run.periodLabel}</p>
                    <p className="text-xs text-text-muted">
                      {formatDate(run.createdAt)} · {run.paymentMethod} · {run.entries.length} staff
                    </p>
                  </div>
                  <span className="font-mono tabular-nums font-bold text-accent text-sm shrink-0">
                    {formatUGX(run.totalNetPayUgx)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                  <span className="font-mono tabular-nums">
                    Gross: {formatUGX(run.totalGrossUgx)} · Tax/NSSF:{' '}
                    {formatUGX(run.totalPayeUgx + run.totalNssfEmployeeUgx + run.totalNssfEmployerUgx)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedRun(run)}
                    className="btn btn-secondary text-xs py-1.5 px-3 min-h-[34px] whitespace-nowrap shrink-0"
                  >
                    View Payslips
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-surface-alt/50 border-b border-border text-xs font-bold text-text-muted uppercase tracking-wider">
                <th className="px-6 py-4">Period</th>
                <th className="px-6 py-4">Staff</th>
                <th className="px-6 py-4">Total Gross</th>
                <th className="px-6 py-4">PAYE + NSSF</th>
                <th className="px-6 py-4">Total Net</th>
                <th className="px-6 py-4 text-right">Payslips</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {isLoading ? (
                <TableRowsSkeleton rows={5} columns={6} />
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-text-muted">
                    No payroll runs processed yet.
                  </td>
                </tr>
              ) : (
                runs.map((run) => (
                  <tr key={run.id} className="hover:bg-surface-alt/30">
                    <td className="px-6 py-4">
                      <p className="font-bold text-primary">{run.periodLabel}</p>
                      <p className="text-xs text-text-muted">
                        {formatDate(run.createdAt)} · {run.paymentMethod}
                      </p>
                    </td>
                    <td className="px-6 py-4 font-mono tabular-nums">{run.entries.length}</td>
                    <td className="px-6 py-4 font-mono tabular-nums font-semibold">
                      {formatUGX(run.totalGrossUgx)}
                    </td>
                    <td className="px-6 py-4 font-mono tabular-nums text-text-secondary">
                      {formatUGX(
                        run.totalPayeUgx + run.totalNssfEmployeeUgx + run.totalNssfEmployerUgx
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono tabular-nums font-bold text-accent">
                      {formatUGX(run.totalNetPayUgx)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedRun(run)}
                        className="btn btn-secondary text-xs py-1.5 px-3 min-h-[32px] whitespace-nowrap"
                      >
                        View Payslips
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Staff Salary Modal */}
      {editingMember && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 no-print">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <h3 className="text-lg font-bold text-white truncate pr-2">
                Salary Profile · {editingMember.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="p-1 hover:bg-white/10 rounded-lg shrink-0"
                aria-label="Close salary editor"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveSalary} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-bold text-primary mb-1">
                  Monthly Base Salary (UGX) *
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  className="input w-full font-mono tabular-nums"
                  value={salaryInput}
                  onChange={(e) => setSalaryInput(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">URA TIN</label>
                  <input
                    type="text"
                    className="input w-full font-mono"
                    placeholder="Optional TIN"
                    value={tinInput}
                    onChange={(e) => setTinInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">NSSF Number</label>
                  <input
                    type="text"
                    className="input w-full font-mono"
                    placeholder="Optional NSSF"
                    value={nssfInput}
                    onChange={(e) => setNssfInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Save Compensation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Payroll Payslips Modal */}
      {selectedRun && (
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white no-print shrink-0">
              <h3 className="text-lg font-bold text-white">
                Payroll Payslips · {selectedRun.periodLabel}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedRun(null)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-5 print-content">
              <div className="border-b border-border pb-3 flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-lg text-primary">{tenant?.name}</h4>
                  <p className="text-xs text-text-muted">
                    Payroll Period: {selectedRun.periodLabel} · Processed by {selectedRun.processedByName}
                  </p>
                </div>
                <div className="text-right text-xs text-text-muted">
                  <p>{formatDate(selectedRun.createdAt)}</p>
                  <p>{selectedRun.paymentMethod}</p>
                </div>
              </div>

              <div className="divide-y divide-border">
                {selectedRun.entries.map((entry) => (
                  <div key={entry.memberUid} className="py-3 space-y-1 text-sm">
                    <div className="flex justify-between font-bold text-primary">
                      <span>
                        {entry.memberName} ({entry.role})
                      </span>
                      <span className="font-mono tabular-nums text-accent">
                        Net: {formatUGX(entry.netPayUgx)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-secondary font-mono tabular-nums">
                      <span>Gross: {formatUGX(entry.grossSalaryUgx)}</span>
                      <span>PAYE: -{formatUGX(entry.payeTaxUgx)}</span>
                      <span>NSSF EE (5%): -{formatUGX(entry.nssfEmployeeUgx)}</span>
                      <span>NSSF ER (10%): {formatUGX(entry.nssfEmployerUgx)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 bg-surface-alt border-t border-border flex justify-end gap-3 no-print shrink-0">
              <button
                type="button"
                onClick={() => setSelectedRun(null)}
                className="btn btn-secondary"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn btn-primary gap-2 whitespace-nowrap"
              >
                <Printer size={16} />
                Print Payslips
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
