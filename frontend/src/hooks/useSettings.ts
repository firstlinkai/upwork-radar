import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SettingsUpdate } from '@/types';

export const settingsKeys = {
  all: ['settings'] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: () => api.getSettings(),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SettingsUpdate) => api.updateSettings(data),
    onSuccess: (settings) => qc.setQueryData(settingsKeys.all, settings),
  });
}

export function useTestEmail() {
  return useMutation({
    mutationFn: () => api.testEmail(),
  });
}
