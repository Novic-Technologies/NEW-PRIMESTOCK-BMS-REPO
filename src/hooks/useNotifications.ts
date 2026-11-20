import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { useTrialGuard } from './useTrialGuard';
import { AppNotification, Product } from '../types';
import { getPlanQuota } from '../utils/planLimits';
import { formatDate, formatUGX } from '../utils/format';
import { stripUndefined } from '../utils/firestoreUtils';
import {
  buildSubscriptionEmailHtml,
  sendTransactionalEmail,
} from '../services/notificationService';
import toast from 'react-hot-toast';

export interface UnifiedNotification {
  id: string;
  title: string;
  message: string;
  category: AppNotification['category'];
  severity: AppNotification['severity'];
  read: boolean;
  actionRoute?: string;
  createdAt: string;
  source: 'firestore' | 'system';
}

interface UseNotificationsOptions {
  lowStockProducts: Product[];
  expiringSoonProducts: Product[];
  pendingCount: number;
  getStockCount: (p: Product) => number;
}

function readLocalSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function writeLocalSet(key: string, values: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(values).slice(-250)));
  } catch {
    // Ignore storage errors
  }
}

export function useNotifications({
  lowStockProducts,
  expiringSoonProducts,
  pendingCount,
  getStockCount,
}: UseNotificationsOptions) {
  const { tenant, user } = useAuthStore();
  const trialState = useTrialGuard();
  const [firestoreItems, setFirestoreItems] = useState<AppNotification[]>([]);

  const tenantId = tenant?.id;
  const userId = user?.uid;
  const scopeKey = tenantId && userId ? `${tenantId}_${userId}` : tenantId || '';
  const readKey = scopeKey ? `primestock_notif_read_${scopeKey}` : '';
  const deletedKey = scopeKey ? `primestock_notif_deleted_${scopeKey}` : '';
  const seenBadgeKey = scopeKey ? `primestock_notif_seen_badge_${scopeKey}` : '';

  const [localReadIds, setLocalReadIds] = useState<Set<string>>(() =>
    readKey ? readLocalSet(readKey) : new Set<string>()
  );
  const [localDeletedIds, setLocalDeletedIds] = useState<Set<string>>(() =>
    deletedKey ? readLocalSet(deletedKey) : new Set<string>()
  );
  const [seenBadgeIds, setSeenBadgeIds] = useState<Set<string>>(() =>
    seenBadgeKey ? readLocalSet(seenBadgeKey) : new Set<string>()
  );

  const autoSweepRanRef = useRef<string>('');

  useEffect(() => {
    setLocalReadIds(readKey ? readLocalSet(readKey) : new Set<string>());
    setLocalDeletedIds(deletedKey ? readLocalSet(deletedKey) : new Set<string>());
    setSeenBadgeIds(seenBadgeKey ? readLocalSet(seenBadgeKey) : new Set<string>());
  }, [readKey, deletedKey, seenBadgeKey]);

  // Listen to persisted Firestore notifications (capped to 50 most recent for speed)
  useEffect(() => {
    if (!tenantId) {
      setFirestoreItems([]);
      return;
    }

    const q = query(
      collection(db, `tenants/${tenantId}/notifications`),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
        setFirestoreItems(list);
      },
      (err) => {
        console.warn('Notifications listener warning:', err);
      }
    );

    return () => unsub();
  }, [tenantId]);

  // Automatic 1-month expiry / 3-day pre-expiry reminder dispatch for the signed-in admin
  useEffect(() => {
    if (!tenant || !user || user.role !== 'admin') return;
    if (tenant.autoRemindersEnabled === false || trialState.isComplimentary) return;
    if (trialState.isPendingApproval) return;

    const needsReminder =
      trialState.isExpired ||
      (trialState.effectiveEndsAt !== null && trialState.daysRemaining <= 3);

    if (!needsReminder) return;

    const todayKey = new Date().toISOString().slice(0, 10);
    const guardKey = `${tenant.id}_${todayKey}_${trialState.isExpired ? 'exp' : 'warn'}`;
    if (autoSweepRanRef.current === guardKey) return;

    const lastAutoMs = tenant.lastAutoReminderAt ? new Date(tenant.lastAutoReminderAt).getTime() : 0;
    if (lastAutoMs && Date.now() - lastAutoMs < 24 * 60 * 60 * 1000) {
      autoSweepRanRef.current = guardKey;
      return;
    }

    autoSweepRanRef.current = guardKey;
    const notifId = `auto_${todayKey}_${trialState.isExpired ? 'expired' : 'due_soon'}`;
    const planQuota = getPlanQuota(tenant.plan);
    const feeUgx =
      typeof tenant.customPriceUgx === 'number' ? tenant.customPriceUgx : planQuota.monthlyPriceUgx;
    const expiryLabel = trialState.effectiveEndsAt
      ? formatDate(trialState.effectiveEndsAt.toISOString())
      : 'today';

    const title = trialState.isExpired
      ? trialState.isTrial
        ? '14-Day Free Trial Ended — Upgrade Required'
        : 'Monthly Subscription Expired — Renewal Required'
      : `Subscription Renewal Due in ${trialState.daysRemaining} Day${
          trialState.daysRemaining === 1 ? '' : 's'
        }`;

    const message = trialState.isExpired
      ? `Your ${planQuota.name} access (${formatUGX(feeUgx)}/month) expired on ${expiryLabel}. Renew via MTN MoMo or Airtel Money in Billing to restore full operations.`
      : `Friendly automated reminder: your ${planQuota.name} subscription (${formatUGX(
          feeUgx
        )}/month) ends on ${expiryLabel}. Renew early in Billing to avoid interruption.`;

    const nowIso = new Date().toISOString();

    const runAutoReminder = async () => {
      try {
        const notifDoc: AppNotification = stripUndefined({
          id: notifId,
          tenantId: tenant.id,
          title,
          message,
          category: 'billing',
          severity: trialState.isExpired ? 'critical' : 'warning',
          read: false,
          actionRoute: '/billing',
          channel: 'all',
          createdAt: nowIso,
        });
        await setDoc(doc(db, `tenants/${tenant.id}/notifications`, notifId), notifDoc);
        await updateDoc(doc(db, 'tenants', tenant.id), {
          lastAutoReminderAt: nowIso,
        });

        const recipientEmail = (tenant.ownerEmail || user.email || '').trim();
        if (recipientEmail) {
          await sendTransactionalEmail({
            to: recipientEmail,
            subject: `${title} — ${tenant.name}`,
            text: `${title}\n\n${message}\n\nPlan: ${planQuota.name} (${formatUGX(
              feeUgx
            )}/month)\nCycle Expiry: ${expiryLabel}`,
            html: buildSubscriptionEmailHtml({
              businessName: tenant.name,
              headline: title,
              message,
              planLabel: `${planQuota.name} (${formatUGX(feeUgx)}/month)`,
              expiryLabel,
            }),
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('Auto reminder skipped:', err);
      }
    };

    void runAutoReminder();
  }, [
    tenant?.id,
    tenant?.name,
    tenant?.plan,
    tenant?.customPriceUgx,
    tenant?.ownerEmail,
    tenant?.autoRemindersEnabled,
    tenant?.lastAutoReminderAt,
    user?.uid,
    user?.role,
    user?.email,
    trialState.isComplimentary,
    trialState.isPendingApproval,
    trialState.isExpired,
    trialState.isTrial,
    trialState.daysRemaining,
    trialState.effectiveEndsAt,
  ]);

  const notifications: UnifiedNotification[] = useMemo(() => {
    const combined: UnifiedNotification[] = [];
    const seenIds = new Set<string>();

    firestoreItems.forEach((n) => {
      if (seenIds.has(n.id)) return;
      seenIds.add(n.id);
      combined.push({
        id: n.id,
        title: n.title,
        message: n.message,
        category: n.category,
        severity: n.severity,
        read: Boolean(n.read),
        actionRoute: n.actionRoute,
        createdAt: n.createdAt,
        source: 'firestore',
      });
    });

    const nowIso = new Date().toISOString();

    if (tenant?.lastReminderMessage) {
      const id = `sys_rem_${tenant.lastReminderAt || 'latest'}`;
      if (!localDeletedIds.has(id)) {
        combined.push({
          id,
          title: 'Subscription Reminder',
          message: tenant.lastReminderMessage,
          category: 'billing',
          severity: 'warning',
          read: localReadIds.has(id),
          actionRoute: '/billing',
          createdAt: tenant.lastReminderAt || nowIso,
          source: 'system',
        });
      }
    }

    if (pendingCount > 0) {
      const id = `sys_sync_${pendingCount}`;
      if (!localDeletedIds.has(id)) {
        combined.push({
          id,
          title: `${pendingCount} unsynced ${pendingCount === 1 ? 'change' : 'changes'}`,
          message: navigator.onLine
            ? 'Pending offline changes are ready to sync to the cloud.'
            : 'Saved offline locally. Will sync automatically once connected.',
          category: 'system',
          severity: 'info',
          read: localReadIds.has(id),
          createdAt: nowIso,
          source: 'system',
        });
      }
    }

    expiringSoonProducts.slice(0, 6).forEach((p) => {
      const id = `sys_exp_${p.id}`;
      if (localDeletedIds.has(id)) return;
      combined.push({
        id,
        title: `Expiry Watch · ${p.name}`,
        message: `Expires ${p.expiryDate} (${getStockCount(p)} ${p.unit || 'pcs'} in stock)`,
        category: 'expiry',
        severity: 'warning',
        read: localReadIds.has(id),
        actionRoute: '/inventory',
        createdAt: p.createdAt || nowIso,
        source: 'system',
      });
    });

    lowStockProducts.slice(0, 8).forEach((p) => {
      const id = `sys_low_${p.id}`;
      if (localDeletedIds.has(id)) return;
      combined.push({
        id,
        title: `Low Stock · ${p.name}`,
        message: `${getStockCount(p)} ${p.unit || 'pcs'} remaining (minimum ${p.minStockLevel})`,
        category: 'stock',
        severity: 'critical',
        read: localReadIds.has(id),
        actionRoute: '/inventory',
        createdAt: p.createdAt || nowIso,
        source: 'system',
      });
    });

    return combined;
  }, [
    firestoreItems,
    tenant?.lastReminderMessage,
    tenant?.lastReminderAt,
    pendingCount,
    expiringSoonProducts,
    lowStockProducts,
    getStockCount,
    localDeletedIds,
    localReadIds,
  ]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // Badge counter clears immediately when the Bell is clicked (only new unseen unread IDs show badge)
  const badgeCount = useMemo(
    () => notifications.filter((n) => !n.read && !seenBadgeIds.has(n.id)).length,
    [notifications, seenBadgeIds]
  );

  const dismissBadgeCounter = useCallback(() => {
    if (!seenBadgeKey) return;
    const next = new Set<string>(seenBadgeIds);
    notifications.forEach((n) => {
      if (!n.read) next.add(n.id);
    });
    setSeenBadgeIds(next);
    writeLocalSet(seenBadgeKey, next);
  }, [notifications, seenBadgeIds, seenBadgeKey]);

  const setNotificationReadState = useCallback(
    async (item: UnifiedNotification, read: boolean) => {
      if (!tenantId) return;
      if (item.source === 'firestore') {
        try {
          await updateDoc(doc(db, `tenants/${tenantId}/notifications`, item.id), {
            read,
            ...(read ? { readAt: new Date().toISOString() } : { readAt: '' }),
          });
        } catch (err) {
          console.warn('Update notification failed:', err);
          toast.error('Unable to update notification');
        }
      } else if (readKey) {
        const next = new Set<string>(localReadIds);
        if (read) {
          next.add(item.id);
        } else {
          next.delete(item.id);
        }
        setLocalReadIds(next);
        writeLocalSet(readKey, next);
      }

      if (read && seenBadgeKey && !seenBadgeIds.has(item.id)) {
        const nextSeen = new Set<string>(seenBadgeIds);
        nextSeen.add(item.id);
        setSeenBadgeIds(nextSeen);
        writeLocalSet(seenBadgeKey, nextSeen);
      }
    },
    [tenantId, readKey, localReadIds, seenBadgeKey, seenBadgeIds]
  );

  const markAllAsRead = useCallback(async () => {
    if (!tenantId) return;
    const unreadFirestore = notifications.filter((n) => n.source === 'firestore' && !n.read);
    const nowIso = new Date().toISOString();

    if (unreadFirestore.length > 0) {
      await Promise.all(
        unreadFirestore.map((n) =>
          updateDoc(doc(db, `tenants/${tenantId}/notifications`, n.id), {
            read: true,
            readAt: nowIso,
          }).catch(() => {})
        )
      );
    }

    if (readKey) {
      const nextRead = new Set<string>(localReadIds);
      notifications.forEach((n) => {
        if (n.source === 'system') nextRead.add(n.id);
      });
      setLocalReadIds(nextRead);
      writeLocalSet(readKey, nextRead);
    }

    dismissBadgeCounter();
    toast.success('All notifications marked as read');
  }, [tenantId, notifications, readKey, localReadIds, dismissBadgeCounter]);

  const deleteNotification = useCallback(
    async (item: UnifiedNotification) => {
      if (!tenantId) return;
      if (item.source === 'firestore') {
        try {
          await deleteDoc(doc(db, `tenants/${tenantId}/notifications`, item.id));
        } catch (err) {
          console.warn('Delete notification failed:', err);
          toast.error('Failed to delete notification');
        }
      } else if (deletedKey) {
        const nextDeleted = new Set<string>(localDeletedIds);
        nextDeleted.add(item.id);
        setLocalDeletedIds(nextDeleted);
        writeLocalSet(deletedKey, nextDeleted);
      }
    },
    [tenantId, deletedKey, localDeletedIds]
  );

  const clearAllNotifications = useCallback(async () => {
    if (!tenantId || notifications.length === 0) return;
    const fsItems = notifications.filter((n) => n.source === 'firestore');
    if (fsItems.length > 0) {
      await Promise.all(
        fsItems.map((n) =>
          deleteDoc(doc(db, `tenants/${tenantId}/notifications`, n.id)).catch(() => {})
        )
      );
    }
    if (deletedKey) {
      const nextDeleted = new Set<string>(localDeletedIds);
      notifications.forEach((n) => {
        if (n.source === 'system') nextDeleted.add(n.id);
      });
      setLocalDeletedIds(nextDeleted);
      writeLocalSet(deletedKey, nextDeleted);
    }
    dismissBadgeCounter();
    toast.success('Notifications cleared');
  }, [tenantId, notifications, deletedKey, localDeletedIds, dismissBadgeCounter]);

  return {
    notifications,
    unreadCount,
    badgeCount,
    dismissBadgeCounter,
    setNotificationReadState,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
  };
}
