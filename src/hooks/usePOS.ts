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
import { applyBranchStockDelta, getEffectiveStock } from '../utils/branchStock';
import { logWorkspaceAudit } from './useAuditLog';
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
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [selectedCustomerType, setSelectedCustomerType] = useState<Customer['type'] | undefined>(undefined);

  const effectiveBranchId =
    activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : user?.branchId || undefined;

  useEffect(() => {
    if (!tenant) {
      setSales([]);
      setHeldCarts([]);
      return;
    }

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
      },
      error: (err) => console.error('Load sales error:', err),
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
    }
  ): Promise<Sale | undefined> => {
    if (!user || !tenant || cart.length === 0) return undefined;

    const trialState = computeTrialState(tenant);
    if (trialState.isSoftLocked) {
      toast.error('Your 14-day trial has expired. Upgrade in Billing to resume POS checkout.');
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
        summary: `${sale.reference} — UGX ${sale.total.toLocaleString()} (${sale.paymentMethod})`,
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
    clearCart,
    sales,
  };
}
