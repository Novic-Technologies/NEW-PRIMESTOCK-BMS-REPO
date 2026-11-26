import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';
import { localDb } from '../services/db';
import { Product } from '../types';
import { useAuthStore } from '../store/authStore';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { computeTrialState } from '../utils/trialUtils';
import { getEffectivePlanQuota, isQuotaExceeded } from '../utils/planLimits';
import { canManageInventoryData } from '../utils/rbac';
import { getNextExpiringBatch, getTotalBatchStock } from '../utils/inventoryMath';
import { logWorkspaceAudit } from './useAuditLog';
import { getHookCache, hasHookCache, setHookCache } from '../utils/hookCache';
import toast from 'react-hot-toast';

export function useInventory() {
  const { tenant, user, activeBranchId } = useAuthStore();
  const [products, setProducts] = useState<Product[]>(
    () => getHookCache<Product[]>('products', tenant?.id) ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => (tenant?.id ? !hasHookCache('products', tenant.id) : false)
  );

  useEffect(() => {
    if (!tenant) {
      setProducts([]);
      setIsLoading(false);
      return;
    }

    setProducts(getHookCache<Product[]>('products', tenant.id) ?? []);
    setIsLoading(!hasHookCache('products', tenant.id));
    const subscription = liveQuery(() =>
      localDb.products.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setHookCache('products', tenant.id, sorted);
        setProducts(sorted);
        setIsLoading(false);
      },
      error: (error) => {
        console.error('Fetch products error:', error);
        toast.error('Failed to load products');
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [tenant?.id]);

  const addProduct = async (productData: Omit<Product, 'id' | 'tenantId' | 'createdAt'>) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing to add products.');
      return;
    }
    if (!canManageInventoryData(user)) {
      toast.error('Only inventory staff, managers, or admins can create products');
      return;
    }

    const quota = getEffectivePlanQuota(tenant);
    if (isQuotaExceeded(products.length, quota.maxProducts)) {
      toast.error(
        `${quota.name} plan supports up to ${quota.maxProducts} products. Upgrade in Billing to add more.`
      );
      return;
    }

    const targetBranch = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId;
    const rawBatches = Array.isArray(productData.batches) ? productData.batches.filter((b) => b.quantity > 0) : [];
    const normalizedBatches =
      rawBatches.length > 0
        ? rawBatches.map((b) => ({ ...b, branchId: b.branchId || targetBranch || undefined }))
        : productData.batchNumber || productData.expiryDate
        ? [
            {
              id: crypto.randomUUID(),
              batchNumber: productData.batchNumber || 'LOT-1',
              expiryDate: productData.expiryDate,
              quantity: Math.max(0, Number(productData.currentStock) || 0),
              branchId: targetBranch || undefined,
              unitCost: Number(productData.buyingPrice) || 0,
              receivedAt: new Date().toISOString(),
            },
          ].filter((b) => b.quantity > 0)
        : undefined;
    const nextLot = getNextExpiringBatch(normalizedBatches);
    const totalFromBatches = normalizedBatches?.length ? getTotalBatchStock(normalizedBatches) : Number(productData.currentStock) || 0;

    const initialBranchStock =
      productData.branchStock ||
      (targetBranch ? { [targetBranch]: totalFromBatches } : undefined);

    const newProduct: Product = stripUndefined({
      ...productData,
      currentStock: totalFromBatches,
      batches: normalizedBatches,
      batchNumber: nextLot?.batchNumber || productData.batchNumber,
      expiryDate: nextLot?.expiryDate || productData.expiryDate,
      branchStock: initialBranchStock,
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      createdAt: new Date().toISOString(),
    });

    try {
      await localDb.products.put(newProduct);

      if (navigator.onLine) {
        const path = `tenants/${tenant.id}/products/${newProduct.id}`;
        try {
          await setDoc(doc(db, `tenants/${tenant.id}/products`, newProduct.id), stripUndefined(newProduct));
        } catch (error) {
          await localDb.syncQueue.add({
            tenantId: tenant.id,
            table: 'products',
            action: 'create',
            data: newProduct,
            status: 'pending',
            createdAt: Date.now(),
          });
          try {
            handleFirestoreError(error, OperationType.WRITE, path);
          } catch (err) {
            console.error(err);
          }
        }
      } else {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table: 'products',
          action: 'create',
          data: newProduct,
          status: 'pending',
          createdAt: Date.now(),
        });
      }

      void logWorkspaceAudit({
        tenantId: tenant.id,
        branchId: targetBranch,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'PRODUCT_CREATED',
        entityType: 'product',
        entityId: newProduct.id,
        summary: `Added product ${newProduct.name} (${newProduct.currentStock} ${newProduct.unit})`,
      });

      toast.success('Product added successfully');
      return newProduct;
    } catch (error) {
      console.error('Add product error:', error);
      toast.error('Failed to add product');
    }
  };

  const bulkImportProducts = async (
    rows: Array<Omit<Product, 'id' | 'tenantId' | 'createdAt'>>,
    sourceLabel = 'Smart Import'
  ): Promise<number> => {
    if (!tenant || !user) return 0;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing to import products.');
      return 0;
    }
    if (!canManageInventoryData(user)) {
      toast.error('Only inventory staff, managers, or admins can bulk import products');
      return 0;
    }

    const quota = getEffectivePlanQuota(tenant);
    const availableSlots = Number.isFinite(quota.maxProducts)
      ? Math.max(0, quota.maxProducts - products.length)
      : rows.length;

    if (availableSlots <= 0) {
      toast.error(`Product limit (${quota.maxProducts}) reached for ${quota.name} plan.`);
      return 0;
    }

    const validRows = rows.filter((r) => String(r.name || '').trim().length > 0);
    const rowsToImport = validRows.slice(0, availableSlots);
    const targetBranch = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId;
    const nowIso = new Date().toISOString();

    const productsToCreate: Product[] = rowsToImport.map((item) => {
      const stock = Math.max(0, Number(item.currentStock) || 0);
      return stripUndefined({
        name: String(item.name).trim().slice(0, 150),
        category: String(item.category || 'General').trim().slice(0, 80) || 'General',
        sku: item.sku ? String(item.sku).trim().slice(0, 64) : undefined,
        barcode: item.barcode ? String(item.barcode).trim().slice(0, 64) : undefined,
        buyingPrice: Math.max(0, Number(item.buyingPrice) || 0),
        sellingPrice: Math.max(0, Number(item.sellingPrice) || 0),
        wholesalePrice: item.wholesalePrice && Number(item.wholesalePrice) > 0 ? Number(item.wholesalePrice) : undefined,
        vipPrice: item.vipPrice && Number(item.vipPrice) > 0 ? Number(item.vipPrice) : undefined,
        currentStock: stock,
        minStockLevel: Math.max(0, Number(item.minStockLevel ?? 5) || 0),
        unit: String(item.unit || 'pcs').trim().slice(0, 32) || 'pcs',
        batchNumber: item.batchNumber ? String(item.batchNumber).trim().slice(0, 64) : undefined,
        expiryDate: item.expiryDate ? String(item.expiryDate).trim().slice(0, 32) : undefined,
        status: item.status === 'inactive' ? 'inactive' : 'active',
        branchStock: targetBranch ? { [targetBranch]: stock } : undefined,
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        createdAt: nowIso,
      });
    });

    if (productsToCreate.length > 0) {
      await localDb.products.bulkPut(productsToCreate);
      if (navigator.onLine) {
        const CHUNK_SIZE = 12;
        for (let i = 0; i < productsToCreate.length; i += CHUNK_SIZE) {
          const chunk = productsToCreate.slice(i, i + CHUNK_SIZE);
          await Promise.all(
            chunk.map(async (product) => {
              try {
                await setDoc(doc(db, `tenants/${tenant.id}/products`, product.id), product);
              } catch {
                await localDb.syncQueue.add({
                  tenantId: tenant.id,
                  table: 'products',
                  action: 'create',
                  data: product,
                  status: 'pending',
                  createdAt: Date.now(),
                });
              }
            })
          );
        }
      } else {
        await localDb.syncQueue.bulkAdd(
          productsToCreate.map((product) => ({
            tenantId: tenant.id,
            table: 'products',
            action: 'create' as const,
            data: product,
            status: 'pending' as const,
            createdAt: Date.now(),
          }))
        );
      }

      void logWorkspaceAudit({
        tenantId: tenant.id,
        branchId: targetBranch,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'PRODUCT_BULK_IMPORT',
        entityType: 'product',
        summary: `Imported ${productsToCreate.length} products via ${sourceLabel}`,
      });
    }

    const importedCount = productsToCreate.length;
    if (validRows.length > importedCount) {
      toast.success(
        `Imported ${importedCount} product(s). ${validRows.length - importedCount} skipped due to ${quota.name} plan SKU cap.`
      );
    } else {
      toast.success(`Imported ${importedCount} product${importedCount === 1 ? '' : 's'}`);
    }
    return importedCount;
  };

  const updateProduct = async (productId: string, updates: Partial<Product>) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing to edit inventory.');
      return;
    }
    if (!canManageInventoryData(user)) {
      toast.error('Only inventory staff, managers, or admins can update products');
      return;
    }
    try {
      const existing = await localDb.products.get(productId);
      if (!existing) return;

      const mergedUpdates = { ...updates };
      if (Array.isArray(mergedUpdates.batches)) {
        const cleanedBatches = mergedUpdates.batches.filter((b) => (Number(b.quantity) || 0) > 0);
        const nextLot = getNextExpiringBatch(cleanedBatches);
        mergedUpdates.batches = cleanedBatches;
        if (cleanedBatches.length > 0) {
          mergedUpdates.batchNumber = nextLot?.batchNumber;
          mergedUpdates.expiryDate = nextLot?.expiryDate;
          if (mergedUpdates.currentStock === undefined) {
            mergedUpdates.currentStock = getTotalBatchStock(cleanedBatches);
          }
        }
      }

      const updated: Product = stripUndefined({ ...existing, ...mergedUpdates });
      await localDb.products.put(updated);

      if (navigator.onLine) {
        const path = `tenants/${tenant.id}/products/${productId}`;
        try {
          await setDoc(doc(db, `tenants/${tenant.id}/products`, productId), stripUndefined(updated));
        } catch (error) {
          await localDb.syncQueue.add({
            tenantId: tenant.id,
            table: 'products',
            action: 'update',
            data: updated,
            status: 'pending',
            createdAt: Date.now(),
          });
          try {
            handleFirestoreError(error, OperationType.UPDATE, path);
          } catch (err) {
            console.error(err);
          }
        }
      } else {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table: 'products',
          action: 'update',
          data: updated,
          status: 'pending',
          createdAt: Date.now(),
        });
      }

      void logWorkspaceAudit({
        tenantId: tenant.id,
        branchId: activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'PRODUCT_UPDATED',
        entityType: 'product',
        entityId: productId,
        summary: `Updated product ${updated.name} (Stock: ${updated.currentStock} ${updated.unit}, Price: UGX ${Number(updated.sellingPrice).toLocaleString()})`,
      });

      toast.success('Product updated');
      return updated;
    } catch (error) {
      console.error('Update product error:', error);
      toast.error('Failed to update product');
    }
  };

  const updateStock = async (productId: string, newStock: number) => {
    return updateProduct(productId, { currentStock: Math.max(0, newStock) });
  };

  const deleteProduct = async (productId: string) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return;
    }
    if (user.role !== 'admin') {
      toast.error('Only business admins can delete products');
      return;
    }
    try {
      const existing = await localDb.products.get(productId);
      await localDb.products.delete(productId);

      if (navigator.onLine) {
        const path = `tenants/${tenant.id}/products/${productId}`;
        try {
          await deleteDoc(doc(db, `tenants/${tenant.id}/products`, productId));
        } catch (error) {
          await localDb.syncQueue.add({
            tenantId: tenant.id,
            table: 'products',
            action: 'delete',
            data: { id: productId },
            status: 'pending',
            createdAt: Date.now(),
          });
          try {
            handleFirestoreError(error, OperationType.DELETE, path);
          } catch (err) {
            console.error(err);
          }
        }
      } else {
        await localDb.syncQueue.add({
          tenantId: tenant.id,
          table: 'products',
          action: 'delete',
          data: { id: productId },
          status: 'pending',
          createdAt: Date.now(),
        });
      }

      void logWorkspaceAudit({
        tenantId: tenant.id,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'PRODUCT_DELETED',
        entityType: 'product',
        entityId: productId,
        summary: `Deleted product ${existing?.name || productId}`,
      });

      toast.success('Product deleted');
    } catch (error) {
      console.error('Delete product error:', error);
      toast.error('Failed to delete product');
    }
  };

  return {
    products,
    isLoading,
    addProduct,
    bulkImportProducts,
    updateProduct,
    updateStock,
    deleteProduct,
  };
}
