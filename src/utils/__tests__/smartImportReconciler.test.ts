import { describe, expect, it, vi } from 'vitest';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('../../services/db', () => ({ localDb: {} }));

import { reconcileSmartImportRows } from '../smartImportReconciler';
import { Customer, Expense, Product, PurchaseOrder, Sale, Supplier } from '../../types';

describe('Smart Import Cross-Document Reconciler', () => {
  const products: Product[] = [
    {
      id: 'p-1',
      tenantId: 't-1',
      name: 'Kibimba Rice 5kg',
      sku: 'RICE-5KG',
      barcode: '6001234567890',
      category: 'Grains',
      buyingPrice: 18000,
      sellingPrice: 22000,
      currentStock: 40,
      minStockLevel: 10,
      unit: 'bag',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  const customers: Customer[] = [
    {
      id: 'c-1',
      tenantId: 't-1',
      name: 'Kato Mini Mart',
      phone: '+256772123456',
      type: 'Business',
      creditLimit: 500000,
      currentBalance: 120000,
      loyaltyPoints: 0,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  const suppliers: Supplier[] = [
    {
      id: 's-1',
      tenantId: 't-1',
      name: 'Kampala Millers Ltd',
      phone: '0701999888',
      category: 'Grains',
      currentBalance: 0,
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  const sales: Sale[] = [
    {
      id: 'sale-1',
      tenantId: 't-1',
      reference: 'REC-1001',
      userId: 'u-1',
      items: [],
      subtotal: 44000,
      discount: 0,
      taxAmount: 0,
      total: 44000,
      paymentMethod: 'Cash',
      cashierId: 'u-1',
      cashierName: 'Staff',
      createdAt: '2026-02-01T10:00:00Z',
      status: 'completed',
    },
  ];

  const purchases: PurchaseOrder[] = [
    {
      id: 'po-1',
      tenantId: 't-1',
      reference: 'PO-900',
      supplierId: 's-1',
      supplierName: 'Kampala Millers Ltd',
      items: [],
      totalAmount: 1800000,
      paidAmount: 0,
      status: 'ordered',
      createdBy: 'u-1',
      createdAt: '2026-02-01T10:00:00Z',
    },
  ];

  const expenses: Expense[] = [
    {
      id: 'exp-1',
      tenantId: 't-1',
      category: 'Utilities',
      description: 'UMEME Electricity Bill',
      amount: 250000,
      paymentMethod: 'MTN Mobile Money',
      expenseDate: '2026-02-05',
      recordedBy: 'Admin',
      createdAt: '2026-02-05T10:00:00Z',
    },
  ];

  it('classifies product rows into create, skip, and conflict by SKU/price changes', () => {
    const res = reconcileSmartImportRows(
      'products',
      [
        { name: 'Fresh Milk 1L', sku: 'MILK-1L', buyingPrice: 2800, sellingPrice: 3500, currentStock: 20 },
        { name: 'Kibimba Rice 5kg', sku: 'RICE-5KG', buyingPrice: 18000, sellingPrice: 22000, currentStock: 40 },
        { name: 'Kibimba Rice 5kg', sku: 'rice-5kg', buyingPrice: 19000, sellingPrice: 24000, currentStock: 50 },
      ],
      { products }
    );

    expect(res[0].action).toBe('create');
    expect(res[1].action).toBe('skip');
    expect(res[2].action).toBe('conflict');
    expect(res[2].matchedRecordId).toBe('p-1');
    expect(res[2].conflictFields?.map((c) => c.field)).toEqual([
      'sellingPrice',
      'buyingPrice',
      'currentStock',
    ]);
  });

  it('matches customers by normalized 9-digit phone suffix and flags balance conflicts', () => {
    const res = reconcileSmartImportRows(
      'customers',
      [
        { name: 'Kato Mini Mart', phone: '0772123456', currentBalance: 120000 },
        { name: 'Kato Mini Mart Ltd', phone: '256772123456', currentBalance: 200000 },
        { name: 'New Shopper', phone: '0782000111', currentBalance: 0 },
      ],
      { customers }
    );

    expect(res[0].action).toBe('link');
    expect(res[1].action).toBe('conflict');
    expect(res[1].conflictFields).toHaveLength(2);
    expect(res[2].action).toBe('create');
  });

  it('links matching suppliers and detects duplicate sales, POs, refunds, and expenses', () => {
    const supRes = reconcileSmartImportRows(
      'suppliers',
      [{ name: 'Kampala Millers Ltd', phone: '+256701999888' }],
      { suppliers }
    );
    expect(supRes[0].action).toBe('link');

    const salesRes = reconcileSmartImportRows(
      'sales',
      [{ reference: 'rec-1001', total: 44000 }, { reference: 'REC-1002', total: 15000 }],
      { sales }
    );
    expect(salesRes[0].action).toBe('conflict');
    expect(salesRes[1].action).toBe('create');

    const refundRes = reconcileSmartImportRows(
      'refunds',
      [{ reference: 'REC-1001', total: 44000 }],
      { sales }
    );
    expect(refundRes[0].action).toBe('link');

    const poRes = reconcileSmartImportRows(
      'purchases',
      [{ reference: 'PO-900', totalAmount: 1900000 }],
      { purchases }
    );
    expect(poRes[0].action).toBe('conflict');

    const expRes = reconcileSmartImportRows(
      'expenses',
      [
        { description: 'UMEME Electricity Bill', amount: 250000, expenseDate: '2026-02-05' },
        { description: 'Water NWSC', amount: 85000, expenseDate: '2026-02-06' },
      ],
      { expenses }
    );
    expect(expRes[0].action).toBe('conflict');
    expect(expRes[1].action).toBe('create');
  });
});
