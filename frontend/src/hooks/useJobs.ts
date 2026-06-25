import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { JobStatus, JobsQuery } from '@/types';

export const jobKeys = {
  all: ['jobs'] as const,
  list: (query: JobsQuery) => ['jobs', 'list', query] as const,
  detail: (id: string) => ['jobs', 'detail', id] as const,
  stats: ['jobs', 'stats'] as const,
};

export function useJobs(query: JobsQuery) {
  return useQuery({
    queryKey: jobKeys.list(query),
    queryFn: () => api.listJobs(query),
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: jobKeys.detail(id),
    queryFn: () => api.getJob(id),
    enabled: Boolean(id),
  });
}

export function useStats() {
  return useQuery({
    queryKey: jobKeys.stats,
    queryFn: () => api.getStats(),
  });
}

/** Invalidate all job lists, stats, and (optionally) a detail after a mutation. */
function useJobInvalidator() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: jobKeys.all });
    if (id) void qc.invalidateQueries({ queryKey: jobKeys.detail(id) });
  };
}

export function useUpdateStatus() {
  const invalidate = useJobInvalidator();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: JobStatus }) =>
      api.updateStatus(id, status),
    onSuccess: (job) => invalidate(job.id),
  });
}

export function useToggleBookmark() {
  const invalidate = useJobInvalidator();
  return useMutation({
    mutationFn: ({ id, isBookmarked }: { id: string; isBookmarked?: boolean }) =>
      api.toggleBookmark(id, isBookmarked),
    onSuccess: (job) => invalidate(job.id),
  });
}

export function useUpdateNotes() {
  const invalidate = useJobInvalidator();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => api.updateNotes(id, notes),
    onSuccess: (job) => invalidate(job.id),
  });
}

export function useDeleteJob() {
  const invalidate = useJobInvalidator();
  return useMutation({
    mutationFn: (id: string) => api.deleteJob(id),
    onSuccess: () => invalidate(),
  });
}

export function useRegenerateProposal() {
  const invalidate = useJobInvalidator();
  return useMutation({
    mutationFn: (id: string) => api.regenerateProposal(id),
    onSuccess: (job) => invalidate(job.id),
  });
}
