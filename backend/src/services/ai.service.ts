import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '../lib/env';
import { logger } from '../lib/logger';
import type { RawJob, AiAnalysis, ScoredJob, Settings } from '../types/index';

// ---------------------------------------------------------------------------
// Configuration constants (PRD §7.3, §14)
// ---------------------------------------------------------------------------

/** Model id pinned by the shared contract. */
const MODEL = 'claude-sonnet-4-6';

/** Max tokens for a single analysis response. */
const MAX_TOKENS = 1500;

/** Number of jobs analyzed concurrently per batch. */
const BATCH_SIZE = 5;

/** Delay (ms) inserted between batches to ease rate-limit pressure. */
const BATCH_DELAY_MS = 1000;

/** Exponential backoff delays (ms) for retry attempts 1..3. */
const RETRY_DELAYS_MS = [2000, 4000, 8000] as const;

// ---------------------------------------------------------------------------
// Lazy Anthropic client
// ---------------------------------------------------------------------------

// The client is created on first use so that importing this module does not
// require ANTHROPIC_API_KEY to be present (e.g. during tests or migrations).
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client === null) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

// Sunny's profile — used verbatim as the SYSTEM prompt.
const SYSTEM_PROMPT = `You are an AI assistant helping Suneel (Sunny) Ramesh, an AI Automation Engineer with the handle @firstlinkai, evaluate Upwork job listings for fit.

Sunny's core expertise:
- Building AI automation systems for digital marketing agencies
- Tech stack: n8n, Make.com, Claude AI, OpenAI GPT-4o, Google Gemini
- Languages/frameworks: Node.js, TypeScript, Python, React, Next.js
- Data/infra: Supabase, PostgreSQL, AWS Lambda, Docker
- Scraping/data: Apify, Puppeteer
- Integrations: Stripe, ClickUp, Moneybird, Productive.io, Looker Studio
- Background: 9 years in reliability/safety engineering (Dubai Metro), MBA in Entrepreneurship

Sunny is based in Manila, Philippines but targets clients in Australia, New Zealand, and Europe. He runs FirstlinkAI, a studio building AI-powered systems for agencies.

Your ideal job criteria:
- AI workflow automation (n8n, Make.com, Zapier)
- AI agent development (Claude, GPT-4, Gemini)
- Backend API + automation systems
- Dashboard/reporting automation (Looker Studio, Supabase)
- Digital marketing tech stack integrations
- Long-term contracts preferred but open to project-based

Proposal writing style for Sunny:
- First line: immediately address the client's core problem
- Second paragraph: specific relevant experience (mention tools if applicable)
- Close: clear call to action / next step
- No em dashes, no buzzwords, no filler phrases like "I hope this finds you well"
- Confident, concise, agency-owner tone`;

/** Build the per-job USER prompt by interpolating job fields. */
function buildUserPrompt(job: RawJob): string {
  const budget = `${job.budgetType} - ${job.budgetMin} to ${job.budgetMax}`;
  const skills = job.skills.join(', ');

  return `Analyze this Upwork job listing and return ONLY a valid JSON object:

Title: ${job.title}
Description: ${job.description}
Budget: ${budget}
Client Location: ${job.clientLocation}
Skills Required: ${skills}
Proposals So Far: ${job.proposalCount}

Return this exact JSON structure:
{
  "score": <integer 1-10>,
  "rationale": "<2-3 sentences explaining the score>",
  "requirements": "<comma-separated list of key technical requirements extracted from the post>",
  "redFlags": "<comma-separated red flags, or empty string if none>",
  "proposal": "<full draft proposal, 150-200 words, written in Sunny's voice — confident, direct, no fluff. Only include if score >= 7, otherwise return empty string>"
}

Scoring guide:
10 = Perfect match (AI automation + his exact tools + good budget + few proposals)
7-9 = Strong match (core automation skills + reasonable budget)
4-6 = Partial match (some relevant skills but gaps or concerns)
1-3 = Poor match (unrelated tech, too low budget, or too vague)`;
}

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

