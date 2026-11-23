import { useState, useMemo, useEffect } from 'react';
import { liveQuery } from 'dexie';
import { Customer, Product, Sale, SplitPaymentPart } from '../types';
import { useAuthStore } from '../store/authStore';
import { localDb } from '../services/db';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { computeTrialState } from '../utils/trialUtils';
import { getTrialDaysCount } from '../utils/planLimits';
import { applyBranchStockDelta, getEffectiveStock } from '../utils/branchStock';
import { logWorkspaceAudit } from './useAuditLog';
import { normalizeIsoDate, normalizeUgPhone } from '../utils/smartImportParser';
import toast from 'react-hot-toast';

export interface CartItem extends Product {
  quantity: number;
  appliedPrice: number;
  priceTier: 'retail' | 'wholesale' | 'vip';
}

export interface HeldCart {
  id: string;
  label: string;
  items: CartItem[];
  discount: number;
  customerId: string | null;
  parkedAt: string;
}

export function resolveCustomerTierPrice(
  product: Product,
  customerType?: Customer['type']
): { price: number; tier: 'retail' | 'wholesale' | 'vip' } {
  if (customerType === 'Wholesale' && product.wholesalePrice && product.wholesalePrice > 0) {
    return { price: product.wholesalePrice, tier: 'wholesale' };
  }
  if (customerType === 'VIP' && product.vipPrice && product.vipPrice > 0) {
    return { price: product.vipPrice, tier: 'vip' };
  }
  return { price: product.sellingPrice, tier: 'retail' };
}

