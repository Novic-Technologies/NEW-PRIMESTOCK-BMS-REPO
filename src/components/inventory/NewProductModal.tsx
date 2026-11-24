import React, { useState, useEffect } from 'react';
import { X, Package, Barcode, Tag, DollarSign, Layers, Camera, Wand2, Plus, Trash2 } from 'lucide-react';
import { useInventory } from '../../hooks/useInventory';
import { EnrichedProductSuggestion, runAiAssistantTool } from '../../services/aiService';
import { BarcodeScannerModal } from '../shared/BarcodeScannerModal';
import { Product, ProductBatch } from '../../types';
import toast from 'react-hot-toast';

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingProduct?: Product | null;
}

const DEFAULT_FORM = {
  name: '',
  sku: '',
  barcode: '',
  category: 'General',
  buyingPrice: 0,
  sellingPrice: 0,
  wholesalePrice: 0,
  vipPrice: 0,
  currentStock: 0,
  minStockLevel: 5,
  unit: 'pcs',
  batchNumber: '',
  expiryDate: '',
  status: 'active' as 'active' | 'inactive',
};

export function NewProductModal({ isOpen, onClose, editingProduct }: NewProductModalProps) {
  const { addProduct, updateProduct } = useInventory();
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    if (editingProduct) {
      setFormData({
        name: editingProduct.name || '',
        sku: editingProduct.sku || '',
        barcode: editingProduct.barcode || '',
        category: editingProduct.category || 'General',
        buyingPrice: editingProduct.buyingPrice || 0,
        sellingPrice: editingProduct.sellingPrice || 0,
        wholesalePrice: editingProduct.wholesalePrice || 0,
        vipPrice: editingProduct.vipPrice || 0,
        currentStock: editingProduct.currentStock || 0,
        minStockLevel: editingProduct.minStockLevel ?? 5,
        unit: editingProduct.unit || 'pcs',
        batchNumber: editingProduct.batchNumber || '',
        expiryDate: editingProduct.expiryDate || '',
        status: editingProduct.status || 'active',
      });
      setBatches(Array.isArray(editingProduct.batches) ? editingProduct.batches : []);
    } else {
      setFormData(DEFAULT_FORM);
      setBatches([]);
    }
  }, [editingProduct, isOpen]);

  if (!isOpen) return null;

  const handleAiEnrich = async () => {
    if (!formData.name.trim()) {
      toast.error('Enter a product name first so AI can suggest category and SKU');
      return;
    }
    setIsEnriching(true);
    try {
      const res = await runAiAssistantTool<{ suggestions: EnrichedProductSuggestion[] }>(
        'enrich_products',
        {
          items: [
            {
              name: formData.name.trim(),
              category: formData.category,
              unit: formData.unit,
              sku: formData.sku,
            },
          ],
        }
      );
      const first = res.suggestions?.[0];
      if (first) {
        setFormData((prev) => ({
          ...prev,
          name: first.standardizedName || prev.name,
          category: first.suggestedCategory || prev.category,
          sku: prev.sku.trim() ? prev.sku : first.suggestedSku || prev.sku,
        }));
        toast.success('Suggested standardized name, category & SKU — review before saving');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not enrich product details');
    } finally {
      setIsEnriching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.sellingPrice <= 0) {
      toast.error('Please enter a product name and selling price greater than 0');
      return;
    }

    setIsSaving(true);
    const activeBatches = batches.filter((b) => (Number(b.quantity) || 0) > 0);
    const totalBatchStock = activeBatches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
    const payload = {
      ...formData,
      name: formData.name.trim(),
      sku: formData.sku.trim() || undefined,
      barcode: formData.barcode.trim() || undefined,
      wholesalePrice: formData.wholesalePrice > 0 ? formData.wholesalePrice : undefined,
      vipPrice: formData.vipPrice > 0 ? formData.vipPrice : undefined,
      currentStock: activeBatches.length > 0 ? totalBatchStock : formData.currentStock,
      batchNumber: formData.batchNumber.trim() || undefined,
      expiryDate: formData.expiryDate.trim() || undefined,
      batches: activeBatches.length > 0 ? activeBatches : undefined,
    };

    try {
      if (editingProduct) {
        const res = await updateProduct(editingProduct.id, payload);
        if (res) onClose();
      } else {
        const res = await addProduct(payload);
        if (res) {
          onClose();
          setFormData(DEFAULT_FORM);
          setBatches([]);
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
        <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90dvh] flex flex-col border border-border">
          <div className="p-6 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
            <div className="flex items-center gap-3">
              <Package size={24} />
              <h3 className="text-xl font-bold text-white">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="hover:bg-white/10 p-1.5 rounded-lg"
              aria-label="Close modal"
            >
              <X size={22} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 sm:p-8 space-y-5 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="col-span-full">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-sm font-bold text-primary">Product Name *</label>
                  <button
                    type="button"
                    disabled={isEnriching || !formData.name.trim()}
                    onClick={handleAiEnrich}
                    className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline disabled:opacity-40 whitespace-nowrap"
                  >
                    <Wand2 size={13} />
                    {isEnriching ? 'Enriching...' : 'AI Standardize & SKU'}
                  </button>
                </div>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Posho Flour 2kg"
                    className="input pl-10"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">Category</label>
                <input
                  type="text"
                  placeholder="e.g. Groceries, Beverages"
                  className="input"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">Unit</label>
                <select
                  className="input"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                >
                  <option value="pcs">Pieces (pcs)</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="ltr">Litres (ltr)</option>
                  <option value="box">Boxes (box)</option>
                  <option value="pack">Packs (pack)</option>
                  <option value="sack">Sacks (sack)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">SKU / Code</label>
                <input
                  type="text"
                  placeholder="PROD-001"
                  className="input"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">Barcode</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                    <input
                      type="text"
                      placeholder="Scan or enter barcode"
                      className="input pl-10"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="btn btn-secondary px-3"
                    aria-label="Scan barcode with camera"
                  >
                    <Camera size={17} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">Buying Price (UGX)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="input pl-10 font-mono"
                    value={formData.buyingPrice}
                    onChange={(e) => setFormData({ ...formData, buyingPrice: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">
                  Retail Selling Price (UGX) *
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    type="number"
                    min={1}
                    required
                    placeholder="0"
                    className="input pl-10 font-mono"
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">
                  Wholesale Price (UGX, optional)
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="Optional wholesale tier"
                  className="input font-mono"
                  value={formData.wholesalePrice || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, wholesalePrice: Number(e.target.value) || 0 })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">
                  VIP Price (UGX, optional)
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="Optional VIP tier"
                  className="input font-mono"
                  value={formData.vipPrice || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, vipPrice: Number(e.target.value) || 0 })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">Current Stock</label>
                <div className="relative">
                  <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="input pl-10 font-mono"
                    value={formData.currentStock}
                    onChange={(e) => setFormData({ ...formData, currentStock: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">Min Stock Alert</label>
                <input
                  type="number"
                  min={0}
                  placeholder="5"
                  className="input font-mono"
                  value={formData.minStockLevel}
                  onChange={(e) => setFormData({ ...formData, minStockLevel: Number(e.target.value) })}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">
                  Batch / Lot Number (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. BATCH-2026-A"
                  className="input font-mono"
                  value={formData.batchNumber}
                  onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1.5">
                  Expiry Date (optional)
                </label>
                <input
                  type="date"
                  className="input"
                  value={formData.expiryDate}
                  onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                />
              </div>

              {/* Multi-Batch FEFO Lot Manager */}
              <div className="col-span-full p-4 rounded-xl border border-border bg-surface-alt/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-primary uppercase tracking-wider">
                      Batch Lots (FEFO — First-Expired, First-Out)
                    </p>
                    <p className="text-[11px] text-text-muted">
                      Optional: track multiple expiry lots per SKU. POS deducts the earliest expiring lot first.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setBatches((prev) => [
                        ...prev,
                        {
                          id: crypto.randomUUID(),
                          batchNumber: `LOT-${prev.length + 1}`,
                          expiryDate: formData.expiryDate || '',
                          quantity: prev.length === 0 ? Math.max(0, formData.currentStock) : 0,
                        },
                      ])
                    }
                    className="btn btn-secondary text-xs py-1.5 px-3 min-h-[34px] gap-1 whitespace-nowrap"
                  >
                    <Plus size={13} />
                    Add Lot
                  </button>
                </div>

                {batches.length > 0 && (
                  <div className="space-y-2">
                    {batches.map((lot, idx) => (
                      <div
                        key={lot.id}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-surface p-2 rounded-lg border border-border"
                      >
                        <input
                          type="text"
                          placeholder="Batch #"
                          className="input-sm sm:col-span-4 font-mono text-xs"
                          value={lot.batchNumber}
                          onChange={(e) =>
                            setBatches((prev) =>
                              prev.map((b, i) => (i === idx ? { ...b, batchNumber: e.target.value } : b))
                            )
                          }
                        />
                        <input
                          type="date"
                          className="input-sm sm:col-span-4 text-xs"
                          value={lot.expiryDate || ''}
                          onChange={(e) =>
                            setBatches((prev) =>
                              prev.map((b, i) => (i === idx ? { ...b, expiryDate: e.target.value } : b))
                            )
                          }
                        />
                        <input
                          type="number"
                          min={0}
                          placeholder="Qty"
                          className="input-sm sm:col-span-3 font-mono tabular-nums text-xs"
                          value={lot.quantity}
                          onChange={(e) =>
                            setBatches((prev) =>
                              prev.map((b, i) =>
                                i === idx ? { ...b, quantity: Math.max(0, Number(e.target.value) || 0) } : b
                              )
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setBatches((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label={`Remove lot ${lot.batchNumber}`}
                          className="p-1.5 text-text-muted hover:text-danger sm:col-span-1 justify-self-end"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <p className="text-[11px] font-mono text-text-secondary">
                      Combined Lot Stock: <strong>{batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0)} {formData.unit}</strong>
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn btn-secondary flex-1 py-3">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="btn btn-primary flex-1 py-3">
                {isSaving ? 'Saving...' : editingProduct ? 'Update Product' : 'Save Product'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onDetected={(code) => setFormData((prev) => ({ ...prev, barcode: code }))}
        title="Scan Product Barcode"
      />
    </>
  );
}
