import { prisma } from './prisma';
import { env } from './env';
import type { Settings } from '../types';

// Default Settings values used when seeding the singleton row. Mirrors the
// Prisma schema defaults so seeding and schema stay in sync.
export const DEFAULT_SETTINGS = {
  id: 'singleton',
  apifyActorId: 'blackfalcondata/upwork-scraper',
  searchKeywords: ['AI automation', 'n8n', 'make.com', 'workflow automation', 'AI agent'],
  maxResults: 50,
  minHourlyRate: 25,
  minFixedBudget: 500,
  maxProposals: 10,
  clientLocations: [] as string[],
  recipientEmail: '',
  emailScheduleHour: 7,
  emailScheduleTz: 'Asia/Manila',
  minScoreToEmail: 6,
  minScoreForProposal: 7,
  apifyApiKey: null as string | null,
  resendApiKey: null as string | null,
};

/**
 * Load the singleton Settings row, creating it with defaults if absent.
 * PRD §18: settings must be loaded fresh from DB on each pipeline run.
 */
export async function getSettings(): Promise<Settings> {
  const existing = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: 'singleton' } });
}

/** Resolve the effective Apify key: DB override first, then env. */
export function resolveApifyKey(settings: Settings): string {
  return settings.apifyApiKey?.trim() || env.apifyApiKey;
}

/** Resolve the effective Resend key: DB override first, then env. */
export function resolveResendKey(settings: Settings): string {
  return settings.resendApiKey?.trim() || env.resendApiKey;
}

/** Mask a secret for safe display, e.g. "apify_api_...c4f2" or null. */
export function maskKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/**
 * Strip plaintext API keys from a Settings object before returning over the
 * API, replacing them with masked indicators under `*Masked` keys.
 */
export function serializeSettings(settings: Settings) {
  const { apifyApiKey, resendApiKey, ...rest } = settings;
  return {
    ...rest,
    apifyApiKeyMasked: maskKey(apifyApiKey),
    resendApiKeyMasked: maskKey(resendApiKey),
  };
}
