import cron from 'node-cron';
import { logger } from '../lib/logger';
import { getSettings } from '../lib/settings';
import { runFullPipeline } from '../services/pipeline.service';

let task: ReturnType<typeof cron.schedule> | null = null;

/**
 * Start the daily cron job (PRD §10). Runs at 07:00 Asia/Manila by default;
 * the hour is read from Settings at startup. The pipeline itself reloads
 * settings fresh on each run.
 */
export async function startScheduler(): Promise<void> {
  // Stop any existing task (supports restarts / re-scheduling).
  if (task) {
    task.stop();
    task = null;
  }

  let hour = 7;
  let tz = 'Asia/Manila';
  try {
    const settings = await getSettings();
    hour = settings.emailScheduleHour;
    tz = settings.emailScheduleTz;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Scheduler could not load settings, using defaults: ${message}`);
  }

  const expression = `0 ${hour} * * *`;
  task = cron.schedule(
    expression,
    () => {
      logger.info('Scheduled daily pipeline triggered');
      runFullPipeline().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Scheduled pipeline error: ${message}`);
      });
    },
    { timezone: tz }
  );

  logger.info(`Scheduler armed: "${expression}" (${tz})`);
}
