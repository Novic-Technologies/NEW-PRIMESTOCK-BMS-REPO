import { describe, expect, it } from 'vitest';
import {
  computeVatAndTotals,
  convertCurrencyToUgx,
  deductFefoBatches,
  getNextExpiringBatch,
  getTotalBatchStock,
  restoreFefoBatches,
} from '../inventoryMath';
import { ProductBatch } from '../../types';

describe('FEFO Batch Stock & Currency/VAT Math', () => {
  const sampleBatches: ProductBatch[] = [
    {
      id: 'b-later',
      batchNumber: 'LOT-NOV',
      expiryDate: '2026-11-30',
      quantity: 10,
      branchId: 'branch-main',
      receivedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'b-soon',
      batchNumber: 'LOT-MAY',
      expiryDate: '2026-05-15',
      quantity: 4,
      branchId: 'branch-main',
      receivedAt: '2026-01-02T00:00:00Z',
    },
    {
      id: 'b-other-branch',
      batchNumber: 'LOT-APR',
      expiryDate: '2026-04-01',
      quantity: 6,
      branchId: 'branch-entebbe',
      receivedAt: '2026-01-03T00:00:00Z',
    },
  ];

  it('sums batch stock with optional branch scoping', () => {
    expect(getTotalBatchStock(sampleBatches)).toBe(20);
    expect(getTotalBatchStock(sampleBatches, 'branch-main')).toBe(14);
    expect(getTotalBatchStock(sampleBatches, 'branch-entebbe')).toBe(6);
  });

  it('deducts earliest-expiring branch batches first (FEFO) and updates next expiry', () => {
    const result = deductFefoBatches(sampleBatches, 6, 'branch-main');

    expect(result.deducted).toBe(6);
    expect(result.updatedBatches.find((b) => b.id === 'b-soon')).toBeUndefined();
    expect(result.updatedBatches.find((b) => b.id === 'b-later')?.quantity).toBe(8);
    expect(result.updatedBatches.find((b) => b.id === 'b-other-branch')?.quantity).toBe(6);
    expect(result.nextBatchNumber).toBe('LOT-NOV');
    expect(result.nextExpiryDate).toBe('2026-11-30');
  });

  it('falls back cleanly when deducting more than available in active batches', () => {
    const result = deductFefoBatches([sampleBatches[1]], 10, 'branch-main');
    expect(result.deducted).toBe(4);
    expect(result.updatedBatches).toHaveLength(0);
    expect(result.nextBatchNumber).toBeUndefined();
  });

  it('restores returned quantity to matching branch batch or creates a fallback return lot', () => {
    const restoredExisting = restoreFefoBatches(sampleBatches, 3, 'branch-main');
    expect(getTotalBatchStock(restoredExisting.updatedBatches, 'branch-main')).toBe(17);

    const restoredNewLot = restoreFefoBatches([], 5, 'branch-kampala', {
      batchNumber: 'LOT-RET-1',
      expiryDate: '2026-09-01',
    });
    expect(restoredNewLot.updatedBatches).toHaveLength(1);
    expect(restoredNewLot.nextBatchNumber).toBe('LOT-RET-1');
    expect(getNextExpiringBatch(restoredNewLot.updatedBatches, 'branch-kampala')?.quantity).toBe(5);
  });

  it('converts USD and KES to UGX using custom or default exchange rates', () => {
    expect(convertCurrencyToUgx(50000, 'UGX')).toBe(50000);
    expect(convertCurrencyToUgx(100, 'USD')).toBe(370000);
    expect(convertCurrencyToUgx(100, 'USD', 3850)).toBe(385000);
    expect(convertCurrencyToUgx(1000, 'KES', 29)).toBe(29000);
    expect(convertCurrencyToUgx(-10, 'USD')).toBe(0);
  });

  it('computes 18% VAT across disabled, tax-inclusive, and tax-exclusive modes', () => {
    expect(
      computeVatAndTotals({ subtotal: 118000, discount: 0, taxEnabled: false })
    ).toEqual({ taxAmount: 0, netTotal: 118000, netExclTax: 118000 });

    expect(
      computeVatAndTotals({
        subtotal: 118000,
        discount: 0,
        taxEnabled: true,
        taxRate: 18,
        taxInclusive: true,
      })
    ).toEqual({ taxAmount: 18000, netTotal: 118000, netExclTax: 100000 });

    expect(
      computeVatAndTotals({
        subtotal: 120000,
        discount: 20000,
        taxEnabled: true,
        taxRate: 18,
        taxInclusive: false,
      })
    ).toEqual({ taxAmount: 18000, netTotal: 118000, netExclTax: 100000 });
  });
});
