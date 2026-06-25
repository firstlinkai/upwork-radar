// Filter service — applies the user's budget, proposal-count and location
// gates to a batch of scraped jobs before they reach AI scoring. PRD §7.2.

import { logger } from '../lib/logger';
import type { RawJob, Settings } from '../types';

/**
 * Filter `jobs` down to those that satisfy every configured gate:
 *
 *  - Budget: hourly jobs must meet `minHourlyRate`; fixed jobs must meet
 *    `minFixedBudget`. A null `budgetMin` fails the gate outright.
 *  - Proposals: reject jobs whose known proposal count is at or above
 *    `maxProposals` (a null count is treated as unknown and passes).
 *  - Location: when `clientLocations` is non-empty, reject jobs whose location
 *    is unknown or not in the allow-list (case-insensitive).
 */
export function filterJobs(jobs: RawJob[], settings: Settings): RawJob[] {
  // Pre-compute a lower-cased allow-list for case-insensitive matching.
  const allowedLocations = settings.clientLocations.map((loc) => loc.toLowerCase());

  const filtered = jobs.filter((job) => {
    // --- Budget gate --------------------------------------------------------
    const passesBudget =
      (job.budgetType === 'hourly' &&
        job.budgetMin !== null &&
        job.budgetMin >= settings.minHourlyRate) ||
      (job.budgetType === 'fixed' &&
        job.budgetMin !== null &&
        job.budgetMin >= settings.minFixedBudget);
    if (!passesBudget) return false;

    // --- Proposal-count gate ------------------------------------------------
    if (job.proposalCount !== null && job.proposalCount >= settings.maxProposals) {
      return false;
    }

    // --- Location gate ------------------------------------------------------
    if (allowedLocations.length > 0) {
      if (job.clientLocation === null) return false;
      if (!allowedLocations.includes(job.clientLocation.toLowerCase())) return false;
    }

    return true;
  });

  logger.info('Filtered jobs', {
    in: jobs.length,
    out: filtered.length,
    rejected: jobs.length - filtered.length,
  });

  return filtered;
}
