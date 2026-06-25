import type { Job } from '@/types';

/** Format a job budget like "$45–60/hr" or "$500–1,000" or "$50/hr". */
export function formatBudget(job: Pick<Job, 'budgetType' | 'budgetMin' | 'budgetMax'>): string {
  const { budgetType, budgetMin, budgetMax } = job;
  const suffix = budgetType === 'hourly' ? '/hr' : '';
  const fmt = (n: number) => `$${n.toLocaleString('en-US')}`;
  if (budgetMin != null && budgetMax != null && budgetMax !== budgetMin) {
    return `${fmt(budgetMin)}–${budgetMax.toLocaleString('en-US')}${suffix}`;
  }
  if (budgetMin != null) return `${fmt(budgetMin)}${suffix}`;
  if (budgetMax != null) return `${fmt(budgetMax)}${suffix}`;
  return budgetType === 'hourly' ? 'Hourly' : 'Fixed';
}

/** Relative "time ago" label from an ISO timestamp. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/** Split a comma-separated AI field into trimmed, non-empty parts. */
export function splitCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
