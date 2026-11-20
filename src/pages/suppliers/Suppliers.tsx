import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Filter,
  Mail,
  Phone,
  MapPin,
  Building2,
  Edit2,
  Trash2,
  X,
  Banknote,
} from 'lucide-react';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useCreditPayments } from '../../hooks/useCreditPayments';
import { useAuthStore } from '../../store/authStore';
import { Supplier } from '../../types';
import { formatDate, formatUGX } from '../../utils/format';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

const SUPPLIER_PAY_METHODS = ['Cash', 'MTN Mobile Money', 'Airtel Money', 'Bank Transfer', 'Card'];

export default function Suppliers() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const { suppliers, loading, addSupplier, updateSupplier, deleteSupplier } = useSuppliers();
  const { payments, recordSupplierPayment } = useCreditPayments();
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null);
  const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payRef, setPayRef] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [formState, setFormState] = useState<Partial<Supplier>>({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    category: 'Wholesale',
    status: 'active',
  });

  const categories = useMemo(() => {
    const cats = new Set(suppliers.map((s) => s.category || 'Wholesale'));
    return ['All', ...Array.from(cats)];
  }, [suppliers]);

  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter((s) => {
        const matchesSearch =
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.phone.includes(searchTerm) ||
          s.category.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCat = categoryFilter === 'All' || s.category === categoryFilter;
        return matchesSearch && matchesCat;
      }),
    [suppliers, searchTerm, categoryFilter]
  );

  const openCreateModal = () => {
    setEditingSupplier(null);
    setFormState({
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      category: 'Wholesale',
      status: 'active',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormState({
      name: supplier.name,
      contactPerson: supplier.contactPerson || '',
      phone: supplier.phone,
      email: supplier.email || '',
      address: supplier.address || '',
      category: supplier.category || 'Wholesale',
      status: supplier.status || 'active',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((formState.phone || '').trim().length < 10) {
      toast.error('Phone number must be at least 10 digits');
      return;
    }

    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, formState);
        setIsModalOpen(false);
      } else {
        await addSupplier(formState as Omit<Supplier, 'id' | 'tenantId' | 'createdAt'>);
        setIsModalOpen(false);
      }
    } catch (error) {
      console.error('Failed to save supplier:', error);
    }
  };

  const openPayModal = (supplier: Supplier) => {
    setPaySupplier(supplier);
    setPayAmount(supplier.currentBalance && supplier.currentBalance > 0 ? String(supplier.currentBalance) : '');
    setPayMethod('Bank Transfer');
    setPayRef('');
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paySupplier || isPaying) return;
    setIsPaying(true);
    try {
      const recorded = await recordSupplierPayment({
        supplierId: paySupplier.id,
        amount: Number(payAmount) || 0,
        paymentMethod: payMethod,
        reference: payRef,
      });
      if (recorded) {
        setPaySupplier(null);
      }
    } finally {
      setIsPaying(false);
    }
  };

  const supplierPaymentHistory = useMemo(() => {
    const targetId = paySupplier?.id || historySupplier?.id;
    if (!targetId) return [];
    return payments.filter((p) => p.partyType === 'supplier' && p.partyId === targetId);
  }, [payments, paySupplier, historySupplier]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Suppliers</h1>
          <p className="text-text-muted text-sm mt-1">Manage your product vendors and supply chain</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="btn btn-primary gap-2 w-full sm:w-auto whitespace-nowrap"
        >
          <Plus size={18} />
          Add Supplier
        </button>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="text"
              placeholder="Search suppliers..."
              className="input pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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

        {showFilters && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  categoryFilter === cat
                    ? 'bg-primary text-white'
                    : 'bg-surface-alt text-text-secondary hover:bg-border/60'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array(6)
            .fill(0)
            .map((_, i) => <div key={i} className="h-48 bg-surface-alt animate-pulse rounded-xl" />)
        ) : filteredSuppliers.length > 0 ? (
          filteredSuppliers.map((supplier) => (
            <div key={supplier.id} className="card hover:border-accent/40 transition-colors flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-4 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 bg-accent/10 text-accent rounded-lg flex items-center justify-center font-bold text-lg shrink-0">
                      {supplier.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-primary truncate">{supplier.name}</h3>
                      <p className="text-xs text-text-muted">{supplier.category}</p>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(supplier)}
                      aria-label={`Edit ${supplier.name}`}
                      className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-surface-alt"
                    >
                      <Edit2 size={15} />
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => deleteSupplier(supplier.id)}
                        aria-label={`Delete ${supplier.name}`}
                        className="p-1.5 text-text-muted hover:text-danger rounded-lg hover:bg-danger/10"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-sm text-text-secondary">
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-text-muted shrink-0" />
                    <span className="truncate">{supplier.contactPerson || 'No contact person'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone size={15} className="text-text-muted shrink-0" />
                    <span className="font-mono tabular-nums">{supplier.phone}</span>
                  </div>
                  {supplier.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={15} className="text-text-muted shrink-0" />
                      <span className="truncate">{supplier.email}</span>
                    </div>
                  )}
                  {supplier.address && (
                    <div className="flex items-center gap-2">
                      <MapPin size={15} className="text-text-muted shrink-0" />
                      <span className="truncate">{supplier.address}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-xs text-text-muted font-medium">Payable Balance</span>
                    <span
                      className={cn(
                        'font-mono tabular-nums font-bold text-xs',
                        (supplier.currentBalance || 0) > 0 ? 'text-danger' : 'text-accent'
                      )}
                    >
                      {formatUGX(supplier.currentBalance || 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border flex justify-between items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateSupplier(supplier.id, {
                      status: supplier.status === 'active' ? 'inactive' : 'active',
                    })
                  }
                  className={cn(
                    'text-xs font-bold uppercase tracking-wider hover:underline',
                    supplier.status === 'active' ? 'text-accent' : 'text-danger'
                  )}
                >
                  {supplier.status}
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openPayModal(supplier)}
                    className="text-primary text-xs font-bold hover:text-accent inline-flex items-center gap-1"
                  >
                    <Banknote size={14} />
                    Pay
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistorySupplier(supplier)}
                    className="text-accent text-sm font-semibold hover:underline"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full card text-center py-12 border-dashed">
            <Building2 className="mx-auto text-text-muted opacity-40 mb-4" size={48} />
            <h3 className="text-lg font-bold text-primary">No suppliers found</h3>
            <p className="text-text-muted text-sm mt-1">Start by adding your first product vendor</p>
          </div>
        )}
      </div>

      {/* Add/Edit Supplier Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-border flex justify-between items-center bg-primary text-white">
              <h2 className="text-xl font-bold text-white">
                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X size={22} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Business Name *</label>
                <input
                  required
                  type="text"
                  className="input"
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Contact Person</label>
                  <input
                    type="text"
                    className="input"
                    value={formState.contactPerson}
                    onChange={(e) => setFormState({ ...formState, contactPerson: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Phone * (min 10 digits)</label>
                  <input
                    required
                    minLength={10}
                    type="tel"
                    className="input"
                    value={formState.phone}
                    onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Email</label>
                <input
                  type="email"
                  className="input"
                  value={formState.email}
                  onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Category</label>
                <select
                  className="input"
                  value={formState.category}
                  onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                >
                  <option value="Wholesale">Wholesale</option>
                  <option value="Manufacturer">Manufacturer</option>
                  <option value="Distributor">Distributor</option>
                  <option value="Local Farmer">Local Farmer</option>
                  <option value="Importer">Importer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Address</label>
                <textarea
                  rows={2}
                  className="input min-h-[72px]"
                  value={formState.address}
                  onChange={(e) => setFormState({ ...formState, address: e.target.value })}
                />
              </div>
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editingSupplier ? 'Update Supplier' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Details Modal */}
      {historySupplier && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-border flex justify-between items-center bg-primary text-white">
              <h2 className="text-lg font-bold text-white">{historySupplier.name}</h2>
              <button
                type="button"
                onClick={() => setHistorySupplier(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted">Category</span>
                <span className="font-semibold text-primary">{historySupplier.category}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted">Contact Person</span>
                <span className="font-semibold text-primary">
                  {historySupplier.contactPerson || 'Not specified'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted">Phone</span>
                <span className="font-mono font-semibold text-primary">{historySupplier.phone}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted">Status</span>
                <span className="font-bold uppercase text-accent">{historySupplier.status}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted">Payable Balance</span>
                <span
                  className={cn(
                    'font-mono tabular-nums font-bold',
                    (historySupplier.currentBalance || 0) > 0 ? 'text-danger' : 'text-accent'
                  )}
                >
                  {formatUGX(historySupplier.currentBalance || 0)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted">Added On</span>
                <span className="text-primary">{formatDate(historySupplier.createdAt)}</span>
              </div>

              {supplierPaymentHistory.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                    Recent Payments
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 text-xs">
                    {supplierPaymentHistory.slice(0, 5).map((entry) => (
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
            </div>
            <div className="p-4 bg-surface-alt border-t border-border flex justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const s = historySupplier;
                  setHistorySupplier(null);
                  openPayModal(s);
                }}
                className="btn btn-secondary gap-1.5"
              >
                <Banknote size={16} />
                Record Payment
              </button>
              <button
                type="button"
                onClick={() => setHistorySupplier(null)}
                className="btn btn-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Payment Modal */}
      {paySupplier && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-border flex justify-between items-center bg-primary text-white">
              <div>
                <h2 className="text-lg font-bold text-white">Pay Supplier Balance</h2>
                <p className="text-xs text-white/75">{paySupplier.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPaySupplier(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePaySubmit} className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-surface-alt border border-border flex items-center justify-between">
                <span className="text-xs font-bold text-text-muted uppercase">Payable Owed</span>
                <span className="text-lg font-bold text-danger font-mono tabular-nums">
                  {formatUGX(paySupplier.currentBalance || 0)}
                </span>
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1">
                  Payment Amount (UGX) *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  className="input font-mono tabular-nums"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Method</label>
                  <select
                    className="input"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    {SUPPLIER_PAY_METHODS.map((m) => (
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
                    placeholder="Optional transfer ref"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPaySupplier(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isPaying} className="btn btn-primary flex-1">
                  {isPaying ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
