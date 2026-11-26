import { useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  signOut,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { clearAllLocalData } from '../services/db';
import { useAuthStore } from '../store/authStore';
import { AppNotification, Branch, PlatformPlansConfig, StaffInvite, Tenant, TenantMember, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { stripUndefined } from '../utils/firestoreUtils';
import { isMasterEmail } from '../utils/masterAdmin';
import { applyTenantTheme } from '../utils/branding';
import { formatDate } from '../utils/format';
import { hashEmailForRegistry } from '../utils/rbac';
import { getDefaultSignupPlan, getPlanQuota, getTrialDaysCount } from '../utils/planLimits';
import { setSyncedPlatformPlansConfig } from '../utils/platformPlans';
import { buildSubscriptionEmailHtml, sendTransactionalEmail } from '../services/notificationService';
import { logWorkspaceAudit } from './useAuditLog';
import { clearAllHookCaches } from '../utils/hookCache';
import { resetWarmedHookScopes } from '../utils/warmHookCache';
import toast from 'react-hot-toast';

interface PendingSignupInfo {
  fullName?: string;
  businessName?: string;
  legalAcceptedAt?: string;
  legalVersion?: string;
}

type SyncOutcome =
  | { status: 'authenticated' }
  | { status: 'needs_signup'; email: string; fullName: string }
  | { status: 'error' };

interface CachedSession {
  user: User;
  tenant: Tenant | null;
  isMasterAdmin: boolean;
}

const SESSION_CACHE_PREFIX = 'primestock_session_cache_';
const LAST_UID_KEY = 'primestock_last_uid';

let googlePopupInFlight = false;
let emailAuthInFlight = false;
let registrationSignOutPending = false;
let pendingSignupInfo: PendingSignupInfo | null = null;
const profileSyncInFlight = new Map<string, Promise<SyncOutcome>>();

const ALL_TENANT_SUBCOLLECTIONS = [
  'products',
  'sales',
  'customers',
  'expenses',
  'suppliers',
  'branches',
  'shifts',
  'purchaseOrders',
  'creditPayments',
  'billingHistory',
  'reminders',
  'notifications',
  'stockTransfers',
  'stockAdjustments',
  'payrollRuns',
  'auditLogs',
  'aiChats',
] as const;

async function deleteCollectionInBatches(colPath: string): Promise<void> {
  const snap = await getDocs(collection(db, colPath));
  if (snap.empty) return;
  const CHUNK_SIZE = 400;
  for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + CHUNK_SIZE)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
}

function clearWorkspaceStorageKeys(uid?: string | null, tenantId?: string | null) {
  clearCachedSession(uid);
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const isNotifKey =
        k.startsWith('primestock_notif_read_') ||
        k.startsWith('primestock_notif_deleted_') ||
        k.startsWith('primestock_notif_del_') ||
        k.startsWith('primestock_notif_seen_badge_');
      const matchesScope =
        (uid && k.endsWith(`_${uid}`)) ||
        (tenantId && (k.includes(`_${tenantId}_`) || k.endsWith(`_${tenantId}`)));
      if (
        (isNotifKey && matchesScope) ||
        (tenantId && k === `primestock_dismissed_rem_${tenantId}`) ||
        (tenantId && k.startsWith(`primestock_pos_held_carts_${tenantId}`))
      ) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage access failures
  }
}

