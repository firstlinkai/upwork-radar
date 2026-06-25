import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterBar } from '@/components/FilterBar';
import { JobCard } from '@/components/JobCard';
import { useJobs, useStats } from '@/hooks/useJobs';
import type { JobsQuery } from '@/types';

function StatsRow() {
  const { data, isLoading } = useStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const stats: { label: string; value: number; badge?: 'info' | 'success' | 'warning' }[] = [
    { label: 'Total', value: data.total },
    { label: 'New Today', value: data.newToday, badge: 'info' },
    { label: 'Interested', value: data.byStatus.INTERESTED ?? 0, badge: 'success' },
    { label: 'Applied', value: data.byStatus.APPLIED ?? 0, badge: 'warning' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 shadow-sm"
        >
          <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold leading-none">{stat.value}</span>
            {stat.badge && stat.value > 0 && (
              <Badge variant={stat.badge}>{stat.label}</Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function JobListSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function Dashboard() {
  const [query, setQuery] = useState<JobsQuery>({
    page: 1,
    limit: 20,
    sortBy: 'postedAt',
    sortDir: 'desc',
  });

  const onChange = (patch: Partial<JobsQuery>) => {
    setQuery((prev) => ({ ...prev, ...patch }));
  };

  const { data, isLoading, isError, error } = useJobs(query);

  const page = data?.page ?? query.page ?? 1;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      <StatsRow />

      <FilterBar query={query} onChange={onChange} />

      {isLoading ? (
        <JobListSkeleton />
      ) : isError ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive"
        >
          <p className="font-semibold">Could not load jobs.</p>
          <p className="mt-1">
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </p>
        </div>
      ) : !data || data.jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <p className="font-medium">No jobs match your filters</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting or clearing your filters to see more results.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onChange({ page: page - 1 })}
            >
              <ChevronLeft /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onChange({ page: page + 1 })}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
