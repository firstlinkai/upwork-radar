// Email digest delivery service (PRD §7.4, §14).
//
// Responsible for turning a set of scored jobs into a rendered digest email and
// sending it via Resend. Email failures must NEVER crash the pipeline, so
// `sendDigest` always resolves to a boolean and swallows errors internally.
// `sendTestEmail` is the exception: it throws so an admin route can surface the
// failure to the operator triggering a manual test.

import { Resend } from 'resend';

import { env } from '../lib/env';
import { logger } from '../lib/logger';
import { resolveResendKey } from '../lib/settings';
import type { Job, Settings } from '../types';
import { buildDigestHtml, type EmailDigestData } from '../templates/email.template';

/** Stats surfaced in the digest's run-summary block. */
interface DigestStats {
  totalScraped: number;
  totalMatched: number;
}

/**
 * Format "now" as a human-readable run date in the Manila timezone, e.g.
 * "Friday, 26 June 2026". Kept centralized so digest and subject line agree.
 */
function formatRunDate(): string {
  return new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

/**
 * Send the daily digest email.
 *
 * Filters `jobs` to those scored at or above the configured threshold, sorts
 * them by score (descending) and renders + sends a single email. Returns
 * `true` only when Resend accepts the send.
 *
 * Returns `false` (without throwing) when:
 *  - the recipient email is empty,
 *  - there are no qualifying jobs (digest is skipped),
 *  - the effective Resend key is empty, or
 *  - the Resend API call fails.
 */
export async function sendDigest(
  jobs: Job[],
  stats: DigestStats,
  settings: Settings
): Promise<boolean> {
  // Recipient must be configured before we attempt anything.
  const recipient = settings.recipientEmail?.trim();
  if (!recipient) {
    logger.warn('sendDigest: no recipient email configured; skipping digest.');
    return false;
  }

  // Keep only AI-scored jobs at/above the threshold, highest score first.
  const topJobs = jobs
    .filter((job): job is Job => job.aiScore != null && job.aiScore >= settings.minScoreToEmail)
    .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0));

  // Skip entirely when nothing qualifies (chosen over sending an empty digest).
  if (topJobs.length === 0) {
    logger.info('sendDigest: no jobs met the email threshold; skipping digest.', {
      minScoreToEmail: settings.minScoreToEmail,
      totalMatched: stats.totalMatched,
    });
    return false;
  }

  const runDate = formatRunDate();

  const digestData: EmailDigestData = {
    topJobs,
    totalScraped: stats.totalScraped,
    totalMatched: stats.totalMatched,
    runDate,
    dashboardUrl: env.frontendUrl,
  };

  const html = buildDigestHtml(digestData);

  // Resolve the effective Resend key (DB override, then env).
  const apiKey = resolveResendKey(settings);
  if (!apiKey) {
    logger.error('sendDigest: no Resend API key available; cannot send digest.');
    return false;
  }

  const resend = new Resend(apiKey);
  const subject = `\u{1F3AF} UpworkRadar — ${topJobs.length} new matches for ${runDate}`;

  try {
    const result = await resend.emails.send({
      from: env.fromEmail,
      to: recipient,
      subject,
      html,
    });

    // The Resend SDK returns `{ data, error }` rather than throwing on API errors.
    if (result.error) {
      logger.error('sendDigest: Resend reported an error sending the digest.', {
        error: result.error,
      });
      return false;
    }

    logger.info('sendDigest: digest email sent successfully.', {
      recipient,
      jobCount: topJobs.length,
      messageId: result.data?.id ?? null,
    });
    return true;
  } catch (error) {
    // Never let an email failure bubble up and crash the pipeline.
    logger.error('sendDigest: unexpected error sending digest email.', { error });
    return false;
  }
}

/**
 * Send a minimal test email to verify Resend configuration end-to-end.
 *
 * Renders a digest with a single fake sample job so the operator can confirm
 * formatting and deliverability. Unlike `sendDigest`, this THROWS on any
 * failure so the calling route can report the error back to the operator.
 */
export async function sendTestEmail(settings: Settings): Promise<void> {
  const recipient = settings.recipientEmail?.trim();
  if (!recipient) {
    throw new Error('Cannot send test email: no recipient email configured.');
  }

  const apiKey = resolveResendKey(settings);
  if (!apiKey) {
    throw new Error('Cannot send test email: no Resend API key available.');
  }

  const runDate = formatRunDate();

  // A single fabricated sample job so the email is representative of a real
  // digest. Only the fields consumed by the template need realistic values; the
  // remaining Prisma columns (notes, appliedAt, etc.) are filled with neutral
  // defaults. The cast keeps this in sync with the generated Prisma `Job` type
  // without depending on the `JobStatus` enum import here.
  const now = new Date();
  const sampleJob: Job = {
    id: 'sample',
    upworkId: 'sample',
    title: 'Sample: Build an n8n automation to sync leads into a CRM',
    description: 'This is a sample job used to verify your UpworkRadar email setup.',
    url: 'https://www.upwork.com/',
    budgetType: 'hourly',
    budgetMin: 35,
    budgetMax: 60,
    clientLocation: 'United States',
    proposalCount: 3,
    clientRating: 4.9,
    clientSpent: '$25K+',
    postedAt: now,
    scrapedAt: now,
    skills: ['n8n', 'automation', 'API integration'],
    aiScore: 9,
    aiRationale: 'Strong budget, low competition, clear automation scope.',
    aiRequirements: 'Experience with n8n, REST APIs, and CRM integrations.',
    aiRedFlags: 'none',
    aiProposal: 'Sample generated proposal text.',
    aiProcessedAt: now,
    status: 'NEW',
    isBookmarked: false,
    notes: null,
    appliedAt: null,
    createdAt: now,
    updatedAt: now,
  } as Job;

  const digestData: EmailDigestData = {
    topJobs: [sampleJob],
    totalScraped: 0,
    totalMatched: 0,
    runDate,
    dashboardUrl: env.frontendUrl,
  };

  const html = buildDigestHtml(digestData);
  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from: env.fromEmail,
    to: recipient,
    subject: '✅ UpworkRadar test email',
    html,
  });

  if (result.error) {
    throw new Error(`Resend failed to send test email: ${JSON.stringify(result.error)}`);
  }

  logger.info('sendTestEmail: test email sent successfully.', {
    recipient,
    messageId: result.data?.id ?? null,
  });
}
