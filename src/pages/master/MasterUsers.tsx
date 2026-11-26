import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { useMasterAdmin, useMasterUsers } from '../../hooks/useMasterAdmin';
import { useAuthStore } from '../../store/authStore';
import { AppSection, Branch, BusinessRole, Tenant, User } from '../../types';
import { ALL_SECTIONS, ROLE_META, getDefaultSectionsForRole } from '../../utils/rbac';
import { formatDate } from '../../utils/format';
import { cn } from '../../lib/utils';
import { KpiValueSkeleton, MobileListSkeleton, TableRowsSkeleton } from '../../components/shared/Skeletons';
import toast from 'react-hot-toast';

const ROLES_LIST: BusinessRole[] = ['admin', 'manager', 'cashier', 'accountant', 'inventory'];

function escapeCsvCell(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default function MasterUsers() {
  const { user: currentUser } = useAuthStore();
  const { organizations } = useMasterAdmin();
  const {
    users,
    isLoading,
    isActing,
    fetchTenantBranches,
    updatePlatformUser,
    sendUserPasswordReset,
    deletePlatformUser,
  } = useMasterUsers();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | BusinessRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [tenantFilter, setTenantFilter] = useState<string>('all');

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<BusinessRole>('cashier');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [editBranchId, setEditBranchId] = useState('');
  const [editSections, setEditSections] = useState<AppSection[]>([]);
  const [tenantBranches, setTenantBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState('');

  const orgMap = useMemo(() => {
    const map = new Map<string, Tenant>();
    for (const org of organizations) {
      map.set(org.id, org);
    }
    return map;
  }, [organizations]);

  const sortedOrgs = useMemo(
    () => [...organizations].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [organizations]
  );

  const openEditor = async (target: User) => {
    setSelectedUser(target);
    setEditName(target.name || '');
    setEditEmail(target.email || '');
    setEditPhone(target.phone || '');
    setEditRole(target.role);
    setEditStatus(target.status);
    setEditBranchId(target.branchId || '');
    setEditSections(
      target.role === 'admin'
        ? []
        : Array.isArray(target.allowedSections) && target.allowedSections.length > 0
        ? [...target.allowedSections]
        : getDefaultSectionsForRole(target.role)
    );
    setConfirmDeleteEmail('');
    setTenantBranches([]);

    if (target.tenantId && target.tenantId !== 'platform') {
      setLoadingBranches(true);
      try {
        const list = await fetchTenantBranches(target.tenantId);
        setTenantBranches(list);
      } finally {
        setLoadingBranches(false);
      }
    }
  };

  useEffect(() => {
    if (!selectedUser) return;
    const stillExists = users.find((u) => u.uid === selectedUser.uid);
    if (!stillExists) {
      setSelectedUser(null);
    }
  }, [users, selectedUser]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (tenantFilter !== 'all' && u.tenantId !== tenantFilter) return false;
      if (!q) return true;

      const orgName =
        u.tenantId === 'platform'
          ? 'platform owner'
          : (orgMap.get(u.tenantId)?.name || '').toLowerCase();

      return (
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q) ||
        (u.uid || '').toLowerCase().includes(q) ||
        (u.tenantId || '').toLowerCase().includes(q) ||
        orgName.includes(q)
      );
    });
  }, [users, roleFilter, statusFilter, tenantFilter, searchQuery, orgMap]);

  const metrics = useMemo(() => {
    let active = 0;
    let inactive = 0;
    const tenantIds = new Set<string>();
    for (const u of users) {
      if (u.status === 'active') active += 1;
      else inactive += 1;
      if (u.tenantId && u.tenantId !== 'platform') tenantIds.add(u.tenantId);
    }
    return {
      total: users.length,
      active,
      inactive,
      businessesCount: tenantIds.size,
    };
  }, [users]);

  const handleExportCsv = () => {
    if (filteredUsers.length === 0) {
      toast.error('No user accounts match the current filter to export.');
      return;
    }
    const headers = [
      'Full Name',
      'Email',
      'Phone',
      'Role',
      'Status',
      'Business Name',
      'Tenant ID',
      'Branch ID',
      'Allowed Sections',
      'User UID',
      'Created At',
    ];
    const rows = filteredUsers.map((u) => {
      const bizName =
        u.tenantId === 'platform'
          ? 'Platform Owner'
          : orgMap.get(u.tenantId)?.name || 'Unlinked Workspace';
      const sections =
        u.role === 'admin'
          ? 'All Sections (Admin)'
          : (u.allowedSections && u.allowedSections.length > 0
              ? u.allowedSections
              : getDefaultSectionsForRole(u.role)
            ).join(' | ');
      return [
        u.name,
        u.email,
        u.phone || '',
        ROLE_META[u.role]?.label || u.role,
        u.status,
        bizName,
        u.tenantId,
        u.branchId || '',
        sections,
        u.uid,
        u.createdAt,
      ]
        .map(escapeCsvCell)
        .join(',');
    });
    const csvContent = [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `primestock-all-user-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredUsers.length} user account(s)`);
  };

  const handleSaveUserChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    const ok = await updatePlatformUser(selectedUser, {
      name: editName,
      email: editEmail,
      phone: editPhone,
      role: editRole,
      status: editStatus,
      branchId: editBranchId || null,
      allowedSections: editRole === 'admin' ? undefined : editSections,
    });
    if (ok) {
      setSelectedUser(null);
    }
  };

  const handleToggleSection = (secId: AppSection) => {
    setEditSections((prev) =>
      prev.includes(secId) ? prev.filter((id) => id !== secId) : [...prev, secId]
    );
  };

  const handleRoleChangeInModal = (nextRole: BusinessRole) => {
    setEditRole(nextRole);
    if (nextRole === 'admin') {
      setEditSections([]);
    } else {
      setEditSections(getDefaultSectionsForRole(nextRole));
    }
  };

  const handleCopyUid = async (uid: string) => {
    try {
      await navigator.clipboard.writeText(uid);
      toast.success('Copied User UID');
    } catch {
      toast.error('Clipboard unavailable');
    }
  };

  const isSelfUser = selectedUser?.uid === currentUser?.uid;
  const isPlatformUser = selectedUser?.tenantId === 'platform';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">All User Accounts</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Inspect every individual login across all businesses and modify credentials, roles, branch assignments, and access system-wide.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={isLoading || filteredUsers.length === 0}
          className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Download size={15} />
          Download CSV
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between text-text-muted text-xs font-semibold uppercase">
            <span>Total Accounts</span>
            <Users size={16} />
          </div>
          <p className="text-2xl font-bold text-primary font-mono tabular-nums mt-2">
            {isLoading ? <KpiValueSkeleton className="w-16" /> : metrics.total}
          </p>
          <p className="text-xs text-text-muted mt-1">Registered user profiles</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between text-text-muted text-xs font-semibold uppercase">
            <span>Active Logins</span>
            <UserCheck size={16} className="text-accent" />
          </div>
          <p className="text-2xl font-bold text-accent font-mono tabular-nums mt-2">
            {isLoading ? <KpiValueSkeleton className="w-16" /> : metrics.active}
          </p>
          <p className="text-xs text-text-muted mt-1">Enabled system accounts</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between text-text-muted text-xs font-semibold uppercase">
            <span>Deactivated</span>
            <UserX size={16} className="text-danger" />
          </div>
          <p className="text-2xl font-bold text-danger font-mono tabular-nums mt-2">
            {isLoading ? <KpiValueSkeleton className="w-14" /> : metrics.inactive}
          </p>
          <p className="text-xs text-text-muted mt-1">Access revoked immediately</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between text-text-muted text-xs font-semibold uppercase">
            <span>Businesses Linked</span>
            <Building2 size={16} />
          </div>
          <p className="text-2xl font-bold text-primary font-mono tabular-nums mt-2">
            {isLoading ? <KpiValueSkeleton className="w-14" /> : metrics.businessesCount}
          </p>
          <p className="text-xs text-text-muted mt-1">Unique merchant tenants</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by full name, login email, phone, UID, or business..."
            className="input pl-9 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 lg:w-auto shrink-0">
          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            aria-label="Filter by business"
            className="input text-xs py-2"
          >
            <option value="all">All Businesses</option>
            <option value="platform">Platform Owner</option>
            {sortedOrgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | BusinessRole)}
            aria-label="Filter by role"
            className="input text-xs py-2"
          >
            <option value="all">All Roles</option>
            {ROLES_LIST.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            aria-label="Filter by status"
            className="input text-xs py-2"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Deactivated Only</option>
          </select>
        </div>
      </div>

      {/* Desktop Data Grid & Mobile List */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <>
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <tbody>
                  <TableRowsSkeleton rows={7} columns={6} />
                </tbody>
              </table>
            </div>
            <div className="md:hidden p-4">
              <MobileListSkeleton cards={5} />
            </div>
          </>
        ) : filteredUsers.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users size={28} className="mx-auto text-text-muted" />
            <p className="text-sm font-semibold text-primary">No matching user accounts</p>
            <p className="text-xs text-text-muted max-w-md mx-auto">
              {users.length === 0
                ? 'User profiles will appear here automatically as business owners and staff members sign in.'
                : 'Try adjusting your search text, business filter, role, or status selection.'}
            </p>
            {(searchQuery || roleFilter !== 'all' || statusFilter !== 'all' || tenantFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setRoleFilter('all');
                  setStatusFilter('all');
                  setTenantFilter('all');
                }}
                className="btn btn-secondary text-xs mt-2"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-surface-alt/60 text-xs font-semibold text-text-muted">
                    <th className="py-3 px-4">User &amp; Login Details</th>
                    <th className="py-3 px-4">Business Workspace</th>
                    <th className="py-3 px-4">Role &amp; Access</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {filteredUsers.map((u) => {
                    const org = orgMap.get(u.tenantId);
                    const bizName =
                      u.tenantId === 'platform'
                        ? 'Platform Owner'
                        : org?.name || 'Unlinked Business';
                    const roleInfo = ROLE_META[u.role];
                    const sectionCount =
                      u.role === 'admin'
                        ? 'Full workspace access'
                        : `${(u.allowedSections && u.allowedSections.length > 0
                            ? u.allowedSections
                            : getDefaultSectionsForRole(u.role)
                          ).length} modules`;

                    return (
                      <tr key={u.uid} className="hover:bg-surface-alt/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-primary truncate max-w-[240px]">
                            {u.name || 'Unnamed User'}
                          </div>
                          <div className="text-xs text-text-secondary flex items-center gap-1.5 mt-0.5 truncate max-w-[260px]">
                            <Mail size={12} className="shrink-0 text-text-muted" />
                            <span className="truncate">{u.email || 'No email'}</span>
                          </div>
                          <div className="text-[11px] text-text-muted flex items-center gap-2 mt-0.5 font-mono tabular-nums">
                            {u.phone && (
                              <>
                                <span>{u.phone}</span>
                                <span aria-hidden="true">·</span>
                              </>
                            )}
                            <span title={u.uid}>UID: {u.uid.slice(0, 10)}…</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-medium text-primary truncate max-w-[220px]">
                            {bizName}
                          </div>
                          <div className="text-xs text-text-muted mt-0.5">
                            {u.tenantId === 'platform' ? (
                              <span>Master Governance</span>
                            ) : org ? (
                              <span>
                                {org.plan.toUpperCase()}
                                <span aria-hidden="true"> · </span>
                                {org.locked || org.status === 'locked' ? 'Locked' : org.status}
                              </span>
                            ) : (
                              <span className="font-mono text-[11px]">{u.tenantId.slice(0, 12)}</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-medium text-primary">
                            {roleInfo?.label || u.role}
                          </div>
                          <div className="text-xs text-text-muted mt-0.5">
                            {sectionCount}
                            {u.branchId ? ` · Branch ${u.branchId.slice(0, 8)}` : ''}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {u.status === 'active' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
                              <CheckCircle2 size={14} />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger">
                              <UserX size={14} />
                              Inactive
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-text-secondary whitespace-nowrap">
                          {formatDate(u.createdAt)}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditor(u)}
                              className="btn btn-secondary text-xs py-1.5 px-2.5 gap-1 whitespace-nowrap"
                            >
                              <Pencil size={13} />
                              Modify
                            </button>
                            {u.email && (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => sendUserPasswordReset(u.email)}
                                title={`Send password reset link to ${u.email}`}
                                aria-label={`Send password reset link to ${u.email}`}
                                className="btn btn-secondary text-xs py-1.5 px-2.5 whitespace-nowrap"
                              >
                                <KeyRound size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-border">
              {filteredUsers.map((u) => {
                const org = orgMap.get(u.tenantId);
                const bizName =
                  u.tenantId === 'platform' ? 'Platform Owner' : org?.name || 'Unlinked Business';
                return (
                  <div key={u.uid} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-primary truncate">{u.name || 'Unnamed User'}</p>
                        <p className="text-xs text-text-secondary truncate">{u.email || 'No email'}</p>
                      </div>
                      {u.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent shrink-0">
                          <CheckCircle2 size={13} />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger shrink-0">
                          <UserX size={13} />
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-primary font-medium">{bizName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ROLE_META[u.role]?.label || u.role}</span>
                      {u.phone && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{u.phone}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatDate(u.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openEditor(u)}
                        className="btn btn-secondary text-xs py-1.5 px-3 gap-1.5 flex-1"
                      >
                        <Pencil size={13} />
                        Modify Account
                      </button>
                      {u.email && (
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() => sendUserPasswordReset(u.email)}
                          className="btn btn-secondary text-xs py-1.5 px-3 gap-1.5"
                        >
                          <KeyRound size={13} />
                          Reset PW
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modify User Account Modal */}
      {selectedUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Modify ${selectedUser.name || 'User Account'}`}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 bg-[#0B1F3A] text-white flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-white truncate">
                  Modify Account · {selectedUser.name || selectedUser.email}
                </h2>
                <p className="text-xs text-slate-300 truncate">
                  {selectedUser.tenantId === 'platform'
                    ? 'Platform Owner'
                    : orgMap.get(selectedUser.tenantId)?.name || selectedUser.tenantId}{' '}
                  · Joined {formatDate(selectedUser.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUserChanges} className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* UID + Quick Reset */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-surface-alt border border-border">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase text-text-muted">Firebase User UID</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="text-xs font-mono text-primary truncate">{selectedUser.uid}</code>
                    <button
                      type="button"
                      onClick={() => handleCopyUid(selectedUser.uid)}
                      aria-label="Copy UID"
                      className="p-1 rounded hover:bg-surface text-text-muted hover:text-primary"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
                {selectedUser.email && (
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={() => sendUserPasswordReset(editEmail || selectedUser.email)}
                    className="btn btn-secondary text-xs py-2 px-3 gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <KeyRound size={14} />
                    Send Password Reset Email
                  </button>
                )}
              </div>

              {/* Profile & Login Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="mu-name" className="block text-xs font-bold text-primary mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="mu-name"
                    type="text"
                    required
                    maxLength={120}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="input text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="mu-email" className="block text-xs font-bold text-primary mb-1.5">
                    Email Address
                  </label>
                  <input
                    id="mu-email"
                    type="email"
                    required
                    maxLength={254}
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="input text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="mu-phone" className="block text-xs font-bold text-primary mb-1.5">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      id="mu-phone"
                      type="tel"
                      maxLength={30}
                      placeholder="+256 7XX XXX XXX"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="input pl-9 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="mu-status" className="block text-xs font-bold text-primary mb-1.5">
                    Account Status
                  </label>
                  <select
                    id="mu-status"
                    value={editStatus}
                    disabled={isSelfUser}
                    onChange={(e) => setEditStatus(e.target.value as 'active' | 'inactive')}
                    className="input text-sm"
                  >
                    <option value="active">Active (Can Sign In)</option>
                    <option value="inactive">Inactive (Session Revoked)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="mu-role" className="block text-xs font-bold text-primary mb-1.5">
                    Business Role
                  </label>
                  <select
                    id="mu-role"
                    value={editRole}
                    disabled={isPlatformUser}
                    onChange={(e) => handleRoleChangeInModal(e.target.value as BusinessRole)}
                    className="input text-sm"
                  >
                    {ROLES_LIST.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_META[r].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="mu-branch" className="block text-xs font-bold text-primary mb-1.5">
                    Assigned Branch
                  </label>
                  <select
                    id="mu-branch"
                    value={editBranchId}
                    disabled={isPlatformUser || loadingBranches}
                    onChange={(e) => setEditBranchId(e.target.value)}
                    className="input text-sm"
                  >
                    <option value="">All Branches / Unassigned</option>
                    {tenantBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} {b.isDefault ? '(Main)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Module Permissions */}
              {!isPlatformUser && editRole !== 'admin' && (
                <div className="border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-accent" />
                        Permitted Modules ({editSections.length})
                      </p>
                      <p className="text-[11px] text-text-muted">
                        Changes apply instantaneously across active browser sessions.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditSections(getDefaultSectionsForRole(editRole))}
                      className="text-xs font-semibold text-accent hover:underline"
                    >
                      Reset to {ROLE_META[editRole].label} Defaults
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ALL_SECTIONS.map((sec) => {
                      const checked = editSections.includes(sec.id);
                      return (
                        <label
                          key={sec.id}
                          className={cn(
                            'flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors',
                            checked
                              ? 'border-accent/50 bg-accent/10 text-primary'
                              : 'border-border bg-surface-alt/40 text-text-secondary hover:bg-surface-alt'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleSection(sec.id)}
                            className="mt-0.5 rounded border-border text-accent focus:ring-accent"
                          />
                          <span className="min-w-0">
                            <span className="font-semibold block">{sec.label}</span>
                            <span className="text-[11px] text-text-muted block truncate">
                              {sec.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {!isPlatformUser && editRole === 'admin' && (
                <div className="p-3 rounded-xl bg-accent/10 border border-accent/30 text-xs text-primary flex items-center gap-2">
                  <ShieldCheck size={16} className="text-accent shrink-0" />
                  <span>
                    Business Administrators automatically have full access to all 16 business modules.
                  </span>
                </div>
              )}

              {/* Remove Account Directory Record */}
              {!isSelfUser && !isPlatformUser && (
                <div className="p-4 rounded-xl border border-danger/30 bg-danger/5 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert size={17} className="text-danger shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-danger">Remove User Profile Record</p>
                      <p className="text-[11px] text-text-secondary mt-0.5">
                        Deletes this user&apos;s Firestore directory record and email lock so they are removed from the workspace. Type{' '}
                        <code className="font-mono font-bold">{selectedUser.email}</code> to confirm.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={confirmDeleteEmail}
                      onChange={(e) => setConfirmDeleteEmail(e.target.value)}
                      placeholder={`Type ${selectedUser.email}`}
                      className="input text-xs flex-1"
                    />
                    <button
                      type="button"
                      disabled={
                        isActing ||
                        confirmDeleteEmail.trim().toLowerCase() !==
                          (selectedUser.email || '').trim().toLowerCase()
                      }
                      onClick={async () => {
                        const deleted = await deletePlatformUser(selectedUser);
                        if (deleted) setSelectedUser(null);
                      }}
                      className="btn bg-danger text-white hover:bg-danger/90 disabled:opacity-40 text-xs py-2 px-3 gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Trash2 size={14} />
                      Remove User Record
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="btn btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActing || (!isPlatformUser && editRole !== 'admin' && editSections.length === 0)}
                  className="btn btn-primary text-xs py-2 px-5"
                >
                  {isActing ? 'Saving Changes...' : 'Save Account Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
