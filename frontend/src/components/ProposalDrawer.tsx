import { useState } from 'react';
import { Copy, RefreshCw, Loader2 } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useRegenerateProposal } from '@/hooks/useJobs';
import type { Job } from '@/types';

interface ProposalDrawerProps {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROPOSAL_LIMIT = 5000;

export function ProposalDrawer({ job, open, onOpenChange }: ProposalDrawerProps) {
  const { toast } = useToast();
  const regenerate = useRegenerateProposal();
  const [copying, setCopying] = useState(false);

  const proposal = job.aiProposal ?? '';
  const charCount = proposal.length;

  const handleCopy = async () => {
    if (!proposal) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(proposal);
      toast({ title: 'Copied to clipboard', variant: 'success' });
    } catch {
      toast({ title: 'Copy failed', description: 'Could not access the clipboard.', variant: 'error' });
    } finally {
      setCopying(false);
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Draft Proposal</SheetTitle>
          <SheetDescription>AI-generated draft for "{job.title}".</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-4">
          {proposal ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{proposal}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No proposal generated for this job (score below threshold).
            </p>
          )}
        </div>

        <SheetFooter>
          <p className="text-xs text-muted-foreground">
            {charCount} / {PROPOSAL_LIMIT} characters
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!proposal || copying}
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
              Regenerate
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
