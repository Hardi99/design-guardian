import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Env mockable (muté par test) ───────────────────────────────────────────────
const mockEnv = {
  RESEND_API_KEY: 're_key',
  RESEND_FROM: 'Design Guardian <noreply@designguardian.app>',
  TWILIO_ACCOUNT_SID: 'AC_sid',
  TWILIO_AUTH_TOKEN: 'tok',
  TWILIO_FROM_NUMBER: '+33611111111',
};
vi.mock('../config/env.js', () => ({ getEnv: () => mockEnv }));

// ─── Mock Resend ────────────────────────────────────────────────────────────────
const mockEmailSend = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockEmailSend };
    constructor(_key: string) {}
  },
}));

// ─── Mock Twilio (export default = fonction factory) ────────────────────────────
const mockMessagesCreate = vi.fn();
vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: mockMessagesCreate } })),
}));

const {
  sendEmail,
  sendCheckpointNotification,
  sendSms,
  sendVerificationSms,
} = await import('../services/notification.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.RESEND_API_KEY = 're_key';
  mockEnv.TWILIO_ACCOUNT_SID = 'AC_sid';
  mockEnv.TWILIO_AUTH_TOKEN = 'tok';
});

// ─── Email ──────────────────────────────────────────────────────────────────────

describe('sendEmail', () => {
  it('échoue proprement si RESEND_API_KEY absent (pas d\'appel réseau)', async () => {
    mockEnv.RESEND_API_KEY = '';
    const r = await sendEmail('a@b.co', 'Sujet', '<p>hi</p>');
    expect(r).toEqual({ sent: false, error: 'RESEND_API_KEY not configured' });
    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  it('renvoie { sent:true, id } quand Resend réussit', async () => {
    mockEmailSend.mockResolvedValue({ data: { id: 're_123' }, error: null });
    const r = await sendEmail('a@b.co', 'Sujet', '<p>hi</p>');
    expect(r).toEqual({ sent: true, id: 're_123' });
    expect(mockEmailSend).toHaveBeenCalledWith({
      from: mockEnv.RESEND_FROM,
      to: 'a@b.co',
      subject: 'Sujet',
      html: '<p>hi</p>',
    });
  });

  it('remonte l\'erreur Resend', async () => {
    mockEmailSend.mockResolvedValue({ data: null, error: { message: 'rate limited' } });
    const r = await sendEmail('a@b.co', 'Sujet', '<p>hi</p>');
    expect(r).toEqual({ sent: false, error: 'rate limited' });
  });
});

describe('sendCheckpointNotification', () => {
  beforeEach(() => mockEmailSend.mockResolvedValue({ data: { id: 're_1' }, error: null }));

  it('compose le sujet et le corps avec auteur, version, branche', async () => {
    await sendCheckpointNotification({
      to: 'a@b.co', authorName: 'Alice', projectName: 'Mon Projet',
      branchName: 'feat/x', versionNumber: 4, aiSummary: 'a déplacé le bouton',
    });
    const arg = mockEmailSend.mock.lastCall![0];
    expect(arg.subject).toBe('[Design Guardian] Nouveau checkpoint — Mon Projet');
    expect(arg.html).toContain('Alice');
    expect(arg.html).toContain('v4');
    expect(arg.html).toContain('feat/x');
    expect(arg.html).toContain('a déplacé le bouton');
    expect(arg.html).toContain('AI Patch Note');
  });

  it('omet le bloc AI Patch Note quand aiSummary est null', async () => {
    await sendCheckpointNotification({
      to: 'a@b.co', authorName: 'Bob', projectName: 'P',
      branchName: 'main', versionNumber: 1, aiSummary: null,
    });
    const arg = mockEmailSend.mock.lastCall![0];
    expect(arg.html).not.toContain('AI Patch Note');
  });
});

// ─── SMS ──────────────────────────────────────────────────────────────────────

describe('sendSms', () => {
  it('échoue proprement si Twilio non configuré', async () => {
    mockEnv.TWILIO_ACCOUNT_SID = '';
    const r = await sendSms('+33600000000', 'hi');
    expect(r).toEqual({ sent: false, error: 'Twilio not configured' });
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('renvoie { sent:true, sid } quand Twilio réussit', async () => {
    mockMessagesCreate.mockResolvedValue({ sid: 'SM_42' });
    const r = await sendSms('+33600000000', 'hi');
    expect(r).toEqual({ sent: true, sid: 'SM_42' });
    expect(mockMessagesCreate).toHaveBeenCalledWith({
      body: 'hi', from: mockEnv.TWILIO_FROM_NUMBER, to: '+33600000000',
    });
  });

  it('capture une exception Twilio en { sent:false, error }', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('twilio down'));
    const r = await sendSms('+33600000000', 'hi');
    expect(r.sent).toBe(false);
    expect(r.error).toContain('twilio down');
  });
});

describe('sendVerificationSms', () => {
  it('envoie un SMS contenant le code de vérification', async () => {
    mockMessagesCreate.mockResolvedValue({ sid: 'SM_99' });
    const r = await sendVerificationSms('+33600000000', '123456');
    expect(r).toEqual({ sent: true, sid: 'SM_99' });
    expect(mockMessagesCreate.mock.lastCall![0].body).toContain('123456');
  });
});
