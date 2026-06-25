import { useEffect, useState } from 'react';
import { Save, Mail, Clock, KeyRound } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { TagInput } from '@/components/TagInput';
import { useToast } from '@/components/ui/toast';
import {
  useSettings,
  useUpdateSettings,
  useTestEmail,
} from '@/hooks/useSettings';
import type { Settings as SettingsType, SettingsUpdate } from '@/types';

interface FormState {
  searchKeywords: string[];
  maxResults: number;
  minHourlyRate: number;
  minFixedBudget: number;
  maxProposals: number;
  clientLocations: string[];
  minScoreToEmail: number;
  minScoreForProposal: number;
  recipientEmail: string;
  apifyApiKey: string;
  resendApiKey: string;
}

const SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function seedForm(s: SettingsType): FormState {
  return {
    searchKeywords: s.searchKeywords,
    maxResults: s.maxResults,
    minHourlyRate: s.minHourlyRate,
    minFixedBudget: s.minFixedBudget,
    maxProposals: s.maxProposals,
    clientLocations: s.clientLocations,
    minScoreToEmail: s.minScoreToEmail,
    minScoreForProposal: s.minScoreForProposal,
    recipientEmail: s.recipientEmail,
    apifyApiKey: '',
    resendApiKey: '',
  };
}

