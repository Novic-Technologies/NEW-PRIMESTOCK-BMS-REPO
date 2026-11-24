import { ProductBatch } from '../types';

export function getTotalBatchStock(batches?: ProductBatch[], branchId?: string | null): number {
  if (!Array.isArray(batches) || batches.length === 0) return 0;
  return batches.reduce((sum, b) => {
    if (branchId && branchId !== 'ALL' && b.branchId && b.branchId !== branchId) {
      return sum;
    }
    return sum + Math.max(0, Number(b.quantity) || 0);
  }, 0);
}

function getBatchExpiryTimestamp(expiryDate?: string): number {
  if (!expiryDate) return Number.POSITIVE_INFINITY;
  const ts = new Date(expiryDate).getTime();
  return Number.isNaN(ts) ? Number.POSITIVE_INFINITY : ts;
}

export function getNextExpiringBatch(
  batches?: ProductBatch[],
  branchId?: string | null
): ProductBatch | undefined {
  if (!Array.isArray(batches) || batches.length === 0) return undefined;
  const active = batches
    .filter((b) => {
      const hasQty = (Number(b.quantity) || 0) > 0;
      const matchesBranch = !branchId || branchId === 'ALL' || !b.branchId || b.branchId === branchId;
      return hasQty && matchesBranch;
    })
    .sort((a, b) => getBatchExpiryTimestamp(a.expiryDate) - getBatchExpiryTimestamp(b.expiryDate));
  return active[0];
}

export function deductFefoBatches(
  batches: ProductBatch[],
  qtyToDeduct: number,
  branchId?: string | null
): {
  updatedBatches: ProductBatch[];
  deducted: number;
  nextExpiryDate?: string;
  nextBatchNumber?: string;
} {
  if (!Array.isArray(batches) || batches.length === 0 || qtyToDeduct <= 0) {
    return { updatedBatches: batches || [], deducted: 0 };
  }

  const cloned = batches.map((b) => ({ ...b }));
  const eligibleIndices = cloned
    .map((b, idx) => ({ b, idx }))
    .filter(({ b }) => {
      const hasQty = (Number(b.quantity) || 0) > 0;
      if (!hasQty) return false;
      if (!branchId || branchId === 'ALL') return true;
      return !b.branchId || b.branchId === branchId;
    })
    .sort((x, y) => {
      // Prefer exact branch match first when branchId provided, then earliest expiry (FEFO)
      if (branchId && branchId !== 'ALL') {
        const xExact = x.b.branchId === branchId ? 0 : 1;
        const yExact = y.b.branchId === branchId ? 0 : 1;
        if (xExact !== yExact) return xExact - yExact;
      }
      return getBatchExpiryTimestamp(x.b.expiryDate) - getBatchExpiryTimestamp(y.b.expiryDate);
    });

  let remaining = qtyToDeduct;
  let totalDeducted = 0;

  for (const { idx } of eligibleIndices) {
    if (remaining <= 0) break;
    const avail = Math.max(0, Number(cloned[idx].quantity) || 0);
    const take = Math.min(avail, remaining);
    cloned[idx].quantity = avail - take;
    remaining -= take;
    totalDeducted += take;
  }

  const activeRemaining = cloned.filter((b) => (Number(b.quantity) || 0) > 0);
  const nextBatch = getNextExpiringBatch(activeRemaining, branchId);

  return {
    updatedBatches: activeRemaining,
    deducted: totalDeducted,
    nextExpiryDate: nextBatch?.expiryDate,
    nextBatchNumber: nextBatch?.batchNumber,
  };
}

export function restoreFefoBatches(
  batches: ProductBatch[],
  qtyToRestore: number,
  branchId?: string | null,
  fallbackBatch?: { batchNumber?: string; expiryDate?: string }
): {
  updatedBatches: ProductBatch[];
  nextExpiryDate?: string;
  nextBatchNumber?: string;
} {
  if (qtyToRestore <= 0) {
    const next = getNextExpiringBatch(batches, branchId);
    return {
      updatedBatches: batches || [],
      nextExpiryDate: next?.expiryDate,
      nextBatchNumber: next?.batchNumber,
    };
  }

  const cloned = (batches || []).map((b) => ({ ...b }));
  const targetIdx = cloned.findIndex(
    (b) => !branchId || branchId === 'ALL' || !b.branchId || b.branchId === branchId
  );

  if (targetIdx >= 0) {
    cloned[targetIdx].quantity = (Number(cloned[targetIdx].quantity) || 0) + qtyToRestore;
  } else {
    cloned.push({
      id: `return-${Date.now()}`,
      batchNumber: fallbackBatch?.batchNumber || 'RETURN-LOT',
      expiryDate: fallbackBatch?.expiryDate,
      quantity: qtyToRestore,
      branchId: branchId && branchId !== 'ALL' ? branchId : undefined,
      receivedAt: new Date().toISOString(),
    });
  }

  const next = getNextExpiringBatch(cloned, branchId);
  return {
    updatedBatches: cloned,
    nextExpiryDate: next?.expiryDate,
    nextBatchNumber: next?.batchNumber,
  };
}

const DEFAULT_RATES_TO_UGX: Record<'UGX' | 'USD' | 'KES', number> = {
  UGX: 1,
  USD: 3700,
  KES: 28.5,
};

export function convertCurrencyToUgx(
  amount: number,
  currency: 'UGX' | 'USD' | 'KES' = 'UGX',
  customRateToUgx?: number
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (currency === 'UGX') return Math.round(amount);
  const rate =
    customRateToUgx && customRateToUgx > 0
      ? customRateToUgx
      : DEFAULT_RATES_TO_UGX[currency] || 1;
  return Math.round(amount * rate);
}

export function computeVatAndTotals(params: {
  subtotal: number;
  discount: number;
  taxEnabled?: boolean;
  taxRate?: number;
  taxInclusive?: boolean;
}): {
  taxAmount: number;
  netTotal: number;
  netExclTax: number;
} {
  const afterDiscount = Math.max(0, Math.round((params.subtotal || 0) - (params.discount || 0)));
  if (!params.taxEnabled) {
    return { taxAmount: 0, netTotal: afterDiscount, netExclTax: afterDiscount };
  }
  const rate = params.taxRate ?? 18;
  if (params.taxInclusive !== false) {
    const taxAmount = Math.round(afterDiscount * (rate / (100 + rate)));
    return {
      taxAmount,
      netTotal: afterDiscount,
      netExclTax: Math.max(0, afterDiscount - taxAmount),
    };
  }
  const taxAmount = Math.round(afterDiscount * (rate / 100));
  return {
    taxAmount,
    netTotal: afterDiscount + taxAmount,
    netExclTax: afterDiscount,
  };
}
