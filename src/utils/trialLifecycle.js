/**
 * trialLifecycle.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Core calculation logic for Trial Auto-Finalization and Photo Reminders.
 */

import { safeJsonParse } from './helpers.js';

/**
 * Returns the Date object of the most recent observation/photo capture for a trial.
 * If no observations exist, falls back to the trial start Date.
 */
export function getTrialLastActivityDate(trial) {
  if (!trial) return new Date();

  let latestDate = null;
  if (trial.Date) {
    const d = new Date(trial.Date);
    if (!isNaN(d.getTime())) {
      latestDate = d;
    }
  }

  const observations = safeJsonParse(trial.EfficacyDataJSON || trial.observations, []);
  if (Array.isArray(observations)) {
    for (const obs of observations) {
      const rawDate = obs.date || obs.ObservationDate || obs.timestamp;
      if (rawDate) {
        const obsD = new Date(rawDate);
        if (!isNaN(obsD.getTime())) {
          if (!latestDate || obsD > latestDate) {
            latestDate = obsD;
          }
        }
      }
    }
  }

  return latestDate || new Date();
}

/**
 * Calculates days elapsed between a given date and now (in full days).
 */
export function getDaysSinceDate(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return 0;
  const diffMs = Date.now() - dateObj.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Determines trial health & lifecycle status:
 * - 'finalized'
 * - 'healthy' (last photo <= 1 day)
 * - 'reminder' (no photo for 2 days -> send reminder)
 * - 'auto_finalize_due' (no photo for 3+ days -> auto-finalize)
 * - 'stale_bulk' (no photo for 7+ days -> bulk cleanup candidate)
 */
export function getTrialLifecycleStatus(trial) {
  const isCompleted = trial.IsCompleted === true || trial.IsCompleted === 'true' || trial.ControlFinalized === true;
  if (isCompleted) {
    return { status: 'finalized', daysSince: 0, lastActivityDate: getTrialLastActivityDate(trial) };
  }

  const lastActivityDate = getTrialLastActivityDate(trial);
  const daysSince = getDaysSinceDate(lastActivityDate);

  if (daysSince >= 7) {
    return { status: 'stale_bulk', daysSince, lastActivityDate };
  } else if (daysSince >= 3) {
    return { status: 'auto_finalize_due', daysSince, lastActivityDate };
  } else if (daysSince === 2) {
    return { status: 'reminder', daysSince, lastActivityDate };
  }

  return { status: 'healthy', daysSince, lastActivityDate };
}

/**
 * Scans active trials and returns partitioned lifecycle buckets.
 */
export function partitionTrialsByLifecycle(trials, userEmail = null, isAdmin = false) {
  const healthy = [];
  const reminders = [];
  const autoFinalize = [];
  const bulkStale = [];

  const list = Array.isArray(trials) ? trials : [];

  for (const trial of list) {
    const isCompleted = trial.IsCompleted === true || trial.IsCompleted === 'true' || trial.ControlFinalized === true;
    if (isCompleted) continue;

    // Filter by ownership if userEmail is provided and user is not admin
    if (userEmail && !isAdmin) {
      const ownerEmail = (trial.AuthorEmail || trial.InvestigatorName || trial.CreatedBy || '').toLowerCase();
      const currentEmail = userEmail.toLowerCase();
      if (ownerEmail && !ownerEmail.includes(currentEmail) && !currentEmail.includes(ownerEmail)) {
        continue; // Skip trials belonging to other scientists for standard non-admin auto-actions
      }
    }

    const info = getTrialLifecycleStatus(trial);
    if (info.status === 'healthy') {
      healthy.push({ trial, ...info });
    } else if (info.status === 'reminder') {
      reminders.push({ trial, ...info });
    } else if (info.status === 'auto_finalize_due') {
      autoFinalize.push({ trial, ...info });
    } else if (info.status === 'stale_bulk') {
      bulkStale.push({ trial, ...info });
    }
  }

  return { healthy, reminders, autoFinalize, bulkStale };
}
