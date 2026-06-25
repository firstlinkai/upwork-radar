import * as React from 'react';
import { Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useRunScraper, useScraperStatus } from '@/hooks/useScraper';

function formatLastRun(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  });
}

export function RunButton() {
  const { data: status } = useScraperStatus();
  const runScraper = useRunScraper();
  const { toast } = useToast();

  const running = status?.running || runScraper.isPending;
  const wasRunning = React.useRef(false);

  // Toast when a run transitions from running -> finished.
  React.useEffect(() => {
    if (wasRunning.current && status && !status.running) {
      const last = status.lastRun;
      if (last?.status === 'completed') {
        toast({
          title: '✅ Scrape complete',
          description: `${last.jobsMatched ?? 0} jobs matched of ${last.jobsFound ?? 0} scraped.`,
          variant: 'success',
        });
      } else if (last?.status === 'failed') {
        toast({
          title: '❌ Scrape failed',
          description: last.errorMessage ?? 'Unknown error',
          variant: 'error',
        });
      }
    }
    wasRunning.current = Boolean(status?.running);
  }, [status, toast]);

  const onClick = () => {
    runScraper.mutate(undefined, {
      onError: (err) =>
        toast({
          title: '❌ Could not start scrape',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'error',
        }),
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Button onClick={onClick} disabled={running} size="lg" className="w-full">
        {running ? (
          <>
            <Loader2 className="animate-spin" /> Scraping Upwork…
          </>
        ) : (
          <>
            <Play /> Run Scraper
          </>
        )}
      </Button>
      <p className="px-1 text-xs text-muted-foreground">
        Last run: {formatLastRun(status?.lastRun?.startedAt)}
      </p>
    </div>
  );
}
