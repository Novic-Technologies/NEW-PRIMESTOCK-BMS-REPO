import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  User,
  Phone,
  CreditCard,
  Download,
  Filter,
  TrendingUp,
  X,
  Edit2,
  Trash2,
  Banknote,
  Sparkles,
  MessageCircle,
  Copy,
} from 'lucide-react';
import { useCustomers } from '../../hooks/useCustomers';
import { useCreditPayments } from '../../hooks/useCreditPayments';
import { useAuthStore } from '../../store/authStore';
import { generateDebtReminder } from '../../services/aiService';
import { buildDebtWhatsAppUrl } from '../../utils/whatsapp';
import { formatUGX, formatDate } from '../../utils/format';
import { downloadCsv } from '../../utils/exportCsv';
import { cn } from '../../lib/utils';
import { Customer } from '../../types';
import toast from 'react-hot-toast';

const REPAYMENT_METHODS = ['Cash', 'MTN Mobile Money', 'Airtel Money', 'Bank Transfer', 'Card'];

export default function Customers() {
  const { user, tenant } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const { customers, isLoading, addCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const { payments, recordCustomerRepayment } = useCreditPayments();
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'All' | Customer['type']>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [repayCustomer, setRepayCustomer] = useState<Customer | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState('Cash');
  const [repayRef, setRepayRef] = useState('');
  const [isRepaying, setIsRepaying] = useState(false);
  const [reminderCustomer, setReminderCustomer] = useState<Customer | null>(null);
  const [reminderTone, setReminderTone] = useState<'friendly' | 'firm' | 'final'>('friendly');
  const [reminderMessage, setReminderMessage] = useState('');
  const [isGeneratingReminder, setIsGeneratingReminder] = useState(false);
  const [formState, setFormState] = useState<{
    name: string;
    phone: string;
    email: string;
    address: string;
    type: Customer['type'];
    creditLimit: number;
  }>({
    name: '',
    phone: '',
    email: '',
    address: '',
    type: 'Individual',
    creditLimit: 0,
  });

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
      const matchesType = typeFilter === 'All' || c.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [customers, search, typeFilter]);

  const openCreateModal = () => {
    setEditingCustomer(null);
    setFormState({
      name: '',
      phone: '',
      email: '',
      address: '',
      type: 'Individual',
      creditLimit: 0,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormState({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address || '',
      type: customer.type,
      creditLimit: customer.creditLimit || 0,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formState.phone.trim().length < 10) {
      toast.error('Phone number must be at least 10 digits');
      return;
    }

    if (editingCustomer) {
      const updated = await updateCustomer(editingCustomer.id, formState);
      if (updated) setIsModalOpen(false);
    } else {
      const created = await addCustomer(formState);
      if (created) setIsModalOpen(false);
    }
  };

  const openRepayModal = (customer: Customer) => {
    setRepayCustomer(customer);
    setRepayAmount(String(customer.currentBalance || 0));
    setRepayMethod('Cash');
    setRepayRef('');
  };

  const handleRepaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayCustomer || isRepaying) return;
    setIsRepaying(true);
    try {
      const recorded = await recordCustomerRepayment({
        customerId: repayCustomer.id,
        amount: Number(repayAmount) || 0,
        paymentMethod: repayMethod,
        reference: repayRef,
      });
      if (recorded) {
        setRepayCustomer(null);
      }
    } finally {
      setIsRepaying(false);
    }
  };

  const customerRepaymentHistory = useMemo(() => {
    if (!repayCustomer) return [];
    return payments.filter(
      (p) => p.partyType === 'customer' && p.partyId === repayCustomer.id
    );
  }, [payments, repayCustomer]);

  const fetchReminderDraft = async (
    customer: Customer,
    tone: 'friendly' | 'firm' | 'final'
  ) => {
    setIsGeneratingReminder(true);
    try {
      const res = await generateDebtReminder({
        customerName: customer.name,
        amountOwedUgx: customer.currentBalance,
        businessName: tenant?.name || 'Our Business',
        tone,
      });
      setReminderMessage(res.message);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to generate AI reminder');
      setReminderMessage(
        `Hello ${customer.name}, a kind reminder regarding your pending balance of ${formatUGX(
          customer.currentBalance
        )} at ${tenant?.name || 'our shop'}. Thank you!`
      );
    } finally {
      setIsGeneratingReminder(false);
    }
  };

  const openDebtReminderModal = (customer: Customer) => {
    setReminderCustomer(customer);
    setReminderTone('friendly');
    setReminderMessage('');
    void fetchReminderDraft(customer, 'friendly');
  };

  const handleExport = () => {
    if (filteredCustomers.length === 0) {
      toast('No customers to export');
      return;
    }
    downloadCsv(
      `customers-${new Date().toISOString().split('T')[0]}.csv`,
      ['Name', 'Phone', 'Email', 'Type', 'Credit Limit', 'Balance', 'Loyalty Points'],
      filteredCustomers.map((c) => [
        c.name,
        c.phone,
        c.email || '',
        c.type,
        c.creditLimit,
        c.currentBalance,
        c.loyaltyPoints,
      ])
    );
    toast.success('Customers exported to CSV');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Customers</h1>
          <p className="text-text-muted mt-1">Manage your customer relationships and credit.</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleExport}
            className="btn btn-secondary gap-2 flex-1 sm:flex-none whitespace-nowrap"
          >
            <Download size={18} />
            Export
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="btn btn-primary gap-2 flex-1 sm:flex-none whitespace-nowrap"
          >
            <Plus size={18} />
            Add Customer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-primary rounded-xl text-white">
            <User size={24} />
          </div>
          <div>
            <p className="text-text-muted text-sm font-medium">Total Customers</p>
            <h3 className="text-xl sm:text-2xl font-bold text-primary font-mono tabular-nums">
              {customers.length}
            </h3>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-danger rounded-xl text-white">
            <CreditCard size={24} />
          </div>
          <div>
            <p className="text-text-muted text-sm font-medium">Total Debt</p>
            <h3 className="text-xl sm:text-2xl font-bold text-primary font-mono tabular-nums">
              {formatUGX(customers.reduce((acc, c) => acc + c.currentBalance, 0))}
            </h3>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-accent rounded-xl text-white">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-text-muted text-sm font-medium">Loyalty Points</p>
            <h3 className="text-xl sm:text-2xl font-bold text-primary font-mono tabular-nums">
              {customers.reduce((acc, c) => acc + c.loyaltyPoints, 0).toLocaleString()}
            </h3>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col gap-3 bg-surface-alt/50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 w-full sm:flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                <input
                  type="text"
                  placeholder="Search customers..."
                  className="input pl-10 w-full"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
                className={cn(
                  'btn gap-2 text-sm whitespace-nowrap',
                  showFilters ? 'btn-primary' : 'btn-secondary'
                )}
              >
                <Filter size={16} />
                Filters
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
              {(['All', 'Individual', 'Business', 'Wholesale', 'VIP'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                    typeFilter === t
                      ? 'bg-primary text-white'
                      : 'bg-white border border-border text-text-secondary hover:bg-surface-alt'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto hidden sm:block">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-surface-alt/50 border-b border-border">
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Contact</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Balance</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Points</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-text-muted">
                    No customers found
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-surface-alt/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold">
                          {customer.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-primary">{customer.name}</p>
                          {customer.email && <p className="text-xs text-text-muted">{customer.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                        <Phone size={14} />
                        {customer.phone}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-text-secondary">
                      {customer.type}
                    </td>
                    <td className="px-6 py-4">
                      <p
                        className={cn(
                          'text-sm font-bold font-mono tabular-nums',
                          customer.currentBalance > 0 ? 'text-danger' : 'text-accent'
                        )}
                      >
                        {formatUGX(customer.currentBalance)}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-primary font-mono tabular-nums">
                        {customer.loyaltyPoints.toLocaleString()}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {customer.currentBalance > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => openDebtReminderModal(customer)}
                              className="px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                              title="Draft AI WhatsApp Debt Reminder"
                            >
                              <Sparkles size={14} className="text-accent" />
                              Remind
                            </button>
                            <button
                              type="button"
                              onClick={() => openRepayModal(customer)}
                              className="px-2.5 py-1.5 text-xs font-bold text-accent hover:bg-accent/10 rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <Banknote size={14} />
                              Repay
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditModal(customer)}
                          aria-label={`Edit ${customer.name}`}
                          className="p-2 text-text-muted hover:text-primary rounded-lg hover:bg-surface-alt transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => deleteCustomer(customer.id)}
                            aria-label={`Delete ${customer.name}`}
                            className="p-2 text-text-muted hover:text-danger rounded-lg hover:bg-danger/10 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
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
        <div className="sm:hidden divide-y divide-border">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-12 text-center text-text-muted">No customers found</div>
          ) : (
            filteredCustomers.map((customer) => (
              <div key={customer.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold">
                      {customer.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-primary">{customer.name}</p>
                      <span className="text-[11px] font-medium text-text-muted">{customer.type}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {customer.currentBalance > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => openDebtReminderModal(customer)}
                          className="px-2 py-1 text-xs font-bold text-primary hover:bg-primary/10 rounded"
                        >
                          Remind
                        </button>
                        <button
                          type="button"
                          onClick={() => openRepayModal(customer)}
                          className="px-2 py-1 text-xs font-bold text-accent hover:bg-accent/10 rounded"
                        >
                          Repay
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditModal(customer)}
                      aria-label={`Edit ${customer.name}`}
                      className="p-2 text-text-muted hover:text-primary"
                    >
                      <Edit2 size={16} />
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => deleteCustomer(customer.id)}
                        aria-label={`Delete ${customer.name}`}
                        className="p-2 text-text-muted hover:text-danger"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Contact</p>
                    <p className="text-xs text-text-secondary flex items-center gap-1 mt-0.5">
                      <Phone size={12} />
                      {customer.phone}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Balance</p>
                    <p
                      className={cn(
                        'text-xs font-bold font-mono tabular-nums mt-0.5',
                        customer.currentBalance > 0 ? 'text-danger' : 'text-accent'
                      )}
                    >
                      {formatUGX(customer.currentBalance)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between bg-primary text-white">
              <h3 className="text-xl font-bold text-white">
                {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="hover:bg-white/10 p-1 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Full Name *</label>
                <input
                  required
                  type="text"
                  className="input w-full"
                  placeholder="e.g. John Doe"
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">
                  Phone Number * (min 10 digits)
                </label>
                <input
                  required
                  minLength={10}
                  type="tel"
                  className="input w-full"
                  placeholder="e.g. 0770000000"
                  value={formState.phone}
                  onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Email Address</label>
                <input
                  type="email"
                  className="input w-full"
                  placeholder="e.g. john@example.com"
                  value={formState.email}
                  onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Customer Type</label>
                <select
                  className="input w-full"
                  value={formState.type}
                  onChange={(e) => setFormState({ ...formState, type: e.target.value as Customer['type'] })}
                >
                  <option value="Individual">Individual</option>
                  <option value="Business">Business</option>
                  <option value="Wholesale">Wholesale</option>
                  <option value="VIP">VIP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Credit Limit (UGX)</label>
                <input
                  type="number"
                  min={0}
                  className="input w-full"
                  value={formState.creditLimit}
                  onChange={(e) => setFormState({ ...formState, creditLimit: Number(e.target.value) })}
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary flex-1 py-3"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1 py-3">
                  {editingCustomer ? 'Update Customer' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Record Customer Credit Repayment Modal */}
      {repayCustomer && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between bg-primary text-white">
              <div>
                <h3 className="text-lg font-bold text-white">Record Credit Repayment</h3>
                <p className="text-xs text-white/75">{repayCustomer.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setRepayCustomer(null)}
                className="hover:bg-white/10 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRepaySubmit} className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-surface-alt border border-border flex items-center justify-between">
                <span className="text-xs font-bold text-text-muted uppercase">Outstanding Debt</span>
                <span className="text-lg font-bold text-danger font-mono tabular-nums">
                  {formatUGX(repayCustomer.currentBalance)}
                </span>
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1">
                  Repayment Amount (UGX) *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={repayCustomer.currentBalance}
                  className="input font-mono tabular-nums"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Method</label>
                  <select
                    className="input"
                    value={repayMethod}
                    onChange={(e) => setRepayMethod(e.target.value)}
                  >
                    {REPAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Reference</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Optional receipt/MoMo ID"
                    value={repayRef}
                    onChange={(e) => setRepayRef(e.target.value)}
                  />
                </div>
              </div>

              {customerRepaymentHistory.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                    Recent Repayments
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 text-xs">
                    {customerRepaymentHistory.slice(0, 5).map((entry) => (
                      <div key={entry.id} className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-text-secondary">
                          {formatDate(entry.createdAt)} · {entry.paymentMethod}
                        </span>
                        <span className="font-mono tabular-nums font-bold text-accent">
                          {formatUGX(entry.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setRepayCustomer(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isRepaying} className="btn btn-primary flex-1">
                  {isRepaying ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Debt Reminder Modal */}
      {reminderCustomer && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between bg-primary text-white">
              <div className="flex items-center gap-2.5">
                <Sparkles size={20} className="text-accent" />
                <div>
                  <h3 className="text-lg font-bold text-white">AI Debt Reminder</h3>
                  <p className="text-xs text-white/75">
                    {reminderCustomer.name} · {formatUGX(reminderCustomer.currentBalance)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReminderCustomer(null)}
                className="hover:bg-white/10 p-1 rounded-lg"
                aria-label="Close AI Debt Reminder modal"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                  Reminder Tone
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['friendly', 'firm', 'final'] as const).map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      disabled={isGeneratingReminder}
                      onClick={() => {
                        setReminderTone(tone);
                        void fetchReminderDraft(reminderCustomer, tone);
                      }}
                      className={cn(
                        'py-2 px-3 rounded-lg text-xs font-bold capitalize border transition-colors',
                        reminderTone === tone
                          ? 'bg-primary text-white border-primary'
                          : 'bg-surface-alt text-text-secondary border-border hover:border-primary'
                      )}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-bold text-primary">WhatsApp / SMS Message</label>
                  {isGeneratingReminder && (
                    <span className="text-xs text-accent font-semibold">Drafting with AI...</span>
                  )}
                </div>
                <textarea
                  rows={5}
                  className="input w-full text-sm leading-relaxed"
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  placeholder="Generating reminder draft..."
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={!reminderMessage.trim()}
                  onClick={() => {
                    void navigator.clipboard.writeText(reminderMessage);
                    toast.success('Reminder copied to clipboard');
                  }}
                  className="btn btn-secondary flex-1 gap-1.5 whitespace-nowrap"
                >
                  <Copy size={16} />
                  Copy Text
                </button>
                <a
                  href={buildDebtWhatsAppUrl(reminderCustomer.phone, reminderMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'btn btn-primary flex-1 gap-1.5 whitespace-nowrap',
                    !reminderMessage.trim() && 'pointer-events-none opacity-60'
                  )}
                >
                  <MessageCircle size={16} />
                  Send via WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
