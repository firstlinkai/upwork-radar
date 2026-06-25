// Apify service — runs the Upwork jobs scraper actor, maps its raw output into
// the normalized `RawJob` shape, and de-duplicates against the database.
// PRD §7.1.

import { ApifyClient } from 'apify-client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { resolveApifyKey } from '../lib/settings';
import type { RawJob, Settings } from '../types';

// ---------------------------------------------------------------------------
// Parsing helpers (private — strictly typed, no `any`)
// ---------------------------------------------------------------------------

/** Narrow an unknown to a plain record so we can index it by string keys. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Return the first defined, non-null value found across the supplied keys.
 * Used to read defensively from an output schema whose exact field names vary.
 */
function pick(item: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/** Coerce an unknown into a trimmed string, or null when not usable. */
function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/**
 * Parse a numeric value out of strings like "$2,500", "45/hr", "10K+", "1.5K".
 * Strips currency symbols, separators, rate suffixes and resolves a trailing
 * "K" to thousands. Returns null when no number can be extracted.
 */
function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;

  // Detect a "K" (thousands) suffix before stripping non-numeric characters.
  const hasThousands = /k\b|k\+|k$/i.test(value.trim());

  // Remove currency, separators and common rate decorations, keeping digits,
  // a decimal point and a leading minus sign.
  const cleaned = value
    .replace(/[$,+]/g, '')
    .replace(/\/\s*hr/gi, '')
    .replace(/k/gi, '')
    .replace(/[^0-9.\-]/g, '')
    .trim();

  if (cleaned.length === 0) return null;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return hasThousands ? parsed * 1000 : parsed;
}

/** Parse an unknown into a valid Date, falling back to "now" when unparseable. */
function parseDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * Normalize a skills value into a string[]. Accepts an array of strings or an
 * array of objects shaped like `{ name: string }` (and a few variants).
 */
function parseSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const skills: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed.length > 0) skills.push(trimmed);
    } else if (isRecord(entry)) {
      const name = toStringOrNull(pick(entry, ['name', 'skill', 'label', 'title']));
      if (name) skills.push(name);
    }
  }
  return skills;
}

/**
 * Derive a stable unique id from a job URL. Upwork job URLs typically end in a
 * `~01abc...` token; otherwise we fall back to the last non-empty path segment.
 */
