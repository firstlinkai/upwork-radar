import { cn } from '@/lib/utils';

/**
 * Score color coding shared with the email digest (PRD §8):
 * 8–10 green, 6–7 blue, 4–5 amber, 1–3 / null gray.
 */
export function scoreColor(score: number | null): {
  border: string;
  bg: string;
  text: string;
  hex: string;
} {
  if (score === null) {
    return { border: 'border-l-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500', hex: '#9ca3af' };
  }
  if (score >= 8) {
    return { border: 'border-l-green-500', bg: 'bg-green-100 dark:bg-green-950', text: 'text-green-700 dark:text-green-400', hex: '#22c55e' };
  }
  if (score >= 6) {
    return { border: 'border-l-blue-500', bg: 'bg-blue-100 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-400', hex: '#3b82f6' };
  }
  if (score >= 4) {
    return { border: 'border-l-amber-500', bg: 'bg-amber-100 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-400', hex: '#f59e0b' };
  }
  return { border: 'border-l-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500', hex: '#9ca3af' };
}

interface ScoreBadgeProps {
  score: number | null;
  size?: 'sm' | 'lg';
  className?: string;
}

export function ScoreBadge({ score, size = 'sm', className }: ScoreBadgeProps) {
  const colors = scoreColor(score);
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md font-semibold tabular-nums',
        colors.bg,
        colors.text,
        size === 'lg' ? 'h-12 w-12 text-xl' : 'h-7 min-w-7 px-1.5 text-sm',
        className
      )}
      title={score === null ? 'Not scored' : `AI score ${score}/10`}
    >
      {score ?? '—'}
    </span>
  );
}
