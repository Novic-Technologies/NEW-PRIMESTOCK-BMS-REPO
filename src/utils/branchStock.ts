import { Product } from '../types';

/**
 * Resolves effective stock for a product either across all branches or for a specific branch.
 */
export function getEffectiveStock(product: Product, branchId?: string | null): number {
  if (!branchId || !product.branchStock) {
    return product.currentStock ?? 0;
  }
  if (branchId in product.branchStock) {
    return product.branchStock[branchId] ?? 0;
  }
  // Legacy products created before per-branch stock inherit currentStock for the first/default branch
  return product.currentStock ?? 0;
}

/**
 * Returns updated branchStock map and recalculated total currentStock.
 */
export function applyBranchStockDelta(
  product: Product,
  branchId: string | null | undefined,
  delta: number,
  allBranchIds?: string[]
): { currentStock: number; branchStock?: Record<string, number> } {
  if (!branchId) {
    return {
      currentStock: Math.max(0, (product.currentStock || 0) + delta),
      branchStock: product.branchStock,
    };
  }

  const existingMap: Record<string, number> = { ...(product.branchStock || {}) };
  if (!(branchId in existingMap)) {
    // Seed this branch with currentStock if branchStock was never initialized
    if (Object.keys(existingMap).length === 0) {
      existingMap[branchId] = product.currentStock || 0;
    } else {
      existingMap[branchId] = 0;
    }
  }

  existingMap[branchId] = Math.max(0, (existingMap[branchId] || 0) + delta);

  // Sum all tracked branches (ensuring newly added branches don't zero out untracked initial stock)
  const trackedKeys = allBranchIds && allBranchIds.length > 0
    ? Array.from(new Set([...Object.keys(existingMap), ...allBranchIds]))
    : Object.keys(existingMap);

  const total = trackedKeys.reduce((sum, key) => sum + (existingMap[key] || 0), 0);

  return {
    currentStock: Math.max(0, total),
    branchStock: existingMap,
  };
}
