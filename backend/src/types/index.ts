// Shared TypeScript types for UpworkRadar backend.

import type { Job, Settings, ScrapeRun } from '@prisma/client';

export type { Job, Settings, ScrapeRun };

// JobStatus is a Prisma enum — re-export as a VALUE (it is also usable as a type).
export { JobStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// API response envelope (PRD §18)
// ---------------------------------------------------------------------------
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ---------------------------------------------------------------------------
// Scraper / pipeline shapes
// ---------------------------------------------------------------------------

/**
 * Normalized job shape produced by the Apify service after mapping raw actor
 * output. This is the internal representation that flows through the
 * filter -> dedup -> AI -> persist pipeline.
 */
export interface RawJob {
  upworkId: string;
  title: string;
  description: string;
  url: string;
  budgetType: 'hourly' | 'fixed';
  budgetMin: number | null;
  budgetMax: number | null;
  clientLocation: string | null;
  proposalCount: number | null;
  clientRating: number | null;
  clientSpent: string | null;
  postedAt: Date;
  skills: string[];
}

/** Result of an AI analysis call for a single job (PRD §7.3). */
export interface AiAnalysis {
  score: number; // 1-10
  rationale: string;
  requirements: string;
  redFlags: string;
  proposal: string;
}

/** A RawJob enriched with AI analysis (may be null when AI failed). */
export interface ScoredJob extends RawJob {
  ai: AiAnalysis | null;
}

/** Summary returned when a pipeline run completes. */
export interface PipelineResult {
  runId: string;
  totalScraped: number;
  totalMatched: number;
  totalNew: number;
  totalScored: number;
  emailSent: boolean;
}
