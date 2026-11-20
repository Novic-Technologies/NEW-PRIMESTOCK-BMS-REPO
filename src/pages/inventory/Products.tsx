import React, { useState, useMemo, useRef } from 'react';
import {
  Plus,
  Search,
  Filter,
  Package,
  ArrowUpDown,
  Download,
  AlertCircle,
  Edit2,
  Trash2,
  Upload,
  ArrowRightLeft,
  ClipboardCheck,
  X,
} from 'lucide-react';
import { useInventory } from '../../hooks/useInventory';
import { useStockOperations } from '../../hooks/useStockOperations';
import { useBranches } from '../../hooks/useBranches';
import { useAuthStore } from '../../store/authStore';
import { formatUGX } from '../../utils/format';
import { getEffectiveStock } from '../../utils/branchStock';
import { canAccessFeature } from '../../utils/planLimits';
import { canManageInventoryData } from '../../utils/rbac';
import { downloadCsv } from '../../utils/exportCsv';
import { cn } from '../../lib/utils';
import { NewProductModal } from '../../components/inventory/NewProductModal';
import { Product, StockAdjustment } from '../../types';
import toast from 'react-hot-toast';

const ADJUSTMENT_REASONS: StockAdjustment['reason'][] = [
  'Stock-Take',
  'Damaged',
  'Expired',
  'Theft/Loss',
  'Return',
  'Correction',
];

