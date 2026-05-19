import { Resend } from 'resend';
import twilio from 'twilio';
import { getEnv } from '../config/env.js';

let resendClient: Resend | null = null;
let twilioClient: ReturnType<typeof twilio> | null = null;

function getResend(): Resend | null {
  const key = getEnv().RESEND_API_KEY;
  if (!key) return null;
  return (resendClient ??= new Resend(key));
}

function getTwilio(): ReturnType<typeof twilio> | null {
  const env = getEnv();
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  return (twilioClient ??= twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN));
}

// ── Email ─────────────────────────────────────────────────────────────────────

export interface EmailResult { sent: boolean; id?: string; error?: string }

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<EmailResult> {
  const client = getResend();
  if (!client) return { sent: false, error: 'RESEND_API_KEY not configured' };

  const { data, error } = await client.emails.send({
    from: getEnv().RESEND_FROM,
    to,
    subject,
    html,
  });

  if (error) return { sent: false, error: error.message };
  return { sent: true, id: data?.id };
}

export async function sendCheckpointNotification(opts: {
  to: string;
  authorName: string;
  projectName: string;
  branchName: string;
  versionNumber: number;
  aiSummary: string | null;
}): Promise<EmailResult> {
  const { to, authorName, projectName, branchName, versionNumber, aiSummary } = opts;
  return sendEmail(
    to,
    `[Design Guardian] Nouveau checkpoint — ${projectName}`,
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#18181b;margin-bottom:8px">Nouveau checkpoint sauvegardé</h2>
      <p style="color:#52525b;margin-bottom:16px">
        <strong>${authorName}</strong> a sauvegardé la version <strong>v${versionNumber}</strong>
        sur la branche <code style="background:#f4f4f5;padding:2px 6px;border-radius:4px">${branchName}</code>
        du projet <strong>${projectName}</strong>.
      </p>
      ${aiSummary ? `
      <div style="background:#f9fafb;border-left:3px solid#6366f1;padding:12px 16px;border-radius:4px">
        <p style="margin:0;color:#374151;font-size:14px"><strong>AI Patch Note :</strong> ${aiSummary}</p>
      </div>` : ''}
      <p style="margin-top:24px;color:#9ca3af;font-size:12px">Design Guardian — Semantic Vector Versioning</p>
    </div>
    `,
  );
}

export async function sendReviewRequestNotification(opts: {
  to: string;
  authorName: string;
  projectName: string;
  versionNumber: number;
  branchName: string;
}): Promise<EmailResult> {
  const { to, authorName, projectName, versionNumber, branchName } = opts;
  return sendEmail(
    to,
    `[Design Guardian] Review demandée — ${projectName} v${versionNumber}`,
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#18181b;margin-bottom:8px">Review demandée</h2>
      <p style="color:#52525b">
        <strong>${authorName}</strong> demande une review pour la version
        <strong>v${versionNumber}</strong> (branche <code style="background:#f4f4f5;padding:2px 6px;border-radius:4px">${branchName}</code>)
        du projet <strong>${projectName}</strong>.
      </p>
      <p style="margin-top:24px;color:#9ca3af;font-size:12px">Design Guardian — Semantic Vector Versioning</p>
    </div>
    `,
  );
}

export async function sendApprovalNotification(opts: {
  to: string;
  approverName: string;
  projectName: string;
  versionNumber: number;
}): Promise<EmailResult> {
  const { to, approverName, projectName, versionNumber } = opts;
  return sendEmail(
    to,
    `[Design Guardian] ✅ Version approuvée — ${projectName} v${versionNumber}`,
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#18181b;margin-bottom:8px">Version approuvée 🏅</h2>
      <p style="color:#52525b">
        <strong>${approverName}</strong> a approuvé la version <strong>v${versionNumber}</strong>
        du projet <strong>${projectName}</strong>. Elle est maintenant au statut Gold.
      </p>
      <p style="margin-top:24px;color:#9ca3af;font-size:12px">Design Guardian — Semantic Vector Versioning</p>
    </div>
    `,
  );
}

// ── SMS ───────────────────────────────────────────────────────────────────────

export interface SmsResult { sent: boolean; sid?: string; error?: string }

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const client = getTwilio();
  if (!client) return { sent: false, error: 'Twilio not configured' };

  try {
    const msg = await client.messages.create({
      body,
      from: getEnv().TWILIO_FROM_NUMBER,
      to,
    });
    return { sent: true, sid: msg.sid };
  } catch (e) {
    return { sent: false, error: String(e) };
  }
}

export async function sendVerificationSms(to: string, code: string): Promise<SmsResult> {
  return sendSms(to, `Design Guardian — Votre code de vérification : ${code}`);
}
