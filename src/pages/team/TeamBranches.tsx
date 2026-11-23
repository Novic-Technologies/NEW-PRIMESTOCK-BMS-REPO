import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  UsersRound,
  Plus,
  Trash2,
  X,
  UserPlus,
  CheckCircle2,
  Mail,
  Shield,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  KeyRound,
  Lock,
  Pencil,
} from 'lucide-react';
import { useBranches } from '../../hooks/useBranches';
import { useTeam } from '../../hooks/useTeam';
import { useAuthStore } from '../../store/authStore';
import { formatDate } from '../../utils/format';
import { getEffectivePlanQuota, isQuotaExceeded } from '../../utils/planLimits';
import {
  ALL_SECTIONS,
  getDefaultSectionsForRole,
  getUserAllowedSections,
  hashStaffPin,
  isValidPinFormat,
  ROLE_META,
} from '../../utils/rbac';
import { AppSection, BusinessRole, TenantMember } from '../../types';
import { MobileListSkeleton, TableRowsSkeleton } from '../../components/shared/Skeletons';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

const ASSIGNABLE_ROLES: BusinessRole[] = [
  'cashier',
  'accountant',
  'inventory',
  'manager',
  'admin',
];

export default function TeamBranches() {
  const { tenant, user } = useAuthStore();
  const { branches, activeBranchId, setActiveBranchId, addBranch, updateBranch, deleteBranch } = useBranches();
  const {
    members,
    invites,
    isLoading,
    inviteStaff,
    createStaffAccount,
    revokeInvite,
    updateMember,
    removeInactiveMember,
  } = useTeam();

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState({ name: '', location: '', phone: '' });

  // Staff Add Modal (Create Account directly OR Send Invite Link)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [staffMode, setStaffMode] = useState<'create' | 'invite'>('create');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);
  const [staffFormError, setStaffFormError] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState<{
    name: string;
    email: string;
    password: string;
    posPin: string;
    role: BusinessRole;
    branchId: string;
    allowedSections: AppSection[];
  }>({
    name: '',
    email: '',
    password: '',
    posPin: '',
    role: 'cashier',
    branchId: activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : '',
    allowedSections: getDefaultSectionsForRole('cashier'),
  });

  // Member Section Access Editor Modal
  const [editingAccessMember, setEditingAccessMember] = useState<TenantMember | null>(null);
  const [editingSections, setEditingSections] = useState<AppSection[]>([]);
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  // Member 4-Digit POS PIN Modal & Remove Inactive Confirmation Modal
  const [editingPinMember, setEditingPinMember] = useState<TenantMember | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TenantMember | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';
  const planQuota = getEffectivePlanQuota(tenant);
  const activeSeatCount =
    members.filter((m) => m.status === 'active').length +
    invites.filter((i) => i.status === 'pending').length;
  const seatLimitReached = isQuotaExceeded(activeSeatCount, planQuota.maxUsers);
  const branchLimitReached = isQuotaExceeded(branches.length, planQuota.maxBranches);

  const openStaffModal = () => {
    if (seatLimitReached) {
      toast.error(
        `${planQuota.name} plan allows up to ${planQuota.maxUsers} staff users. Upgrade in Billing to add more.`
      );
      return;
    }
    setStaffFormError(null);
    setShowStaffPassword(false);
    setStaffForm({
      name: '',
      email: '',
      password: '',
      posPin: '',
      role: 'cashier',
      branchId: activeBranchId && activeBranchId !== 'ALL' ? activeBranchId : '',
      allowedSections: getDefaultSectionsForRole('cashier'),
    });
    setIsStaffModalOpen(true);
  };

  const handleStaffRoleChange = (nextRole: BusinessRole) => {
    setStaffForm((prev) => ({
      ...prev,
      role: nextRole,
      allowedSections: getDefaultSectionsForRole(nextRole),
    }));
  };

  const toggleStaffFormSection = (sectionId: AppSection) => {
    setStaffForm((prev) => {
      const exists = prev.allowedSections.includes(sectionId);
      if (exists && prev.allowedSections.length === 1) {
        toast.error('Staff must have access to at least one section');
        return prev;
      }
      return {
        ...prev,
        allowedSections: exists
          ? prev.allowedSections.filter((s) => s !== sectionId)
          : [...prev.allowedSections, sectionId],
      };
    });
  };

  const openAddBranchModal = () => {
    if (branchLimitReached) {
      toast.error(
        `${planQuota.name} plan allows up to ${planQuota.maxBranches} branch${
          planQuota.maxBranches === 1 ? '' : 'es'
        }. Upgrade in Billing.`
      );
      return;
    }
    setEditingBranchId(null);
    setBranchForm({ name: '', location: '', phone: '' });
    setIsBranchModalOpen(true);
  };

  const openEditBranchModal = (branch: (typeof branches)[number]) => {
    setEditingBranchId(branch.id);
    setBranchForm({
      name: branch.name,
      location: branch.location,
      phone: branch.phone || '',
    });
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchForm.name.trim() || !branchForm.location.trim()) {
      toast.error('Branch name and location are required');
      return;
    }
    if (editingBranchId) {
      const updated = await updateBranch(editingBranchId, {
        name: branchForm.name.trim(),
        location: branchForm.location.trim(),
        phone: branchForm.phone.trim() || undefined,
      });
      if (updated) {
        setIsBranchModalOpen(false);
        setEditingBranchId(null);
        setBranchForm({ name: '', location: '', phone: '' });
      }
      return;
    }
    const created = await addBranch(branchForm);
    if (created) {
      setIsBranchModalOpen(false);
      setBranchForm({ name: '', location: '', phone: '' });
    }
  };

  const handleSubmitStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingStaff) return;
    setStaffFormError(null);
    if (staffMode === 'create' && staffForm.posPin.trim() && !isValidPinFormat(staffForm.posPin)) {
      setStaffFormError('POS Quick-Switch PIN must be exactly 4 digits (e.g. 1234).');
      return;
    }
    setIsSubmittingStaff(true);

    try {
      const result =
        staffMode === 'create'
          ? await createStaffAccount({
              name: staffForm.name,
              email: staffForm.email,
              password: staffForm.password,
              posPin: staffForm.posPin.trim() || undefined,
              role: staffForm.role,
              allowedSections: staffForm.allowedSections,
              branchId: staffForm.branchId || undefined,
            })
          : await inviteStaff({
              name: staffForm.name,
              email: staffForm.email,
              role: staffForm.role,
              allowedSections: staffForm.allowedSections,
              branchId: staffForm.branchId || undefined,
            });

      if (result.ok) {
        setIsStaffModalOpen(false);
      } else if (result.error) {
        setStaffFormError(result.error);
      }
    } finally {
      setIsSubmittingStaff(false);
    }
  };

  const handleSaveMemberPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPinMember || !tenant || isSavingPin) return;
    const cleanPin = pinInput.trim();
    if (!isValidPinFormat(cleanPin)) {
      toast.error('Enter exactly 4 numeric digits (e.g. 2468)');
      return;
    }
    setIsSavingPin(true);
    try {
      const hash = await hashStaffPin(tenant.id, editingPinMember.uid, cleanPin);
      await updateMember(editingPinMember.uid, { posPinHash: hash });
      setEditingPinMember(null);
      setPinInput('');
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleClearMemberPin = async () => {
    if (!editingPinMember || isSavingPin) return;
    setIsSavingPin(true);
    try {
      await updateMember(editingPinMember.uid, { posPinHash: null });
      setEditingPinMember(null);
      setPinInput('');
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleConfirmRemoveInactive = async () => {
    if (!removeTarget || isRemovingMember) return;
    setIsRemovingMember(true);
    try {
      const ok = await removeInactiveMember(removeTarget.uid);
      if (ok) setRemoveTarget(null);
    } finally {
      setIsRemovingMember(false);
    }
  };

  const openAccessEditor = (member: TenantMember) => {
    setEditingAccessMember(member);
    setEditingSections(
      getUserAllowedSections({
        uid: member.uid,
        name: member.name,
        email: member.email,
        role: member.role,
        allowedSections: member.allowedSections,
        tenantId: member.tenantId,
        status: member.status,
        createdAt: member.createdAt,
      })
    );
  };

  const toggleEditMemberSection = (sectionId: AppSection) => {
    setEditingSections((prev) => {
      const exists = prev.includes(sectionId);
      if (exists && prev.length === 1) {
        toast.error('Staff must have at least one visible section');
        return prev;
      }
      return exists ? prev.filter((s) => s !== sectionId) : [...prev, sectionId];
    });
  };

  const handleSaveMemberAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccessMember || isSavingAccess) return;
    setIsSavingAccess(true);
    try {
      await updateMember(editingAccessMember.uid, {
        allowedSections: editingSections,
      });
      setEditingAccessMember(null);
    } finally {
      setIsSavingAccess(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Team &amp; Branches</h1>
          <p className="text-text-muted mt-1">
            Create isolated staff accounts, enforce strict role visibility, and manage business branches.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {isManagerOrAdmin && (
            <button
              type="button"
              onClick={openAddBranchModal}
              className={cn('btn btn-secondary gap-2 whitespace-nowrap', branchLimitReached && 'opacity-70')}
            >
              {branchLimitReached ? <Lock size={16} /> : <Plus size={18} />}
              Add Branch
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={openStaffModal}
              className={cn('btn btn-primary gap-2 whitespace-nowrap', seatLimitReached && 'opacity-70')}
            >
              {seatLimitReached ? <Lock size={16} /> : <UserPlus size={18} />}
              Add Staff Account
            </button>
          )}
        </div>
      </div>

      {(seatLimitReached || branchLimitReached) && isAdmin && (
        <div className="p-3.5 rounded-xl bg-accent-alt/10 border border-accent-alt/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <span className="text-primary font-medium">
            {seatLimitReached && branchLimitReached
              ? `Both staff seat (${activeSeatCount}/${planQuota.maxUsers}) and branch (${branches.length}/${planQuota.maxBranches}) quotas are full on ${planQuota.name}.`
              : seatLimitReached
              ? `Staff seat quota reached (${activeSeatCount}/${planQuota.maxUsers}) on ${planQuota.name}.`
              : `Branch quota reached (${branches.length}/${planQuota.maxBranches}) on ${planQuota.name}.`}
          </span>
          <Link to="/billing" className="font-bold text-accent hover:underline whitespace-nowrap">
            Upgrade in Billing →
          </Link>
        </div>
      )}

      {/* Branches Section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <MapPin size={20} className="text-accent" />
            Business Branches ({branches.length} / {Number.isFinite(planQuota.maxBranches) ? planQuota.maxBranches : '∞'})
          </h2>
          <span className="text-xs font-medium text-text-muted">{planQuota.name} Tier Limit</span>
        </div>
        {branches.length === 0 ? (
          <div className="card text-center py-8 text-text-muted text-sm">
            No branches configured yet. Add your primary store or warehouse branch.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {branches.map((branch) => {
              const isCurrent = branch.id === activeBranchId;
              return (
                <div
                  key={branch.id}
                  className={cn(
                    'card flex flex-col justify-between gap-4',
                    isCurrent ? 'border-accent ring-2 ring-accent/15' : 'border-border'
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-primary">{branch.name}</h3>
                        <p className="text-xs text-text-muted mt-0.5">{branch.location}</p>
                      </div>
                      {branch.isDefault && (
                        <span className="text-[11px] font-bold text-accent uppercase">Default</span>
                      )}
                    </div>
                    {branch.phone && (
                      <p className="text-xs font-mono text-text-secondary mt-2">{branch.phone}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveBranchId(branch.id);
                        toast.success(`Switched to ${branch.name}`);
                      }}
                      className={cn(
                        'text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap',
                        isCurrent ? 'text-accent' : 'text-primary hover:underline'
                      )}
                    >
                      {isCurrent && <CheckCircle2 size={14} />}
                      {isCurrent ? 'Active Branch' : 'Switch to Branch'}
                    </button>

                    <div className="flex items-center gap-1">
                      {isManagerOrAdmin && (
                        <button
                          type="button"
                          onClick={() => openEditBranchModal(branch)}
                          aria-label={`Edit ${branch.name}`}
                          className="p-1.5 text-text-muted hover:text-primary rounded"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {isAdmin && !branch.isDefault && (
                        <button
                          type="button"
                          onClick={() => deleteBranch(branch.id)}
                          aria-label={`Delete ${branch.name}`}
                          className="p-1.5 text-text-muted hover:text-danger rounded"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Team Members */}
      <div className="card p-0 overflow-hidden">
        <div className="p-5 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-surface-alt/50">
          <div className="flex items-center gap-2">
            <UsersRound size={20} className="text-primary" />
            <h2 className="font-bold text-primary">
              Team Members ({activeSeatCount} / {Number.isFinite(planQuota.maxUsers) ? planQuota.maxUsers : '∞'} active seats)
            </h2>
          </div>
          <span className="text-xs text-text-muted hidden sm:inline">
            Each staff account uses an isolated email and strict role permissions.
          </span>
        </div>

        <div className="md:hidden divide-y divide-border">
          {isLoading ? (
            <MobileListSkeleton cards={4} />
          ) : members.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-text-muted">
              No team members found
            </div>
          ) : (
            members.map((member) => {
              const isSelf = member.uid === user?.uid;
              const effectiveSections =
                member.role === 'admin'
                  ? ['All Sections']
                  : (member.allowedSections?.length
                      ? member.allowedSections
                      : getDefaultSectionsForRole(member.role)
                    ).map((id) => ALL_SECTIONS.find((s) => s.id === id)?.label || id);

              return (
                <div key={member.uid} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-primary truncate">
                        {member.name} {isSelf && <span className="text-xs text-accent">(You)</span>}
                      </p>
                      <p className="text-xs text-text-muted truncate">{member.email}</p>
                    </div>
                    {isAdmin && !isSelf ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            updateMember(member.uid, {
                              status: member.status === 'active' ? 'inactive' : 'active',
                            })
                          }
                          className={cn(
                            'text-xs font-bold uppercase px-2 py-1 rounded border',
                            member.status === 'active'
                              ? 'text-accent border-accent/25 bg-accent/10'
                              : 'text-danger border-danger/25 bg-danger/10'
                          )}
                        >
                          {member.status}
                        </button>
                        {member.status === 'inactive' && (
                          <button
                            type="button"
                            onClick={() => setRemoveTarget(member)}
                            className="p-1.5 text-danger hover:bg-danger/10 rounded-lg"
                            aria-label={`Remove ${member.name}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs font-bold uppercase text-accent shrink-0">
                        {member.status}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">
                        Role
                      </label>
                      {isAdmin && !isSelf ? (
                        <select
                          aria-label={`Mobile role for ${member.name}`}
                          className="input-sm w-full"
                          value={member.role}
                          onChange={(e) =>
                            updateMember(member.uid, {
                              role: e.target.value as BusinessRole,
                            })
                          }
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_META[r].label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="font-bold uppercase text-primary py-1">
                          {ROLE_META[member.role]?.label || member.role}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">
                        Assigned Branch
                      </label>
                      {isAdmin ? (
                        <select
                          aria-label={`Mobile branch for ${member.name}`}
                          className="input-sm w-full"
                          value={member.branchId || ''}
                          onChange={(e) =>
                            updateMember(member.uid, { branchId: e.target.value || undefined })
                          }
                        >
                          <option value="">All Branches</option>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-text-secondary py-1">
                          {branches.find((b) => b.id === member.branchId)?.name || 'All Branches'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-surface-alt/50 border border-border/60 flex items-center justify-between gap-2 text-xs">
                    <span className="text-text-secondary truncate">
                      {member.role === 'admin'
                        ? 'Full Access (All)'
                        : effectiveSections.join(', ')}
                    </span>
                    {isAdmin && !isSelf && member.role !== 'admin' && (
                      <button
                        type="button"
                        onClick={() => openAccessEditor(member)}
                        className="inline-flex items-center gap-1 font-bold text-accent hover:underline whitespace-nowrap shrink-0"
                      >
                        <Shield size={12} />
                        Edit
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
                    <span>Joined {formatDate(member.createdAt)}</span>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPinMember(member);
                          setPinInput('');
                        }}
                        className={cn(
                          'inline-flex items-center gap-1 font-bold whitespace-nowrap hover:underline',
                          member.posPinHash ? 'text-accent' : 'text-text-secondary'
                        )}
                      >
                        <Lock size={12} />
                        {member.posPinHash ? 'PIN Set (Change)' : 'Set 4-Digit PIN'}
                      </button>
                    ) : (
                      <span>{member.posPinHash ? 'PIN Configured' : '—'}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[880px]">
            <thead>
              <tr className="bg-surface-alt/50 border-b border-border text-xs font-bold text-text-muted uppercase tracking-wider">
                <th className="px-6 py-4">Member</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Visible Sections</th>
                <th className="px-6 py-4">Assigned Branch</th>
                <th className="px-6 py-4">Status &amp; Actions</th>
                <th className="px-6 py-4">POS PIN</th>
                <th className="px-6 py-4">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {isLoading ? (
                <TableRowsSkeleton rows={5} columns={7} />
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-text-muted">
                    No team members found
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const isSelf = member.uid === user?.uid;
                  const effectiveSections =
                    member.role === 'admin'
                      ? ['All Sections']
                      : (member.allowedSections?.length
                          ? member.allowedSections
                          : getDefaultSectionsForRole(member.role)
                        ).map((id) => ALL_SECTIONS.find((s) => s.id === id)?.label || id);

                  return (
                    <tr key={member.uid} className="hover:bg-surface-alt/30">
                      <td className="px-6 py-4">
                        <p className="font-bold text-primary">
                          {member.name} {isSelf && <span className="text-xs text-accent">(You)</span>}
                        </p>
                        <p className="text-xs text-text-muted">{member.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        {isAdmin && !isSelf ? (
                          <select
                            aria-label={`Role for ${member.name}`}
                            className="input-sm w-44"
                            value={member.role}
                            onChange={(e) =>
                              updateMember(member.uid, {
                                role: e.target.value as BusinessRole,
                              })
                            }
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_META[r].label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs font-bold uppercase text-primary">
                            {ROLE_META[member.role]?.label || member.role}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 max-w-[240px]">
                          <span
                            className="text-xs text-text-secondary truncate"
                            title={effectiveSections.join(', ')}
                          >
                            {member.role === 'admin'
                              ? 'Full Access (All)'
                              : effectiveSections.join(', ')}
                          </span>
                          {isAdmin && !isSelf && member.role !== 'admin' && (
                            <button
                              type="button"
                              onClick={() => openAccessEditor(member)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:underline whitespace-nowrap shrink-0"
                            >
                              <Shield size={12} />
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isAdmin ? (
                          <select
                            aria-label={`Branch for ${member.name}`}
                            className="input-sm w-40"
                            value={member.branchId || ''}
                            onChange={(e) =>
                              updateMember(member.uid, { branchId: e.target.value || undefined })
                            }
                          >
                            <option value="">All Branches</option>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-text-secondary">
                            {branches.find((b) => b.id === member.branchId)?.name || 'All Branches'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isAdmin && !isSelf ? (
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                updateMember(member.uid, {
                                  status: member.status === 'active' ? 'inactive' : 'active',
                                })
                              }
                              className={cn(
                                'text-xs font-bold uppercase hover:underline',
                                member.status === 'active' ? 'text-accent' : 'text-danger'
                              )}
                            >
                              {member.status}
                            </button>
                            {member.status === 'inactive' && (
                              <button
                                type="button"
                                onClick={() => setRemoveTarget(member)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-danger hover:underline whitespace-nowrap"
                                title="Remove inactive staff member permanently"
                              >
                                <Trash2 size={13} />
                                Remove
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-bold uppercase text-accent">
                            {member.status}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPinMember(member);
                              setPinInput('');
                            }}
                            className={cn(
                              'inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap hover:underline',
                              member.posPinHash ? 'text-accent' : 'text-text-secondary'
                            )}
                          >
                            <Lock size={12} />
                            {member.posPinHash ? 'PIN Set (Change)' : 'Set 4-Digit PIN'}
                          </button>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {member.posPinHash ? 'Configured' : '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-text-muted whitespace-nowrap">
                        {formatDate(member.createdAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending / Recent Invitations */}
      {isAdmin && (
        <div className="card p-0 overflow-hidden">
          <div className="p-5 border-b border-border bg-surface-alt/50">
            <h2 className="font-bold text-primary flex items-center gap-2">
              <Mail size={18} className="text-accent" />
              Staff Invitations ({invites.length})
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Invited staff automatically join your business workspace with their assigned role &amp; sections when they sign in using their invited email address.
            </p>
          </div>
          {invites.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-muted">
              No invitations sent yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {invites.map((inv) => (
                <div key={inv.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-bold text-primary">
                      {inv.name} · <span className="font-normal text-text-secondary">{inv.email}</span>
                    </p>
                    <p className="text-xs text-text-muted">
                      Role: {ROLE_META[inv.role]?.label || inv.role} · Branch:{' '}
                      {branches.find((b) => b.id === inv.branchId)?.name || 'Default'} · Sent{' '}
                      {formatDate(inv.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'text-xs font-bold uppercase',
                        inv.status === 'accepted'
                          ? 'text-accent'
                          : inv.status === 'pending'
                          ? 'text-accent-alt'
                          : 'text-danger'
                      )}
                    >
                      {inv.status}
                    </span>
                    {inv.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => revokeInvite(inv.id)}
                        className="text-xs font-bold text-danger hover:underline"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Branch Modal */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <h3 className="text-lg font-bold text-white">
                {editingBranchId ? 'Edit Business Branch' : 'Add Business Branch'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsBranchModalOpen(false);
                  setEditingBranchId(null);
                }}
                className="p-1 hover:bg-white/10 rounded-lg"
                aria-label="Close branch modal"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveBranch} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Branch Name *</label>
                <input
                  required
                  type="text"
                  className="input w-full"
                  placeholder="e.g. Entebbe Road Branch"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Location *</label>
                <input
                  required
                  type="text"
                  className="input w-full"
                  placeholder="e.g. Plot 14, Kampala"
                  value={branchForm.location}
                  onChange={(e) => setBranchForm({ ...branchForm, location: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-primary mb-1">Phone</label>
                <input
                  type="tel"
                  className="input w-full"
                  placeholder="e.g. 0772 000 000"
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                />
              </div>
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsBranchModalOpen(false);
                    setEditingBranchId(null);
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editingBranchId ? 'Update Branch' : 'Save Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Staff Account / Send Invite Modal */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <h3 className="text-lg font-bold text-white">Add Business Staff Member</h3>
              <button
                type="button"
                onClick={() => setIsStaffModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 pt-4 pb-2 border-b border-border bg-surface-alt/50 shrink-0">
              <div className="grid grid-cols-2 gap-1 p-1 bg-white border border-border rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setStaffMode('create');
                    setStaffFormError(null);
                  }}
                  className={cn(
                    'py-2 px-3 text-xs sm:text-sm font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors',
                    staffMode === 'create'
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:text-primary'
                  )}
                >
                  <KeyRound size={15} />
                  Create Account Now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStaffMode('invite');
                    setStaffFormError(null);
                  }}
                  className={cn(
                    'py-2 px-3 text-xs sm:text-sm font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors',
                    staffMode === 'invite'
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:text-primary'
                  )}
                >
                  <Mail size={15} />
                  Send Email Invite
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmitStaff} className="p-6 space-y-4 overflow-y-auto">
              {staffFormError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg border border-danger/30 bg-danger/5 text-danger text-xs sm:text-sm flex items-start gap-2"
                >
                  <AlertCircle size={17} className="shrink-0 mt-0.5" />
                  <span>{staffFormError}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-primary mb-1">Full Name *</label>
                <input
                  required
                  type="text"
                  className="input w-full"
                  placeholder="e.g. Sarah Namukasa"
                  value={staffForm.name}
                  onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-1">
                  Unique Staff Email *
                </label>
                <input
                  required
                  type="email"
                  className="input w-full"
                  placeholder="sarah@company.com"
                  value={staffForm.email}
                  onChange={(e) => {
                    setStaffFormError(null);
                    setStaffForm({ ...staffForm, email: e.target.value });
                  }}
                />
                <p className="text-[11px] text-text-muted mt-1">
                  Must be an unused email. Existing or duplicate emails are automatically rejected to prevent account conflicts.
                </p>
              </div>

              {staffMode === 'create' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-primary mb-1">
                      Temporary Password *
                    </label>
                    <div className="relative">
                      <input
                        required
                        minLength={6}
                        type={showStaffPassword ? 'text' : 'password'}
                        className="input w-full pr-11"
                        placeholder="At least 6 characters"
                        value={staffForm.password}
                        onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowStaffPassword((p) => !p)}
                        aria-label={showStaffPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text-muted hover:text-primary"
                      >
                        {showStaffPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-primary mb-1">
                      POS Quick-Switch PIN (Optional)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      pattern="\d{4}"
                      className="input w-full font-mono tracking-widest"
                      placeholder="4 digits (e.g. 2468)"
                      value={staffForm.posPin}
                      onChange={(e) =>
                        setStaffForm({
                          ...staffForm,
                          posPin: e.target.value.replace(/\D/g, '').slice(0, 4),
                        })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Business Role *</label>
                  <select
                    className="input w-full"
                    value={staffForm.role}
                    onChange={(e) => handleStaffRoleChange(e.target.value as BusinessRole)}
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_META[r].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-1">Assign Branch</label>
                  <select
                    className="input w-full"
                    value={staffForm.branchId}
                    onChange={(e) => setStaffForm({ ...staffForm, branchId: e.target.value })}
                  >
                    <option value="">All / Default</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-border bg-surface-alt/50 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">
                    Visible System Sections
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {ROLE_META[staffForm.role].summary}
                  </span>
                </div>

                {staffForm.role === 'admin' ? (
                  <p className="text-xs text-accent font-semibold">
                    Business Admins have full control over all 15 sections, staff accounts, and settings.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                    {ALL_SECTIONS.filter(
                      (s) => s.id !== 'team' && s.id !== 'billing' && s.id !== 'settings'
                    ).map((sec) => {
                      const checked = staffForm.allowedSections.includes(sec.id);
                      return (
                        <label
                          key={sec.id}
                          className={cn(
                            'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs cursor-pointer select-none transition-colors',
                            checked
                              ? 'bg-accent/10 border-accent/40 text-primary font-semibold'
                              : 'bg-white border-border text-text-secondary hover:bg-surface-alt'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStaffFormSection(sec.id)}
                            className="rounded border-border text-accent focus:ring-accent"
                          />
                          <span className="truncate">{sec.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="btn btn-secondary flex-1"
                  disabled={isSubmittingStaff}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStaff}
                  className="btn btn-primary flex-1 gap-2"
                >
                  {isSubmittingStaff && <Loader2 size={16} className="animate-spin" />}
                  <span>
                    {isSubmittingStaff
                      ? staffMode === 'create'
                        ? 'Creating Account...'
                        : 'Sending Invite...'
                      : staffMode === 'create'
                      ? 'Create Staff Account'
                      : 'Send Invite'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customize Member Section Access Modal */}
      {editingAccessMember && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Section Access · {editingAccessMember.name}
                </h3>
                <p className="text-xs text-white/75">
                  Role: {ROLE_META[editingAccessMember.role]?.label || editingAccessMember.role}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAccessMember(null)}
                className="p-1 hover:bg-white/10 rounded-lg"
                aria-label="Close section access modal"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveMemberAccess} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <p className="text-xs text-text-secondary">
                Choose exactly which workspace sections this staff member can see and open. Changes apply live immediately.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto p-1">
                {ALL_SECTIONS.map((sec) => {
                  const checked = editingSections.includes(sec.id);
                  return (
                    <label
                      key={sec.id}
                      className={cn(
                        'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs cursor-pointer select-none transition-colors',
                        checked
                          ? 'bg-accent/10 border-accent/40 text-primary font-semibold'
                          : 'bg-white border-border text-text-secondary hover:bg-surface-alt'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEditMemberSection(sec.id)}
                        className="rounded border-border text-accent focus:ring-accent"
                      />
                      <span className="truncate">{sec.label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() =>
                    setEditingSections(getDefaultSectionsForRole(editingAccessMember.role))
                  }
                  className="text-xs font-bold text-accent hover:underline"
                >
                  Reset to {ROLE_META[editingAccessMember.role]?.label} Defaults
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingAccessMember(null)}
                    className="btn btn-secondary text-xs py-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingAccess}
                    className="btn btn-primary text-xs py-2"
                  >
                    {isSavingAccess ? 'Saving...' : 'Save Permissions'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Set / Update 4-Digit POS PIN Modal */}
      {editingPinMember && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90dvh]">
            <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white">4-Digit POS PIN</h3>
                <p className="text-xs text-white/75">{editingPinMember.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPinMember(null)}
                className="p-1 hover:bg-white/10 rounded-lg"
                aria-label="Close PIN modal"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveMemberPin} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-bold text-primary mb-1">
                  Enter 4-Digit Counter PIN *
                </label>
                <input
                  required
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  className="input w-full font-mono text-center text-xl tracking-[0.5em]"
                  placeholder="••••"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  autoFocus
                />
                <p className="text-xs text-text-muted mt-1.5">
                  Stored securely as a salted SHA-256 hash. Used to switch active cashier rapidly inside POS.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {editingPinMember.posPinHash && (
                  <button
                    type="button"
                    disabled={isSavingPin}
                    onClick={handleClearMemberPin}
                    className="btn btn-secondary text-xs text-danger"
                  >
                    Clear PIN
                  </button>
                )}
                <button
                  type="button"
                  disabled={isSavingPin}
                  onClick={() => setEditingPinMember(null)}
                  className="btn btn-secondary flex-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPin || pinInput.length !== 4}
                  className="btn btn-primary flex-1 text-xs"
                >
                  {isSavingPin ? 'Saving...' : 'Save PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Permanent Removal of Inactive Staff */}
      {removeTarget && (
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-danger/25 flex flex-col max-h-[90dvh]">
            <div className="p-5 bg-danger text-white flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-white">Remove Inactive Staff Member</h3>
              <button
                type="button"
                disabled={isRemovingMember}
                onClick={() => setRemoveTarget(null)}
                className="p-1 hover:bg-white/15 rounded-lg"
                aria-label="Close removal confirmation"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <p className="text-sm text-text-secondary">
                Permanently remove <strong className="text-primary">{removeTarget.name}</strong> ({removeTarget.email}) from your team directory and release their email lock &amp; seat? Historical receipts remain intact.
              </p>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  disabled={isRemovingMember}
                  onClick={() => setRemoveTarget(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isRemovingMember}
                  onClick={handleConfirmRemoveInactive}
                  className="btn bg-danger text-white hover:bg-danger/90 flex-1 font-bold"
                >
                  {isRemovingMember ? 'Removing...' : 'Remove Staff'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
