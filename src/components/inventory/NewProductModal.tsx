import React, { useState, useEffect } from 'react';
import { X, Package, Barcode, Tag, DollarSign, Layers, Camera } from 'lucide-react';
import { useInventory } from '../../hooks/useInventory';
import { BarcodeScannerModal } from '../shared/BarcodeScannerModal';
import { Product } from '../../types';
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
  const [isSaving, setIsSaving] = useState(false);
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
    } else {
      setFormData(DEFAULT_FORM);
    }
  }, [editingProduct, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.sellingPrice <= 0) {
      toast.error('Please enter a product name and selling price greater than 0');
      return;
    }

    setIsSaving(true);
    const payload = {
      ...formData,
      name: formData.name.trim(),
      sku: formData.sku.trim() || undefined,
      barcode: formData.barcode.trim() || undefined,
      wholesalePrice: formData.wholesalePrice > 0 ? formData.wholesalePrice : undefined,
      vipPrice: formData.vipPrice > 0 ? formData.vipPrice : undefined,
      batchNumber: formData.batchNumber.trim() || undefined,
      expiryDate: formData.expiryDate.trim() || undefined,
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
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
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

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="col-span-full">
                <label className="block text-sm font-bold text-primary mb-1.5">Product Name *</label>
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