function deriveIdFromUrl(url: string | null): string | null {
  if (!url) return null;

  // Prefer the Upwork "~" token if present anywhere in the URL.
  const tilde = url.match(/~[0-9a-z]+/i);
  if (tilde) return tilde[0];

  // Otherwise use the last meaningful path segment.
  const withoutQuery = url.split(/[?#]/)[0];
  const segments = withoutQuery.split('/').filter((s) => s.length > 0);
  const last = segments[segments.length - 1];
  return last && last.length > 0 ? last : null;
}

// Candidate field-name groups for each logical attribute. We probe several
// likely names so the mapper survives schema differences between the primary
// (blackfalcondata/upwork-scraper) and fallback (neatrat/upwork-job-scraper)
// actors. Names verified against live blackfalcondata output are included.
const ID_KEYS = ['id', 'jobId', 'uid', 'ciphertext', 'key'] as const;
const URL_KEYS = ['url', 'link', 'jobUrl', 'href'] as const;
const TITLE_KEYS = ['title', 'name', 'jobTitle'] as const;
const DESCRIPTION_KEYS = ['description', 'desc', 'snippet', 'jobDescription'] as const;
const TYPE_KEYS = ['type', 'jobType', 'contractType', 'budgetType'] as const;
const HOURLY_MIN_KEYS = [
  'hourlyBudgetMin',
  'hourlyMin',
  'hourlyRateMin',
  'minHourly',
  'rateMin',
] as const;
const HOURLY_MAX_KEYS = [
  'hourlyBudgetMax',
  'hourlyMax',
  'hourlyRateMax',
  'maxHourly',
  'rateMax',
] as const;
const HOURLY_KEYS = ['hourlyRate', 'hourly', 'rate'] as const;
const FIXED_KEYS = ['budgetAmount', 'fixedPrice', 'budget', 'amount', 'fixedBudget', 'price'] as const;
const FIXED_MAX_KEYS = ['budgetMax', 'amountMax', 'maxBudget'] as const;
const LOCATION_KEYS = [
  'clientCountry',
  'country',
  'clientLocation',
  'location',
  'clientCity',
] as const;
const PROPOSAL_KEYS = [
  'proposals',
  'applicantsCount',
  'totalApplicants',
  'proposalCount',
  'applicants',
] as const;
const RATING_KEYS = ['clientRating', 'rating', 'feedbackScore', 'clientFeedback'] as const;
const SPENT_KEYS = ['clientSpent', 'totalSpent', 'spent', 'clientTotalSpent'] as const;
const POSTED_KEYS = [
  'publishTime',
  'createTime',
  'postedOn',
  'publishedDate',
  'createdAt',
  'postedAt',
  'datePosted',
] as const;
const SKILLS_KEYS = ['skills', 'tags', 'jobSkills', 'categories'] as const;

/**
 * Map a single raw actor item into a normalized `RawJob`. Returns null when the
 * essential fields (title, description, upworkId) cannot be determined.
 */
export function mapRawItem(item: Record<string, unknown>): RawJob | null {
  const title = toStringOrNull(pick(item, TITLE_KEYS));
  const description = toStringOrNull(pick(item, DESCRIPTION_KEYS));
  const url = toStringOrNull(pick(item, URL_KEYS)) ?? '';

  // upworkId: prefer an explicit id field, else derive from the URL.
  const upworkId =
    toStringOrNull(pick(item, ID_KEYS)) ?? deriveIdFromUrl(url || null);

  if (!title || !description || !upworkId) return null;

  // --- Budget ---------------------------------------------------------------
  const hourlyMin = parseNumber(pick(item, HOURLY_MIN_KEYS));
  const hourlyMax = parseNumber(pick(item, HOURLY_MAX_KEYS));
  const hourlyFlat = parseNumber(pick(item, HOURLY_KEYS));

  // Inspect any explicit type field to corroborate the hourly/fixed decision.
  const rawType = toStringOrNull(pick(item, TYPE_KEYS))?.toLowerCase() ?? '';
  const typeSaysHourly = rawType.includes('hour');

  const hasHourly =
    hourlyMin !== null || hourlyMax !== null || hourlyFlat !== null || typeSaysHourly;

  let budgetType: 'hourly' | 'fixed';
  let budgetMin: number | null;
  let budgetMax: number | null;

  if (hasHourly) {
    budgetType = 'hourly';
    budgetMin = hourlyMin ?? hourlyFlat;
    budgetMax = hourlyMax ?? hourlyFlat;
  } else {
    budgetType = 'fixed';
    const fixed = parseNumber(pick(item, FIXED_KEYS));
    budgetMin = fixed;
    budgetMax = parseNumber(pick(item, FIXED_MAX_KEYS)) ?? fixed;
  }

  // --- Metadata -------------------------------------------------------------
  const clientLocation = toStringOrNull(pick(item, LOCATION_KEYS));
  const proposalCount = parseNumber(pick(item, PROPOSAL_KEYS));
  const clientRating = parseNumber(pick(item, RATING_KEYS));
  const clientSpent = toStringOrNull(pick(item, SPENT_KEYS));
  const postedAt = parseDate(pick(item, POSTED_KEYS));
  const skills = parseSkills(pick(item, SKILLS_KEYS));

  return {
    upworkId,
    title,
    description,
    url,
    budgetType,
    budgetMin,
    budgetMax,
    clientLocation,
    proposalCount: proposalCount === null ? null : Math.round(proposalCount),
    clientRating,
    clientSpent,
    postedAt,
    skills,
  };
}

// ---------------------------------------------------------------------------
// Actor execution
// ---------------------------------------------------------------------------

/** Shape of the actor run result we rely on (Apify returns more fields). */
interface ActorRun {
  defaultDatasetId: string;
}

// Fallback actor used when the configured primary actor fails for a keyword.
const FALLBACK_ACTOR = 'neatrat/upwork-job-scraper';

/**
 * Build the per-actor input. These actors take a SINGLE `query` string (not an
 * array), so the caller runs them once per keyword.
 * - blackfalcondata/upwork-scraper: `{ query, maxResults }`
 * - neatrat/upwork-job-scraper:     `{ query, perPage, pagesToScrape }`
 */
function buildActorInput(
  actorId: string,
  keyword: string,
  maxResults: number
): Record<string, unknown> {
  if (actorId.includes('neatrat')) {
    const perPage = Math.min(Math.max(maxResults, 1), 50);
    const pagesToScrape = Math.max(1, Math.ceil(maxResults / perPage));
    return { query: keyword, perPage, pagesToScrape };
  }
  // blackfalcondata and any other actor: a simple query + cap.
  return { query: keyword, maxResults };
}

/**
 * Run an async operation, retrying exactly once on failure. The first failure
 * is logged as a warning before the single retry.
 */
async function retryOnce<T>(operation: () => Promise<T>, label: string): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.warn(`${label} failed on first attempt, retrying once`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return operation();
  }
}

/** Run one actor for one keyword and return its raw dataset items. */
async function runActor(
  client: ApifyClient,
  actorId: string,
  keyword: string,
  maxResults: number
): Promise<unknown[]> {
  const input = buildActorInput(actorId, keyword, maxResults);
  const run = (await retryOnce(
    () => client.actor(actorId).call(input, { waitSecs: 120 }),
    `Apify actor "${actorId}" (query: "${keyword}")`
  )) as ActorRun;
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return items;
}

/**
 * Scrape Upwork jobs via the configured Apify actor — one run per search
 * keyword — falling back to the neatrat actor when the primary fails for a
 * keyword. Returns normalized, in-run-deduplicated `RawJob[]`. Throws when the
 * Apify key is missing or when every keyword run fails.
 */
export async function scrapeJobs(settings: Settings): Promise<RawJob[]> {
  const token = resolveApifyKey(settings);
  if (!token) {
    throw new Error('Apify API key not configured');
  }

  const client = new ApifyClient({ token });
  const keywords = settings.searchKeywords.length > 0 ? settings.searchKeywords : [''];

  const mapped: RawJob[] = [];
  let totalFetched = 0;
  let successfulRuns = 0;
  let lastError: unknown = null;

  for (const keyword of keywords) {
    let items: unknown[] | null = null;

    // Try the configured (primary) actor first.
    try {
      items = await runActor(client, settings.apifyActorId, keyword, settings.maxResults);
    } catch (primaryError) {
      lastError = primaryError;
      logger.warn('Primary actor failed for keyword, trying fallback', {
        actorId: settings.apifyActorId,
        keyword,
        error: primaryError instanceof Error ? primaryError.message : String(primaryError),
      });

      // Fall back to neatrat (unless that IS the configured actor).
      if (settings.apifyActorId !== FALLBACK_ACTOR) {
        try {
          items = await runActor(client, FALLBACK_ACTOR, keyword, settings.maxResults);
        } catch (fallbackError) {
          lastError = fallbackError;
          logger.error('Fallback actor also failed for keyword', {
            keyword,
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          });
        }
      }
    }

    if (items === null) continue; // both attempts failed for this keyword

    successfulRuns += 1;
    totalFetched += items.length;
    for (const item of items) {
      if (!isRecord(item)) continue;
      const job = mapRawItem(item);
      if (job) mapped.push(job);
    }
  }

  // If no keyword run succeeded and we saw errors, surface the failure so the
  // pipeline marks the run as failed (PRD §14).
  if (successfulRuns === 0 && lastError !== null) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  // Collapse duplicates produced across keyword runs (kept first occurrence).
  const seen = new Set<string>();
  const unique = mapped.filter((job) => {
    if (seen.has(job.upworkId)) return false;
    seen.add(job.upworkId);
    return true;
  });

  logger.info('Apify scrape complete', {
    primaryActorId: settings.apifyActorId,
    keywords: keywords.length,
    successfulRuns,
    fetched: totalFetched,
    mapped: mapped.length,
    unique: unique.length,
  });

  return unique;
}

// ---------------------------------------------------------------------------
// De-duplication
// ---------------------------------------------------------------------------

/**
 * Remove jobs that already exist in the database (by `upworkId`) and collapse
 * duplicates within the incoming array itself. Logs new vs skipped counts.
 */
export async function deduplicateJobs(jobs: RawJob[]): Promise<RawJob[]> {
  if (jobs.length === 0) return [];

  // De-dupe within the incoming batch, keeping the first occurrence.
  const seen = new Set<string>();
  const unique: RawJob[] = [];
  for (const job of jobs) {
    if (seen.has(job.upworkId)) continue;
    seen.add(job.upworkId);
    unique.push(job);
  }

  // Find which of these already exist in the DB.
  const existing = await prisma.job.findMany({
    where: { upworkId: { in: unique.map((j) => j.upworkId) } },
    select: { upworkId: true },
  });
  const existingIds = new Set(existing.map((e) => e.upworkId));

  const fresh = unique.filter((job) => !existingIds.has(job.upworkId));

  logger.info('Deduplicated jobs', {
    incoming: jobs.length,
    uniqueInBatch: unique.length,
    new: fresh.length,
    skipped: unique.length - fresh.length,
  });

  return fresh;
}
