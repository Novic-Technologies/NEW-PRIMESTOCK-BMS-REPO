import { AppSection, BusinessRole, User } from '../types';

export interface SectionDefinition {
  id: AppSection;
  label: string;
  path: string;
  description: string;
}

export const ALL_SECTIONS: SectionDefinition[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', description: 'Executive KPIs & revenue summary' },
  { id: 'pos', label: 'POS', path: '/pos', description: 'Point of sale & receipts' },
  { id: 'sales', label: 'Sales & Refunds', path: '/sales', description: 'Sales history, invoices & refunds' },
  { id: 'inventory', label: 'Inventory', path: '/inventory', description: 'Products, stock levels & transfers' },
  { id: 'purchases', label: 'Purchases', path: '/purchases', description: 'Supplier purchase orders' },
  { id: 'customers', label: 'Customers', path: '/customers', description: 'Customer directory & credit' },
  { id: 'suppliers', label: 'Suppliers', path: '/suppliers', description: 'Vendor directory & payables' },
  { id: 'finance', label: 'Finance', path: '/finance', description: 'Business expenses & cash flow' },
  { id: 'payroll', label: 'Payroll', path: '/payroll', description: 'Staff salaries, PAYE & NSSF' },
  { id: 'reports', label: 'Reports', path: '/reports', description: 'Profit, tax & analytics' },
  { id: 'shifts', label: 'Shifts & Audit', path: '/shifts', description: 'Cash register shifts & audit trail' },
  { id: 'ai', label: 'AI Copilot', path: '/ai', description: 'Smart inventory & restock insights' },
  { id: 'team', label: 'Team & Branches', path: '/team', description: 'Staff accounts, roles & branches' },
  { id: 'billing', label: 'Billing', path: '/billing', description: 'Subscription & plan payments' },
  { id: 'settings', label: 'Settings', path: '/settings', description: 'White-label branding & preferences' },
];

export const ALL_SECTION_IDS: AppSection[] = ALL_SECTIONS.map((s) => s.id);

export const ROLE_META: Record<
  BusinessRole,
  {
    label: string;
    summary: string;
    defaultSections: AppSection[];
  }
> = {
  admin: {
    label: 'Business Admin',
    summary: 'Full access to all business operations, staff accounts, billing & settings.',
    defaultSections: ALL_SECTION_IDS,
  },
  manager: {
    label: 'Manager',
    summary: 'Operations & branch management (no billing, white-label settings, or staff control).',
    defaultSections: [
      'dashboard',
      'pos',
      'sales',
      'inventory',
      'purchases',
      'customers',
      'suppliers',
      'reports',
      'shifts',
    ],
  },
  cashier: {
    label: 'Cashier',
    summary: 'Front-desk sales, finance counter & register shifts only.',
    defaultSections: ['finance', 'pos', 'sales', 'shifts'],
  },
  accountant: {
    label: 'Finance / Accountant',
    summary: 'Finance ledger, payroll & financial reports only.',
    defaultSections: ['finance', 'payroll', 'reports'],
  },
  inventory: {
    label: 'Inventory / Storekeeper',
    summary: 'Stock control, purchase orders & suppliers only.',
    defaultSections: ['inventory', 'purchases', 'suppliers'],
  },
};

export function getDefaultSectionsForRole(role: BusinessRole): AppSection[] {
  return [...(ROLE_META[role]?.defaultSections || ROLE_META.cashier.defaultSections)];
}

export function getUserAllowedSections(user: User | null | undefined): AppSection[] {
  if (!user) return [];
  if (user.role === 'admin') return ALL_SECTION_IDS;
  if (Array.isArray(user.allowedSections) && user.allowedSections.length > 0) {
    return user.allowedSections;
  }
  return getDefaultSectionsForRole(user.role);
}

export function hasSectionAccess(user: User | null | undefined, section: AppSection): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return getUserAllowedSections(user).includes(section);
}

export function getDefaultRouteForUser(user: User | null | undefined): string {
  if (!user) return '/login';
  if (user.role === 'admin') return '/';
  const allowed = getUserAllowedSections(user);
  for (const def of ALL_SECTIONS) {
    if (allowed.includes(def.id)) {
      return def.path;
    }
  }
  return '/finance';
}

export function getSectionForRoute(route?: string): AppSection | null {
  if (!route) return null;
  const match = ALL_SECTIONS.find((s) => s.path === route);
  return match ? match.id : null;
}

export function canManageInventoryData(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    user.role === 'manager' ||
    user.role === 'inventory' ||
    hasSectionAccess(user, 'inventory') ||
    hasSectionAccess(user, 'purchases')
  );
}

export function canManageFinanceData(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    user.role === 'accountant' ||
    hasSectionAccess(user, 'finance') ||
    hasSectionAccess(user, 'payroll')
  );
}

export async function hashEmailForRegistry(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')
  ).padEnd(64, '0');
}
