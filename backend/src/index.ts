import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { fail } from './lib/http';
import { healthRouter } from './routes/health.routes';
import { settingsRouter } from './routes/settings.routes';
import { jobsRouter } from './routes/jobs.routes';
import { scraperRouter } from './routes/scraper.routes';
import { startScheduler } from './cron/scheduler';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check (PRD §15) — mounted outside /api
app.use('/health', healthRouter);

// API routes
app.use('/api/settings', settingsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/scraper', scraperRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  fail(res, 'Not found', 404);
});

// Centralized error handler — keeps the envelope consistent
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  logger.error('Unhandled error', { error: message });
  fail(res, message, 500);
});

/**
 * Connect to the DB with retry (PRD §14: retry 5x on startup with 2s delay
 * before crashing).
 */
async function connectWithRetry(retries = 5, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      logger.info('Database connection established');
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`DB connection attempt ${attempt}/${retries} failed: ${message}`);
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main(): Promise<void> {
  await connectWithRetry();

  app.listen(env.port, () => {
    logger.info(`UpworkRadar backend listening on port ${env.port}`);
  });

  // Start the daily cron scheduler (PRD §10)
  startScheduler();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Fatal startup error: ${message}`);
  process.exit(1);
});
