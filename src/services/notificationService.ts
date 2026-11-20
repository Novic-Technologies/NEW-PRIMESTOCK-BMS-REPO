import { auth } from '../firebase';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken() : '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface EmailServiceStatus {
  configured: boolean;
  provider: 'resend' | 'smtp' | 'none';
  host?: string;
  fromAddress?: string;
  whatsappConfigured: boolean;
}

export async function getNotificationServiceStatus(): Promise<EmailServiceStatus> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/notifications/email-status', {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    return { configured: false, provider: 'none', whatsappConfigured: false };
  }
  return res.json();
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<{ sent: boolean; configured?: boolean; provider?: string; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/notifications/send-email', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      sent: false,
      configured: Boolean(data.configured),
      provider: data.provider,
      error: data.error || 'Email delivery failed',
    };
  }
  return data;
}

export async function sendTestEmail(to?: string): Promise<{
  sent: boolean;
  configured?: boolean;
  provider?: string;
  host?: string;
  fromAddress?: string;
  messageId?: string;
  error?: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/notifications/test-email', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...(to ? { to } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      sent: false,
      configured: Boolean(data.configured),
      provider: data.provider,
      error: data.error || 'Test email delivery failed',
    };
  }
  return data;
}

export async function sendWhatsAppReminder(params: {
  toPhone?: string;
  message: string;
}): Promise<{ sent: boolean; configured: boolean; fallbackUrl: string; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/notifications/send-whatsapp', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      sent: false,
      configured: false,
      fallbackUrl: `https://wa.me/?text=${encodeURIComponent(params.message)}`,
      error: data.error || 'WhatsApp request failed',
    };
  }
  return data;
}

export function buildSubscriptionEmailHtml(params: {
  businessName: string;
  headline: string;
  message: string;
  planLabel?: string;
  expiryLabel?: string;
  actionLabel?: string;
  actionUrl?: string;
}): string {
  const safeUrl = params.actionUrl || (typeof window !== 'undefined' ? `${window.location.origin}/billing` : '');
  const safeActionLabel = params.actionLabel || 'Open Billing & Renew';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f8fafc; padding:24px; color:#0f172a;">
      <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden;">
        <div style="background:#0a2540; padding:20px 24px; color:#ffffff;">
          <div style="font-size:18px; font-weight:800; letter-spacing:0.3px;">PRIMESTOCK <span style="color:#00c37f;">BMS UG</span></div>
          <div style="font-size:12px; opacity:0.8; margin-top:4px;">${params.businessName}</div>
        </div>
        <div style="padding:24px;">
          <h2 style="margin:0 0 12px 0; font-size:18px; color:#0a2540;">${params.headline}</h2>
          <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#334155;">${params.message}</p>
          ${
            params.planLabel || params.expiryLabel
              ? `<div style="background:#f1f5f9; border-radius:10px; padding:12px 16px; margin-bottom:18px; font-size:13px;">
                  ${params.planLabel ? `<div><strong>Plan:</strong> ${params.planLabel}</div>` : ''}
                  ${params.expiryLabel ? `<div style="margin-top:4px;"><strong>Cycle / Expiry:</strong> ${params.expiryLabel}</div>` : ''}
                 </div>`
              : ''
          }
          ${
            safeUrl
              ? `<a href="${safeUrl}" style="display:inline-block; background:#00c37f; color:#ffffff; text-decoration:none; font-weight:700; font-size:13px; padding:11px 20px; border-radius:8px;">${safeActionLabel}</a>`
              : ''
          }
        </div>
        <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; font-size:11px; color:#64748b; text-align:center;">
          Built &amp; managed by Novic Technologies · PrimeStock BMS UG
        </div>
      </div>
    </div>
  `.trim();
}
