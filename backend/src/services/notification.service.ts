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

export async function sendSubscriptionStartedEmail(opts: {
  to: string;
  projectName: string;
  plan: string;
  nextBillingDate: string;
}): Promise<EmailResult> {
  return sendEmail(
    opts.to,
    `[Design Guardian] Abonnement ${opts.plan} activé`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#18181b">Bienvenue sur le plan ${opts.plan} 🎉</h2>
      <p style="color:#52525b">Votre abonnement <strong>${opts.plan}</strong> pour le projet
      <strong>${opts.projectName}</strong> est actif.</p>
      <p style="color:#52525b">Prochain renouvellement : <strong>${opts.nextBillingDate}</strong>.</p>
      <p style="margin-top:24px;color:#9ca3af;font-size:12px">Design Guardian — Semantic Vector Versioning</p>
    </div>`,
  );
}

export async function sendSubscriptionCancelledEmail(opts: {
  to: string;
  projectName: string;
  plan: string;
  endDate: string;
}): Promise<EmailResult> {
  return sendEmail(
    opts.to,
    `[Design Guardian] Abonnement annulé — ${opts.projectName}`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#18181b">Abonnement annulé</h2>
      <p style="color:#52525b">Votre abonnement <strong>${opts.plan}</strong> pour
      <strong>${opts.projectName}</strong> a été annulé.</p>
      <p style="color:#52525b">Accès maintenu jusqu'au <strong>${opts.endDate}</strong>,
      puis retour au plan Free.</p>
      <p style="margin-top:24px;color:#9ca3af;font-size:12px">Design Guardian — Semantic Vector Versioning</p>
    </div>`,
  );
}

export async function sendPaymentFailedEmail(opts: {
  to: string;
  projectName: string;
  amount: string;
  nextAttempt: string;
}): Promise<EmailResult> {
  return sendEmail(
    opts.to,
    `[Design Guardian] Échec de paiement — action requise`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#dc2626">Échec de paiement</h2>
      <p style="color:#52525b">Le paiement de <strong>${opts.amount}</strong> pour
      <strong>${opts.projectName}</strong> a échoué.</p>
      <p style="color:#52525b">Prochain essai : <strong>${opts.nextAttempt}</strong>.
      Mettez à jour votre moyen de paiement pour éviter une interruption de service.</p>
      <p style="margin-top:24px;color:#9ca3af;font-size:12px">Design Guardian — Semantic Vector Versioning</p>
    </div>`,
  );
}

export async function sendInvoiceEmail(opts: {
  to: string;
  projectName: string;
  amount: string;
  invoiceUrl: string;
  period: string;
}): Promise<EmailResult> {
  return sendEmail(
    opts.to,
    `[Design Guardian] Facture — ${opts.projectName}`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#18181b">Votre facture Design Guardian</h2>
      <p style="color:#52525b">Période : <strong>${opts.period}</strong><br>
      Projet : <strong>${opts.projectName}</strong><br>
      Montant : <strong>${opts.amount}</strong></p>
      <a href="${opts.invoiceUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;
        background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:14px">
        Télécharger la facture
      </a>
      <p style="margin-top:24px;color:#9ca3af;font-size:12px">Design Guardian — Semantic Vector Versioning</p>
    </div>`,
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
