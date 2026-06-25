import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { jobKeys } from '@/hooks/useJobs';

export const scraperKeys = {
  status: ['scraper', 'status'] as const,
  history: ['scraper', 'history'] as const,
};

export function useScraperStatus() {
  return useQuery({
    queryKey: scraperKeys.status,
    queryFn: () => api.scraperStatus(),
    // Poll while a run is in progress so the UI reflects completion.
    refetchInterval: (query) => (query.state.data?.running ? 3000 : false),
  });
}

export function useScraperHistory() {
  return useQuery({
    queryKey: scraperKeys.history,
    queryFn: () => api.scraperHistory(),
  });
}

export function useRunScraper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.runScraper(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: scraperKeys.status });
      void qc.invalidateQueries({ queryKey: scraperKeys.history });
      void qc.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}
