import { Router, type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ok, fail } from '../lib/http';
import { logger } from '../lib/logger';
import { getSettings } from '../lib/settings';
import { analyzeJob } from '../services/ai.service';
import { JobStatus, type Job, type RawJob } from '../types';

export const jobsRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Prisma error code raised when an update/delete targets a missing record. */
const RECORD_NOT_FOUND = 'P2025';

function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === RECORD_NOT_FOUND;
}

/**
 * Centralized catch handler. Treats a missing record as 404; everything else
 * is a 500 with the error message surfaced.
 */
function handleError(res: Response, err: unknown, fallback: string): Response {
  if (isRecordNotFound(err)) {
    return fail(res, 'Job not found', 404);
  }
  const message = err instanceof Error ? err.message : fallback;
  logger.error(fallback, { err });
  return fail(res, message, 500);
}

/** Narrow the stored budgetType string back to the RawJob union. */
function toBudgetType(value: string): RawJob['budgetType'] {
  return value === 'hourly' ? 'hourly' : 'fixed';
}

// ---------------------------------------------------------------------------
// GET /api/jobs — list with filters / pagination
// ---------------------------------------------------------------------------
const listQuerySchema = z.object({
  status: z.enum(JobStatus).optional(),
  bookmarked: z.enum(['true', 'false']).optional(),
  minScore: z.coerce.number().int().min(1).max(10).optional(),
  budgetType: z.enum(['hourly', 'fixed']).optional(),
  search: z.string().min(1).optional(),
  sortBy: z.enum(['aiScore', 'postedAt', 'proposalCount']).default('postedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

jobsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.join('.');
      const message = path ? `${path}: ${issue.message}` : (issue?.message ?? 'Invalid query');
      return fail(res, message, 400);
    }

    const { status, bookmarked, minScore, budgetType, search, sortBy, sortDir, page, limit } =
      parsed.data;

    const where: Prisma.JobWhereInput = {};
    if (status) where.status = status;
    if (bookmarked) where.isBookmarked = bookmarked === 'true';
    if (typeof minScore === 'number') where.aiScore = { gte: minScore };
    if (budgetType) where.budgetType = budgetType;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.JobOrderByWithRelationInput = { [sortBy]: sortDir };

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.job.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return ok(res, { jobs, total, page, limit, totalPages });
  } catch (err) {
    return handleError(res, err, 'Failed to list jobs');
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs/stats — counts by status + today's new count
// IMPORTANT: declared BEFORE GET /:id so "stats" is not captured as an id.
// ---------------------------------------------------------------------------
jobsRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [total, grouped, newToday] = await Promise.all([
      prisma.job.count(),
      prisma.job.groupBy({ by: ['status'], _count: true }),
      prisma.job.count({ where: { createdAt: { gte: startOfToday } } }),
    ]);

    const byStatus: Record<JobStatus, number> = {
      [JobStatus.NEW]: 0,
      [JobStatus.INTERESTED]: 0,
      [JobStatus.APPLIED]: 0,
      [JobStatus.REJECTED]: 0,
      [JobStatus.ARCHIVED]: 0,
    };
    for (const row of grouped) {
      byStatus[row.status] = row._count;
    }

    return ok(res, { total, byStatus, newToday });
  } catch (err) {
    return handleError(res, err, 'Failed to load job stats');
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id
// ---------------------------------------------------------------------------
jobsRouter.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return fail(res, 'Job not found', 404);
    return ok(res, job);
  } catch (err) {
    return handleError(res, err, 'Failed to load job');
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/jobs/:id/status
// ---------------------------------------------------------------------------
const statusSchema = z.object({ status: z.enum(JobStatus) });

jobsRouter.patch('/:id/status', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, parsed.error.issues[0]?.message ?? 'Invalid status', 400);
    }

    const { status } = parsed.data;
    const data: Prisma.JobUpdateInput = { status };
    if (status === JobStatus.APPLIED) data.appliedAt = new Date();

    const job = await prisma.job.update({ where: { id: req.params.id }, data });
    return ok(res, job);
  } catch (err) {
    return handleError(res, err, 'Failed to update status');
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/jobs/:id/bookmark — set explicitly or toggle when omitted
// ---------------------------------------------------------------------------
const bookmarkSchema = z.object({ isBookmarked: z.boolean().optional() });

jobsRouter.patch('/:id/bookmark', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const parsed = bookmarkSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return fail(res, parsed.error.issues[0]?.message ?? 'Invalid bookmark payload', 400);
    }

    let next: boolean;
    if (typeof parsed.data.isBookmarked === 'boolean') {
      next = parsed.data.isBookmarked;
    } else {
      const current = await prisma.job.findUnique({
        where: { id: req.params.id },
        select: { isBookmarked: true },
      });
      if (!current) return fail(res, 'Job not found', 404);
      next = !current.isBookmarked;
    }

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { isBookmarked: next },
    });
    return ok(res, job);
  } catch (err) {
    return handleError(res, err, 'Failed to update bookmark');
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/jobs/:id/notes
// ---------------------------------------------------------------------------
const notesSchema = z.object({ notes: z.string() });

jobsRouter.patch('/:id/notes', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const parsed = notesSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, parsed.error.issues[0]?.message ?? 'Invalid notes payload', 400);
    }

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { notes: parsed.data.notes },
    });
    return ok(res, job);
  } catch (err) {
    return handleError(res, err, 'Failed to update notes');
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/jobs/:id
// ---------------------------------------------------------------------------
jobsRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    await prisma.job.delete({ where: { id: req.params.id } });
    return ok(res, { deleted: true });
  } catch (err) {
    return handleError(res, err, 'Failed to delete job');
  }
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:id/regenerate-proposal
// ---------------------------------------------------------------------------
function toRawJob(job: Job): RawJob {
  return {
    upworkId: job.upworkId,
    title: job.title,
    description: job.description,
    url: job.url,
    budgetType: toBudgetType(job.budgetType),
    budgetMin: job.budgetMin,
    budgetMax: job.budgetMax,
    clientLocation: job.clientLocation,
    proposalCount: job.proposalCount,
    clientRating: job.clientRating,
    clientSpent: job.clientSpent,
    postedAt: job.postedAt,
    skills: job.skills,
  };
}

jobsRouter.post('/:id/regenerate-proposal', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return fail(res, 'Job not found', 404);

    const settings = await getSettings();
    const analysis = await analyzeJob(toRawJob(job), settings);
    if (!analysis) return fail(res, 'AI analysis failed', 502);

    const updated = await prisma.job.update({
      where: { id: job.id },
      data: {
        aiScore: analysis.score,
        aiRationale: analysis.rationale,
        aiRequirements: analysis.requirements,
        aiRedFlags: analysis.redFlags,
        aiProposal: analysis.proposal,
        aiProcessedAt: new Date(),
      },
    });

    return ok(res, updated);
  } catch (err) {
    return handleError(res, err, 'Failed to regenerate proposal');
  }
});
