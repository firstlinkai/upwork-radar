import { cn } from '@/lib/utils';
import type { JobStatus } from '@/types';

const styles: Record<JobStatus, string> = {
  NEW: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  INTERESTED: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400',
  APPLIED: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  ARCHIVED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const labels: Record<JobStatus, string> = {
  NEW: 'New',
  INTERESTED: 'Interested',
  APPLIED: 'Applied',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        styles[status],
        className
      )}
    >
      {labels[status]}
    </span>
  );
}
