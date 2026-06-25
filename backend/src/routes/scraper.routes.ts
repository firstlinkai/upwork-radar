import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { ok, fail } from '../lib/http';
import { runFullPipeline, isPipelineRunning } from '../services/pipeline.service';

export const scraperRouter = Router();

// POST /api/scraper/run — trigger a manual scrape (PRD §6.2, §14)
scraperRouter.post('/run', async (_req: Request, res: Response) => {
  if (isPipelineRunning()) {
    return fail(res, 'A scrape is already in progress', 409);
  }

  // Kick off the pipeline but don't wait for it — respond immediately so the
  // UI can poll /scraper/status for progress.
  let runId: string | null = null;
  try {
    const run = await prisma.scrapeRun.findFirst({ orderBy: { startedAt: 'desc' } });
    runId = run?.id ?? null;
  } catch {
    runId = null;
  }

  runFullPipeline().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Manual pipeline run failed: ${message}`);
  });

  return ok(
    res,
    {
      runId,
      status: 'running',
      message: 'Scrape started. Check /scraper/status for progress.',
    },
    202
  );
});

// GET /api/scraper/status — current or last run status
scraperRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const last = await prisma.scrapeRun.findFirst({ orderBy: { startedAt: 'desc' } });
    return ok(res, { running: isPipelineRunning(), lastRun: last });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(res, message, 500);
  }
});

// GET /api/scraper/history — last 10 scrape runs
scraperRouter.get('/history', async (_req: Request, res: Response) => {
  try {
    const runs = await prisma.scrapeRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    });
    return ok(res, { runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(res, message, 500);
  }
});
