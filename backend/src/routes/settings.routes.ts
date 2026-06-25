import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ok, fail } from '../lib/http';
import { getSettings, serializeSettings } from '../lib/settings';
import { sendTestEmail } from '../services/email.service';
import type { Settings } from '../types';

export const settingsRouter = Router();

// ---------------------------------------------------------------------------
// Validation (PRD §6.3). Every field is optional so the client can send a
// partial update. Numeric ranges mirror the constraints documented in the PRD.
// ---------------------------------------------------------------------------
const updateSettingsSchema = z
  .object({
    apifyActorId: z.string(),
    searchKeywords: z.array(z.string()),
    maxResults: z.number().int().min(1),
    minHourlyRate: z.number().min(0),
    minFixedBudget: z.number().min(0),
    maxProposals: z.number().int().min(0),
    clientLocations: z.array(z.string()),
    // Allow either an empty string ("clear the recipient") or a valid email.
    recipientEmail: z.union([z.literal(''), z.email()]),
    emailScheduleHour: z.number().int().min(0).max(23),
    emailScheduleTz: z.string(),
    minScoreToEmail: z.number().int().min(1).max(10),
    minScoreForProposal: z.number().int().min(1).max(10),
    // Secret keys: validated as plain strings here; emptiness is handled below
    // so the masked placeholder from the UI never overwrites a stored key.
    apifyApiKey: z.string(),
    resendApiKey: z.string(),
  })
  .partial();

type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/**
 * Build the Prisma update payload from validated input. Secret keys are only
 * included when a non-empty string was provided; an empty string or undefined
 * means "leave the stored value unchanged".
 */
function buildUpdateData(input: UpdateSettingsInput): Record<string, unknown> {
  const { apifyApiKey, resendApiKey, ...rest } = input;
  const data: Record<string, unknown> = { ...rest };

  if (typeof apifyApiKey === 'string' && apifyApiKey.trim() !== '') {
    data.apifyApiKey = apifyApiKey;
  }
  if (typeof resendApiKey === 'string' && resendApiKey.trim() !== '') {
    data.resendApiKey = resendApiKey;
  }

  return data;
}

// GET /api/settings -> current settings with secrets masked.
settingsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    return ok(res, serializeSettings(settings));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load settings';
    return fail(res, message, 500);
  }
});

// PUT /api/settings -> partial update; returns the updated, masked settings.
settingsRouter.put('/', async (req: Request, res: Response) => {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      // Surface the first validation issue for a concise, actionable message.
      const issue = parsed.error.issues[0];
      const path = issue?.path.join('.');
      const message = path ? `${path}: ${issue.message}` : (issue?.message ?? 'Invalid settings payload');
      return fail(res, message, 400);
    }

    // Ensure the singleton row exists before updating it.
    await getSettings();

    const data = buildUpdateData(parsed.data);
    const updated = await prisma.settings.update({
      where: { id: 'singleton' },
      data,
    });

    return ok(res, serializeSettings(updated));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update settings';
    return fail(res, message, 500);
  }
});

// POST /api/settings/test-email -> send a test email to the configured recipient.
settingsRouter.post('/test-email', async (_req: Request, res: Response) => {
  try {
    const settings: Settings = await getSettings();

    if (!settings.recipientEmail || settings.recipientEmail.trim() === '') {
      return fail(res, 'No recipient email configured', 400);
    }

    await sendTestEmail(settings);
    return ok(res, { sent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send test email';
    return fail(res, message, 500);
  }
});
