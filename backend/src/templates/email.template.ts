// Email digest HTML template (PRD §8).
//
// Produces a self-contained, inline-styled HTML document for the daily digest
// email. All styling is inline so it renders consistently in Gmail and Apple
// Mail (no <style> blocks, no external CSS). Layout uses tables for maximum
// client compatibility and is constrained to a ~640px centered container.

import type { Job } from '../types';

/** Data required to render a single digest email. */
export interface EmailDigestData {
  /** Already filtered to score >= minScoreToEmail and sorted descending. */
  topJobs: Job[];
  /** Total number of jobs scraped this run. */
  totalScraped: number;
  /** Total number of jobs that passed the pre-AI filters. */
  totalMatched: number;
  /** Human readable run date, e.g. "Friday, 26 June 2026". */
  runDate: string;
  /** Base dashboard URL (env.frontendUrl). */
  dashboardUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape a user-provided string so it cannot break out of the surrounding HTML
 * context. Applied to every value that originates from scraped/AI content
 * (titles, requirements, red flags, locations, etc.).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Map an AI score (1-10, or null) to the accent color used for the card's left
 * border and the score label. Null/unscored jobs fall back to gray.
 */
function scoreColor(score: number | null): string {
  if (score == null) return '#9ca3af'; // gray
  if (score >= 8) return '#22c55e'; // green
  if (score >= 6) return '#3b82f6'; // blue
  if (score >= 4) return '#f59e0b'; // amber
  return '#9ca3af'; // gray (1-3)
}

/**
 * Render a simple 10-dot meter: `●` filled for each point of the score and
 * `○` for the remainder. Null score renders as all empty dots.
 */
function scoreMeter(score: number | null): string {
  const filled = score == null ? 0 : Math.max(0, Math.min(10, Math.round(score)));
  const empty = 10 - filled;
  return '●'.repeat(filled) + '○'.repeat(empty);
}

/**
 * Format a job's budget for display. Hourly budgets are suffixed with `/hr`.
 * Handles missing min/max gracefully and returns an empty string when there is
 * no budget data to show.
 */
function formatBudget(job: Job): string {
  const { budgetMin, budgetMax, budgetType } = job;
  if (budgetMin == null && budgetMax == null) return '';

  let range: string;
  if (budgetMin != null && budgetMax != null) {
    range = budgetMin === budgetMax ? `$${budgetMin}` : `$${budgetMin}–${budgetMax}`;
  } else {
    range = `$${budgetMin ?? budgetMax}`;
  }

  return budgetType === 'hourly' ? `${range}/hr` : range;
}

/**
 * Build the comma-separated meta line (budget · proposals · location), omitting
 * any segments that have no data. Returned text is already HTML-escaped.
 */
function buildMetaLine(job: Job): string {
  const parts: string[] = [];

  const budget = formatBudget(job);
  if (budget) parts.push(escapeHtml(budget));

  if (job.proposalCount != null) {
    parts.push(`${job.proposalCount} proposals`);
  }

  if (job.clientLocation) {
    parts.push(escapeHtml(job.clientLocation));
  }

  return parts.join('&nbsp;&middot;&nbsp;');
}

/**
 * Render a single anchor styled as a button. Used for the per-job and footer
 * call-to-action links.
 */
function button(href: string, label: string, color: string): string {
  return [
    `<a href="${escapeHtml(href)}"`,
    ` style="display:inline-block;padding:10px 18px;margin:4px 6px 4px 0;`,
    `background-color:${color};color:#ffffff;text-decoration:none;`,
    `font-size:14px;font-weight:600;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">`,
    `${escapeHtml(label)}</a>`,
  ].join('');
}

/**
 * Render one job card. The left border is colored by the job's score and a
 * dot-meter visualizes the score. The first job in the digest is flagged as the
 * "Top Match".
 */
function renderJobCard(job: Job, dashboardUrl: string, isTop: boolean): string {
  const color = scoreColor(job.aiScore);
  const scoreText = job.aiScore == null ? 'N/A' : `${job.aiScore}/10`;
  const meter = scoreMeter(job.aiScore);
  const meta = buildMetaLine(job);

  const requirements = job.aiRequirements ? escapeHtml(job.aiRequirements) : 'n/a';
  const redFlags = job.aiRedFlags ? escapeHtml(job.aiRedFlags) : 'none';

  const topBadge = isTop
    ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;` +
      `background-color:#fef3c7;color:#92400e;border-radius:10px;` +
      `font-size:11px;font-weight:700;">&#128293; Top Match</span>`
    : '';

  // Per-job dashboard deep link.
  const jobDashboardUrl = `${dashboardUrl}/jobs/${encodeURIComponent(job.id)}`;

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="margin:0 0 16px 0;background-color:#ffffff;border:1px solid #e5e7eb;
    border-left:4px solid ${color};border-radius:8px;">
    <tr>
      <td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <div style="font-size:13px;font-weight:700;color:${color};">
          Score: ${escapeHtml(scoreText)}
          <span style="font-size:13px;letter-spacing:1px;color:${color};">${meter}</span>
          ${topBadge}
        </div>
        <div style="font-size:17px;font-weight:700;color:#111827;margin:8px 0 4px 0;line-height:1.3;">
          ${escapeHtml(job.title)}
        </div>
        ${meta ? `<div style="font-size:13px;color:#6b7280;margin:0 0 10px 0;">${meta}</div>` : ''}
        <div style="font-size:13px;color:#374151;margin:0 0 6px 0;">
          <strong>Key Requirements:</strong> ${requirements}
        </div>
        <div style="font-size:13px;color:#374151;margin:0 0 12px 0;">
          <strong>&#9888;&#65039; Red Flags:</strong> ${redFlags}
        </div>
        <div>
          ${button(job.url, 'Open Job', '#111827')}
          ${button(jobDashboardUrl, 'View in Dashboard', '#3b82f6')}
        </div>
      </td>
    </tr>
  </table>`;
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Build the full inline-styled HTML document for a digest email.
 *
 * The structure is: outer light-gray body → centered 640px container →
 * header bar → run-summary block → one card per job → footer CTA.
 */
export function buildDigestHtml(data: EmailDigestData): string {
  const { topJobs, totalScraped, totalMatched, runDate, dashboardUrl } = data;
  const matchLabel = `${topJobs.length} ${topJobs.length === 1 ? 'match' : 'matches'}`;

  const cards = topJobs.length
    ? topJobs.map((job, index) => renderJobCard(job, dashboardUrl, index === 0)).join('\n')
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="margin:0 0 16px 0;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
        <tr>
          <td style="padding:24px;text-align:center;font-family:Arial,Helvetica,sans-serif;
            font-size:14px;color:#6b7280;">
            No new matches above your threshold for this run.
          </td>
        </tr>
      </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>UpworkRadar Digest</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;
  -webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!-- Centered container -->
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;max-width:640px;">

          <!-- Header bar -->
          <tr>
            <td style="background-color:#111827;border-radius:10px 10px 0 0;padding:20px 22px;
              font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">
                &#127919; UpworkRadar
              </div>
              <div style="font-size:13px;color:#9ca3af;margin-top:4px;">
                ${escapeHtml(runDate)} &nbsp;&middot;&nbsp; ${escapeHtml(matchLabel)}
              </div>
            </td>
          </tr>

          <!-- Run summary -->
          <tr>
            <td style="background-color:#1f2937;padding:12px 22px;
              font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:13px;color:#e5e7eb;">
                Jobs scraped: <strong>${totalScraped}</strong>
                &nbsp;|&nbsp;
                Matched: <strong>${totalMatched}</strong>
              </div>
            </td>
          </tr>

          <!-- Body / job cards -->
          <tr>
            <td style="background-color:#f3f4f6;padding:18px 16px;">
              ${cards}
            </td>
          </tr>

          <!-- Footer CTA -->
          <tr>
            <td style="background-color:#ffffff;border-radius:0 0 10px 10px;
              padding:24px 22px;text-align:center;border-top:1px solid #e5e7eb;
              font-family:Arial,Helvetica,sans-serif;">
              <a href="${escapeHtml(dashboardUrl)}"
                style="display:inline-block;padding:14px 28px;background-color:#22c55e;
                color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;
                border-radius:8px;font-family:Arial,Helvetica,sans-serif;">
                Open Full Dashboard
              </a>
              <div style="font-size:12px;color:#9ca3af;margin-top:16px;">
                You are receiving this because UpworkRadar is configured to email you matches.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
