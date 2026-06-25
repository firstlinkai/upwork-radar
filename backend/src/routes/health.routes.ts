import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma';

export const healthRouter = Router();

// GET /health -> { status, db, uptime } (PRD §15)
healthRouter.get('/', async (_req: Request, res: Response) => {
  let db: 'connected' | 'disconnected' = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = 'connected';
  } catch {
    db = 'disconnected';
  }

  res.status(db === 'connected' ? 200 : 503).json({
    status: db === 'connected' ? 'ok' : 'degraded',
    db,
    uptime: Math.round(process.uptime()),
  });
});
