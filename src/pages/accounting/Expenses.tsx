import React, { useState, useMemo, useRef } from 'react';
import {
  Plus,
  Search,
  DollarSign,
  Tag,
  Download,
  Filter,
  ArrowDownCircle,
  X,
  Trash2,
  Receipt,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useExpenses } from '../../hooks/useExpenses';
import { useAuthStore } from '../../store/authStore';
import { scanDocumentImage, fileToBase64 } from '../../services/aiService';
import { SmartImportModal } from '../../components/shared/SmartImportModal';
import { MobileListSkeleton, TableRowsSkeleton } from '../../components/shared/Skeletons';
import { formatUGX, formatDate } from '../../utils/format';
import { downloadCsv } from '../../utils/exportCsv';
import toast from 'react-hot-toast';

const EXPENSE_CATEGORIES = [
  'General',
  'Rent',
  'Utilities',
  'Salaries',
  'Supplies',
  'Marketing',
  'Maintenance',
];

const PAYMENT_METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Credit Card'];

export default function Expenses() {
  const { user, activeBranchId } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const { expenses, isLoading, addExpense, deleteExpense, bulkImportExpenses } = useExpenses();
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [methodFilter, setMethodFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: 0,
    category: 'General',
    paymentMethod: 'Cash',
    expenseDate: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.description.trim()) {
      toast.error('Please enter an expense description');
      return;
    }
    if (Number(newExpense.amount) <= 0) {
      toast.error('Expense amount must be greater than 0');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await addExpense({
        ...newExpense,
        branchId: activeBranchId || user?.branchId || undefined,
      });
      if (created) {
        setIsModalOpen(false);
        setNewExpense({
          description: '',
          amount: 0,
          category: 'General',
          paymentMethod: 'Cash',
          expenseDate: new Date().toISOString().split('T')[0],
        });
      }
    } catch (error) {
      console.error('Failed to record expense:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReceiptScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanningReceipt(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const scanned = await scanDocumentImage({
        imageBase64: base64,
        mimeType,
        targetType: 'expense',
      });
      const matchedCat =
        EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === (scanned.category || '').toLowerCase()) ||
        'General';
      const matchedMethod =
        PAYMENT_METHODS.find((m) =>
          (scanned.paymentMethod || '').toLowerCase().includes(m.toLowerCase())
        ) || 'Cash';

      setNewExpense((prev) => ({
        ...prev,
        description:
          [scanned.vendorName, scanned.description].filter(Boolean).join(' — ') || prev.description,
        amount: scanned.totalAmount && scanned.totalAmount > 0 ? scanned.totalAmount : prev.amount,
        category: matchedCat,
        paymentMethod: matchedMethod,
        expenseDate: scanned.documentDate || prev.expenseDate,
      }));
      toast.success('Receipt scanned and fields prefilled');
    } catch (err: any) {
      toast.error(err?.message || 'Unable to scan receipt image');
    } finally {
      setIsScanningReceipt(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (expenseId: string) => {
    await deleteExpense(expenseId);
    setConfirmDeleteId(null);
  };

  const scopedExpenses = useMemo(() => {
    if (!activeBranchId || activeBranchId === 'ALL') return expenses;
    return expenses.filter((e) => !e.branchId || e.branchId === activeBranchId);
  }, [expenses, activeBranchId]);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedExpenses.filter((e) => {
      const matchesSearch =
        !q ||
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.paymentMethod.toLowerCase().includes(q);
      const matchesCategory = categoryFilter === 'All' || e.category === categoryFilter;
      const matchesMethod = methodFilter === 'All' || e.paymentMethod === methodFilter;
      return matchesSearch && matchesCategory && matchesMethod;
    });
  }, [scopedExpenses, search, categoryFilter, methodFilter]);

  const currentMonthPrefix = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const monthlyExpensesTotal = useMemo(() => {
    return scopedExpenses
      .filter((e) => (e.expenseDate || e.createdAt).startsWith(currentMonthPrefix))
      .reduce((acc, e) => acc + e.amount, 0);
  }, [scopedExpenses, currentMonthPrefix]);

  const topCategory = useMemo(() => {
    if (scopedExpenses.length === 0) return 'N/A';
    const categories: Record<string, number> = {};
    scopedExpenses.forEach((e) => {
      categories[e.category] = (categories[e.category] || 0) + e.amount;
    });
    return Object.entries(categories).sort((a, b) => b[1] - a[1])[0][0];
  }, [scopedExpenses]);

  const handleExportCsv = () => {
    if (filteredExpenses.length === 0) {
      toast.error('No expenses to export');
      return;
    }
    const headers = ['Date', 'Category', 'Description', 'Amount (UGX)', 'Payment Method'];
    const rows = filteredExpenses.map((e) => [
      e.expenseDate || e.createdAt.split('T')[0],
      e.category,
      e.description,
      e.amount,
      e.paymentMethod,
    ]);
    downloadCsv(`expenses-${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast.success(`Exported ${filteredExpenses.length} expense records`);
  };

  const hasActiveFilters = categoryFilter !== 'All' || methodFilter !== 'All';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Expenses</h1>
          <p className="text-text-muted mt-1">Track your business spending and overheads.</p>
        </div>
        <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleExportCsv}
            className="btn btn-secondary gap-2 flex-1 sm:flex-none whitespace-nowrap"
          >
            <Download size={18} />
            Export
          </button>
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="btn btn-secondary gap-2 flex-1 sm:flex-none whitespace-nowrap"
          >
            <Sparkles size={17} className="text-accent" />
            Smart Import
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary gap-2 flex-1 sm:flex-none whitespace-nowrap"
          >
            <Plus size={18} />
            Record Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-danger rounded-xl text-white shrink-0">
            <ArrowDownCircle size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-sm font-medium">This Month&apos;s Spending</p>
            <h3 className="text-2xl font-bold text-primary font-mono tabular-nums truncate">
              {formatUGX(monthlyExpensesTotal)}
            </h3>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-primary rounded-xl text-white shrink-0">
            <Tag size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-sm font-medium">Top Category</p>
            <h3 className="text-2xl font-bold text-primary truncate">{topCategory}</h3>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-accent rounded-xl text-white shrink-0">
            <Receipt size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-sm font-medium">Recorded Entries</p>
            <h3 className="text-2xl font-bold text-primary font-mono tabular-nums">
              {scopedExpenses.length}
            </h3>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-border space-y-3 bg-surface-alt/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                <input
                  type="text"
                  placeholder="Search expenses..."
                  className="input pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={`btn gap-2 text-sm whitespace-nowrap ${
                  showFilters || hasActiveFilters ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                <Filter size={16} />
                Filters{hasActiveFilters ? ' (Active)' : ''}
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
              <select
                aria-label="Filter by category"
                className="input w-full sm:w-48"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="All">All Categories</option>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter by payment method"
                className="input w-full sm:w-48"
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
              >
                <option value="All">All Payment Methods</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('All');
                    setMethodFilter('All');
                  }}
                  className="btn btn-ghost text-sm text-danger whitespace-nowrap"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-surface-alt/50 border-b border-border">
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Description</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Method</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <TableRowsSkeleton rows={6} columns={6} />
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-text-muted">
                    {expenses.length === 0 ? 'No expenses recorded yet' : 'No matching expenses found'}
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-surface-alt/30 transition-colors">
                    <td className="px-6 py-4 text-sm text-text-secondary whitespace-nowrap">
                      {formatDate(expense.expenseDate || expense.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-primary uppercase tracking-wide">
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-primary">{expense.description}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-danger font-mono tabular-nums whitespace-nowrap">
                        {formatUGX(expense.amount)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary whitespace-nowrap">
                      {expense.paymentMethod}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {!isAdmin ? (
                        <span className="text-xs text-text-muted">—</span>
                      ) : confirmDeleteId === expense.id ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDelete(expense.id)}
                            className="px-3 py-1.5 text-xs font-bold bg-danger text-white rounded-md hover:bg-danger/90"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1.5 text-xs font-medium text-text-muted hover:text-primary"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(expense.id)}
                          aria-label={`Delete ${expense.description}`}
                          className="p-2 text-text-muted hover:text-danger transition-colors rounded-lg hover:bg-danger/10"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
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
          ) : filteredExpenses.length === 0 ? (
            <div className="p-12 text-center text-text-muted">
              {expenses.length === 0 ? 'No expenses recorded yet' : 'No matching expenses found'}
            </div>
          ) : (
            filteredExpenses.map((expense) => (
              <div key={expense.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-primary uppercase">
                      {expense.category}
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {formatDate(expense.expenseDate || expense.createdAt)}
                    </span>
                  </div>
                  {isAdmin &&
                    (confirmDeleteId === expense.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(expense.id)}
                          className="px-2.5 py-1 text-xs font-bold bg-danger text-white rounded"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-text-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(expense.id)}
                        aria-label={`Delete ${expense.description}`}
                        className="p-2 text-text-muted hover:text-danger"
                      >
                        <Trash2 size={18} />
                      </button>
                    ))}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-primary truncate flex-1">{expense.description}</p>
                  <p className="text-sm font-bold text-danger font-mono tabular-nums shrink-0">
                    {formatUGX(expense.amount)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
                  <DollarSign size={12} />
                  {expense.paymentMethod}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="p-6 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <div className="flex items-center gap-3">
                <ArrowDownCircle size={24} />
                <h3 className="text-xl font-bold text-white">Record Expense</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="hover:bg-white/10 p-1 rounded-lg"
                aria-label="Close modal"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <Sparkles size={14} className="text-accent shrink-0" />
                    AI Receipt Scanner
                  </p>
                  <p className="text-[11px] text-text-muted">
                    Upload a receipt photo to extract amount, vendor, and date.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleReceiptScan}
                />
                <button
                  type="button"
                  disabled={isScanningReceipt}
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-primary py-2 px-3 text-xs gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Upload size={14} />
                  {isScanningReceipt ? 'Scanning...' : 'Scan Photo'}
                </button>
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Description *</label>
                <input
                  required
                  type="text"
                  className="input w-full"
                  placeholder="e.g. Rent Payment"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Amount (UGX) *</label>
                  <input
                    required
                    min={1}
                    type="number"
                    className="input w-full font-mono tabular-nums"
                    placeholder="0"
                    value={newExpense.amount || ''}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Date *</label>
                  <input
                    required
                    type="date"
                    className="input w-full"
                    value={newExpense.expenseDate}
                    onChange={(e) => setNewExpense({ ...newExpense, expenseDate: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Category</label>
                <select
                  className="input w-full"
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Payment Method</label>
                <select
                  className="input w-full"
                  value={newExpense.paymentMethod}
                  onChange={(e) => setNewExpense({ ...newExpense, paymentMethod: e.target.value })}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary flex-1 py-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary flex-1 py-3"
                >
                  {isSubmitting ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SmartImportModal
        isOpen={isImportOpen}
        entityType="expenses"
        onClose={() => setIsImportOpen(false)}
        onCommit={(rows) =>
          bulkImportExpenses(
            rows.map((r) => ({
              expenseDate: r.expenseDate ? String(r.expenseDate) : undefined,
              category: r.category ? String(r.category) : 'General',
              description: String(r.description || ''),
              amount: Number(r.amount) || 0,
              paymentMethod: r.paymentMethod ? String(r.paymentMethod) : 'Cash',
            }))
          )
        }
      />
    </div>
  );
}