function readCachedSession(uid: string): CachedSession | null {
  try {
    const raw = localStorage.getItem(`${SESSION_CACHE_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSession;
    if (parsed?.user?.uid === uid && (parsed?.tenant?.id || parsed?.isMasterAdmin)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedSession(uid: string, payload: CachedSession) {
  try {
    localStorage.setItem(`${SESSION_CACHE_PREFIX}${uid}`, JSON.stringify(payload));
    localStorage.setItem(LAST_UID_KEY, uid);
  } catch {
    // Ignore storage quota errors
  }
}

function clearCachedSession(uid?: string | null) {
  try {
    if (uid) {
      localStorage.removeItem(`${SESSION_CACHE_PREFIX}${uid}`);
    }
    localStorage.removeItem(LAST_UID_KEY);
  } catch {
    // Ignore storage errors
  }
}

function getFirebaseErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return '';
}

const EXPECTED_USER_AUTH_CODES = new Set([
  'auth/invalid-credential',
  'auth/wrong-password',
  'auth/user-not-found',
  'auth/invalid-email',
  'auth/missing-email',
  'auth/email-already-in-use',
  'auth/weak-password',
  'auth/too-many-requests',
  'auth/user-disabled',
  'auth/popup-closed-by-user',
  'auth/user-cancelled',
  'auth/cancelled-popup-request',
]);

function mapAuthErrorMessage(code: string): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Google sign-in window was closed before completing. Click "Continue with Google" to try again.';
    case 'auth/user-cancelled':
      return 'Google sign-in was cancelled before completing. Click "Continue with Google" to try again.';
    case 'auth/cancelled-popup-request':
      return 'A previous sign-in request was replaced. Please complete the active sign-in window.';
    case 'auth/popup-blocked':
      return 'Pop-up was blocked by your browser. Allow pop-ups for this site or sign in with email and password.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Double-check your details, reset your password below, or use "Continue with Google" if you registered with Google.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'This email address has already been used by another account. Please sign in instead or use a different email.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in Firebase Console yet. Enable it under Authentication > Sign-in method.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment or reset your password.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact your administrator.';
    case 'auth/network-request-failed':
      return 'Network error while connecting to authentication service. Check your connection and try again.';
    default:
      return 'Unable to complete sign-in. Please try again.';
  }
}

async function ensureEmailRegistryEntry(email: string, tenantId: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return;
  try {
    const emailHash = await hashEmailForRegistry(cleanEmail);
    const ref = doc(db, 'emailRegistry', emailHash);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        hash: emailHash,
        tenantId,
        type: 'account',
        createdAt: new Date().toISOString(),
      });
    }
  } catch {
    // Ignore non-critical backfill failures
  }
}

async function syncAuthenticatedUser(
  firebaseUser: FirebaseUser,
  options?: { commitToStore?: boolean; requireExistingProfile?: boolean }
): Promise<SyncOutcome> {
  const commitToStore = options?.commitToStore ?? true;
  const requireExistingProfile = options?.requireExistingProfile ?? false;
  const existingPromise = profileSyncInFlight.get(firebaseUser.uid);
  if (existingPromise) {
    return existingPromise;
  }

  const syncTask: Promise<SyncOutcome> = (async (): Promise<SyncOutcome> => {
    const { setUser, setTenant, setActiveBranchId, setMasterAdmin, setAuthError, logout } =
      useAuthStore.getState();
    const userPath = `users/${firebaseUser.uid}`;
    const userDocRef = doc(db, 'users', firebaseUser.uid);

    // Run master check and user profile load in parallel
    const [hasMasterDoc, userDocResult] = await Promise.all([
      firebaseUser.emailVerified
        ? getDoc(doc(db, 'masterAdmins', firebaseUser.uid))
            .then((snap) => snap.exists())
            .catch(() => false)
        : Promise.resolve(false),
      getDoc(userDocRef)
        .then((docSnap) => ({ ok: true as const, docSnap }))
        .catch((error) => ({ ok: false as const, error })),
    ]);

    const isMaster = Boolean(
      firebaseUser.emailVerified && (hasMasterDoc || isMasterEmail(firebaseUser.email))
    );
    setMasterAdmin(isMaster);

    // Master Admin is the platform owner — never treat or provision as a retail shop tenant
    if (isMaster) {
      const existingDoc = userDocResult.ok && userDocResult.docSnap.exists()
        ? (userDocResult.docSnap.data() as User)
        : null;
      const masterOwnerUser: User = {
        uid: firebaseUser.uid,
        name: (
          existingDoc?.name ||
          firebaseUser.displayName?.trim() ||
          'Platform Owner'
        ).slice(0, 120),
        email: (firebaseUser.email || existingDoc?.email || '').slice(0, 254),
        role: 'admin',
        tenantId: 'platform',
        status: 'active',
        createdAt: existingDoc?.createdAt || new Date().toISOString(),
      };
      setUser(masterOwnerUser);
      setTenant(null);
      setActiveBranchId(null);
      applyTenantTheme(null);
      setAuthError(null);
      writeCachedSession(firebaseUser.uid, {
        user: masterOwnerUser,
        tenant: null,
        isMasterAdmin: true,
      });
      pendingSignupInfo = null;
      return { status: 'authenticated' };
    }

    if (!userDocResult.ok) {
      const fetchErr = 'error' in userDocResult ? userDocResult.error : new Error('Profile fetch failed');
      try {
        handleFirestoreError(fetchErr, OperationType.GET, userPath);
      } catch (structuredError) {
        console.error(structuredError);
      }
      if (!useAuthStore.getState().user && commitToStore) {
        setAuthError('Failed to load your account profile from Firestore.');
        toast.error('Failed to load user profile');
      }
      return { status: 'error' };
    }

    const userDoc = userDocResult.docSnap;

    if (userDoc.exists()) {
      const userData = userDoc.data() as User;
      if (userData.status === 'inactive') {
        clearCachedSession(firebaseUser.uid);
        await clearAllLocalData().catch(() => {});
        await signOut(auth).catch(() => {});
        logout();
        setAuthError('Your account has been deactivated by your workspace administrator.');
        toast.error('Account deactivated. Contact your workspace administrator.');
        return { status: 'error' };
      }

      const prevUid = (() => {
        try {
          return localStorage.getItem(LAST_UID_KEY);
        } catch {
          return null;
        }
      })();
      const cachedUser = useAuthStore.getState().user;
      if (cachedUser && cachedUser.tenantId !== userData.tenantId) {
        await clearAllLocalData().catch(() => {});
      }

      setUser(userData);
      if (prevUid !== userData.uid || !useAuthStore.getState().activeBranchId) {
        setActiveBranchId(userData.branchId || null);
      }

      const tenantPath = `tenants/${userData.tenantId}`;
      try {
        const tenantDoc = await getDoc(doc(db, 'tenants', userData.tenantId));
        if (tenantDoc.exists()) {
          let loadedTenant = tenantDoc.data() as Tenant;
          if (
            userData.role === 'admin' &&
            firebaseUser.email &&
            (!loadedTenant.ownerEmail || !loadedTenant.ownerName)
          ) {
            const ownerPatch: Partial<Tenant> = {};
            if (!loadedTenant.ownerEmail) ownerPatch.ownerEmail = firebaseUser.email;
            if (!loadedTenant.ownerName) {
              ownerPatch.ownerName = userData.name || firebaseUser.displayName || 'Business Owner';
            }
            loadedTenant = { ...loadedTenant, ...ownerPatch };
            updateDoc(doc(db, 'tenants', userData.tenantId), ownerPatch).catch(() => {});
          }
          setTenant(loadedTenant);
          applyTenantTheme(loadedTenant);
          setAuthError(null);
          writeCachedSession(firebaseUser.uid, {
            user: userData,
            tenant: loadedTenant,
            isMasterAdmin: isMaster,
          });
        } else {
          clearCachedSession(firebaseUser.uid);
          setTenant(null);
          applyTenantTheme(null);
          if (commitToStore) {
            setAuthError('Your business workspace could not be found or has been removed.');
          }
        }
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.GET, tenantPath);
        } catch (structuredError) {
          console.error(structuredError);
        }
        if (!useAuthStore.getState().tenant) {
          setAuthError('Failed to load your business workspace.');
          toast.error('Failed to load business profile');
        }
      }

      // Non-blocking background sync for legacy member directory & email uniqueness registry
      void (async () => {
        try {
          const memberRef = doc(db, `tenants/${userData.tenantId}/members`, userData.uid);
          const memberSnap = await getDoc(memberRef);
          if (!memberSnap.exists()) {
            const memberPayload: TenantMember = stripUndefined({
              uid: userData.uid,
              tenantId: userData.tenantId,
              name: userData.name,
              email: userData.email,
              phone: userData.phone,
              role: userData.role,
              allowedSections: userData.allowedSections,
              branchId: userData.branchId,
              status: userData.status,
              createdAt: userData.createdAt,
            });
            await setDoc(memberRef, memberPayload);
          }
        } catch {
          // Ignore non-critical backfill errors
        }
        if (userData.email || firebaseUser.email) {
          await ensureEmailRegistryEntry(userData.email || firebaseUser.email || '', userData.tenantId);
        }
      })();

      pendingSignupInfo = null;
      return { status: 'authenticated' };
    }

    // Check if this user has a pending team invitation for an existing workspace
    const signupMeta = pendingSignupInfo;
    pendingSignupInfo = null;
    const normalizedEmail = (firebaseUser.email || '').trim().toLowerCase();

    if (normalizedEmail) {
      try {
        const inviteQuery = query(
          collection(db, 'staffInvites'),
          where('email', '==', normalizedEmail),
          where('status', '==', 'pending')
        );
        const inviteSnap = await getDocs(inviteQuery);
        if (!inviteSnap.empty) {
          const inviteDoc = inviteSnap.docs[0];
          const invite = inviteDoc.data() as StaffInvite;
          const nowIso = new Date().toISOString();
          const emailHash = await hashEmailForRegistry(normalizedEmail);
          const registryRef = doc(db, 'emailRegistry', emailHash);
          const registrySnap = await getDoc(registryRef).catch(() => null);

          const joinedUser: User = stripUndefined({
            uid: firebaseUser.uid,
            name: (
              signupMeta?.fullName?.trim() ||
              firebaseUser.displayName?.trim() ||
              invite.name
            ).slice(0, 120),
            email: normalizedEmail.slice(0, 254),
            role: invite.role,
            allowedSections: invite.allowedSections,
            tenantId: invite.tenantId,
            branchId: invite.branchId,
            inviteId: invite.id,
            status: 'active',
            createdAt: nowIso,
          });

          const memberRecord: TenantMember = stripUndefined({
            uid: firebaseUser.uid,
            tenantId: invite.tenantId,
            name: joinedUser.name,
            email: joinedUser.email,
            role: joinedUser.role,
            allowedSections: invite.allowedSections,
            branchId: joinedUser.branchId,
            status: 'active',
            createdAt: nowIso,
          });

          const batch = writeBatch(db);
          batch.set(userDocRef, joinedUser);
          batch.set(
            doc(db, `tenants/${invite.tenantId}/members`, firebaseUser.uid),
            memberRecord
          );
          batch.update(doc(db, 'staffInvites', invite.id), { status: 'accepted' });
          if (registrySnap?.exists()) {
            batch.update(registryRef, { type: 'account' });
          } else {
            batch.set(registryRef, {
              hash: emailHash,
              tenantId: invite.tenantId,
              type: 'account',
              createdAt: nowIso,
            });
          }
          await batch.commit();

          void logWorkspaceAudit({
            tenantId: invite.tenantId,
            branchId: joinedUser.branchId,
            actorId: joinedUser.uid,
            actorName: joinedUser.name,
            actorRole: joinedUser.role,
            action: 'USER_REGISTERED',
            entityType: 'auth',
            entityId: joinedUser.uid,
            summary: `${joinedUser.name} activated ${joinedUser.role} account via team invitation`,
          });

          if (commitToStore) {
            const tenantDoc = await getDoc(doc(db, 'tenants', invite.tenantId));
            setUser(joinedUser);
            setActiveBranchId(joinedUser.branchId || null);
            if (tenantDoc.exists()) {
              const loaded = tenantDoc.data() as Tenant;
              setTenant(loaded);
              applyTenantTheme(loaded);
              writeCachedSession(firebaseUser.uid, {
                user: joinedUser,
                tenant: loaded,
                isMasterAdmin: isMaster,
              });
            }
            setAuthError(null);
            toast.success(`Joined ${invite.tenantName} as ${invite.role}!`);
          }
          return { status: 'authenticated' };
        }
      } catch (inviteErr) {
        console.warn('Staff invite check skipped:', inviteErr);
      }
    }

    // If signing in (or restoring session) with an unregistered account, never auto-provision a workspace
    if (requireExistingProfile) {
      const email = (firebaseUser.email || '').trim();
      const fullName = (firebaseUser.displayName || '').trim();
      clearCachedSession(firebaseUser.uid);
      clearAllHookCaches();
      resetWarmedHookScopes();
      await clearAllLocalData().catch(() => {});
      await signOut(auth).catch(() => {});
      applyTenantTheme(null);
      logout();
      return { status: 'needs_signup', email, fullName };
    }

    // New business workspace registration: first account is ALWAYS 'admin' with full business access
    const displayName = (
      signupMeta?.fullName?.trim() ||
      firebaseUser.displayName?.trim() ||
      firebaseUser.email?.split('@')[0] ||
      'Business Owner'
    ).slice(0, 120);
    const hasExplicitBusinessName = Boolean(signupMeta?.businessName?.trim());
    const businessName = (
      signupMeta?.businessName?.trim() || 'My Business'
    ).slice(0, 150);

    const newTenantId = crypto.randomUUID();
    const defaultBranchId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    try {
      const plansSnap = await getDoc(doc(db, 'platformConfig', 'plans'));
      if (plansSnap.exists()) {
        setSyncedPlatformPlansConfig(plansSnap.data() as PlatformPlansConfig);
      }
    } catch {
      // Fall back to default platform plan settings if unavailable
    }

    const defaultPlan = getDefaultSignupPlan();
    const defaultQuota = getPlanQuota(defaultPlan);
    const trialDays = getTrialDaysCount();
    const newTenant: Tenant = stripUndefined({
      id: newTenantId,
      name: businessName,
      ownerEmail: firebaseUser.email ? firebaseUser.email.slice(0, 254) : undefined,
      ownerName: displayName,
      plan: defaultPlan,
      status: 'trial',
      trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString(),
      legalAcceptedAt: signupMeta?.legalAcceptedAt,
      legalVersion: signupMeta?.legalVersion,
      createdAt: nowIso,
      preferences: {
        taxEnabled: false,
        taxRate: 18,
        taxInclusive: true,
        mtnMomoEnabled: true,
        whatsappReceipts: false,
      },
    });

    const defaultBranch: Branch = {
      id: defaultBranchId,
      tenantId: newTenantId,
      name: 'Main Branch',
      location: 'Headquarters',
      isDefault: true,
      status: 'active',
      createdAt: nowIso,
    };

    const newUser: User = {
      uid: firebaseUser.uid,
      name: displayName,
      email: (firebaseUser.email || '').slice(0, 254),
      role: 'admin',
      tenantId: newTenantId,
      branchId: defaultBranchId,
      status: 'active',
      createdAt: nowIso,
    };

    const newMember: TenantMember = {
      uid: firebaseUser.uid,
      tenantId: newTenantId,
      name: displayName,
      email: (firebaseUser.email || '').slice(0, 254),
      role: 'admin',
      branchId: defaultBranchId,
      status: 'active',
      createdAt: nowIso,
    };

    try {
      const emailHash = normalizedEmail ? await hashEmailForRegistry(normalizedEmail) : '';
      const existingRegistry = emailHash
        ? await getDoc(doc(db, 'emailRegistry', emailHash)).catch(() => null)
        : null;

      const batch = writeBatch(db);
      batch.set(doc(db, 'tenants', newTenantId), newTenant);
      batch.set(userDocRef, newUser);
      batch.set(doc(db, `tenants/${newTenantId}/members`, firebaseUser.uid), newMember);
      batch.set(doc(db, `tenants/${newTenantId}/branches`, defaultBranchId), defaultBranch);
      if (emailHash && (!existingRegistry || !existingRegistry.exists())) {
        batch.set(doc(db, 'emailRegistry', emailHash), {
          hash: emailHash,
          tenantId: newTenantId,
          type: 'account',
          createdAt: nowIso,
        });
      }
      await batch.commit();

      if (commitToStore) {
        setUser(newUser);
        setTenant(newTenant);
        applyTenantTheme(newTenant);
        setActiveBranchId(defaultBranchId);
        setAuthError(null);
        writeCachedSession(firebaseUser.uid, {
          user: newUser,
          tenant: newTenant,
          isMasterAdmin: isMaster,
        });
        toast.success(`Welcome to PrimeStock Business Management System! Your ${trialDays}-day free trial has started.`);
      }

      const regAuditId = crypto.randomUUID();
      void setDoc(doc(db, `tenants/${newTenantId}/auditLogs`, regAuditId), {
        id: regAuditId,
        tenantId: newTenantId,
        branchId: defaultBranchId,
        actorId: newUser.uid,
        actorName: newUser.name,
        actorRole: newUser.role,
        action: 'USER_REGISTERED',
        entityType: 'auth',
        entityId: newUser.uid,
        summary: `Registered ${businessName} workspace and admin account (${newUser.email || displayName})`,
        createdAt: nowIso,
      }).catch(() => {});

      const welcomeNotifId = `welcome_${newTenantId.slice(0, 8)}`;
      const welcomeMsg = `Welcome to PrimeStock Business Management System. Your ${trialDays}-day free trial for ${
        hasExplicitBusinessName ? businessName : 'your business'
      } runs until ${formatDate(
        newTenant.trialEndsAt
      )}. Update your business name, logo, colors, and branch details anytime in Settings and Team & Branches.`;
      const welcomeNotif: AppNotification = {
        id: welcomeNotifId,
        tenantId: newTenantId,
        title: 'Welcome to PrimeStock Business Management System',
        message: welcomeMsg,
        category: 'system',
        severity: 'info',
        read: false,
        actionRoute: '/settings',
        channel: 'all',
        createdAt: nowIso,
      };
      setDoc(doc(db, `tenants/${newTenantId}/notifications`, welcomeNotifId), welcomeNotif).catch(
        () => {}
      );

      if (firebaseUser.email) {
        sendTransactionalEmail({
          to: firebaseUser.email,
          subject: `Welcome to PrimeStock Business Management System (${trialDays}-Day Free Trial)`,
          text: `${welcomeMsg}\n\nWorkspace URL: ${
            typeof window !== 'undefined' ? window.location.origin : ''
          }`,
          html: buildSubscriptionEmailHtml({
            businessName: hasExplicitBusinessName
              ? businessName
              : 'PrimeStock Business Management System',
            headline: 'Welcome to PrimeStock Business Management System',
            message: welcomeMsg,
            planLabel: `${defaultQuota.name} (${trialDays}-Day Free Trial)`,
            expiryLabel: formatDate(newTenant.trialEndsAt),
            actionLabel: 'Sign In to Workspace',
            actionUrl:
              typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
          }),
        }).catch(() => {});
      }
      return { status: 'authenticated' };
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, `tenants/${newTenantId}`);
      } catch (structuredError) {
        console.error(structuredError);
      }
      setAuthError('Account authenticated, but workspace provisioning failed.');
      toast.error('Failed to set up business workspace');
      return { status: 'error' };
    }
  })().finally(() => {
    profileSyncInFlight.delete(firebaseUser.uid);
  });

  profileSyncInFlight.set(firebaseUser.uid, syncTask);
  return syncTask;
}

export function useAuthObserver() {
  const { setLoading, logout, setUser, setTenant, setActiveBranchId, setMasterAdmin, setAuthError, user } =
    useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (registrationSignOutPending || googlePopupInFlight || emailAuthInFlight) {
          return;
        }
        if (firebaseUser) {
          const cached = readCachedSession(firebaseUser.uid);
          if (cached) {
            setMasterAdmin(cached.isMasterAdmin);
            setUser(cached.user);
            setTenant(cached.tenant);
            setActiveBranchId(cached.user.branchId || null);
            applyTenantTheme(cached.tenant);
            setLoading(false);
            void syncAuthenticatedUser(firebaseUser, { requireExistingProfile: !pendingSignupInfo });
          } else {
            await syncAuthenticatedUser(firebaseUser, { requireExistingProfile: !pendingSignupInfo });
          }
        } else {
          clearCachedSession(useAuthStore.getState().user?.uid);
          clearAllHookCaches();
          resetWarmedHookScopes();
          applyTenantTheme(null);
          logout();
        }
      } catch (err) {
        console.error('Auth state observer error:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [setLoading, logout, setUser, setTenant, setActiveBranchId, setMasterAdmin]);

  // Real-time security listener on the signed-in user's profile: enforces immediate deactivation, role & section updates
  useEffect(() => {
    if (!user?.uid || user.tenantId === 'platform') return;
    const unsubUser = onSnapshot(
      doc(db, 'users', user.uid),
      async (snap) => {
        if (!snap.exists()) return;
        const latest = snap.data() as User;
        if (latest.status === 'inactive') {
          clearCachedSession(user.uid);
          clearAllHookCaches();
          resetWarmedHookScopes();
          await clearAllLocalData().catch(() => {});
          await signOut(auth).catch(() => {});
          applyTenantTheme(null);
          logout();
          setAuthError('Your account has been deactivated by your workspace administrator.');
          toast.error('Session ended: your account was deactivated.');
          return;
        }
        const sectionsChanged =
          JSON.stringify(latest.allowedSections || []) !==
          JSON.stringify(user.allowedSections || []);
        if (
          latest.role !== user.role ||
          latest.branchId !== user.branchId ||
          latest.name !== user.name ||
          (latest.phone || '') !== (user.phone || '') ||
          (latest.email || '') !== (user.email || '') ||
          sectionsChanged
        ) {
          setUser(latest);
          const currentTenant = useAuthStore.getState().tenant;
          if (currentTenant) {
            writeCachedSession(latest.uid, {
              user: latest,
              tenant: currentTenant,
              isMasterAdmin: useAuthStore.getState().isMasterAdmin,
            });
          }
        }
      },
      (err) => {
        console.warn('User status watch error:', err);
      }
    );

    return () => unsubUser();
  }, [
    user?.uid,
    user?.tenantId,
    user?.role,
    user?.branchId,
    user?.name,
    user?.phone,
    user?.email,
    user?.allowedSections,
    logout,
    setUser,
    setAuthError,
  ]);

  // Real-time listener on tenant workspace: propagates Master Admin approvals/free grants/suspensions/reminders & White-Label branding immediately
  useEffect(() => {
    if (!user?.tenantId || user.tenantId === 'platform') return;
    const unsubTenant = onSnapshot(
      doc(db, 'tenants', user.tenantId),
      (snap) => {
        if (!snap.exists()) return;
        const latestTenant = snap.data() as Tenant;
        setTenant(latestTenant);
        applyTenantTheme(latestTenant);
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          writeCachedSession(currentUser.uid, {
            user: currentUser,
            tenant: latestTenant,
            isMasterAdmin: useAuthStore.getState().isMasterAdmin,
          });
        }
      },
      (err) => {
        console.warn('Tenant watch error:', err);
      }
    );

    return () => unsubTenant();
  }, [user?.tenantId, setTenant]);
}

export function useAuth() {
  const { setAuthenticating, setAuthError, clearAuthError, logout } = useAuthStore();

  const loginWithGoogle = async (options?: {
    intent?: 'signin' | 'signup';
    fullName?: string;
    businessName?: string;
    legalAcceptedAt?: string;
    legalVersion?: string;
  }): Promise<{ ok: boolean; needsSignup?: boolean; email?: string; fullName?: string }> => {
    if (googlePopupInFlight || emailAuthInFlight) return { ok: false };
    const intent = options?.intent || (options?.legalAcceptedAt ? 'signup' : 'signin');
    googlePopupInFlight = true;
    clearAuthError();
    setAuthenticating(true);
    if (intent === 'signup') {
      pendingSignupInfo = {
        fullName: options?.fullName?.trim() || undefined,
        businessName: options?.businessName?.trim() || undefined,
        legalAcceptedAt: options?.legalAcceptedAt || new Date().toISOString(),
        legalVersion: options?.legalVersion || '2026-11',
      };
    } else {
      pendingSignupInfo = null;
    }

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(auth, provider);
      const outcome = await syncAuthenticatedUser(credential.user, {
        requireExistingProfile: intent === 'signin',
      });
      if (outcome.status === 'needs_signup') {
        return {
          ok: false,
          needsSignup: true,
          email: outcome.email,
          fullName: outcome.fullName,
        };
      }
      const signedInUser = useAuthStore.getState().user;
      if (signedInUser && signedInUser.tenantId !== 'platform') {
        void logWorkspaceAudit({
          tenantId: signedInUser.tenantId,
          branchId: signedInUser.branchId,
          actorId: signedInUser.uid,
          actorName: signedInUser.name,
          actorRole: signedInUser.role,
          action: 'USER_SIGNED_IN',
          entityType: 'auth',
          entityId: signedInUser.uid,
          summary: `${signedInUser.name} (${signedInUser.role}) signed in with Google`,
        });
      }
      return { ok: outcome.status === 'authenticated' };
    } catch (error) {
      pendingSignupInfo = null;
      const code = getFirebaseErrorCode(error);
      const message = mapAuthErrorMessage(code);

      if (code === 'auth/popup-closed-by-user' || code === 'auth/user-cancelled') {
        setAuthError(message);
        toast(message, { icon: 'ℹ️' });
      } else if (code === 'auth/cancelled-popup-request') {
        setAuthError(message);
      } else {
        console.error('Google sign-in error:', code || error);
        setAuthError(message);
        toast.error(message);
      }
      return { ok: false };
    } finally {
      googlePopupInFlight = false;
      setAuthenticating(false);
    }
  };

  const loginWithEmail = async (
    email: string,
    password: string
  ): Promise<{ ok: boolean; needsSignup?: boolean; email?: string; fullName?: string; errorCode?: string }> => {
    if (googlePopupInFlight || emailAuthInFlight) return { ok: false };
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      const msg = 'Please enter both your email address and password.';
      setAuthError(msg);
      return { ok: false };
    }

    emailAuthInFlight = true;
    clearAuthError();
    setAuthenticating(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const outcome = await syncAuthenticatedUser(credential.user, {
        requireExistingProfile: true,
      });
      if (outcome.status === 'needs_signup') {
        return {
          ok: false,
          needsSignup: true,
          email: outcome.email || trimmedEmail,
          fullName: outcome.fullName,
        };
      }
      const signedInUser = useAuthStore.getState().user;
      if (signedInUser) {
        if (signedInUser.tenantId !== 'platform') {
          void logWorkspaceAudit({
            tenantId: signedInUser.tenantId,
            branchId: signedInUser.branchId,
            actorId: signedInUser.uid,
            actorName: signedInUser.name,
            actorRole: signedInUser.role,
            action: 'USER_SIGNED_IN',
            entityType: 'auth',
            entityId: signedInUser.uid,
            summary: `${signedInUser.name} (${signedInUser.role}) signed in with email`,
          });
        }
        return { ok: true };
      }
      return { ok: false };
    } catch (error) {
      const code = getFirebaseErrorCode(error);
      if (code === 'auth/user-not-found') {
        return { ok: false, needsSignup: true, email: trimmedEmail, errorCode: code };
      }
      const message = mapAuthErrorMessage(code);
      if (!EXPECTED_USER_AUTH_CODES.has(code)) {
        console.error('Email sign-in error:', code || error);
      }
      setAuthError(message);
      toast.error(message);
      return { ok: false, errorCode: code };
    } finally {
      emailAuthInFlight = false;
      setAuthenticating(false);
    }
  };

  const registerWithEmail = async (params: {
    fullName: string;
    businessName: string;
    email: string;
    password: string;
    legalAccepted?: boolean;
    legalVersion?: string;
  }): Promise<{ ok: boolean; email?: string }> => {
    if (googlePopupInFlight || emailAuthInFlight) return { ok: false };

    const fullName = params.fullName.trim();
    const businessName = params.businessName.trim();
    const email = params.email.trim();
    const password = params.password;

    if (!fullName || !businessName || !email) {
      setAuthError('Please complete your full name, business name, and email address.');
      return { ok: false };
    }
    if (!params.legalAccepted) {
      setAuthError('Please review and accept the Terms of Service and Privacy Policy before creating an account.');
      return { ok: false };
    }
    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return { ok: false };
    }

    emailAuthInFlight = true;
    registrationSignOutPending = true;
    clearAuthError();
    setAuthenticating(true);
    pendingSignupInfo = {
      fullName,
      businessName,
      legalAcceptedAt: new Date().toISOString(),
      legalVersion: params.legalVersion || '2026-11',
    };

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      void updateProfile(credential.user, { displayName: fullName }).catch(() => {});
      void sendEmailVerification(credential.user).catch(() => {});

      const outcome = await syncAuthenticatedUser(credential.user, {
        commitToStore: false,
        requireExistingProfile: false,
      });
      clearCachedSession(credential.user.uid);
      clearAllHookCaches();
      resetWarmedHookScopes();
      await clearAllLocalData().catch(() => {});
      await signOut(auth).catch(() => {});
      applyTenantTheme(null);
      logout();

      if (outcome.status !== 'authenticated') {
        return { ok: false };
      }
      toast.success('Account created! Please sign in to access your workspace.');
      return { ok: true, email };
    } catch (error) {
      pendingSignupInfo = null;
      const code = getFirebaseErrorCode(error);
      const message = mapAuthErrorMessage(code);
      if (!EXPECTED_USER_AUTH_CODES.has(code)) {
        console.error('Email registration error:', code || error);
      }
      setAuthError(message);
      toast.error(message);
      return { ok: false };
    } finally {
      registrationSignOutPending = false;
      emailAuthInFlight = false;
      setAuthenticating(false);
    }
  };

  const resetPassword = async (email: string): Promise<boolean> => {
    if (googlePopupInFlight || emailAuthInFlight) return false;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthError('Please enter your email address to receive a reset link.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setAuthError('Please enter a valid email address.');
      return false;
    }

    emailAuthInFlight = true;
    clearAuthError();
    setAuthenticating(true);

    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      toast.success('Password reset instructions sent.');
      return true;
    } catch (error) {
      const code = getFirebaseErrorCode(error);
      const message =
        code === 'auth/user-not-found'
          ? 'No account found with that email address.'
          : code === 'auth/missing-email'
          ? 'Please enter your email address to receive a reset link.'
          : mapAuthErrorMessage(code);
      if (!EXPECTED_USER_AUTH_CODES.has(code)) {
        console.error('Password reset error:', code || error);
      }
      setAuthError(message);
      toast.error(message);
      return false;
    } finally {
      emailAuthInFlight = false;
      setAuthenticating(false);
    }
  };

  const resendVerificationEmail = async (): Promise<boolean> => {
    const current = auth.currentUser;
    if (!current) {
      toast.error('Please sign in first');
      return false;
    }
    if (current.emailVerified) {
      toast.success('Your email address is already verified');
      return true;
    }
    try {
      await sendEmailVerification(current);
      toast.success(`Verification email sent to ${current.email}`);
      return true;
    } catch (error) {
      console.error('Verification email error:', error);
      toast.error('Unable to send verification email right now. Try again shortly.');
      return false;
    }
  };

  const refreshAuthSession = async (): Promise<boolean> => {
    const current = auth.currentUser;
    if (!current) return false;
    try {
      await current.reload();
      await current.getIdToken(true);
      await syncAuthenticatedUser(current);
      if (current.emailVerified) {
        toast.success('Email verification confirmed!');
      } else {
        toast(
          'Email still shows unverified. Click the link in your inbox, then refresh again.',
          { icon: 'ℹ️' }
        );
      }
      return current.emailVerified;
    } catch (error) {
      console.error('Session refresh error:', error);
      toast.error('Failed to refresh verification status');
      return false;
    }
  };

  const deleteAdminAccountAndWorkspace = async (
    password?: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const currentUser = auth.currentUser;
    const { user: storeUser, tenant: storeTenant } = useAuthStore.getState();

    if (!currentUser || !storeUser || !storeTenant) {
      return { ok: false, error: 'You must be signed in as the business administrator.' };
    }
    if (storeUser.role !== 'admin') {
      const msg = 'Only the business admin can permanently delete this workspace and account.';
      toast.error(msg);
      return { ok: false, error: msg };
    }
    if (!navigator.onLine) {
      const msg = 'Connect to the internet to permanently delete your account and cloud workspace.';
      toast.error(msg);
      return { ok: false, error: msg };
    }

    const usesPasswordProvider = currentUser.providerData.some((p) => p.providerId === 'password');
    const usesGoogleProvider = currentUser.providerData.some((p) => p.providerId === 'google.com');

    // Step 1: Verify identity BEFORE wiping any cloud data so deleteUser() cannot fail with requires-recent-login
    try {
      if (usesPasswordProvider && currentUser.email) {
        if (!password || !password.trim()) {
          return { ok: false, error: 'Enter your current password to confirm account deletion.' };
        }
        const cred = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, cred);
      } else if (usesGoogleProvider) {
        const provider = new GoogleAuthProvider();
        await reauthenticateWithPopup(currentUser, provider);
      }
    } catch (err) {
      const code = getFirebaseErrorCode(err);
      const msg =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Incorrect password. Account deletion cancelled.'
          : code === 'auth/popup-closed-by-user' || code === 'auth/user-cancelled'
          ? 'Verification window closed or cancelled. Account deletion cancelled.'
          : 'Could not verify your identity. Please try again.';
      toast.error(msg);
      return { ok: false, error: msg };
    }

    const tenantId = storeTenant.id;
    const adminUid = currentUser.uid;

    try {
      // Step 2: Gather all member emails and staff invites belonging to this workspace
      const [membersSnap, invitesSnap] = await Promise.all([
        getDocs(collection(db, `tenants/${tenantId}/members`)),
        getDocs(query(collection(db, 'staffInvites'), where('tenantId', '==', tenantId))),
      ]);

      const emailSet = new Set<string>();
      if (currentUser.email) emailSet.add(currentUser.email.trim().toLowerCase());
      if (storeUser.email) emailSet.add(storeUser.email.trim().toLowerCase());
      if (storeTenant.ownerEmail) emailSet.add(storeTenant.ownerEmail.trim().toLowerCase());

      const otherMemberUids: string[] = [];
      for (const mDoc of membersSnap.docs) {
        const m = mDoc.data() as TenantMember;
        if (m.email) emailSet.add(m.email.trim().toLowerCase());
        if (m.uid && m.uid !== adminUid) otherMemberUids.push(m.uid);
      }
      for (const invDoc of invitesSnap.docs) {
        const inv = invDoc.data() as StaffInvite;
        if (inv.email) emailSet.add(inv.email.trim().toLowerCase());
      }

      const emailHashes = await Promise.all(
        Array.from(emailSet)
          .filter(Boolean)
          .map((em) => hashEmailForRegistry(em))
      );

      // Step 3: Delete all tenant operational subcollections in parallel
      await Promise.all(
        ALL_TENANT_SUBCOLLECTIONS.map((sub) =>
          deleteCollectionInBatches(`tenants/${tenantId}/${sub}`)
        )
      );

      // Step 4: Delete invites, emailRegistry locks, and non-admin staff member/user records
      await Promise.all([
        ...invitesSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})),
        ...emailHashes.map((h) => deleteDoc(doc(db, 'emailRegistry', h)).catch(() => {})),
        ...otherMemberUids.map((uid) =>
          Promise.allSettled([
            deleteDoc(doc(db, `tenants/${tenantId}/members`, uid)),
            deleteDoc(doc(db, 'users', uid)),
          ])
        ),
      ]);

      // Step 5: Delete admin member doc, tenant document, and admin's /users/{uid} last
      await deleteDoc(doc(db, `tenants/${tenantId}/members`, adminUid)).catch(() => {});
      await deleteDoc(doc(db, 'tenants', tenantId));
      await deleteDoc(doc(db, 'users', adminUid));

      // Step 6: Delete Firebase Auth user and clear all local browser caches
      await deleteUser(currentUser);
      clearWorkspaceStorageKeys(adminUid, tenantId);
      try {
        const savedEmail = localStorage.getItem('primestock_remembered_email');
        if (savedEmail && emailSet.has(savedEmail.trim().toLowerCase())) {
          localStorage.removeItem('primestock_remembered_email');
        }
      } catch {
        // Ignore storage errors
      }
      clearAllHookCaches();
      resetWarmedHookScopes();
      await clearAllLocalData().catch(() => {});
      applyTenantTheme(null);
      logout();

      toast.success('Your account and entire business workspace have been permanently deleted.');
      return { ok: true };
    } catch (error) {
      console.error('Account deletion failed:', error);
      const msg =
        'Failed to erase all workspace data. Please sign out and sign back in before retrying.';
      toast.error(msg);
      return { ok: false, error: msg };
    }
  };

  const handleLogout = async () => {
    const currentUid = useAuthStore.getState().user?.uid || auth.currentUser?.uid;
    try {
      clearCachedSession(currentUid);
      clearAllHookCaches();
      resetWarmedHookScopes();
      await signOut(auth);
      await clearAllLocalData();
      applyTenantTheme(null);
      logout();
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Logout failed');
    }
  };

  return {
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    resetPassword,
    resendVerificationEmail,
    refreshAuthSession,
    deleteAdminAccountAndWorkspace,
    handleLogout,
  };
}
