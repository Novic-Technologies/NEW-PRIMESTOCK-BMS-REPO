import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { db } from '../firebase';
import { localDb } from '../services/db';
import { useAuthStore } from '../store/authStore';
import { AppSection, BusinessRole, StaffInvite, TenantMember, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { computeTrialState } from '../utils/trialUtils';
import { getEffectivePlanQuota, isQuotaExceeded } from '../utils/planLimits';
import { getDefaultSectionsForRole, hashEmailForRegistry, ROLE_META } from '../utils/rbac';
import { buildSubscriptionEmailHtml, sendTransactionalEmail } from '../services/notificationService';
import { logWorkspaceAudit } from './useAuditLog';
import toast from 'react-hot-toast';

export function useTeam() {
  const { tenant, user } = useAuthStore();
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenant || !user) {
      setMembers([]);
      setInvites([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const dexieSub = liveQuery(() =>
      localDb.members.where('tenantId').equals(tenant.id).toArray()
    ).subscribe({
      next: (items) => {
        if (items.length > 0) {
          const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          setMembers(sorted);
          setIsLoading(false);
        }
      },
    });

    const membersPath = `tenants/${tenant.id}/members`;
    const unsubMembers = onSnapshot(
      collection(db, membersPath),
      async (snap) => {
        const list = snap.docs.map((d) => d.data() as TenantMember);
        list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (list.length > 0) {
          await localDb.members.bulkPut(list);
        }
        setMembers(list);
        setIsLoading(false);
      },
      (error) => {
        setIsLoading(false);
        try {
          handleFirestoreError(error, OperationType.LIST, membersPath);
        } catch (e) {
          console.error(e);
        }
      }
    );

    const invitesQuery =
      user.role === 'admin'
        ? query(collection(db, 'staffInvites'), where('tenantId', '==', tenant.id))
        : query(collection(db, 'staffInvites'), where('invitedBy', '==', user.uid));
    const unsubInvites = onSnapshot(
      invitesQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as StaffInvite)
          .filter((inv) => inv.tenantId === tenant.id);
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setInvites(list);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'staffInvites');
        } catch (e) {
          console.error(e);
        }
      }
    );

    return () => {
      dexieSub.unsubscribe();
      unsubMembers();
      unsubInvites();
    };
  }, [tenant?.id, user?.uid, user?.role]);

  const validateNewStaffEmail = async (
    rawEmail: string
  ): Promise<{ ok: true; cleanEmail: string; emailHash: string } | { ok: false; reason: string }> => {
    const cleanEmail = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
      return { ok: false, reason: 'Please enter a valid email address.' };
    }

    if (user?.email && user.email.trim().toLowerCase() === cleanEmail) {
      return {
        ok: false,
        reason: 'That email belongs to your own admin account. Please enter a different email for this staff member.',
      };
    }

    if (members.some((m) => m.email.trim().toLowerCase() === cleanEmail)) {
      return {
        ok: false,
        reason: 'This email address is already assigned to a staff account in your business. Please enter a different email.',
      };
    }

    if (invites.some((i) => i.email.trim().toLowerCase() === cleanEmail && i.status === 'pending')) {
      return {
        ok: false,
        reason: 'A pending invitation already exists for this email address. Revoke it first or enter a different email.',
      };
    }

    const emailHash = await hashEmailForRegistry(cleanEmail);
    try {
      const regSnap = await getDoc(doc(db, 'emailRegistry', emailHash));
      if (regSnap.exists()) {
        return {
          ok: false,
          reason: 'This email address has already been used by an existing account. Please enter a different email address.',
        };
      }
    } catch {
      // Fallback safely to Auth/Firestore rules check
    }

    return { ok: true, cleanEmail, emailHash };
  };

  const resolveSections = (role: BusinessRole, allowedSections?: AppSection[]): AppSection[] => {
    if (role === 'admin') return getDefaultSectionsForRole('admin');
    if (allowedSections && allowedSections.length > 0) {
      return Array.from(new Set(allowedSections));
    }
    return getDefaultSectionsForRole(role);
  };

  const inviteStaff = async (params: {
    name: string;
    email: string;
    role: BusinessRole;
    allowedSections?: AppSection[];
    branchId?: string;
  }): Promise<{ ok: boolean; error?: string; invite?: StaffInvite }> => {
    if (!tenant || !user) return { ok: false, error: 'Workspace session missing' };
    if (computeTrialState(tenant).isSoftLocked) {
      const msg = 'Your subscription is paused. Renew in Billing to invite staff.';
      toast.error(msg);
      return { ok: false, error: msg };
    }
    if (user.role !== 'admin') {
      const msg = 'Only business admins can invite staff';
      toast.error(msg);
      return { ok: false, error: msg };
    }

    const activeCount =
      members.filter((m) => m.status === 'active').length +
      invites.filter((i) => i.status === 'pending').length;
    const quota = getEffectivePlanQuota(tenant);
    if (isQuotaExceeded(activeCount, quota.maxUsers)) {
      const msg = `${quota.name} plan allows up to ${quota.maxUsers} staff users. Upgrade in Billing to add more.`;
      toast.error(msg);
      return { ok: false, error: msg };
    }

    const cleanName = params.name.trim().slice(0, 120);
    if (!cleanName) {
      const msg = 'Enter the staff member full name.';
      toast.error(msg);
      return { ok: false, error: msg };
    }

    const emailCheck = await validateNewStaffEmail(params.email);
    if (!emailCheck.ok) {
      const msg = 'reason' in emailCheck ? emailCheck.reason : 'This email cannot be used.';
      toast.error(msg);
      return { ok: false, error: msg };
    }

    const effectiveSections = resolveSections(params.role, params.allowedSections);
    const nowIso = new Date().toISOString();

    const invite: StaffInvite = stripUndefined({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      tenantName: tenant.name.slice(0, 150),
      email: emailCheck.cleanEmail,
      name: cleanName,
      role: params.role,
      allowedSections: params.role === 'admin' ? undefined : effectiveSections,
      branchId: params.branchId || undefined,
      status: 'pending',
      invitedBy: user.uid,
      createdAt: nowIso,
    });

    const path = `staffInvites/${invite.id}`;
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'staffInvites', invite.id), invite);
      batch.set(doc(db, 'emailRegistry', emailCheck.emailHash), {
        hash: emailCheck.emailHash,
        tenantId: tenant.id,
        type: 'invite',
        createdAt: nowIso,
      });
      await batch.commit();

      void logWorkspaceAudit({
        tenantId: tenant.id,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'STAFF_INVITED',
        entityType: 'team',
        entityId: invite.id,
        summary: `Invited ${cleanName} (${emailCheck.cleanEmail}) as ${ROLE_META[params.role].label}`,
      });

      const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '';
      const roleLabel = ROLE_META[params.role].label;
      const inviteEmailText = `Hello ${cleanName},\n\n${user.name} has invited you to join ${tenant.name} on PrimeStock BMS as ${roleLabel}.\n\nSign in or create your account at ${loginUrl} using this exact email address (${emailCheck.cleanEmail}) to activate your account.`;

      toast.success(`Invitation created for ${emailCheck.cleanEmail}`);

      void sendTransactionalEmail({
        to: emailCheck.cleanEmail,
        replyTo: user.email || tenant.ownerEmail,
        subject: `You're invited to join ${tenant.name} (${roleLabel})`,
        text: inviteEmailText,
        html: buildSubscriptionEmailHtml({
          businessName: tenant.name,
          headline: `Team Invitation · ${roleLabel}`,
          message: `Hello ${cleanName}, ${user.name} invited you to join ${tenant.name} as ${roleLabel}. Sign in at the link below with ${emailCheck.cleanEmail} to activate your role access immediately.`,
          actionLabel: 'Accept Invitation & Sign In',
          actionUrl: loginUrl,
        }),
      })
        .then((res) => {
          if (res.sent) {
            toast.success(`Invitation email sent to ${emailCheck.cleanEmail}`);
          }
        })
        .catch(() => {});

      return { ok: true, invite };
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, path);
      } catch (e) {
        console.error(e);
      }
      const msg = 'This email is already in use or could not be invited. Please try a different email.';
      toast.error(msg);
      return { ok: false, error: msg };
    }
  };

  const createStaffAccount = async (params: {
    name: string;
    email: string;
    password: string;
    role: BusinessRole;
    allowedSections?: AppSection[];
    branchId?: string;
  }): Promise<{ ok: boolean; error?: string; member?: TenantMember }> => {
    if (!tenant || !user) return { ok: false, error: 'Workspace session missing' };
    if (computeTrialState(tenant).isSoftLocked) {
      const msg = 'Your subscription is paused. Renew in Billing to create staff accounts.';
      toast.error(msg);
      return { ok: false, error: msg };
    }
    if (user.role !== 'admin') {
      const msg = 'Only business admins can create staff accounts';
      toast.error(msg);
      return { ok: false, error: msg };
    }

    const activeCount =
      members.filter((m) => m.status === 'active').length +
      invites.filter((i) => i.status === 'pending').length;
    const quota = getEffectivePlanQuota(tenant);
    if (isQuotaExceeded(activeCount, quota.maxUsers)) {
      const msg = `${quota.name} plan allows up to ${quota.maxUsers} staff users. Upgrade in Billing to add more.`;
      toast.error(msg);
      return { ok: false, error: msg };
    }

    const cleanName = params.name.trim().slice(0, 120);
    if (!cleanName) {
      const msg = 'Please enter the staff member full name.';
      toast.error(msg);
      return { ok: false, error: msg };
    }
    if (!params.password || params.password.length < 6) {
      const msg = 'Temporary password must be at least 6 characters long.';
      toast.error(msg);
      return { ok: false, error: msg };
    }

    const emailCheck = await validateNewStaffEmail(params.email);
    if (!emailCheck.ok) {
      const msg = 'reason' in emailCheck ? emailCheck.reason : 'This email cannot be used.';
      toast.error(msg);
      return { ok: false, error: msg };
    }

    const effectiveSections = resolveSections(params.role, params.allowedSections);
    const nowIso = new Date().toISOString();
    const inviteId = crypto.randomUUID();

    const inviteDoc: StaffInvite = stripUndefined({
      id: inviteId,
      tenantId: tenant.id,
      tenantName: tenant.name.slice(0, 150),
      email: emailCheck.cleanEmail,
      name: cleanName,
      role: params.role,
      allowedSections: params.role === 'admin' ? undefined : effectiveSections,
      branchId: params.branchId || undefined,
      status: 'pending',
      invitedBy: user.uid,
      createdAt: nowIso,
    });

    // Phase 1: Atomically lock email and record invite using admin session
    try {
      const initBatch = writeBatch(db);
      initBatch.set(doc(db, 'staffInvites', inviteId), inviteDoc);
      initBatch.set(doc(db, 'emailRegistry', emailCheck.emailHash), {
        hash: emailCheck.emailHash,
        tenantId: tenant.id,
        type: 'invite',
        createdAt: nowIso,
      });
      await initBatch.commit();
    } catch (err) {
      console.error('Staff pre-provision lock failed:', err);
      const msg = 'This email address has already been used. Please enter a different email.';
      toast.error(msg);
      return { ok: false, error: msg };
    }

    // Phase 2: Provision isolated Auth + Profile using secondary Firebase App so Admin session is untouched
    const appName = `staff-provisioner-${inviteId.slice(0, 8)}`;
    const secondaryApp = initializeApp(firebaseConfig, appName);
    const secondaryAuth = getAuth(secondaryApp);
    const secondaryDb = getFirestore(
      secondaryApp,
      firebaseConfig.firestoreDatabaseId || undefined
    );

    try {
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        emailCheck.cleanEmail,
        params.password
      );
      void updateProfile(cred.user, { displayName: cleanName }).catch(() => {});

      const newUser: User = stripUndefined({
        uid: cred.user.uid,
        name: cleanName,
        email: emailCheck.cleanEmail,
        role: params.role,
        allowedSections: params.role === 'admin' ? undefined : effectiveSections,
        tenantId: tenant.id,
        branchId: params.branchId || undefined,
        inviteId,
        status: 'active',
        createdAt: nowIso,
      });

      const newMember: TenantMember = stripUndefined({
        uid: cred.user.uid,
        tenantId: tenant.id,
        name: cleanName,
        email: emailCheck.cleanEmail,
        role: params.role,
        allowedSections: params.role === 'admin' ? undefined : effectiveSections,
        branchId: params.branchId || undefined,
        status: 'active',
        createdAt: nowIso,
      });

      const staffBatch = writeBatch(secondaryDb);
      staffBatch.set(doc(secondaryDb, 'users', cred.user.uid), newUser);
      staffBatch.set(
        doc(secondaryDb, `tenants/${tenant.id}/members`, cred.user.uid),
        newMember
      );
      staffBatch.update(doc(secondaryDb, 'staffInvites', inviteId), { status: 'accepted' });
      staffBatch.update(doc(secondaryDb, 'emailRegistry', emailCheck.emailHash), {
        type: 'account',
      });
      await staffBatch.commit();

      await localDb.members.put(newMember);

      void logWorkspaceAudit({
        tenantId: tenant.id,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'STAFF_ACCOUNT_CREATED',
        entityType: 'team',
        entityId: cred.user.uid,
        summary: `Created ${ROLE_META[params.role].label} account for ${cleanName} (${emailCheck.cleanEmail})`,
      });

      const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '';
      const roleLabel = ROLE_META[params.role].label;
      void sendTransactionalEmail({
        to: emailCheck.cleanEmail,
        replyTo: user.email || tenant.ownerEmail,
        subject: `Your ${tenant.name} Staff Account Is Ready (${roleLabel})`,
        text: `Hello ${cleanName},\n\n${user.name} has created your ${roleLabel} account for ${tenant.name}.\n\nSign in at: ${loginUrl}\nEmail: ${emailCheck.cleanEmail}\n\nPlease change or reset your password after signing in.`,
        html: buildSubscriptionEmailHtml({
          businessName: tenant.name,
          headline: `Your ${roleLabel} Account Is Ready`,
          message: `Hello ${cleanName}, ${user.name} created your staff account for ${tenant.name}. Sign in with ${emailCheck.cleanEmail} and the temporary password provided by your administrator.`,
          actionLabel: 'Sign In Now',
          actionUrl: loginUrl,
        }),
      }).catch(() => {});

      toast.success(`Account created for ${cleanName} (${roleLabel})`);
      return { ok: true, member: newMember };
    } catch (error: unknown) {
      // Roll back Phase 1 invite + registry lock if Auth rejected (e.g. legacy account already in Auth)
      await Promise.allSettled([
        deleteDoc(doc(db, 'staffInvites', inviteId)),
        deleteDoc(doc(db, 'emailRegistry', emailCheck.emailHash)),
      ]);

      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : '';
      const msg =
        code === 'auth/email-already-in-use'
          ? 'This email address has already been used by an existing account. Please enter a different email address.'
          : code === 'auth/weak-password'
          ? 'Password is too weak. Please enter at least 6 characters.'
          : 'Failed to create staff account. Please verify the email and password and try again.';
      toast.error(msg);
      return { ok: false, error: msg };
    } finally {
      await signOut(secondaryAuth).catch(() => {});
      await deleteApp(secondaryApp).catch(() => {});
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!user || user.role !== 'admin') return;
    const targetInvite = invites.find((i) => i.id === inviteId);
    try {
      await deleteDoc(doc(db, 'staffInvites', inviteId));
      if (targetInvite?.email) {
        const emailHash = await hashEmailForRegistry(targetInvite.email);
        const regRef = doc(db, 'emailRegistry', emailHash);
        const regSnap = await getDoc(regRef).catch(() => null);
        if (
          regSnap?.exists() &&
          regSnap.data()?.tenantId === targetInvite.tenantId &&
          regSnap.data()?.type === 'invite'
        ) {
          await deleteDoc(regRef).catch(() => {});
        }
      }
      if (tenant) {
        void logWorkspaceAudit({
          tenantId: tenant.id,
          actorId: user.uid,
          actorName: user.name,
          actorRole: user.role,
          action: 'STAFF_INVITE_REVOKED',
          entityType: 'team',
          entityId: inviteId,
          summary: `Revoked pending invitation for ${targetInvite?.email || inviteId}`,
        });
      }
      toast.success('Invitation revoked');
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `staffInvites/${inviteId}`);
      } catch (e) {
        console.error(e);
      }
      toast.error('Failed to revoke invitation');
    }
  };

  const updateMember = async (
    memberUid: string,
    updates: Partial<
      Pick<
        TenantMember,
        'role' | 'allowedSections' | 'branchId' | 'status' | 'baseSalaryUgx' | 'nssfNumber' | 'tinNumber'
      >
    >
  ) => {
    if (!tenant || !user || user.role !== 'admin') {
      toast.error('Only admins can modify staff profiles or roles');
      return;
    }
    if (memberUid === user.uid && updates.role && updates.role !== 'admin') {
      toast.error('You cannot remove your own admin role');
      return;
    }
    if (memberUid === user.uid && updates.status === 'inactive') {
      toast.error('You cannot deactivate your own admin account');
      return;
    }

    if (!navigator.onLine) {
      toast.error('Connect to the internet to update team roles or assignments');
      return;
    }

    const memberPath = `tenants/${tenant.id}/members/${memberUid}`;
    const existingMember =
      members.find((m) => m.uid === memberUid) || (await localDb.members.get(memberUid));

    const firestoreUpdates: Record<string, unknown> = {};
    const localUpdates: Partial<TenantMember> = { ...existingMember };

    if ('role' in updates && updates.role) {
      firestoreUpdates.role = updates.role;
      localUpdates.role = updates.role;
      // When role changes without explicit custom sections, reset sections to the new role's strict defaults
      if (!('allowedSections' in updates)) {
        if (updates.role === 'admin') {
          firestoreUpdates.allowedSections = deleteField();
          delete localUpdates.allowedSections;
        } else {
          const nextSections = getDefaultSectionsForRole(updates.role);
          firestoreUpdates.allowedSections = nextSections;
          localUpdates.allowedSections = nextSections;
        }
      }
    }
    if ('allowedSections' in updates) {
      const targetRole = updates.role || existingMember?.role || 'cashier';
      if (targetRole === 'admin') {
        firestoreUpdates.allowedSections = deleteField();
        delete localUpdates.allowedSections;
      } else if (updates.allowedSections && updates.allowedSections.length > 0) {
        const deduped = Array.from(new Set(updates.allowedSections));
        firestoreUpdates.allowedSections = deduped;
        localUpdates.allowedSections = deduped;
      }
    }
    if ('status' in updates && updates.status) {
      firestoreUpdates.status = updates.status;
      localUpdates.status = updates.status;
    }
    if ('branchId' in updates) {
      if (updates.branchId) {
        firestoreUpdates.branchId = updates.branchId;
        localUpdates.branchId = updates.branchId;
      } else {
        firestoreUpdates.branchId = deleteField();
        delete localUpdates.branchId;
      }
    }
    if ('baseSalaryUgx' in updates && updates.baseSalaryUgx !== undefined) {
      firestoreUpdates.baseSalaryUgx = updates.baseSalaryUgx;
      localUpdates.baseSalaryUgx = updates.baseSalaryUgx;
    }
    if ('nssfNumber' in updates) {
      if (updates.nssfNumber) {
        firestoreUpdates.nssfNumber = updates.nssfNumber;
        localUpdates.nssfNumber = updates.nssfNumber;
      } else {
        firestoreUpdates.nssfNumber = deleteField();
        delete localUpdates.nssfNumber;
      }
    }
    if ('tinNumber' in updates) {
      if (updates.tinNumber) {
        firestoreUpdates.tinNumber = updates.tinNumber;
        localUpdates.tinNumber = updates.tinNumber;
      } else {
        firestoreUpdates.tinNumber = deleteField();
        delete localUpdates.tinNumber;
      }
    }

    try {
      if (existingMember) {
        await localDb.members.put(stripUndefined(localUpdates) as TenantMember);
      }

      await updateDoc(doc(db, `tenants/${tenant.id}/members`, memberUid), firestoreUpdates);

      const userMirrorFields: Record<string, unknown> = {};
      if ('role' in firestoreUpdates) userMirrorFields.role = firestoreUpdates.role;
      if ('allowedSections' in firestoreUpdates) {
        userMirrorFields.allowedSections = firestoreUpdates.allowedSections;
      }
      if ('branchId' in firestoreUpdates) userMirrorFields.branchId = firestoreUpdates.branchId;
      if ('status' in firestoreUpdates) userMirrorFields.status = firestoreUpdates.status;

      if (Object.keys(userMirrorFields).length > 0) {
        try {
          await updateDoc(doc(db, 'users', memberUid), userMirrorFields);
        } catch (userSyncErr) {
          console.warn('User mirror update skipped:', userSyncErr);
        }
      }
      void logWorkspaceAudit({
        tenantId: tenant.id,
        actorId: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: 'MEMBER_UPDATED',
        entityType: 'team',
        entityId: memberUid,
        summary: `Updated team member ${existingMember?.name || memberUid} (${Object.keys(
          firestoreUpdates
        ).join(', ')})`,
      });
      toast.success('Team member updated');
    } catch (error) {
      if (existingMember) {
        await localDb.members.put(existingMember).catch(() => {});
      }
      try {
        handleFirestoreError(error, OperationType.UPDATE, memberPath);
      } catch (e) {
        console.error(e);
      }
      toast.error('Failed to update team member');
    }
  };

  return {
    members,
    invites,
    isLoading,
    inviteStaff,
    createStaffAccount,
    revokeInvite,
    updateMember,
  };
}
