import axios, { type AxiosRequestConfig } from 'axios';
import type {
  Job,
  JobListResponse,
  JobStats,
  JobStatus,
  JobsQuery,
  ScrapeRun,
  ScraperStatus,
  Settings,
  SettingsUpdate,
} from '@/types';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

export const http = axios.create({ baseURL });

/** Backend response envelope (PRD §18). */
interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Unwrap the `{ success, data }` envelope, throwing the server error message. */
async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const res = await http.request<ApiEnvelope<T>>(config);
    if (!res.data.success || res.data.data === undefined) {
      throw new Error(res.data.error ?? 'Request failed');
    }
    return res.data.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const message =
        (err.response?.data as ApiEnvelope<unknown> | undefined)?.error ?? err.message;
      throw new Error(message);
    }
    throw err;
  }
}

/** Convert a JobsQuery into a clean params object (drop undefined). */
function toParams(query: JobsQuery): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '' && value !== null) {
      params[key] = value as string | number | boolean;
    }
  }
  return params;
}

export const api = {
  // Jobs
  listJobs: (query: JobsQuery = {}) =>
    request<JobListResponse>({ url: '/jobs', method: 'GET', params: toParams(query) }),
  getJob: (id: string) => request<Job>({ url: `/jobs/${id}`, method: 'GET' }),
  getStats: () => request<JobStats>({ url: '/jobs/stats', method: 'GET' }),
  updateStatus: (id: string, status: JobStatus) =>
    request<Job>({ url: `/jobs/${id}/status`, method: 'PATCH', data: { status } }),
  toggleBookmark: (id: string, isBookmarked?: boolean) =>
    request<Job>({ url: `/jobs/${id}/bookmark`, method: 'PATCH', data: { isBookmarked } }),
  updateNotes: (id: string, notes: string) =>
    request<Job>({ url: `/jobs/${id}/notes`, method: 'PATCH', data: { notes } }),
  deleteJob: (id: string) =>
    request<{ deleted: boolean }>({ url: `/jobs/${id}`, method: 'DELETE' }),
  regenerateProposal: (id: string) =>
    request<Job>({ url: `/jobs/${id}/regenerate-proposal`, method: 'POST' }),

  // Settings
  getSettings: () => request<Settings>({ url: '/settings', method: 'GET' }),
  updateSettings: (data: SettingsUpdate) =>
    request<Settings>({ url: '/settings', method: 'PUT', data }),
  testEmail: () => request<{ sent: boolean }>({ url: '/settings/test-email', method: 'POST' }),

  // Scraper
  runScraper: () =>
    request<{ runId: string | null; status: string; message: string }>({
      url: '/scraper/run',
      method: 'POST',
    }),
  scraperStatus: () => request<ScraperStatus>({ url: '/scraper/status', method: 'GET' }),
  scraperHistory: () =>
    request<{ runs: ScrapeRun[] }>({ url: '/scraper/history', method: 'GET' }),
};