export function usePOS() {
  const { user, tenant, activeBranchId } = useAuthStore();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [selectedCustomerType, setSelectedCustomerType] = useState<Customer['type'] | undefined>(undefined);

  const effectiveBranchId =
    activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user?.branchId || undefined;

  useEffect(() => {
    if (!tenant) {
      setSales([]);
      setHeldCarts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const storageKey = `primestock_held_carts_${tenant.id}`;
    try {
      const saved = localStorage.getItem(storageKey);
      setHeldCarts(saved ? (JSON.parse(saved) as HeldCart[]) : []);
    } catch {
      setHeldCarts([]);
    }

    const subscription = liveQuery(() =>
      localDb.sales.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setSales(sorted);
        setIsLoading(false);
      },
      error: (err) => {
        console.error('Load sales error:', err);
        setIsLoading(false);
      },
    });

    return () => subscription.unsubscribe();
  }, [tenant?.id]);

  // Re-price existing cart items whenever customer tier changes
  useEffect(() => {
    if (!customerId) {
      setSelectedCustomerType(undefined);
      setCart((prev) =>
        prev.map((item) => ({
          ...item,
          appliedPrice: item.sellingPrice,
          priceTier: 'retail',
        }))
      );
      return;
    }

    localDb.customers.get(customerId).then((customer) => {
      const cType = customer?.type;
      setSelectedCustomerType(cType);
      setCart((prev) =>
        prev.map((item) => {
          const resolved = resolveCustomerTierPrice(item, cType);
          return {
            ...item,
            appliedPrice: resolved.price,
            priceTier: resolved.tier,
          };
        })
      );
    });
  }, [customerId]);

  const persistHeldCarts = (next: HeldCart[]) => {
    setHeldCarts(next);
    if (!tenant) return;
    try {
      localStorage.setItem(`primestock_held_carts_${tenant.id}`, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  };

  const parkCurrentCart = (label?: string) => {
    if (cart.length === 0) return;
    const held: HeldCart = {
      id: crypto.randomUUID(),
      label: label?.trim() || `Order #${heldCarts.length + 1}`,
      items: cart,
      discount,
      customerId,
      parkedAt: new Date().toISOString(),
    };
    persistHeldCarts([held, ...heldCarts]);
    setCart([]);
    setDiscount(0);
    setCustomerId(null);
    toast.success(`Cart parked as "${held.label}"`);
  };

  const resumeHeldCart = (heldId: string) => {
    const target = heldCarts.find((h) => h.id === heldId);
    if (!target) return;
    setCart(target.items);
    setDiscount(target.discount);
    setCustomerId(target.customerId);
    persistHeldCarts(heldCarts.filter((h) => h.id !== heldId));
    toast.success(`Resumed "${target.label}"`);
  };

  const discardHeldCart = (heldId: string) => {
    persistHeldCarts(heldCarts.filter((h) => h.id !== heldId));
  };

  const addToCart = (product: Product) => {
    const availableStock = getEffectiveStock(product, effectiveBranchId);
    if (availableStock <= 0) {
      toast.error(`${product.name} is out of stock in this branch`);
      return;
    }
    const resolved = resolveCustomerTierPrice(product, selectedCustomerType);
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity >= availableStock) {
          toast.error(`Only ${availableStock} ${product.unit || 'units'} available in stock`);
          return prev;
        }
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          ...product,
          quantity: 1,
          appliedPrice: resolved.price,
          priceTier: resolved.tier,
        },
      ];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== productId) return item;
        const available = getEffectiveStock(item, effectiveBranchId);
        const clamped = Math.min(quantity, Math.max(1, available));
        return { ...item, quantity: clamped };
      })
    );
  };

  const subtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.appliedPrice * item.quantity, 0),
    [cart]
  );

  const safeDiscount = useMemo(
    () => Math.min(Math.max(0, discount), subtotal),
    [discount, subtotal]
  );

  const taxConfig = useMemo(() => {
    const enabled = Boolean(tenant?.preferences?.taxEnabled);
    const rate = enabled ? Number(tenant?.preferences?.taxRate ?? 18) : 0;
    const inclusive = tenant?.preferences?.taxInclusive ?? true;
    return { enabled, rate, inclusive };
  }, [tenant?.preferences]);

  const { taxAmount, total } = useMemo(() => {
    const discountedBase = Math.max(0, subtotal - safeDiscount);
    if (!taxConfig.enabled || taxConfig.rate <= 0 || discountedBase === 0) {
      return { taxAmount: 0, total: discountedBase };
    }
    if (taxConfig.inclusive) {
      const tax = Math.round(discountedBase - discountedBase / (1 + taxConfig.rate / 100));
      return { taxAmount: tax, total: discountedBase };
    }
    const tax = Math.round(discountedBase * (taxConfig.rate / 100));
    return { taxAmount: tax, total: discountedBase + tax };
  }, [subtotal, safeDiscount, taxConfig]);

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setCustomerId(null);
  };

  const applyOrderDraft = async (
    draftItems: Array<{ product: Product; quantity: number }>,
    targetCustomerId?: string | null
  ) => {
    let resolvedType = selectedCustomerType;
    if (targetCustomerId !== undefined) {
      setCustomerId(targetCustomerId || null);
      if (targetCustomerId) {
        const cust = await localDb.customers.get(targetCustomerId);
        resolvedType = cust?.type;
      } else {
        resolvedType = undefined;
      }
    }

    const nextItems: CartItem[] = [];
    for (const entry of draftItems) {
      const available = getEffectiveStock(entry.product, effectiveBranchId);
      if (available <= 0) continue;
      const qty = Math.min(Math.max(1, Math.round(entry.quantity) || 1), available);
      const resolved = resolveCustomerTierPrice(entry.product, resolvedType);
      nextItems.push({
        ...entry.product,
        quantity: qty,
        appliedPrice: resolved.price,
        priceTier: resolved.tier,
      });
    }

    if (nextItems.length === 0) {
      toast.error('None of the drafted items have available stock in this branch');
      return false;
    }

    setCart(nextItems);
    toast.success(`Loaded ${nextItems.length} item(s) into POS cart`);
    return true;
  };

  const persistSaleAndSideEffects = async (
    sale: Sale,
    action: 'create' | 'update',
    updatedProducts: Product[],
    updatedCustomer: Customer | null
  ) => {
    if (!tenant) return;

    await localDb.transaction(
      'rw',
      [localDb.sales, localDb.products, localDb.customers],
      async () => {
        await localDb.sales.put(sale);
        if (updatedProducts.length > 0) {
          await localDb.products.bulkPut(updatedProducts);
        }
        if (updatedCustomer) {
          await localDb.customers.put(updatedCustomer);
        }
      }
    );

    if (navigator.onLine) {
      const writePromises: Promise<void>[] = [];

      writePromises.push(
        setDoc(doc(db, `tenants/${tenant.id}/sales`, sale.id), stripUndefined(sale)).catch(
          async (error) => {
            await localDb.syncQueue.add({
              tenantId: tenant.id,
              table: 'sales',
              action,
              data: sale,
              status: 'pending',
              createdAt: Date.now(),
            });
            try {
              handleFirestoreError(error, OperationType.WRITE, `tenants/${tenant.id}/sales/${sale.id}`);
            } catch (err) {
              console.error(err);
            }
          }
        )
      );

      for (const prod of updatedProducts) {
        writePromises.push(
          setDoc(doc(db, `tenants/${tenant.id}/products`, prod.id), stripUndefined(prod)).catch(
            async (error) => {
              await localDb.syncQueue.add({
                tenantId: tenant.id,
                table: 'products',
                action: 'update',
                data: prod,
                status: 'pending',
                createdAt: Date.now(),
              });
              try {
                handleFirestoreError(
                  error,
                  OperationType.UPDATE,
                  `tenants/${tenant.id}/products/${prod.id}`
                );
              } catch (err) {
                console.error(err);
              }
            }
          )
        );
      }

      if (updatedCustomer) {
        writePromises.push(
          setDoc(
            doc(db, `tenants/${tenant.id}/customers`, updatedCustomer.id),
            stripUndefined(updatedCustomer)
          ).catch(async (error) => {
            await localDb.syncQueue.add({
              tenantId: tenant.id,
              table: 'customers',
              action: 'update',
              data: updatedCustomer,
              status: 'pending',
              createdAt: Date.now(),
            });
            try {
              handleFirestoreError(
                error,
                OperationType.UPDATE,
                `tenants/${tenant.id}/customers/${updatedCustomer.id}`
              );
            } catch (err) {
              console.error(err);
            }
          })
        );
      }

      await Promise.all(writePromises);
    } else {
      const queueItems = [
        {
          tenantId: tenant.id,
          table: 'sales' as const,
          action,
          data: sale,
          status: 'pending' as const,
          createdAt: Date.now(),
        },
        ...updatedProducts.map((prod) => ({
          tenantId: tenant.id,
          table: 'products' as const,
          action: 'update' as const,
          data: prod,
          status: 'pending' as const,
          createdAt: Date.now(),
        })),
        ...(updatedCustomer
          ? [
              {
                tenantId: tenant.id,
                table: 'customers' as const,
                action: 'update' as const,
                data: updatedCustomer,
                status: 'pending' as const,
                createdAt: Date.now(),
              },
            ]
          : []),
      ];
      await localDb.syncQueue.bulkAdd(queueItems);
    }
  };

  const processSale = async (
    paymentMethod: string,
    shiftId?: string | null,
    options?: {
      splitPayments?: SplitPaymentPart[];
      status?: 'completed' | 'pending';
      branchName?: string;
      paymentProvider?: string;
      paymentReference?: string;
      payerPhone?: string;
      cashTendered?: number;
      changeGiven?: number;
      cashierId?: string;
      cashierName?: string;
    }
  ): Promise<Sale | undefined> => {
    if (!user || !tenant || cart.length === 0) return undefined;

    const trialState = computeTrialState(tenant);
    if (trialState.isSoftLocked) {
      toast.error(`Your ${getTrialDaysCount()}-day trial has expired. Upgrade in Billing to resume POS checkout.`);
      return undefined;
    }

    const splitParts = options?.splitPayments?.filter((p) => p.amount > 0) || [];
    const creditPortion =
      paymentMethod === 'Customer Credit'
        ? total
        : splitParts
            .filter((p) => p.method === 'Customer Credit')
            .reduce((s, p) => s + p.amount, 0);

    if (creditPortion > 0) {
      if (!customerId) {
        toast.error('Select a customer before recording a Customer Credit balance');
        return undefined;
      }
      const customer = await localDb.customers.get(customerId);
      if (customer && customer.creditLimit > 0) {
        const projected = (customer.currentBalance || 0) + creditPortion;
        if (projected > customer.creditLimit) {
          toast.error(
            `Credit limit exceeded for ${customer.name} (Limit: UGX ${customer.creditLimit.toLocaleString()})`
          );
          return undefined;
        }
      }
    }

    const saleStatus = options?.status || 'completed';
    const allBranches = await localDb.branches.where('tenantId').equals(tenant.id).toArray();
    const branchIds = allBranches.map((b) => b.id);
    const branchName =
      options?.branchName ||
      allBranches.find((b) => b.id === effectiveBranchId)?.name ||
      undefined;

    const sale: Sale = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      ...(branchName ? { branchName } : {}),
      ...(shiftId ? { shiftId } : {}),
      reference: `SALE-${Date.now()}`,
      ...(customerId ? { customerId } : {}),
      userId: user.uid,
      ...(options?.cashierId ? { cashierId: options.cashierId } : {}),
      ...(options?.cashierName ? { cashierName: options.cashierName } : {}),
      items: cart.map((item) => ({
        productId: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.appliedPrice,
        costPrice: Number(item.buyingPrice) || 0,
        total: item.appliedPrice * item.quantity,
      })),
      subtotal,
      discount: safeDiscount,
      ...(taxConfig.enabled ? { taxAmount, taxRate: taxConfig.rate } : {}),
      total,
      paymentMethod: splitParts.length > 1 ? 'Split Payment' : paymentMethod,
      ...(options?.paymentProvider ? { paymentProvider: options.paymentProvider } : {}),
      ...(options?.paymentReference ? { paymentReference: options.paymentReference } : {}),
      ...(options?.payerPhone ? { payerPhone: options.payerPhone } : {}),
      ...(typeof options?.cashTendered === 'number' ? { cashTendered: options.cashTendered } : {}),
      ...(typeof options?.changeGiven === 'number' ? { changeGiven: options.changeGiven } : {}),
      ...(splitParts.length > 0 ? { splitPayments: splitParts } : {}),
      status: saleStatus,
      createdAt: new Date().toISOString(),
    });

    try {
      const updatedProducts: Product[] = [];
      for (const item of cart) {
        const product = await localDb.products.get(item.id);
        if (product) {
          const stockUpdate = applyBranchStockDelta(product, effectiveBranchId, -item.quantity, branchIds);
          const updatedProduct = stripUndefined({
            ...product,
            currentStock: stockUpdate.currentStock,
            branchStock: stockUpdate.branchStock,
          });
          updatedProducts.push(updatedProduct);
        }
      }

      let updatedCustomer: Customer | null = null;
      if (customerId) {
        const customer = await localDb.customers.get(customerId);
        if (customer) {
          const earnedPoints = saleStatus === 'completed' ? Math.floor(total / 10000) : 0;
          updatedCustomer = stripUndefined({
            ...customer,
            loyaltyPoints: (customer.loyaltyPoints || 0) + earnedPoints,
            currentBalance: (customer.currentBalance || 0) + creditPortion,
          });
        }
      }

      await persistSaleAndSideEffects(sale, 'create', updatedProducts, updatedCustomer);

      void logWorkspaceAudit({
        tenantId: tenant.id,
        branchId: effectiveBranchId,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: saleStatus === 'pending' ? 'SALE_PENDING_CREATED' : 'SALE_COMPLETED',
        entityType: 'sale',
        entityId: sale.id,
        summary: `${sale.reference} — UGX ${sale.total.toLocaleString()} (${sale.paymentMethod})${
          options?.cashierName ? ` · Cashier: ${options.cashierName}` : ''
        }`,
      });

      clearCart();
      toast.success(
        saleStatus === 'pending' ? 'Order saved as Pending Payment' : 'Sale completed successfully'
      );
      return sale;
    } catch (error) {
      console.error('Process sale error:', error);
      toast.error('Failed to process sale');
      return undefined;
    }
  };

  const refundSale = async (saleId: string, reason: string): Promise<boolean> => {
    if (!user || !tenant) return false;
    if (!['admin', 'manager'].includes(user.role)) {
      toast.error('Only managers or admins can refund or void sales');
      return false;
    }
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return false;
    }

    const sale = await localDb.sales.get(saleId);
    if (!sale || sale.status === 'refunded') return false;

    const allBranches = await localDb.branches.where('tenantId').equals(tenant.id).toArray();
    const branchIds = allBranches.map((b) => b.id);

    const updatedProducts: Product[] = [];
    for (const item of sale.items) {
      const product = await localDb.products.get(item.productId);
      if (product) {
        const restored = applyBranchStockDelta(product, sale.branchId, item.quantity, branchIds);
        updatedProducts.push(
          stripUndefined({
            ...product,
            currentStock: restored.currentStock,
            branchStock: restored.branchStock,
          })
        );
      }
    }

    let updatedCustomer: Customer | null = null;
    if (sale.customerId) {
      const customer = await localDb.customers.get(sale.customerId);
      if (customer) {
        const creditPortion =
          sale.paymentMethod === 'Customer Credit'
            ? sale.total
            : (sale.splitPayments || [])
                .filter((p) => p.method === 'Customer Credit')
                .reduce((s, p) => s + p.amount, 0);

        updatedCustomer = stripUndefined({
          ...customer,
          currentBalance: Math.max(0, (customer.currentBalance || 0) - creditPortion),
          loyaltyPoints: Math.max(0, (customer.loyaltyPoints || 0) - Math.floor(sale.total / 10000)),
        });
      }
    }

    const refundedSale: Sale = stripUndefined({
      ...sale,
      status: 'refunded',
      refundedAt: new Date().toISOString(),
      refundReason: reason.trim() || 'Customer return / voided',
    });

    await persistSaleAndSideEffects(refundedSale, 'update', updatedProducts, updatedCustomer);

    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: sale.branchId,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'SALE_REFUNDED',
      entityType: 'sale',
      entityId: sale.id,
      summary: `Refunded ${sale.reference} (UGX ${sale.total.toLocaleString()}) — ${refundedSale.refundReason}`,
    });

    toast.success(`${sale.reference} refunded & stock restored`);
    return true;
  };

  const settlePendingSale = async (
    saleId: string,
    paymentMethod: string,
    options?: {
      paymentProvider?: string;
      paymentReference?: string;
      payerPhone?: string;
      cashTendered?: number;
      changeGiven?: number;
    }
  ): Promise<boolean> => {
    if (!user || !tenant) return false;
    if (!['admin', 'manager'].includes(user.role)) {
      toast.error('Only managers or admins can settle pending invoices');
      return false;
    }

    const sale = await localDb.sales.get(saleId);
    if (!sale || sale.status !== 'pending') return false;

    const updatedSale: Sale = stripUndefined({
      ...sale,
      paymentMethod,
      ...(options?.paymentProvider ? { paymentProvider: options.paymentProvider } : {}),
      ...(options?.paymentReference ? { paymentReference: options.paymentReference } : {}),
      ...(options?.payerPhone ? { payerPhone: options.payerPhone } : {}),
      ...(typeof options?.cashTendered === 'number' ? { cashTendered: options.cashTendered } : {}),
      ...(typeof options?.changeGiven === 'number' ? { changeGiven: options.changeGiven } : {}),
      status: 'completed',
    });

    await persistSaleAndSideEffects(updatedSale, 'update', [], null);

    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: sale.branchId,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'SALE_SETTLED',
      entityType: 'sale',
      entityId: sale.id,
      summary: `Settled pending sale ${sale.reference} via ${paymentMethod}`,
    });

    toast.success(`${sale.reference} marked as Paid`);
    return true;
  };

  const bulkImportSales = async (
    rows: Array<Record<string, any>>,
    options?: { deductStock?: boolean }
  ): Promise<number> => {
    if (!user || !tenant) return 0;
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return 0;
    }

    const [allProducts, allCustomers, allBranches] = await Promise.all([
      localDb.products.where('tenantId').equals(tenant.id).toArray(),
      localDb.customers.where('tenantId').equals(tenant.id).toArray(),
      localDb.branches.where('tenantId').equals(tenant.id).toArray(),
    ]);
    const branchIds = allBranches.map((b) => b.id);
    const branchName = allBranches.find((b) => b.id === effectiveBranchId)?.name;

    const findProduct = (sku?: string, name?: string) => {
      const cleanSku = String(sku || '').trim().toLowerCase();
      if (cleanSku) {
        const bySku = allProducts.find(
          (p) =>
            (p.sku && p.sku.toLowerCase() === cleanSku) ||
            (p.barcode && p.barcode.toLowerCase() === cleanSku)
        );
        if (bySku) return bySku;
      }
      const cleanName = String(name || '').trim().toLowerCase();
      if (!cleanName) return undefined;
      return (
        allProducts.find((p) => p.name.trim().toLowerCase() === cleanName) ||
        allProducts.find((p) => p.name.toLowerCase().includes(cleanName))
      );
    };

    const findCustomer = (name?: string, phone?: string) => {
      const cleanPhone = String(phone || '').replace(/[^\d]/g, '');
      const cleanName = String(name || '').trim().toLowerCase();
      return allCustomers.find(
        (c) =>
          (cleanPhone.length >= 9 && c.phone.replace(/[^\d]/g, '').endsWith(cleanPhone.slice(-9))) ||
          (cleanName && c.name.trim().toLowerCase() === cleanName)
      );
    };

    const salesToCreate: Sale[] = [];
    const newCustomersToCreate: Customer[] = [];
    const productUpdates = new Map<string, Product>();

    const groupedByRef = new Map<
      string,
      {
        reference: string;
        customerId?: string;
        items: Sale['items'];
        subtotal: number;
        discount: number;
        total: number;
        paymentMethod: string;
        status: Sale['status'];
        createdAt: string;
      }
    >();

    rows.forEach((row, idx) => {
      const totalVal = Math.max(0, Number(row.total) || 0);
      const rawItems = Array.isArray(row.items) && row.items.length > 0 ? row.items : null;

      const saleItems = rawItems
        ? rawItems.slice(0, 200).map((it: any) => {
            const matched = findProduct(it.sku, it.name);
            const qty = Math.max(1, Number(it.quantity) || 1);
            const unitPrice = Math.max(0, Number(it.price ?? it.unitPrice) || matched?.sellingPrice || 0);
            const lineTotal = Math.max(0, Number(it.total) || qty * unitPrice);
            return {
              productId: matched?.id || 'imported-item',
              name: String(it.name || matched?.name || 'Imported Item').slice(0, 150),
              quantity: qty,
              price: unitPrice,
              costPrice: matched?.buyingPrice || 0,
              total: lineTotal,
            };
          })
        : [
            (() => {
              const matched = findProduct(row.sku, row.itemName);
              const qty = Math.max(1, Number(row.quantity) || 1);
              const unitPrice =
                Math.max(0, Number(row.unitPrice) || 0) ||
                (qty > 0 ? Math.round(totalVal / qty) : totalVal);
              return {
                productId: matched?.id || 'imported-item',
                name: String(row.itemName || matched?.name || 'Imported Sale').slice(0, 150),
                quantity: qty,
                price: unitPrice,
                costPrice: matched?.buyingPrice || 0,
                total: totalVal || qty * unitPrice,
              };
            })(),
          ];

      const subtotalVal = saleItems.reduce((s, i) => s + i.total, 0);
      const discountVal = Math.max(0, Number(row.discount) || 0);
      const finalTotal = totalVal > 0 ? totalVal : Math.max(0, subtotalVal - discountVal);

      if (finalTotal <= 0 && subtotalVal <= 0) return;

      const cleanCustName = String(row.customerName || '').trim();
      const normalizedCustPhone = normalizeUgPhone(row.customerPhone).slice(0, 30);
      let matchedCust = findCustomer(cleanCustName, normalizedCustPhone);
      if (
        !matchedCust &&
        cleanCustName &&
        cleanCustName.toLowerCase() !== 'walk-in' &&
        normalizedCustPhone.length >= 10
      ) {
        const createdCust: Customer = stripUndefined({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          name: cleanCustName.slice(0, 150),
          phone: normalizedCustPhone,
          type: 'Individual',
          creditLimit: 0,
          currentBalance: 0,
          loyaltyPoints: 0,
          createdAt: new Date().toISOString(),
        });
        allCustomers.push(createdCust);
        newCustomersToCreate.push(createdCust);
        matchedCust = createdCust;
      }

      let createdIso = new Date().toISOString();
      if (row.saleDate) {
        const isoDate = normalizeIsoDate(row.saleDate);
        const parsedDate = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00Z`);
        if (!Number.isNaN(parsedDate.getTime())) {
          createdIso = parsedDate.toISOString();
        }
      }

      const rawStatus = String(row.status || 'completed').trim().toLowerCase();
      const status: Sale['status'] =
        rawStatus === 'pending' || rawStatus === 'overdue' || rawStatus === 'unpaid' || rawStatus === 'partial'
          ? 'pending'
          : rawStatus === 'refunded' || rawStatus === 'void' || rawStatus === 'voided'
          ? 'refunded'
          : 'completed';

      const explicitRef = String(row.reference || '').trim().slice(0, 64);
      const groupKey = explicitRef ? `REF_${explicitRef.toLowerCase()}` : `SINGLE_${idx}`;
      const paymentMethod = String(row.paymentMethod || 'Cash').trim().slice(0, 64) || 'Cash';

      const existingGroup = groupedByRef.get(groupKey);
      if (existingGroup) {
        existingGroup.items.push(...saleItems);
        existingGroup.subtotal += subtotalVal || finalTotal;
        existingGroup.discount += discountVal;
        existingGroup.total += finalTotal;
        if (!existingGroup.customerId && matchedCust?.id) {
          existingGroup.customerId = matchedCust.id;
        }
        if (existingGroup.paymentMethod === 'Cash' && paymentMethod !== 'Cash') {
          existingGroup.paymentMethod = paymentMethod;
        }
        if (status === 'pending' && existingGroup.status === 'completed') {
          existingGroup.status = 'pending';
        }
      } else {
        groupedByRef.set(groupKey, {
          reference: explicitRef || `IMP-${Date.now().toString().slice(-6)}-${groupedByRef.size + 1}`,
          ...(matchedCust ? { customerId: matchedCust.id } : {}),
          items: [...saleItems],
          subtotal: subtotalVal || finalTotal,
          discount: discountVal,
          total: finalTotal,
          paymentMethod,
          status,
          createdAt: createdIso,
        });
      }
    });

    for (const grp of groupedByRef.values()) {
      const sale: Sale = stripUndefined({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        ...(branchName ? { branchName } : {}),
        reference: grp.reference,
        ...(grp.customerId ? { customerId: grp.customerId } : {}),
        userId: user.uid,
        cashierId: user.uid,
        cashierName: user.name,
        items: grp.items.slice(0, 200),
        subtotal: grp.subtotal,
        discount: grp.discount,
        total: grp.total,
        paymentMethod: grp.paymentMethod,
        status: grp.status,
        createdAt: grp.createdAt,
      });

      salesToCreate.push(sale);

      if (options?.deductStock && grp.status !== 'refunded') {
        for (const item of grp.items) {
          if (item.productId === 'imported-item') continue;
          const baseProd = productUpdates.get(item.productId) || allProducts.find((p) => p.id === item.productId);
          if (baseProd) {
            const stockUpdate = applyBranchStockDelta(baseProd, effectiveBranchId, -item.quantity, branchIds);
            productUpdates.set(
              baseProd.id,
              stripUndefined({
                ...baseProd,
                currentStock: stockUpdate.currentStock,
                branchStock: stockUpdate.branchStock,
              })
            );
          }
        }
      }
    }

    if (salesToCreate.length === 0) {
      toast.error('No valid sales rows found to import.');
      return 0;
    }

    const updatedProductsList = Array.from(productUpdates.values());
    await localDb.transaction('rw', [localDb.sales, localDb.products, localDb.customers], async () => {
      await localDb.sales.bulkPut(salesToCreate);
      if (updatedProductsList.length > 0) {
        await localDb.products.bulkPut(updatedProductsList);
      }
      if (newCustomersToCreate.length > 0) {
        await localDb.customers.bulkPut(newCustomersToCreate);
      }
    });

    if (navigator.onLine) {
      for (const cust of newCustomersToCreate) {
        try {
          await setDoc(doc(db, `tenants/${tenant.id}/customers`, cust.id), cust);
        } catch {
          await localDb.syncQueue.add({
            tenantId: tenant.id,
            table: 'customers',
            action: 'create',
            data: cust,
            status: 'pending',
            createdAt: Date.now(),
          });
        }
      }
      const CHUNK_SIZE = 10;
      for (let i = 0; i < salesToCreate.length; i += CHUNK_SIZE) {
        await Promise.all(
          salesToCreate.slice(i, i + CHUNK_SIZE).map(async (sale) => {
            try {
              await setDoc(doc(db, `tenants/${tenant.id}/sales`, sale.id), sale);
            } catch {
              await localDb.syncQueue.add({
                tenantId: tenant.id,
                table: 'sales',
                action: 'create',
                data: sale,
                status: 'pending',
                createdAt: Date.now(),
              });
            }
          })
        );
      }
      for (const prod of updatedProductsList) {
        try {
          await setDoc(doc(db, `tenants/${tenant.id}/products`, prod.id), prod);
        } catch {
          await localDb.syncQueue.add({
            tenantId: tenant.id,
            table: 'products',
            action: 'update',
            data: prod,
            status: 'pending',
            createdAt: Date.now(),
          });
        }
      }
    } else {
      await localDb.syncQueue.bulkAdd([
        ...newCustomersToCreate.map((cust) => ({
          tenantId: tenant.id,
          table: 'customers' as const,
          action: 'create' as const,
          data: cust,
          status: 'pending' as const,
          createdAt: Date.now(),
        })),
        ...salesToCreate.map((sale) => ({
          tenantId: tenant.id,
          table: 'sales' as const,
          action: 'create' as const,
          data: sale,
          status: 'pending' as const,
          createdAt: Date.now(),
        })),
      ]);
    }

    void logWorkspaceAudit({
      tenantId: tenant.id,
      branchId: effectiveBranchId,
      actorId: user.uid,
      actorName: user.name,
      actorRole: user.role,
      action: 'SALE_BULK_IMPORT',
      entityType: 'sale',
      summary: `Imported ${salesToCreate.length} sale(s) via Smart Import${
        options?.deductStock ? ' (with stock deduction)' : ''
      }`,
    });

    toast.success(`Imported ${salesToCreate.length} sale${salesToCreate.length === 1 ? '' : 's'}`);
    return salesToCreate.length;
  };

  const bulkImportRefunds = async (
    rows: Array<Record<string, any>>,
    options?: { restoreStock?: boolean }
  ): Promise<number> => {
    if (!user || !tenant) return 0;
    if (!['admin', 'manager'].includes(user.role)) {
      toast.error('Only managers or admins can import refunds');
      return 0;
    }
    if (computeTrialState(tenant).isSoftLocked) {
      toast.error('Your trial has expired. Upgrade in Billing first.');
      return 0;
    }

    const [existingSales, allProducts, allBranches] = await Promise.all([
      localDb.sales.where('tenantId').equals(tenant.id).toArray(),
      localDb.products.where('tenantId').equals(tenant.id).toArray(),
      localDb.branches.where('tenantId').equals(tenant.id).toArray(),
    ]);
    const branchIds = allBranches.map((b) => b.id);
    const branchName = allBranches.find((b) => b.id === effectiveBranchId)?.name;

    let processed = 0;

    for (const row of rows) {
      const ref = String(row.reference || '').trim();
      const reason = String(row.refundReason || 'Imported customer refund').trim().slice(0, 300);
      const matchedSale = ref
        ? existingSales.find((s) => s.reference.toLowerCase() === ref.toLowerCase() && s.status !== 'refunded')
        : undefined;

      let refundDateIso = new Date().toISOString();
      if (row.refundDate) {
        const isoDate = normalizeIsoDate(row.refundDate);
        const d = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00Z`);
        if (!Number.isNaN(d.getTime())) refundDateIso = d.toISOString();
      }

      if (matchedSale) {
        if (options?.restoreStock) {
          const ok = await refundSale(matchedSale.id, reason);
          if (ok) processed++;
        } else {
          const updated: Sale = stripUndefined({
            ...matchedSale,
            status: 'refunded',
            refundedAt: refundDateIso,
            refundReason: reason,
          });
          await persistSaleAndSideEffects(updated, 'update', [], null);
          processed++;
        }
        continue;
      }

      const totalVal = Math.max(0, Number(row.total) || 0);
      if (totalVal <= 0) continue;

      const qty = Math.max(1, Number(row.quantity) || 1);
      const cleanItemName = String(row.itemName || '').trim().toLowerCase();
      const matchedProd = cleanItemName
        ? allProducts.find((p) => p.name.trim().toLowerCase() === cleanItemName) ||
          allProducts.find((p) => p.name.toLowerCase().includes(cleanItemName))
        : undefined;

      const refundRecord: Sale = stripUndefined({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        ...(branchName ? { branchName } : {}),
        reference: ref.slice(0, 64) || `REF-${Date.now().toString().slice(-6)}-${processed + 1}`,
        userId: user.uid,
        cashierId: user.uid,
        cashierName: user.name,
        items: [
          {
            productId: matchedProd?.id || 'imported-refund',
            name: String(row.itemName || matchedProd?.name || 'Refunded Item').slice(0, 150),
            quantity: qty,
            price: Math.round(totalVal / qty),
            costPrice: matchedProd?.buyingPrice || 0,
            total: totalVal,
          },
        ],
        subtotal: totalVal,
        discount: 0,
        total: totalVal,
        paymentMethod: String(row.paymentMethod || 'Cash').trim().slice(0, 64) || 'Cash',
        status: 'refunded',
        refundedAt: refundDateIso,
        refundReason: reason,
        createdAt: refundDateIso,
      });

      const restoredProducts: Product[] = [];
      if (options?.restoreStock && matchedProd) {
        const restored = applyBranchStockDelta(matchedProd, effectiveBranchId, qty, branchIds);
        restoredProducts.push(
          stripUndefined({
            ...matchedProd,
            currentStock: restored.currentStock,
            branchStock: restored.branchStock,
          })
        );
      }

      await persistSaleAndSideEffects(refundRecord, 'create', restoredProducts, null);
      processed++;
    }

    if (processed > 0) {
      void logWorkspaceAudit({
        tenantId: tenant.id,
        branchId: effectiveBranchId,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'REFUND_BULK_IMPORT',
        entityType: 'sale',
        summary: `Imported ${processed} refund record(s) via Smart Import`,
      });
      toast.success(`Imported ${processed} refund record${processed === 1 ? '' : 's'}`);
    } else {
      toast.error('No valid refund records found to import.');
    }
    return processed;
  };

  return {
    cart,
    heldCarts,
    addToCart,
    removeFromCart,
    updateQuantity,
    parkCurrentCart,
    resumeHeldCart,
    discardHeldCart,
    subtotal,
    taxAmount,
    taxConfig,
    total,
    discount: safeDiscount,
    setDiscount,
    customerId,
    setCustomerId,
    selectedCustomerType,
    processSale,
    refundSale,
    settlePendingSale,
    bulkImportSales,
    bulkImportRefunds,
    applyOrderDraft,
    clearCart,
    sales,
    isLoading,
  };
}
