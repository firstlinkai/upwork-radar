import { Bookmark } from 'lucide-react';
import { JobCard } from '@/components/JobCard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useJobs } from '@/hooks/useJobs';
import type { JobsQuery } from '@/types';

const BOOKMARKS_QUERY: JobsQuery = {
  bookmarked: true,
  sortBy: 'aiScore',
  sortDir: 'desc',
  limit: 100,
};

export function Bookmarks() {
  const { data, isLoading, isError, error } = useJobs(BOOKMARKS_QUERY);
  const jobs = data?.jobs ?? [];

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Bookmark className="size-6 text-amber-500" aria-hidden="true" />
        <h1 className="text-2xl font-semibold tracking-tight">Bookmarks</h1>
        {!isLoading && !isError && (
          <span
            className="text-sm text-muted-foreground"
            aria-label={`${jobs.length} bookmarked jobs`}
          >
            ({jobs.length})
          </span>
        )}
      </header>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="gap-3 p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="size-12 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card className="gap-2 border-destructive/40 p-6 text-center" role="alert">
          <p className="font-medium text-destructive">Could not load bookmarks</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Something went wrong. Please try again.'}
          </p>
        </Card>
      ) : jobs.length === 0 ? (
        <Card className="items-center gap-2 p-10 text-center">
          <Bookmark className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">No bookmarked jobs yet.</p>
          <p className="text-sm text-muted-foreground">
            Tap the &#9734; on any job to save it here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
