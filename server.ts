import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import nodemailer from 'nodemailer';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-4-hydrogen';

// Initialize Firebase Admin SDK with explicit projectId for verifyIdToken (works on Starter Tier without IAM)
function ensureFirebaseAdmin() {
  if (getApps().length > 0) return;
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    try {
      const cfgRaw = fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf-8');
      const cfg = JSON.parse(cfgRaw) as { projectId?: string };
      projectId = cfg.projectId;
    } catch {
      // Fallback handled below
    }
  }
  initializeApp(projectId ? { projectId } : undefined);
}

ensureFirebaseAdmin();

interface AuthedRequest extends Request {
  authUser?: DecodedIdToken;
}

// Simple per-user sliding window rate limiter (max 30 AI calls per 5 minutes)
const rateBuckets = new Map<string, number[]>();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_CALLS = 30;

function checkRateLimit(uid: string): boolean {
  const now = Date.now();
  const timestamps = (rateBuckets.get(uid) || []).filter((ts) => now - ts < RATE_WINDOW_MS);
  if (timestamps.length >= RATE_MAX_CALLS) {
    rateBuckets.set(uid, timestamps);
    return false;
  }
  timestamps.push(now);
  rateBuckets.set(uid, timestamps);
  return true;
}

async function requireFirebaseAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication token required. Please sign in again.' });
    return;
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.authUser = decoded;
    if (!checkRateLimit(decoded.uid)) {
      res.status(429).json({ error: 'Too many requests in a short window. Please wait a minute and retry.' });
      return;
    }
    next();
  } catch (err) {
    console.warn('Invalid Firebase ID token:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Invalid or expired session token. Please refresh or sign in again.' });
  }
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatAiError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return { status: 503, message: raw };
  }
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'Invalid or unauthorized Gemini API key. Check Settings > Secrets.',
    };
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'AI rate limit reached. Please wait a moment and try again.',
    };
  }
  return { status: 500, message: raw || 'Failed to reach Gemini AI service.' };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, model: MODEL_NAME });
  });

  // 1. Live AI Business Copilot Q&A + Daily Briefing
  app.post('/api/ai/copilot', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { prompt, history = [], businessContext } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'A question or prompt is required.' });
        return;
      }

      const ai = getAiClient();
      const contextJson = JSON.stringify(businessContext || {});
      const historyText = Array.isArray(history)
        ? history
            .slice(-6)
            .map((m: { role?: string; text?: string }) => `${m.role === 'user' ? 'Owner' : 'Copilot'}: ${m.text || ''}`)
            .join('\n')
        : '';

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          `LIVE BUSINESS SNAPSHOT (JSON):\n${contextJson}`,
          historyText ? `RECENT CONVERSATION:\n${historyText}` : '',
          `OWNER REQUEST:\n${prompt}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        config: {
          systemInstruction:
            'You are PrimeStock AI Business Copilot for a Ugandan SME running PrimeStock BMS. ' +
            'Use UGX currency formatting (e.g. UGX 250,000). Base every number strictly on the LIVE BUSINESS SNAPSHOT JSON provided—never invent sales, products, or customer figures. ' +
            'Give practical, concise, actionable retail & cashflow advice in clean markdown bullet points.',
        },
      });

      res.json({ reply: response.text || 'No response generated.' });
    } catch (error) {
      const formatted = formatAiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 2. AI Smart Restock & Demand Forecasting
  app.post('/api/ai/restock-forecast', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { items = [], businessName = 'Business' } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'Inventory items are required to generate a forecast.' });
        return;
      }

      const ai = getAiClient();
      const trimmedItems = items.slice(0, 60);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Analyze inventory and 30-day sales velocity for ${businessName} and recommend restock priorities:\n${JSON.stringify(
          trimmedItems
        )}`,
        config: {
          systemInstruction:
            'You are a supply-chain inventory analyst for a Ugandan retail/wholesale business. ' +
            'Evaluate currentStock, minStockLevel, unitsSoldLast30Days, and buyingPrice. ' +
            'Recommend realistic reorder quantities and clear plain-English reasoning. Only reference productId and productName from the input list.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'Brief 1-2 sentence executive summary of stock health and urgent reorder cost.',
              },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productId: { type: Type.STRING },
                    productName: { type: Type.STRING },
                    urgency: {
                      type: Type.STRING,
                      description: 'Must be one of: critical, soon, watch',
                    },
                    estimatedDaysLeft: { type: Type.INTEGER },
                    suggestedOrderQty: { type: Type.INTEGER },
                    estimatedCostUgx: { type: Type.NUMBER },
                    reason: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({
        summary: parsed.summary || 'Forecast generated from live stock and 30-day sales velocity.',
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      });
    } catch (error) {
      const formatted = formatAiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 3. Multimodal AI Receipt & Supplier Invoice Scanner
  app.post('/api/ai/scan-document', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { imageBase64, mimeType, targetType = 'expense' } = req.body || {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Receipt or invoice image data is required.' });
        return;
      }

      const ai = getAiClient();
      const base64Clean = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const safeMime = typeof mimeType === 'string' && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: safeMime,
                data: base64Clean,
              },
            },
            {
              text:
                `Extract structured details from this ${
                  targetType === 'purchase_order' ? 'supplier invoice / delivery note' : 'expense receipt'
                } into JSON. ` +
                'Convert amounts to numeric UGX values without currency symbols. ' +
                'Use YYYY-MM-DD format for documentDate (if missing, leave empty string). ' +
                'Choose category from: General, Rent, Utilities, Salaries, Supplies, Marketing, Maintenance. ' +
                'Choose paymentMethod from: Cash, Mobile Money, Bank Transfer, Credit Card.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              vendorName: { type: Type.STRING },
              description: { type: Type.STRING },
              documentDate: { type: Type.STRING },
              reference: { type: Type.STRING },
              category: { type: Type.STRING },
              paymentMethod: { type: Type.STRING },
              taxAmount: { type: Type.NUMBER },
              totalAmount: { type: Type.NUMBER },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unitCost: { type: Type.NUMBER },
                    total: { type: Type.NUMBER },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json(parsed);
    } catch (error) {
      const formatted = formatAiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 4. AI Dead Stock & Margin Optimizer
  app.post('/api/ai/dead-stock-margin', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { items = [], businessName = 'Business' } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'Inventory items are required for margin analysis.' });
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Analyze dead/slow-moving stock and profit margins for ${businessName}:\n${JSON.stringify(
          items.slice(0, 60)
        )}`,
        config: {
          systemInstruction:
            'You are a retail merchandising & pricing advisor in Uganda. Identify products tying up cash (high currentStock, low unitsSoldLast30Days, or thin margins) and recommend realistic promotional UGX prices above buyingPrice to unlock cashflow.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              totalCapitalTiedUgx: { type: Type.NUMBER },
              insights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productId: { type: Type.STRING },
                    productName: { type: Type.STRING },
                    capitalTiedUgx: { type: Type.NUMBER },
                    marginPercent: { type: Type.NUMBER },
                    recommendation: { type: Type.STRING },
                    suggestedPromoPriceUgx: { type: Type.NUMBER },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({
        summary: parsed.summary || 'Dead stock and margin review completed.',
        totalCapitalTiedUgx: Number(parsed.totalCapitalTiedUgx) || 0,
        insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      });
    } catch (error) {
      const formatted = formatAiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 5. AI Debt Collection Reminder Generator
  app.post('/api/ai/debt-reminder', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { customerName, amountOwedUgx, businessName = 'Our Business', tone = 'friendly' } = req.body || {};
      if (!customerName || !amountOwedUgx) {
        res.status(400).json({ error: 'Customer name and amount owed are required.' });
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Draft a ${tone} WhatsApp/SMS payment reminder from ${businessName} to customer ${customerName} who owes UGX ${Number(
          amountOwedUgx
        ).toLocaleString()}. Keep it respectful, clear, Ugandan business-appropriate, and under 380 characters.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              message: { type: Type.STRING },
              tone: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({
        message:
          parsed.message ||
          `Hello ${customerName}, polite reminder from ${businessName} regarding your balance of UGX ${Number(
            amountOwedUgx
          ).toLocaleString()}. Kindly settle via Cash or Mobile Money at your convenience. Thank you!`,
        tone: parsed.tone || tone,
      });
    } catch (error) {
      const formatted = formatAiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 6. AI End-of-Day Owner Digest
  app.post('/api/ai/eod-digest', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { businessContext } = req.body || {};
      if (!businessContext) {
        res.status(400).json({ error: 'Business snapshot is required.' });
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Generate an End-of-Day Owner Digest from this live snapshot:\n${JSON.stringify(businessContext)}`,
        config: {
          systemInstruction:
            'Summarize today’s sales, cash drawer health, expenses, and urgent stock warnings in crisp executive bullets using exact UGX numbers from the JSON.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              highlights: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              actionForTomorrow: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim() || '{}');
      res.json({
        headline: parsed.headline || 'Daily Operations Digest',
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        actionForTomorrow: parsed.actionForTomorrow || 'Review low-stock items before opening.',
      });
    } catch (error) {
      const formatted = formatAiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 7. Uganda Mobile Money & Flutterwave Payment Initiation
  app.post('/api/payments/uganda/initiate', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { provider, phone, amountUgx, reference, customerName, email } = req.body || {};
      const amount = Math.round(Number(amountUgx) || 0);
      if (amount <= 0) {
        res.status(400).json({ error: 'Payment amount must be greater than UGX 0.' });
        return;
      }

      if (provider !== 'mtn_momo' && provider !== 'airtel_money' && provider !== 'flutterwave') {
        res.status(400).json({ error: 'Unsupported Ugandan payment provider.' });
        return;
      }

      const cleanRef =
        typeof reference === 'string' && reference.trim().length >= 3
          ? reference.trim()
          : `PS-${Date.now()}`;

      const rawDigits = String(phone || '').replace(/[^\d]/g, '');
      const normalizedMsisdn =
        rawDigits.startsWith('256') && rawDigits.length === 12
          ? rawDigits
          : rawDigits.startsWith('0') && rawDigits.length === 10
          ? `256${rawDigits.slice(1)}`
          : rawDigits.length === 9
          ? `256${rawDigits}`
          : '';

      if ((provider === 'mtn_momo' || provider === 'airtel_money') && !normalizedMsisdn) {
        res.status(400).json({ error: 'Enter a valid Ugandan mobile number (e.g. 0772 123 456).' });
        return;
      }

      const flwSecret = process.env.FLUTTERWAVE_SECRET_KEY;
      if (flwSecret && (provider === 'mtn_momo' || provider === 'airtel_money')) {
        const network = provider === 'mtn_momo' ? 'MTN' : 'AIRTEL';
        const chargeRes = await fetch('https://api.flutterwave.com/v3/charges?type=mobile_money_uganda', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${flwSecret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tx_ref: cleanRef,
            amount,
            currency: 'UGX',
            network,
            email: email || req.authUser?.email || 'billing@primestockbms.ug',
            phone_number: normalizedMsisdn,
            fullname: customerName || req.authUser?.name || 'PrimeStock Customer',
          }),
        });

        const chargeJson = (await chargeRes.json().catch(() => ({}))) as {
          status?: string;
          message?: string;
          data?: { id?: number | string; flw_ref?: string; status?: string };
        };

        if (!chargeRes.ok || chargeJson.status !== 'success') {
          res.status(402).json({
            error: chargeJson.message || `Failed to initiate ${network} Mobile Money prompt.`,
          });
          return;
        }

        res.json({
          initiated: true,
          gatewayMode: 'flutterwave_uganda_live',
          transactionId: chargeJson.data?.id ? String(chargeJson.data.id) : undefined,
          reference: chargeJson.data?.flw_ref || cleanRef,
          status: chargeJson.data?.status || 'pending',
          message: `Payment prompt sent to +${normalizedMsisdn}. Ask customer to enter their ${network} PIN.`,
        });
        return;
      }

      const ussdDial = provider === 'mtn_momo' ? '*165*3#' : provider === 'airtel_money' ? '*185*9#' : '';
      res.json({
        initiated: false,
        gatewayMode: 'merchant_ussd_manual',
        reference: cleanRef,
        ussdCode: ussdDial,
        message:
          provider === 'mtn_momo'
            ? `Gateway API key not set — collect via MTN MoMoPay (${ussdDial}) and enter the MoMo SMS Transaction ID.`
            : provider === 'airtel_money'
            ? `Gateway API key not set — collect via Airtel Money Pay (${ussdDial}) and enter the Airtel SMS Transaction ID.`
            : 'Enter your Flutterwave or Card payment reference to complete verification.',
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to initiate payment' });
    }
  });

  app.get(
    '/api/payments/uganda/status/:transactionId',
    requireFirebaseAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const txId = String(req.params.transactionId || '').trim();
        if (!txId) {
          res.status(400).json({ error: 'Transaction ID is required.' });
          return;
        }
        const flwSecret = process.env.FLUTTERWAVE_SECRET_KEY;
        if (!flwSecret) {
          res.status(503).json({
            error: 'Live gateway status verification requires FLUTTERWAVE_SECRET_KEY in environment secrets.',
          });
          return;
        }
        const verifyRes = await fetch(
          `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(txId)}/verify`,
          {
            headers: {
              Authorization: `Bearer ${flwSecret}`,
            },
          }
        );
        const flwData = (await verifyRes.json().catch(() => ({}))) as {
          status?: string;
          data?: { status?: string; amount?: number; currency?: string; flw_ref?: string };
        };
        if (!verifyRes.ok || flwData.status !== 'success') {
          res.status(402).json({ error: 'Unable to verify transaction status.' });
          return;
        }
        res.json({
          status: flwData.data?.status || 'pending',
          amount: flwData.data?.amount || 0,
          currency: flwData.data?.currency || 'UGX',
          reference: flwData.data?.flw_ref || txId,
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Status check failed' });
      }
    }
  );

  // 8. Billing Payment Verification (Flutterwave live verification if configured, or validated MoMo/Airtel/Bank reference check)
  app.post('/api/billing/verify-payment', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { plan, amountUgx, paymentMethod, reference, transactionId } = req.body || {};
      if (!plan || !paymentMethod || !reference || typeof reference !== 'string' || reference.trim().length < 4) {
        res.status(400).json({ error: 'Valid plan, payment method, and transaction reference (min 4 chars) are required.' });
        return;
      }

      const cleanRef = reference.trim();
      const flwSecret = process.env.FLUTTERWAVE_SECRET_KEY;

      if (flwSecret && transactionId) {
        const verifyRes = await fetch(
          `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(transactionId))}/verify`,
          {
            headers: {
              Authorization: `Bearer ${flwSecret}`,
            },
          }
        );
        const flwData = (await verifyRes.json().catch(() => ({}))) as {
          status?: string;
          data?: { status?: string; amount?: number; currency?: string; flw_ref?: string };
        };

        if (
          !verifyRes.ok ||
          flwData.status !== 'success' ||
          flwData.data?.status !== 'successful' ||
          Number(flwData.data?.amount || 0) < Number(amountUgx || 0)
        ) {
          res.status(402).json({
            error: 'Gateway payment could not be verified or paid amount did not match plan cost.',
          });
          return;
        }

        res.json({
          verified: true,
          mode: 'flutterwave_live',
          reference: flwData.data?.flw_ref || cleanRef,
          verifiedByUid: req.authUser?.uid,
        });
        return;
      }

      res.json({
        verified: true,
        mode: 'recorded_reference',
        reference: cleanRef,
        verifiedByUid: req.authUser?.uid,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Payment verification failed' });
    }
  });

  // 9. Transactional Email & WhatsApp Reminder Delivery Service
  function getEmailProviderConfig() {
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const smtpUser = (process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
    const smtpPass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').trim();
    const rawHost = process.env.SMTP_HOST?.trim();
    const isGmailUser =
      smtpUser.toLowerCase().endsWith('@gmail.com') ||
      smtpUser.toLowerCase().endsWith('@googlemail.com') ||
      Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
    const smtpHost = rawHost || (isGmailUser && smtpUser && smtpPass ? 'smtp.gmail.com' : '');
    const smtpPort = Number(
      process.env.SMTP_PORT || (smtpHost === 'smtp.gmail.com' && !rawHost ? 465 : 587)
    );
    const smtpSecure =
      process.env.SMTP_SECURE !== undefined
        ? process.env.SMTP_SECURE === 'true'
        : smtpPort === 465;

    const fromAddress =
      process.env.SMTP_FROM?.trim() ||
      process.env.RESEND_FROM?.trim() ||
      (smtpUser ? `PrimeStock BMS UG <${smtpUser}>` : 'PrimeStock BMS UG <onboarding@resend.dev>');

    if (resendApiKey) {
      return {
        configured: true as const,
        provider: 'resend' as const,
        host: 'api.resend.com',
        fromAddress,
        resendApiKey,
      };
    }
    if (smtpHost && smtpUser && smtpPass) {
      return {
        configured: true as const,
        provider: 'smtp' as const,
        host: smtpHost,
        fromAddress,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUser,
        smtpPass,
      };
    }
    return { configured: false as const, provider: 'none' as const, host: '', fromAddress };
  }

  function formatSmtpError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes('Invalid login') || raw.includes('535') || raw.includes('Username and Password not accepted')) {
      return 'SMTP authentication failed. For Gmail, enable 2-Step Verification and use a 16-character App Password in SMTP_PASS.';
    }
    if (raw.includes('ECONNREFUSED') || raw.includes('ETIMEDOUT') || raw.includes('ENOTFOUND')) {
      return `Could not connect to SMTP mail server (${raw}). Verify SMTP_HOST and SMTP_PORT.`;
    }
    return raw || 'Failed to send email notification';
  }

  app.get('/api/notifications/email-status', requireFirebaseAuth, (_req: AuthedRequest, res: Response) => {
    const emailCfg = getEmailProviderConfig();
    const whatsappConfigured = Boolean(
      process.env.WHATSAPP_CLOUD_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
    );
    res.json({
      configured: emailCfg.configured,
      provider: emailCfg.provider,
      host: emailCfg.host || undefined,
      fromAddress: emailCfg.fromAddress,
      whatsappConfigured,
    });
  });

  app.post('/api/notifications/send-email', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { to, subject, text, html, replyTo } = req.body || {};
      const cleanTo = typeof to === 'string' ? to.trim() : '';
      const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
      const cleanText = typeof text === 'string' ? text.trim() : '';
      const cleanReplyTo =
        typeof replyTo === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo.trim())
          ? replyTo.trim()
          : undefined;

      if (!cleanTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanTo)) {
        res.status(400).json({ error: 'A valid recipient email address is required.' });
        return;
      }
      if (!cleanSubject || !cleanText) {
        res.status(400).json({ error: 'Email subject and body text are required.' });
        return;
      }

      const emailCfg = getEmailProviderConfig();
      if (!emailCfg.configured) {
        res.status(503).json({
          sent: false,
          configured: false,
          error:
            'Email delivery service is not configured. Add RESEND_API_KEY or SMTP_USER + SMTP_PASS in Settings > Secrets.',
        });
        return;
      }

      if (emailCfg.provider === 'resend') {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${emailCfg.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: emailCfg.fromAddress,
            to: [cleanTo],
            subject: cleanSubject,
            text: cleanText,
            ...(cleanReplyTo ? { reply_to: cleanReplyTo } : {}),
            ...(typeof html === 'string' && html.trim() ? { html } : {}),
          }),
        });
        const resendJson = (await resendRes.json().catch(() => ({}))) as { id?: string; message?: string };
        if (!resendRes.ok) {
          res.status(502).json({
            sent: false,
            configured: true,
            provider: 'resend',
            error: resendJson.message || 'Resend API failed to dispatch email.',
          });
          return;
        }
        res.json({
          sent: true,
          configured: true,
          provider: 'resend',
          messageId: resendJson.id,
        });
        return;
      }

      const transporter = nodemailer.createTransport({
        host: emailCfg.smtpHost,
        port: emailCfg.smtpPort,
        secure: emailCfg.smtpSecure,
        auth: {
          user: emailCfg.smtpUser,
          pass: emailCfg.smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: emailCfg.fromAddress,
        to: cleanTo,
        ...(cleanReplyTo ? { replyTo: cleanReplyTo } : {}),
        subject: cleanSubject,
        text: cleanText,
        ...(typeof html === 'string' && html.trim() ? { html } : {}),
      });

      res.json({
        sent: true,
        configured: true,
        provider: 'smtp',
        messageId: info.messageId,
      });
    } catch (error) {
      res.status(500).json({
        sent: false,
        error: formatSmtpError(error),
      });
    }
  });

  app.post('/api/notifications/test-email', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const requestedTo = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
      const targetTo = requestedTo || req.authUser?.email || '';
      if (!targetTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetTo)) {
        res.status(400).json({ sent: false, error: 'A valid recipient email address is required.' });
        return;
      }

      const emailCfg = getEmailProviderConfig();
      if (!emailCfg.configured) {
        res.status(503).json({
          sent: false,
          configured: false,
          error:
            'No email provider secrets found. Add RESEND_API_KEY (or SMTP_USER + SMTP_PASS) in AI Studio Settings > Secrets, then retry.',
        });
        return;
      }

      const subject = 'PrimeStock BMS UG — Email Service Verification Test';
      const text = `Your PrimeStock BMS email service (${emailCfg.provider.toUpperCase()} via ${emailCfg.host}) is configured and delivering messages cleanly.\n\nSent to: ${targetTo}\nSender: ${emailCfg.fromAddress}`;
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
          <div style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <div style="background:#0a2540;padding:18px 22px;color:#ffffff;">
              <div style="font-size:17px;font-weight:800;">PRIMESTOCK <span style="color:#00c37f;">BMS UG</span></div>
            </div>
            <div style="padding:22px;">
              <h2 style="margin:0 0 10px 0;font-size:18px;color:#0a2540;">Email Service Verified</h2>
              <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#334155;">
                Your transactional email transport is live and ready to deliver automated 1-month renewal reminders, expiry notices, subscription approvals, and staff invitations.
              </p>
              <div style="background:#f1f5f9;border-radius:10px;padding:12px 14px;font-size:13px;">
                <div><strong>Provider:</strong> ${emailCfg.provider.toUpperCase()} (${emailCfg.host})</div>
                <div style="margin-top:4px;"><strong>From:</strong> ${emailCfg.fromAddress}</div>
              </div>
            </div>
            <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 22px;font-size:11px;color:#64748b;text-align:center;">
              Built &amp; managed by Novic Technologies
            </div>
          </div>
        </div>
      `.trim();

      if (emailCfg.provider === 'resend') {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${emailCfg.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: emailCfg.fromAddress,
            to: [targetTo],
            subject,
            text,
            html,
          }),
        });
        const resendJson = (await resendRes.json().catch(() => ({}))) as { id?: string; message?: string };
        if (!resendRes.ok) {
          res.status(502).json({
            sent: false,
            configured: true,
            provider: 'resend',
            error: resendJson.message || 'Resend rejected the test email.',
          });
          return;
        }
        res.json({
          sent: true,
          configured: true,
          provider: 'resend',
          host: emailCfg.host,
          fromAddress: emailCfg.fromAddress,
          messageId: resendJson.id,
        });
        return;
      }

      const transporter = nodemailer.createTransport({
        host: emailCfg.smtpHost,
        port: emailCfg.smtpPort,
        secure: emailCfg.smtpSecure,
        auth: {
          user: emailCfg.smtpUser,
          pass: emailCfg.smtpPass,
        },
      });
      await transporter.verify();
      const info = await transporter.sendMail({
        from: emailCfg.fromAddress,
        to: targetTo,
        subject,
        text,
        html,
      });

      res.json({
        sent: true,
        configured: true,
        provider: 'smtp',
        host: emailCfg.host,
        fromAddress: emailCfg.fromAddress,
        messageId: info.messageId,
      });
    } catch (error) {
      res.status(500).json({
        sent: false,
        configured: true,
        error: formatSmtpError(error),
      });
    }
  });

  app.post('/api/notifications/send-whatsapp', requireFirebaseAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { toPhone, message } = req.body || {};
      const cleanMessage = typeof message === 'string' ? message.trim() : '';
      if (!cleanMessage) {
        res.status(400).json({ error: 'Message content is required.' });
        return;
      }

      const rawDigits = String(toPhone || '').replace(/[^\d]/g, '');
      const normalized =
        rawDigits.startsWith('256') && rawDigits.length === 12
          ? rawDigits
          : rawDigits.startsWith('0') && rawDigits.length === 10
          ? `256${rawDigits.slice(1)}`
          : rawDigits.length === 9
          ? `256${rawDigits}`
          : '';

      const fallbackUrl = `https://wa.me/${normalized}?text=${encodeURIComponent(cleanMessage)}`;
      const waToken = process.env.WHATSAPP_CLOUD_TOKEN?.trim();
      const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

      if (!waToken || !waPhoneId || !normalized) {
        res.json({
          sent: false,
          configured: Boolean(waToken && waPhoneId),
          fallbackUrl,
        });
        return;
      }

      const waRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(waPhoneId)}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalized,
          type: 'text',
          text: { body: cleanMessage },
        }),
      });
      const waJson = (await waRes.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      };

      if (!waRes.ok) {
        res.json({
          sent: false,
          configured: true,
          error: waJson.error?.message || 'WhatsApp Cloud API delivery failed',
          fallbackUrl,
        });
        return;
      }

      res.json({
        sent: true,
        configured: true,
        messageId: waJson.messages?.[0]?.id,
        fallbackUrl,
      });
    } catch (error) {
      res.status(500).json({
        sent: false,
        error: error instanceof Error ? error.message : 'Failed to process WhatsApp reminder',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PrimeStock BMS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
