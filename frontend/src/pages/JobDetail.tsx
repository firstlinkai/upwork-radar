import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Copy,
  RefreshCw,
  Loader2,
  Bookmark,
  Star,
  MapPin,
  Users,
  Calendar,
} from 'lucide-react';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

import { ScoreBadge } from '@/components/ScoreBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { ProposalDrawer } from '@/components/ProposalDrawer';

import {
  useJob,
  useUpdateStatus,
  useToggleBookmark,
  useUpdateNotes,
  useRegenerateProposal,
} from '@/hooks/useJobs';
import { formatBudget, splitCsv } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Job, JobStatus } from '@/types';

const PROPOSAL_LIMIT = 5000;

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ARCHIVED', label: 'Archived' },
];

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/">
        <ArrowLeft />
        Back to Dashboard
      </Link>
    </Button>
  );
}

export function JobDetail() {
  const { id } = useParams();
  const { data: job, isLoading, isError } = useJob(id ?? '');

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <BackLink />
        <Card>
          <CardHeader>
            <CardTitle>Something went wrong</CardTitle>
            <CardDescription>
              We couldn't load this job. Please try again in a moment.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <BackLink />
        <Card>
          <CardHeader>
            <CardTitle>Job not found</CardTitle>
            <CardDescription>
              This job may have been removed.{' '}
              <Link to="/" className="text-primary underline-offset-4 hover:underline">
                Return to the dashboard
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return <JobDetailContent job={job} />;
}

function JobDetailContent({ job }: { job: Job }) {
  const { toast } = useToast();

  const updateStatus = useUpdateStatus();
  const toggleBookmark = useToggleBookmark();
  const updateNotes = useUpdateNotes();
  const regenerate = useRegenerateProposal();

  const [drawerOpen, setDrawerOpen] = useState(false);

  // Notes: local state seeded from job, debounced auto-save.
  const [notes, setNotes] = useState(job.notes ?? '');
  const [savedVisible, setSavedVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(job.notes ?? '');

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setSavedVisible(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value === lastSavedRef.current) return;
      updateNotes.mutate(
        { id: job.id, notes: value },
        {
          onSuccess: () => {
            lastSavedRef.current = value;
            setSavedVisible(true);
          },
          onError: () =>
            toast({
              title: 'Failed to save notes',
              description: 'Your changes could not be saved.',
              variant: 'error',
            }),
        }
      );
    }, 800);
  };

  const handleStatusChange = (value: string) => {
    updateStatus.mutate(
      { id: job.id, status: value as JobStatus },
      {
        onError: () =>
          toast({
            title: 'Failed to update status',
            description: 'Please try again.',
            variant: 'error',
          }),
      }
    );
  };

  const handleToggleBookmark = () => {
    toggleBookmark.mutate(
      { id: job.id, isBookmarked: !job.isBookmarked },
      {
        onError: () =>
          toast({
            title: 'Failed to update bookmark',
            description: 'Please try again.',
            variant: 'error',
          }),
      }
    );
  };

  const proposal = job.aiProposal ?? '';
  const requirements = splitCsv(job.aiRequirements);
  const redFlags = splitCsv(job.aiRedFlags);

  const handleCopyProposal = async () => {
    if (!proposal) return;
    try {
      await navigator.clipboard.writeText(proposal);
      toast({ title: 'Copied to clipboard', variant: 'success' });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not access the clipboard.',
        variant: 'error',
      });
    }
  };

  const handleRegenerate = () => {
    regenerate.mutate(job.id, {
      onSuccess: () => toast({ title: 'Proposal regenerated', variant: 'success' }),
      onError: () =>
        toast({
          title: 'Regeneration failed',
          description: 'Could not regenerate the proposal. Please try again.',
          variant: 'error',
        }),
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <BackLink />
        <StatusBadge status={job.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT — Job Info */}
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl leading-snug font-semibold">{job.title}</h1>
            </CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              Posted {new Date(job.postedAt).toLocaleDateString()}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="font-medium text-foreground">{formatBudget(job)}</span>
              <Badge variant="secondary" className="capitalize">
                {job.budgetType}
              </Badge>
              {job.clientLocation ? (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {job.clientLocation}
                </span>
              ) : null}
              {job.proposalCount != null ? (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Users className="size-3.5" />
                  {job.proposalCount} proposals
                </span>
              ) : null}
              {job.clientRating != null ? (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Star className="size-3.5" />
                  {job.clientRating.toFixed(1)}
                  {job.clientSpent ? ` · ${job.clientSpent} spent` : ''}
                </span>
              ) : null}
            </div>

            <Button asChild variant="outline" size="sm">
              <a href={job.url} target="_blank" rel="noreferrer">
                <ExternalLink />
                View on Upwork
              </a>
            </Button>

            <Separator />

            <div>
              <h2 className="mb-2 text-sm font-medium">Description</h2>
              <div className="max-h-[480px] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {job.description}
              </div>
            </div>

            {job.skills.length > 0 ? (
              <div>
                <h2 className="mb-2 text-sm font-medium">Skills</h2>
                <div className="flex flex-wrap gap-1.5">
                  {job.skills.map((skill) => (
                    <Badge key={skill} variant="outline">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* RIGHT — AI Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>AI Analysis</CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="flex items-start gap-3">
              <ScoreBadge score={job.aiScore} size="lg" />
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                {job.aiRationale ?? 'No rationale available.'}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Extracted requirements</h3>
              {requirements.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {requirements.map((req, i) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None</p>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Red flags</h3>
              {redFlags.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-400">
                  {redFlags.map((flag, i) => (
                    <li key={i}>{flag}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None</p>
              )}
            </div>

            <Separator />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="job-status">Status</Label>
                <Select value={job.status} onValueChange={handleStatusChange}>
                  <SelectTrigger id="job-status" disabled={updateStatus.isPending}>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                variant={job.isBookmarked ? 'secondary' : 'outline'}
                onClick={handleToggleBookmark}
                disabled={toggleBookmark.isPending}
                aria-pressed={job.isBookmarked}
              >
                <Bookmark className={cn(job.isBookmarked && 'fill-current')} />
                {job.isBookmarked ? 'Bookmarked' : 'Bookmark'}
              </Button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="job-notes">Notes</Label>
                <span
                  className={cn(
                    'text-xs text-muted-foreground transition-opacity',
                    savedVisible && !updateNotes.isPending ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  Saved
                </span>
              </div>
              <Textarea
                id="job-notes"
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Add private notes about this job…"
                className="min-h-24"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BELOW — Proposal */}
      <Card>
        <CardHeader>
          <CardTitle>Draft Proposal</CardTitle>
          <CardDescription>AI-generated draft proposal for this job.</CardDescription>
        </CardHeader>

        <CardContent>
          {proposal ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {proposal}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No proposal generated for this job (score below threshold).
            </p>
          )}
        </CardContent>

        <CardFooter className="flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {proposal.length} / {PROPOSAL_LIMIT} characters
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDrawerOpen(true)}
              disabled={!proposal}
            >
              Open in drawer
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyProposal}
              disabled={!proposal}
            >
              <Copy />
              Copy
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleRegenerate}
              disabled={regenerate.isPending}
            >
              {regenerate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Regenerate Proposal
            </Button>
          </div>
        </CardFooter>
      </Card>

      <ProposalDrawer job={job} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
