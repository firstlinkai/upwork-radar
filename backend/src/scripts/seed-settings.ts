import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

/**
 * Seed the singleton Settings row (PRD §13 step 4).
 *
 * Uses an upsert with an empty `update` so an existing settings row is left
 * untouched; when the row is absent it is created with `id: 'singleton'` and
 * the Prisma schema defaults fill in every other column.
 *
 * Run with: ts-node src/scripts/seed-settings.ts
 */
async function main(): Promise<void> {
  const settings = await prisma.settings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  logger.info('Seeded singleton settings row', { id: settings.id });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to seed settings', { error: message });
    await prisma.$disconnect();
    process.exit(1);
  });
