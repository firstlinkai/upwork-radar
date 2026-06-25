import { Link } from 'react-router-dom';
import { Star, MapPin, Users, Clock, ArrowRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScoreBadge, scoreColor } from '@/components/ScoreBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { formatBudget, timeAgo, splitCsv } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { useUpdateStatus, useToggleBookmark } from '@/hooks/useJobs';
import type { Job, JobStatus } from '@/types';

export function JobCard({ job }: { job: Job }) {
  const colors = scoreColor(job.aiScore);
  const updateStatus = useUpdateStatus();
  const toggleBookmark = useToggleBookmark();
  const { toast } = useToast();

  const setStatus = (status: JobStatus) => {
    updateStatus.mutate(
      { id: job.id, status },
      {
        onError: (err) =>
          toast({
            title: 'Could not update status',
            description: err instanceof Error ? err.message : undefined,
            variant: 'error',
          }),
      }
    );
  };

  const onBookmark = () => {
    toggleBookmark.mutate({ id: job.id });
  };

  const redFlags = splitCsv(job.aiRedFlags);

  return (
    <div
      className={cn(
        'relative rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
        colors.border
      )}
    >
      {/* Unreviewed indicator */}
      {job.status === 'NEW' && (
        <span
          className="absolute -left-[3px] top-4 size-2 -translate-x-1/2 rounded-full bg-blue-500"
          aria-label="New / unreviewed"
        />
      )}

      <div className="flex items-start gap-3">
        <ScoreBadge score={job.aiScore} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              to={`/jobs/${job.id}`}
              className="line-clamp-2 font-semibold leading-snug hover:underline"
            >
              {job.title}
            </Link>
            <button
              type="button"
              onClick={onBookmark}
              aria-label={job.isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              className="shrink-0 text-muted-foreground transition-colors hover:text-amber-500"
            >
              <Star className={cn('size-5', job.isBookmarked && 'fill-amber-400 text-amber-400')} />
            </button>
          </div>

          {/* Meta line */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{formatBudget(job)}</span>
            {job.clientLocation && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {job.clientLocation}
              </span>
            )}
            {job.proposalCount != null && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" /> {job.proposalCount} proposals
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {timeAgo(job.postedAt)}
            </span>
            <StatusBadge status={job.status} />
          </div>

          {/* Requirements */}
          {job.aiRequirements && (
            <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Requirements:</span>{' '}
              {job.aiRequirements}
            </p>
          )}

          {/* Red flags */}
          {redFlags.length > 0 && (
            <p className="mt-1 inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" /> {redFlags.join(', ')}
            </p>
          )}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={job.status === 'INTERESTED' ? 'default' : 'outline'}
              onClick={() => setStatus('INTERESTED')}
            >
              Interested
            </Button>
            <Button
              size="sm"
              variant={job.status === 'APPLIED' ? 'default' : 'outline'}
              onClick={() => setStatus('APPLIED')}
            >
              Applied
            </Button>
            <Button
              size="sm"
              variant={job.status === 'REJECTED' ? 'destructive' : 'outline'}
              onClick={() => setStatus('REJECTED')}
            >
              Reject
            </Button>
            <Button size="sm" variant="ghost" asChild className="ml-auto">
              <Link to={`/jobs/${job.id}`}>
                View <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