// Zod schema for the model's JSON output. The score is coerced to an integer
// and clamped to 1-10; the text fields default to '' when missing.
const analysisSchema = z.object({
  score: z.coerce
    .number()
    .transform((n) => Math.min(10, Math.max(1, Math.round(n)))),
  rationale: z.string().default(''),
  requirements: z.string().default(''),
  redFlags: z.string().default(''),
  proposal: z.string().default(''),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Promise-based sleep. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Concatenate the text from all `text`-type content blocks of a message
 * response. Other block types (e.g. tool_use) are ignored.
 */
function extractText(message: Anthropic.Message): string {
  let text = '';
  for (const block of message.content) {
    if (block.type === 'text') {
      text += block.text;
    }
  }
  return text;
}

/**
 * Robustly parse a JSON object out of raw model text:
 *  1. strip any markdown code fences,
 *  2. slice from the first `{` to the last `}`,
 *  3. JSON.parse the result.
 * Returns `unknown` so the caller validates the shape with zod.
 */
function parseJsonObject(raw: string): unknown {
  // Remove ``` and ```json fences anywhere in the string.
  const withoutFences = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '');

  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model response');
  }

  const candidate = withoutFences.slice(start, end + 1);
  return JSON.parse(candidate) as unknown;
}

/**
 * Call the Anthropic Messages API with retry + exponential backoff.
 * Retries up to 3 times (delays 2000/4000/8000 ms) on rate-limit (429) and
 * transient errors. Throws the last error if every attempt fails.
 */
async function createWithRetry(userPrompt: string): Promise<Anthropic.Message> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await getClient().messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });
    } catch (err: unknown) {
      lastError = err;

      // If we have exhausted the retry budget, stop.
      if (attempt >= RETRY_DELAYS_MS.length) {
        break;
      }

      const delay = RETRY_DELAYS_MS[attempt];
      const status =
        err instanceof Anthropic.APIError ? err.status : undefined;
      logger.warn('Anthropic request failed, retrying', {
        attempt: attempt + 1,
        maxAttempts: RETRY_DELAYS_MS.length + 1,
        delayMs: delay,
        status,
        error: err instanceof Error ? err.message : String(err),
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze a single job with Claude and return a validated `AiAnalysis`.
 * Returns `null` (never throws) if all retries fail or the response cannot be
 * parsed/validated, so callers can degrade gracefully.
 */
export async function analyzeJob(
  job: RawJob,
  settings: Settings
): Promise<AiAnalysis | null> {
  const userPrompt = buildUserPrompt(job);

  try {
    const message = await createWithRetry(userPrompt);
    const text = extractText(message);
    const parsed = parseJsonObject(text);
    const analysis: AiAnalysis = analysisSchema.parse(parsed);

    // Proposal gating: only keep the draft proposal when the score clears the
    // configured threshold.
    if (analysis.score < settings.minScoreForProposal) {
      analysis.proposal = '';
    }

    return analysis;
  } catch (err: unknown) {
    logger.error('analyzeJob failed', {
      upworkId: job.upworkId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Analyze many jobs in batches of `BATCH_SIZE` with a `BATCH_DELAY_MS` pause
 * between batches (PRD §7.3). Within a batch each job is analyzed concurrently;
 * a failure in one job maps to `{ ...job, ai: null }` and does not abort the
 * batch.
 */
export async function processJobs(
  jobs: RawJob[],
  settings: Settings
): Promise<ScoredJob[]> {
  const results: ScoredJob[] = [];
  const totalBatches = Math.ceil(jobs.length / BATCH_SIZE);

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

    logger.info('Processing AI batch', {
      batch: batchNumber,
      totalBatches,
      size: batch.length,
    });

    const scored = await Promise.all(
      batch.map(async (job): Promise<ScoredJob> => {
        try {
          const ai = await analyzeJob(job, settings);
          return { ...job, ai };
        } catch (err: unknown) {
          // analyzeJob already swallows errors, but guard here too so one bad
          // job can never reject the whole batch.
          logger.error('processJobs job failed', {
            upworkId: job.upworkId,
            error: err instanceof Error ? err.message : String(err),
          });
          return { ...job, ai: null };
        }
      })
    );

    results.push(...scored);

    // Pause between batches, but not after the final one.
    if (i + BATCH_SIZE < jobs.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}
