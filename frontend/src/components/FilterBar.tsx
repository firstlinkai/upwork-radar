import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { JobStatus, JobsQuery } from '@/types';

interface FilterBarProps {
  query: JobsQuery;
  onChange: (patch: Partial<JobsQuery>) => void;
}

const ALL_STATUS = 'ALL';

const statusTabs: { value: string; label: string }[] = [
  { value: ALL_STATUS, label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'REJECTED', label: 'Rejected' },
];

const NO_MIN_SCORE = 'any';
const ALL_BUDGET = 'all';

type SortValue = 'score-desc' | 'posted-desc' | 'proposals-asc';

const sortOptions: {
  value: SortValue;
  label: string;
  sortBy: NonNullable<JobsQuery['sortBy']>;
  sortDir: NonNullable<JobsQuery['sortDir']>;
}[] = [
  { value: 'score-desc', label: 'Score ↓', sortBy: 'aiScore', sortDir: 'desc' },
  { value: 'posted-desc', label: 'Posted ↓', sortBy: 'postedAt', sortDir: 'desc' },
  { value: 'proposals-asc', label: 'Proposals ↑', sortBy: 'proposalCount', sortDir: 'asc' },
];

function sortValueFor(query: JobsQuery): SortValue {
  const match = sortOptions.find(
    (o) => o.sortBy === query.sortBy && o.sortDir === query.sortDir
  );
  return match ? match.value : 'posted-desc';
}

export function FilterBar({ query, onChange }: FilterBarProps) {
  const [searchText, setSearchText] = useState(query.search ?? '');

  // Keep local search in sync when the query is reset/changed externally.
  useEffect(() => {
    setSearchText(query.search ?? '');
  }, [query.search]);

  // Debounce search input before propagating.
  useEffect(() => {
    const next = searchText.trim() || undefined;
    if (next === (query.search ?? undefined)) return;
    const timer = setTimeout(() => {
      onChange({ search: next, page: 1 });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const handleStatus = (value: string) => {
    onChange({
      status: value === ALL_STATUS ? undefined : (value as JobStatus),
      page: 1,
    });
  };

  const handleScore = (value: string) => {
    onChange({
      minScore: value === NO_MIN_SCORE ? undefined : Number(value),
      page: 1,
    });
  };

  const handleBudget = (value: string) => {
    onChange({
      budgetType: value === ALL_BUDGET ? undefined : (value as 'hourly' | 'fixed'),
      page: 1,
    });
  };

  const handleSort = (value: string) => {
    const option = sortOptions.find((o) => o.value === value);
    if (!option) return;
    onChange({ sortBy: option.sortBy, sortDir: option.sortDir, page: 1 });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs value={query.status ?? ALL_STATUS} onValueChange={handleStatus}>
        <TabsList>
          {statusTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Select
        value={query.minScore != null ? String(query.minScore) : NO_MIN_SCORE}
        onValueChange={handleScore}
      >
        <SelectTrigger className="w-[110px]" aria-label="Minimum AI score">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_MIN_SCORE}>Any</SelectItem>
          <SelectItem value="7">7+</SelectItem>
          <SelectItem value="8">8+</SelectItem>
          <SelectItem value="9">9+</SelectItem>
        </SelectContent>
      </Select>

      <Select value={query.budgetType ?? ALL_BUDGET} onValueChange={handleBudget}>
        <SelectTrigger className="w-[120px]" aria-label="Budget type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_BUDGET}>All</SelectItem>
          <SelectItem value="hourly">Hourly</SelectItem>
          <SelectItem value="fixed">Fixed</SelectItem>
        </SelectContent>
      </Select>

      <Select value={sortValueFor(query)} onValueChange={handleSort}>
        <SelectTrigger className="w-[150px]" aria-label="Sort jobs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search jobs..."
          aria-label="Search jobs"
          className="pl-9"
        />
      </div>
    </div>
  );
}
