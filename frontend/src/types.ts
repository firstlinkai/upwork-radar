// Shared frontend types — mirror the backend Prisma models / API shapes.

export type JobStatus = 'NEW' | 'INTERESTED' | 'APPLIED' | 'REJECTED' | 'ARCHIVED';

export interface Job {
  id: string;
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
  postedAt: string;
  scrapedAt: string;
  skills: string[];
  aiScore: number | null;
  aiRationale: string | null;
  aiRequirements: string | null;
  aiRedFlags: string | null;
  aiProposal: string | null;
  aiProcessedAt: string | null;
  status: JobStatus;
  isBookmarked: boolean;
  notes: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobListResponse {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface JobStats {
  total: number;
  byStatus: Record<JobStatus, number>;
  newToday: number;
}

export interface Settings {
  id: string;
  apifyActorId: string;
  searchKeywords: string[];
  maxResults: number;
  minHourlyRate: number;
  minFixedBudget: number;
  maxProposals: number;
  clientLocations: string[];
  recipientEmail: string;
  emailScheduleHour: number;
  emailScheduleTz: string;
  minScoreToEmail: number;
  minScoreForProposal: number;
  apifyApiKeyMasked: string | null;
  resendApiKeyMasked: string | null;
  updatedAt: string;
}

/** Body for PUT /settings — all fields optional; keys only sent when changed. */
export type SettingsUpdate = Partial<
  Omit<Settings, 'id' | 'updatedAt' | 'apifyApiKeyMasked' | 'resendApiKeyMasked'>
> & {
  apifyApiKey?: string;
  resendApiKey?: string;
};

export interface ScrapeRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'completed' | 'failed';
  jobsFound: number | null;
  jobsMatched: number | null;
  errorMessage: string | null;
}

export interface ScraperStatus {
  running: boolean;
  lastRun: ScrapeRun | null;
}

export interface JobsQuery {
  status?: JobStatus;
  bookmarked?: boolean;
  minScore?: number;
  budgetType?: 'hourly' | 'fixed';
  search?: string;
  sortBy?: 'aiScore' | 'postedAt' | 'proposalCount';
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