export function Settings() {
  const { toast } = useToast();
  const { data, isLoading, isError } = useSettings();
  const updateSettings = useUpdateSettings();
  const testEmail = useTestEmail();

  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (data && form === null) {
      setForm(seedForm(data));
    }
  }, [data, form]);

  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: val } : prev));
  };

  const handleNumber = (key: keyof FormState, raw: string) => {
    const n = Number(raw);
    setField(key, (Number.isNaN(n) ? 0 : n) as FormState[typeof key]);
  };

  const handleTestEmail = () => {
    testEmail.mutate(undefined, {
      onSuccess: () =>
        toast({
          title: 'Test email sent',
          description: 'Check your inbox to confirm delivery.',
          variant: 'success',
        }),
      onError: (err) =>
        toast({
          title: 'Failed to send test email',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'error',
        }),
    });
  };

  const handleSave = () => {
    if (!form) return;
    const payload: SettingsUpdate = {
      searchKeywords: form.searchKeywords,
      maxResults: Number(form.maxResults),
      minHourlyRate: Number(form.minHourlyRate),
      minFixedBudget: Number(form.minFixedBudget),
      maxProposals: Number(form.maxProposals),
      clientLocations: form.clientLocations,
      minScoreToEmail: Number(form.minScoreToEmail),
      minScoreForProposal: Number(form.minScoreForProposal),
      recipientEmail: form.recipientEmail,
    };
    const apify = form.apifyApiKey.trim();
    const resend = form.resendApiKey.trim();
    if (apify) payload.apifyApiKey = apify;
    if (resend) payload.resendApiKey = resend;

    updateSettings.mutate(payload, {
      onSuccess: () =>
        toast({
          title: 'Settings saved',
          description: 'Your changes have been applied.',
          variant: 'success',
        }),
      onError: (err) =>
        toast({
          title: 'Failed to save settings',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'error',
        }),
    });
  };

  if (isLoading || form === null) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load settings</CardTitle>
            <CardDescription>
              Something went wrong while fetching your settings. Please refresh
              and try again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const apifyPlaceholder = data?.apifyApiKeyMasked ?? 'Not set';
  const resendPlaceholder = data?.resendApiKeyMasked ?? 'Not set';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 pb-28">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure scraping, filters, scoring, and notifications.
        </p>
      </div>

      {/* 1. Search Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Search Configuration</CardTitle>
          <CardDescription>
            Keywords used to find matching Upwork jobs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="searchKeywords">Search keywords</Label>
            <TagInput
              id="searchKeywords"
              value={form.searchKeywords}
              onChange={(v) => setField('searchKeywords', v)}
              placeholder="Type a keyword and press Enter"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxResults">Max results per run</Label>
            <Input
              id="maxResults"
              type="number"
              min={1}
              value={form.maxResults}
              onChange={(e) => handleNumber('maxResults', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 2. Budget Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Budget Filters</CardTitle>
          <CardDescription>
            Minimum budgets a job must meet to be considered.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="minHourlyRate">Min hourly rate (USD/hr)</Label>
            <Input
              id="minHourlyRate"
              type="number"
              min={0}
              value={form.minHourlyRate}
              onChange={(e) => handleNumber('minHourlyRate', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minFixedBudget">Min fixed budget (USD)</Label>
            <Input
              id="minFixedBudget"
              type="number"
              min={0}
              value={form.minFixedBudget}
              onChange={(e) => handleNumber('minFixedBudget', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 3. Proposal & Location Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Proposal &amp; Location Filters</CardTitle>
          <CardDescription>
            Narrow results by competition and client location.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="maxProposals">Max proposals</Label>
            <Input
              id="maxProposals"
              type="number"
              min={0}
              value={form.maxProposals}
              onChange={(e) => handleNumber('maxProposals', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clientLocations">Client locations</Label>
            <TagInput
              id="clientLocations"
              value={form.clientLocations}
              onChange={(v) => setField('clientLocations', v)}
              placeholder="Type a location and press Enter"
            />
            {form.clientLocations.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Empty = all locations.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* 4. AI Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>AI Configuration</CardTitle>
          <CardDescription>
            Score thresholds (1–10) that drive emailing and proposal drafting.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="minScoreToEmail">Min score to email</Label>
            <Select
              value={String(form.minScoreToEmail)}
              onValueChange={(v) => setField('minScoreToEmail', Number(v))}
            >
              <SelectTrigger id="minScoreToEmail">
                <SelectValue placeholder="Select a score" />
              </SelectTrigger>
              <SelectContent>
                {SCORE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="minScoreForProposal">Min score for proposal</Label>
            <Select
              value={String(form.minScoreForProposal)}
              onValueChange={(v) => setField('minScoreForProposal', Number(v))}
            >
              <SelectTrigger id="minScoreForProposal">
                <SelectValue placeholder="Select a score" />
              </SelectTrigger>
              <SelectContent>
                {SCORE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 5. Email Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Email Settings</CardTitle>
          <CardDescription>
            Where job digests are delivered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="recipientEmail">Recipient email</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="recipientEmail"
                type="email"
                value={form.recipientEmail}
                onChange={(e) => setField('recipientEmail', e.target.value)}
                placeholder="you@example.com"
                className="sm:flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleTestEmail}
                disabled={testEmail.isPending}
              >
                <Mail />
                {testEmail.isPending ? 'Sending…' : 'Send Test Email'}
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4" />
            <span>Schedule: 7:00 AM Philippine Time (PHT)</span>
          </div>
        </CardContent>
      </Card>

      {/* 6. API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            API Keys
          </CardTitle>
          <CardDescription>
            Keys are stored securely in the database and used at runtime. Leave
            blank to keep the current key.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="apifyApiKey">Apify API key</Label>
            <Input
              id="apifyApiKey"
              type="password"
              autoComplete="off"
              value={form.apifyApiKey}
              onChange={(e) => setField('apifyApiKey', e.target.value)}
              placeholder={apifyPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="resendApiKey">Resend API key</Label>
            <Input
              id="resendApiKey"
              type="password"
              autoComplete="off"
              value={form.resendApiKey}
              onChange={(e) => setField('resendApiKey', e.target.value)}
              placeholder={resendPlaceholder}
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            type="button"
            size="lg"
            onClick={handleSave}
            disabled={updateSettings.isPending}
          >
            <Save />
            {updateSettings.isPending ? 'Saving…' : 'Save Settings'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