export default function Products() {
  const { user, tenant } = useAuthStore();
  const { products, isLoading, bulkImportProducts, deleteProduct } = useInventory();
  const { branches, activeBranchId } = useBranches();
  const { transfers, recordAdjustment, transferStock } = useStockOperations();

  const canManage = canManageInventoryData(user);
  const isAdmin = user?.role === 'admin';
  const effectiveBranchId = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : null;

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'expiring'>('all');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Logged Adjustment Modal
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustNewStock, setAdjustNewStock] = useState('0');
  const [adjustReason, setAdjustReason] = useState<StockAdjustment['reason']>('Stock-Take');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Inter-Branch Transfer Modal
  const [transferTarget, setTransferTarget] = useState<Product | null>(null);
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [transferQty, setTransferQty] = useState('1');
  const [transferNotes, setTransferNotes] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Bulk CSV Import Modal
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category || 'General'));
    return ['All', ...Array.from(set)];
  }, [products]);

  const expiryCutoffMs = useMemo(() => Date.now() + 30 * 24 * 60 * 60 * 1000, []);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const stock = getEffectiveStock(p, effectiveBranchId);
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku?.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || (p.category || 'General') === categoryFilter;
      const isExpiring =
        Boolean(p.expiryDate) &&
        stock > 0 &&
        new Date(p.expiryDate!).getTime() <= expiryCutoffMs;
      const matchesStock =
        stockFilter === 'all'
          ? true
          : stockFilter === 'low'
          ? stock <= (p.minStockLevel ?? 0) && stock > 0
          : stockFilter === 'out'
          ? stock <= 0
          : isExpiring;
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [products, search, categoryFilter, stockFilter, effectiveBranchId, expiryCutoffMs]);

  const handleExport = () => {
    if (filteredProducts.length === 0) {
      toast('No products to export');
      return;
    }
    downloadCsv(
      `inventory-${new Date().toISOString().split('T')[0]}.csv`,
      [
        'Name',
        'Category',
        'SKU',
        'Barcode',
        'Buying Price',
        'Selling Price',
        'Wholesale Price',
        'VIP Price',
        'Stock',
        'Min Stock',
        'Unit',
        'Batch',
        'Expiry Date',
        'Status',
      ],
      filteredProducts.map((p) => [
        p.name,
        p.category,
        p.sku || '',
        p.barcode || '',
        p.buyingPrice,
        p.sellingPrice,
        p.wholesalePrice || '',
        p.vipPrice || '',
        getEffectiveStock(p, effectiveBranchId),
        p.minStockLevel,
        p.unit,
        p.batchNumber || '',
        p.expiryDate || '',
        p.status,
      ])
    );
    toast.success('Inventory exported to CSV');
  };

  const handleDownloadCsvTemplate = () => {
    downloadCsv(
      'primestock-import-template.csv',
      ['name', 'category', 'sku', 'barcode', 'buyingPrice', 'sellingPrice', 'wholesalePrice', 'vipPrice', 'currentStock', 'minStockLevel', 'unit', 'batchNumber', 'expiryDate'],
      [
        ['Sugar Kakira 1kg', 'Groceries', 'SUG-001', '6001234567890', 3800, 4500, 4200, 4100, 50, 10, 'kg', 'B-01', '2027-06-30'],
      ]
    );
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        toast.error('CSV file must include a header row and at least one product row');
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
      const rows: Array<Omit<Product, 'id' | 'tenantId' | 'createdAt'>> = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const getVal = (key: string) => {
          const idx = headers.indexOf(key.toLowerCase());
          return idx >= 0 ? cols[idx] || '' : '';
        };
        const name = getVal('name');
        const sellingPrice = Number(getVal('sellingprice') || getVal('price')) || 0;
        if (!name || sellingPrice <= 0) continue;

        rows.push({
          name,
          category: getVal('category') || 'General',
          sku: getVal('sku') || undefined,
          barcode: getVal('barcode') || undefined,
          buyingPrice: Number(getVal('buyingprice')) || 0,
          sellingPrice,
          wholesalePrice: Number(getVal('wholesaleprice')) || undefined,
          vipPrice: Number(getVal('vipprice')) || undefined,
          currentStock: Math.max(0, Number(getVal('currentstock') || getVal('stock')) || 0),
          minStockLevel: Math.max(0, Number(getVal('minstocklevel') || getVal('minstock')) || 5),
          unit: getVal('unit') || 'pcs',
          batchNumber: getVal('batchnumber') || undefined,
          expiryDate: getVal('expirydate') || undefined,
          status: 'active',
        });
      }

      if (rows.length === 0) {
        toast.error('No valid rows found (each row requires name and sellingPrice > 0)');
        return;
      }

      const count = await bulkImportProducts(rows);
      if (count > 0) setIsImportOpen(false);
    } finally {
      setIsImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const openAdjustModal = (product: Product) => {
    setAdjustTarget(product);
    setAdjustNewStock(String(getEffectiveStock(product, effectiveBranchId)));
    setAdjustReason('Stock-Take');
    setAdjustNotes('');
  };

  const handleConfirmAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget || isAdjusting) return;
    setIsAdjusting(true);
    try {
      await recordAdjustment({
        productId: adjustTarget.id,
        newStock: Math.max(0, Number(adjustNewStock) || 0),
        reason: adjustReason,
        notes: adjustNotes,
        branchId: effectiveBranchId || undefined,
      });
      setAdjustTarget(null);
    } finally {
      setIsAdjusting(false);
    }
  };

  const openTransferModal = (product: Product) => {
    if (!canAccessFeature(tenant, 'multiBranchTransfers')) {
      toast.error('Inter-branch stock transfers require Business Growth or Enterprise plan.');
      return;
    }
    setTransferTarget(product);
    const first = effectiveBranchId || branches[0]?.id || '';
    const second = branches.find((b) => b.id !== first)?.id || '';
    setFromBranchId(first);
    setToBranchId(second);
    setTransferQty('1');
    setTransferNotes('');
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTarget || isTransferring) return;
    setIsTransferring(true);
    try {
      const ok = await transferStock({
        productId: transferTarget.id,
        fromBranchId,
        toBranchId,
        quantity: Number(transferQty) || 0,
        notes: transferNotes,
      });
      if (ok) setTransferTarget(null);
    } finally {
      setIsTransferring(false);
    }
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary">Inventory</h1>
          <p className="text-text-muted mt-1 text-sm">
            Manage products, batch expiry, inter-branch transfers, and audited stock adjustments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="btn btn-secondary gap-2 text-xs sm:text-sm justify-center whitespace-nowrap"
          >
            <Download size={17} />
            <span>Export</span>
          </button>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="btn btn-secondary gap-2 text-xs sm:text-sm justify-center whitespace-nowrap"
              >
                <Upload size={17} />
                <span>CSV Import</span>
              </button>
              <button
                type="button"
                className="btn btn-primary gap-2 text-xs sm:text-sm justify-center whitespace-nowrap"
                onClick={openCreateModal}
              >
                <Plus size={18} />
                <span>Add Product</span>
              </button>
            </>
          )}
        </div>
      </div>

      <NewProductModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProduct(null);
        }}
        editingProduct={editingProduct}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="card bg-accent/5 border-accent/20 flex items-center gap-4 p-4">
          <div className="p-3 bg-accent rounded-xl text-white shrink-0">
            <Package size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-xs font-medium uppercase tracking-wider">Total Products</p>
            <h3 className="text-xl sm:text-2xl font-bold text-primary font-mono tabular-nums truncate">
              {products.length}
            </h3>
          </div>
        </div>
        <div className="card bg-danger/5 border-danger/20 flex items-center gap-4 p-4">
          <div className="p-3 bg-danger rounded-xl text-white shrink-0">
            <AlertCircle size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-xs font-medium uppercase tracking-wider">Low Stock Alerts</p>
            <h3 className="text-xl sm:text-2xl font-bold text-primary font-mono tabular-nums truncate">
              {
                products.filter(
                  (p) => getEffectiveStock(p, effectiveBranchId) <= (p.minStockLevel ?? 0)
                ).length
              }
            </h3>
          </div>
        </div>
        <div className="card bg-primary/5 border-primary/20 flex items-center gap-4 p-4 sm:col-span-2 lg:col-span-1">
          <div className="p-3 bg-primary rounded-xl text-white shrink-0">
            <ArrowUpDown size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-xs font-medium uppercase tracking-wider">Stock Valuation</p>
            <h3 className="text-xl sm:text-2xl font-bold text-primary font-mono tabular-nums truncate">
              {formatUGX(
                products.reduce(
                  (acc, p) => acc + p.buyingPrice * getEffectiveStock(p, effectiveBranchId),
                  0
                )
              )}
            </h3>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col gap-3 bg-surface-alt/50">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
              <input
                type="text"
                placeholder="Search products by name, SKU, or barcode..."
                className="input pl-10 w-full"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={cn(
                'btn gap-2 text-sm justify-center whitespace-nowrap',
                showFilters ? 'btn-primary' : 'btn-secondary'
              )}
            >
              <Filter size={16} />
              Filters
            </button>
          </div>

          {showFilters && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/60">
              <select
                aria-label="Filter by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input w-auto min-h-[38px] text-sm py-1.5"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === 'All' ? 'All Categories' : c}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter by stock level"
                value={stockFilter}
                onChange={(e) =>
                  setStockFilter(e.target.value as 'all' | 'low' | 'out' | 'expiring')
                }
                className="input w-auto min-h-[38px] text-sm py-1.5"
              >
                <option value="all">All Stock Levels</option>
                <option value="low">Low Stock Only</option>
                <option value="out">Out of Stock</option>
                <option value="expiring">Expiring in 30 Days</option>
              </select>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[880px]">
            <thead>
              <tr className="bg-surface-alt/50 border-b border-border">
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Product</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">SKU / Batch</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Pricing</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Stock</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Status</th>
                {canManage && (
                  <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider text-right">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      <p className="text-text-muted text-sm font-medium">Loading products...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Package size={48} className="text-text-muted opacity-20" />
                      <p className="text-text-muted font-medium">No products found</p>
                      {canManage && (
                        <button type="button" onClick={openCreateModal} className="btn btn-primary mt-2">
                          Add Your First Product
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const stock = getEffectiveStock(product, effectiveBranchId);
                  const isExpiring =
                    Boolean(product.expiryDate) &&
                    new Date(product.expiryDate!).getTime() <= expiryCutoffMs;
                  return (
                    <tr key={product.id} className="hover:bg-surface-alt/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-surface-alt rounded-lg flex items-center justify-center text-primary font-bold shrink-0">
                            {product.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-primary">{product.name}</p>
                            <p className="text-xs text-text-muted">
                              {product.category || 'General'} · {product.unit}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-mono text-text-secondary">{product.sku || '-'}</p>
                        <p className="text-xs text-text-muted">
                          {product.barcode || '-'}
                          {product.expiryDate && (
                            <span className={cn('ml-2 font-semibold', isExpiring && 'text-danger')}>
                              · Exp: {product.expiryDate}
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-6 py-4 font-mono tabular-nums">
                        <p className="text-sm font-bold text-primary">{formatUGX(product.sellingPrice)}</p>
                        <p className="text-xs text-text-muted">
                          Cost: {formatUGX(product.buyingPrice)}
                          {product.wholesalePrice ? ` · Whl: ${formatUGX(product.wholesalePrice)}` : ''}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'text-base font-bold font-mono tabular-nums',
                            stock <= product.minStockLevel ? 'text-danger' : 'text-primary'
                          )}
                        >
                          {stock}
                        </span>
                        <span className="text-xs text-text-muted ml-1">{product.unit}</span>
                        <p className="text-xs text-text-muted mt-0.5">Min: {product.minStockLevel}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'text-xs font-bold uppercase tracking-wider',
                            product.status === 'active' ? 'text-accent' : 'text-text-muted'
                          )}
                        >
                          {product.status}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openAdjustModal(product)}
                              title="Logged Stock Adjustment"
                              aria-label={`Adjust stock for ${product.name}`}
                              className="p-2 text-text-muted hover:text-accent rounded-lg hover:bg-accent/10 transition-colors"
                            >
                              <ClipboardCheck size={16} />
                            </button>
                            {branches.length > 1 && (
                              <button
                                type="button"
                                onClick={() => openTransferModal(product)}
                                title="Transfer Stock Between Branches"
                                aria-label={`Transfer stock for ${product.name}`}
                                className="p-2 text-text-muted hover:text-primary rounded-lg hover:bg-surface-alt transition-colors"
                              >
                                <ArrowRightLeft size={16} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditModal(product)}
                              aria-label={`Edit ${product.name}`}
                              className="p-2 text-text-muted hover:text-primary rounded-lg hover:bg-surface-alt transition-colors"
                            >
                              <Edit2 size={16} />
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => deleteProduct(product.id)}
                                aria-label={`Delete ${product.name}`}
                                className="p-2 text-text-muted hover:text-danger rounded-lg hover:bg-danger/10 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
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

      {/* Recent Inter-Branch Transfers Log */}
      {transfers.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-border bg-surface-alt/40 flex items-center gap-2">
            <ArrowRightLeft size={16} className="text-primary" />
            <h2 className="font-bold text-primary text-sm">Recent Inter-Branch Stock Transfers</h2>
          </div>
          <div className="divide-y divide-border text-sm">
            {transfers.slice(0, 5).map((tr) => (
              <div key={tr.id} className="px-6 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-primary">{tr.productName}</span>
                  <span className="text-text-muted text-xs ml-2">
                    {tr.fromBranchName} → {tr.toBranchName}
                  </span>
                </div>
                <span className="font-mono tabular-nums font-bold text-accent">
                  {tr.quantity} units
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logged Stock Adjustment Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white">
              <h3 className="text-lg font-bold text-white">Adjust Stock · {adjustTarget.name}</h3>
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleConfirmAdjustment} className="p-6 space-y-4">
              <div className="p-3.5 bg-surface-alt rounded-xl flex justify-between text-sm">
                <span className="text-text-secondary">Current Branch Stock</span>
                <span className="font-mono font-bold text-primary">
                  {getEffectiveStock(adjustTarget, effectiveBranchId)} {adjustTarget.unit}
                </span>
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">
                  New Counted Stock ({adjustTarget.unit}) *
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  className="input w-full font-mono tabular-nums"
                  value={adjustNewStock}
                  onChange={(e) => setAdjustNewStock(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Audit Reason *</label>
                <select
                  className="input w-full"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value as StockAdjustment['reason'])}
                >
                  {ADJUSTMENT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Notes</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Optional stock-take or variance note"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isAdjusting} className="btn btn-primary flex-1">
                  {isAdjusting ? 'Saving...' : 'Record Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inter-Branch Stock Transfer Modal */}
      {transferTarget && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white">
              <h3 className="text-lg font-bold text-white">Transfer Stock · {transferTarget.name}</h3>
              <button
                type="button"
                onClick={() => setTransferTarget(null)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleConfirmTransfer} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">From Branch *</label>
                  <select
                    className="input w-full"
                    value={fromBranchId}
                    onChange={(e) => setFromBranchId(e.target.value)}
                    required
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({getEffectiveStock(transferTarget, b.id)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">To Branch *</label>
                  <select
                    className="input w-full"
                    value={toBranchId}
                    onChange={(e) => setToBranchId(e.target.value)}
                    required
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({getEffectiveStock(transferTarget, b.id)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">
                  Quantity ({transferTarget.unit}) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, getEffectiveStock(transferTarget, fromBranchId))}
                  required
                  className="input w-full font-mono tabular-nums"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Dispatch Notes</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Driver / dispatch ref"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isTransferring} className="btn btn-primary flex-1">
                  {isTransferring ? 'Transferring...' : 'Transfer Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white">
              <h3 className="text-lg font-bold text-white">Bulk CSV Product Import</h3>
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-text-secondary">
                Upload a CSV file containing product columns (<code>name</code> and{' '}
                <code>sellingPrice</code> required). Stock is seeded to your active branch automatically.
              </p>
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="btn btn-secondary w-full gap-2 text-xs"
              >
                <Download size={15} />
                Download Sample CSV Template
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleCsvUpload}
              />
              <button
                type="button"
                disabled={isImporting}
                onClick={() => csvInputRef.current?.click()}
                className="btn btn-primary w-full gap-2"
              >
                <Upload size={17} />
                {isImporting ? 'Importing CSV...' : 'Choose CSV File & Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
