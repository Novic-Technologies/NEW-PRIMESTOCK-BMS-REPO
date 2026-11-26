import { localDb } from '../services/db';
import { User } from '../types';
import { hasSectionAccess } from './rbac';
import { hasHookCache, setHookCache } from './hookCache';

const warmedScopes = new Set<string>();

/**
 * Warms module-level hook caches from IndexedDB in parallel during idle time
 * so even the very first click to any permitted section renders instantaneously.
 */
export async function warmPermittedHookCaches(
  tenantId: string | undefined,
  user: User | null | undefined
): Promise<void> {
  if (!tenantId || !user || tenantId === 'platform') return;
  const scopeKey = `${tenantId}:${user.uid}`;
  if (warmedScopes.has(scopeKey)) return;
  warmedScopes.add(scopeKey);

  const tasks: Array<Promise<void>> = [];

  if (!hasHookCache('branches', tenantId)) {
    tasks.push(
      localDb.branches
        .where('tenantId')
        .equals(tenantId)
        .toArray()
        .then((items) => {
          const sorted = [...items].sort((a, b) => {
            if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
            return a.createdAt.localeCompare(b.createdAt);
          });
          setHookCache('branches', tenantId, sorted);
        })
        .catch(() => {})
    );
  }

  if (hasSectionAccess(user, 'inventory') || hasSectionAccess(user, 'pos') || hasSectionAccess(user, 'dashboard') || hasSectionAccess(user, 'reports')) {
    if (!hasHookCache('products', tenantId)) {
      tasks.push(
        localDb.products
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) =>
            setHookCache('products', tenantId, [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          )
          .catch(() => {})
      );
    }
  }

  if (hasSectionAccess(user, 'pos') || hasSectionAccess(user, 'sales') || hasSectionAccess(user, 'dashboard') || hasSectionAccess(user, 'reports') || hasSectionAccess(user, 'shifts')) {
    if (!hasHookCache('sales', tenantId)) {
      tasks.push(
        localDb.sales
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) =>
            setHookCache('sales', tenantId, [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          )
          .catch(() => {})
      );
    }
  }

  if (hasSectionAccess(user, 'customers') || hasSectionAccess(user, 'pos') || hasSectionAccess(user, 'sales') || hasSectionAccess(user, 'dashboard')) {
    if (!hasHookCache('customers', tenantId)) {
      tasks.push(
        localDb.customers
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) =>
            setHookCache('customers', tenantId, [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          )
          .catch(() => {})
      );
    }
  }

  if (hasSectionAccess(user, 'finance') || hasSectionAccess(user, 'dashboard') || hasSectionAccess(user, 'reports')) {
    if (!hasHookCache('expenses', tenantId)) {
      tasks.push(
        localDb.expenses
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) =>
            setHookCache('expenses', tenantId, [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          )
          .catch(() => {})
      );
    }
  }

  if (hasSectionAccess(user, 'suppliers') || hasSectionAccess(user, 'purchases')) {
    if (!hasHookCache('suppliers', tenantId)) {
      tasks.push(
        localDb.suppliers
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) =>
            setHookCache('suppliers', tenantId, [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          )
          .catch(() => {})
      );
    }
    if (!hasHookCache('purchaseOrders', tenantId)) {
      tasks.push(
        localDb.purchaseOrders
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) =>
            setHookCache('purchaseOrders', tenantId, [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          )
          .catch(() => {})
      );
    }
  }

  if (hasSectionAccess(user, 'shifts') || hasSectionAccess(user, 'pos')) {
    if (!hasHookCache('shifts', tenantId)) {
      tasks.push(
        localDb.shifts
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) =>
            setHookCache('shifts', tenantId, [...items].sort((a, b) => b.openedAt.localeCompare(a.openedAt)))
          )
          .catch(() => {})
      );
    }
  }

  if (hasSectionAccess(user, 'inventory')) {
    if (!hasHookCache('stockTransfers', tenantId)) {
      tasks.push(
        localDb.stockTransfers
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) =>
            setHookCache('stockTransfers', tenantId, [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          )
          .catch(() => {})
      );
    }
    if (!hasHookCache('stockAdjustments', tenantId)) {
      tasks.push(
        localDb.stockAdjustments
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) =>
            setHookCache('stockAdjustments', tenantId, [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          )
          .catch(() => {})
      );
    }
  }

  if (hasSectionAccess(user, 'payroll')) {
    if (!hasHookCache('payrollRuns', tenantId)) {
      tasks.push(
        localDb.payrollRuns
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) =>
            setHookCache('payrollRuns', tenantId, [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          )
          .catch(() => {})
      );
    }
  }

  if (hasSectionAccess(user, 'billing')) {
    if (!hasHookCache('billingHistory', tenantId)) {
      tasks.push(
        localDb.billingHistory
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) =>
            setHookCache('billingHistory', tenantId, [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          )
          .catch(() => {})
      );
    }
  }

  if (hasSectionAccess(user, 'customers') || hasSectionAccess(user, 'suppliers')) {
    if (!hasHookCache('creditPayments', tenantId)) {
      tasks.push(
        localDb.creditPayments
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) =>
            setHookCache('creditPayments', tenantId, [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          )
          .catch(() => {})
      );
    }
  }

  if (hasSectionAccess(user, 'team') || hasSectionAccess(user, 'pos')) {
    if (!hasHookCache('members', tenantId)) {
      tasks.push(
        localDb.members
          .where('tenantId')
          .equals(tenantId)
          .toArray()
          .then((items) => {
            if (items.length > 0) {
              setHookCache('members', tenantId, [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
            }
          })
          .catch(() => {})
      );
    }
  }

  await Promise.all(tasks);
}

export function resetWarmedHookScopes(): void {
  warmedScopes.clear();
}
