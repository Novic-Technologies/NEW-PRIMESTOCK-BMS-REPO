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
import { logWorkspaceAudit } from './useAuditLog';
import toast from 'react-hot-toast';

export function useInventory() {
  const { tenant, user, activeBranchId } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenant) {
      setProducts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const subscription = liveQuery(() =>
      localDb.products.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    const initialBranchStock =
      productData.branchStock ||
      (targetBranch ? { [targetBranch]: Number(productData.currentStock) || 0 } : undefined);

    const newProduct: Product = stripUndefined({
      ...productData,
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
    rows: Array<Omit<Product, 'id' | 'tenantId' | 'createdAt'>>
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

    const rowsToImport = rows.slice(0, availableSlots);
    const targetBranch = activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user.branchId;
    const nowIso = new Date().toISOString();

    const productsToCreate: Product[] = rowsToImport.map((item) =>
      stripUndefined({
        ...item,
        branchStock: targetBranch ? { [targetBranch]: Number(item.currentStock) || 0 } : undefined,
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        createdAt: nowIso,
      })
    );

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
        summary: `Imported ${productsToCreate.length} products via CSV`,
      });
    }

    const importedCount = productsToCreate.length;

    toast.success(`Imported ${importedCount} product${importedCount === 1 ? '' : 's'}`);
    return importedCount;
  };

  const updateProduct = async (productId: string, updates: Partial<Product>) => {
    if (!tenant || !user) return;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing to edit inventory.');
      return;
    }
    try {
      const existing = await localDb.products.get(productId);
      if (!existing) return;

      const updated: Product = stripUndefined({ ...existing, ...updates });
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
