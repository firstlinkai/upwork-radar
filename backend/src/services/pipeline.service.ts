import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getSettings } from '../lib/settings';
import { scrapeJobs, deduplicateJobs } from './apify.service';
import { filterJobs } from './filter.service';
import { processJobs } from './ai.service';
import { sendDigest } from './email.service';
import type { Job, ScoredJob, PipelineResult } from '../types';

// In-process lock so a manual trigger cannot run while the scheduled run (or a
// previous manual run) is still in progress (PRD §14 -> 409 Conflict).
let running = false;

export function isPipelineRunning(): boolean {
  return running;
}

async function createScrapeRun(): Promise<string> {
  const run = await prisma.scrapeRun.create({ data: { status: 'running' } });
  return run.id;
}

async function completeScrapeRun(
  id: string,
  jobsFound: number,
  jobsMatched: number
): Promise<void> {
  await prisma.scrapeRun.update({
    where: { id },
    data: { status: 'completed', completedAt: new Date(), jobsFound, jobsMatched },
  });
}

async function failScrapeRun(id: string, message: string): Promise<void> {
  await prisma.scrapeRun.update({
    where: { id },
    data: { status: 'failed', completedAt: new Date(), errorMessage: message },
  });
}

/**
 * Persist scored jobs, preserving user actions (status/notes/bookmark) on
 * existing rows via upsert keyed by upworkId (PRD §14). Returns the saved rows.
 */
async function saveJobs(scored: ScoredJob[]): Promise<Job[]> {
  const saved: Job[] = [];
  for (const job of scored) {
    const ai = job.ai;
    const aiData = {
      aiScore: ai?.score ?? null,
      aiRationale: ai?.rationale ?? null,
      aiRequirements: ai?.requirements ?? null,
      aiRedFlags: ai?.redFlags ?? null,
      aiProposal: ai?.proposal ?? null,
      aiProcessedAt: ai ? new Date() : null,
    };
    const meta = {
      title: job.title,
      description: job.description,
      url: job.url,
      budgetType: job.budgetType,
      budgetMin: job.budgetMin,
      budgetMax: job.budgetMax,
      clientLocation: job.clientLocation,
      proposalCount: job.proposalCount,
      clientRating: job.clientRating,
      clientSpent: job.clientSpent,
      postedAt: job.postedAt,
      skills: job.skills,
    };
    const row = await prisma.job.upsert({
      where: { upworkId: job.upworkId },
      create: { upworkId: job.upworkId, ...meta, ...aiData },
      // Refresh metadata + AI on re-scrape but never clobber user actions.
      update: { ...meta, ...aiData },
    });
    saved.push(row);
  }
  return saved;
}

/**
 * The full daily pipeline (PRD §10). Used by both the cron scheduler and the
 * manual trigger endpoint. Never throws — failures are recorded on the run.
 */
export async function runFullPipeline(): Promise<PipelineResult> {
  if (running) {
    throw new Error('A scrape is already in progress');
  }
  running = true;
  const runId = await createScrapeRun();
  logger.info(`Pipeline run ${runId} started`);

  try {
    const settings = await getSettings();

    const rawJobs = await scrapeJobs(settings);
    logger.info(`Scraped ${rawJobs.length} raw jobs`);

    const filtered = filterJobs(rawJobs, settings);
    const newJobs = await deduplicateJobs(filtered);
    logger.info(`${filtered.length} passed filters, ${newJobs.length} are new`);

    const scored = await processJobs(newJobs, settings);
    const savedJobs = await saveJobs(scored);
    logger.info(`Saved ${savedJobs.length} scored jobs`);

    const emailSent = await sendDigest(
      savedJobs,
      { totalScraped: rawJobs.length, totalMatched: filtered.length },
      settings
    );

    await completeScrapeRun(runId, rawJobs.length, filtered.length);
    logger.info(`Pipeline run ${runId} completed`);

    return {
      runId,
      totalScraped: rawJobs.length,
      totalMatched: filtered.length,
      totalNew: newJobs.length,
      totalScored: savedJobs.length,
      emailSent,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Pipeline run ${runId} failed: ${message}`);
    await failScrapeRun(runId, message);
    throw err;
  } finally {
    running = false;
  }
}
