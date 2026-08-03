/**
 * trialLifecycle.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Core calculation logic for Trial Auto-Finalization and Photo Reminders.
 */

import { safeJsonParse } from './helpers.js';
import { parseCustomDate } from './dateUtils.js';

function parseDateRobust(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const custom = parseCustomDate(raw);
  if (custom && !isNaN(custom.getTime())) return custom;
  const std = new Date(raw);
  return isNaN(std.getTime()) ? null : std;
}

/**
 * Returns the Date object of the most recent observation/photo capture for a trial.
 * If no observations exist, falls back to the trial start Date.
 */
export function getTrialLastActivityDate(trial) {
  if (!trial) return new Date();

  let latestDate = null;
  if (trial.Date) {
    const d = parseDateRobust(trial.Date);
    if (d) latestDate = d;
  }

  const observations = safeJsonParse(trial.EfficacyDataJSON || trial.observations, []);
  if (Array.isArray(observations)) {
    for (const obs of observations) {
      const rawDate = obs.date || obs.ObservationDate || obs.timestamp;
      const obsD = parseDateRobust(rawDate);
      if (obsD) {
        if (!latestDate || obsD > latestDate) {
          latestDate = obsD;
        }
      }
    }
  }

  // Also check photo dates in PhotoURLs and WeedPhotosJSON
  const photos = [
    ...safeJsonParse(trial.PhotoURLs, []),
    ...safeJsonParse(trial.WeedPhotosJSON, [])
  ];
  if (Array.isArray(photos)) {
    for (const photo of photos) {
      if (photo && !photo.deleted) {
        const rawDate = photo.date || photo.timestamp || photo.capturedAt || photo.createdAt;
        const photoD = parseDateRobust(rawDate);
        if (photoD) {
          if (!latestDate || photoD > latestDate) {
            latestDate = photoD;
          }
        }
      }
    }
  }

  return latestDate || new Date();
}

/**
 * SCIENTIFIC CONTROL DURATION CALCULATOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Calculates the exact Effective Days of Weed Control (WCE >= 70%).
 * 
 * Rules:
 * 1. Scans observation timeline sorted by DAA.
 * 2. Effective control continues as long as Weed Control Efficiency (WCE) >= 70%
 *    (or Weed Cover <= 30%).
 * 3. Once control drops below 70% (regrowth breakdown), control duration STOPS at 
 *    the last successful DAA observation where control was maintained (>= 70%).
 * 4. If control never dropped below 70%, control duration equals max DAA or total trial span.
 */
export function calculateEffectiveControlDays(trial) {
  if (!trial) return 0;

  const observations = safeJsonParse(trial.EfficacyDataJSON || trial.observations, []);
  if (!Array.isArray(observations) || observations.length === 0) {
    if (trial.FinalControlDuration) {
      const parsed = parseInt(trial.FinalControlDuration, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 0;
  }

  // Sort observations chronologically by DAA
  const sortedObs = [...observations].sort((a, b) => {
    const daaA = parseFloat(a.daa ?? a.day ?? a.DAA ?? 0);
    const daaB = parseFloat(b.daa ?? b.day ?? b.DAA ?? 0);
    return daaA - daaB;
  });

  const category = trial.Category || 'herbicide';
  let effectiveControlDays = 0;
  let breakdownOccurred = false;

  for (let i = 0; i < sortedObs.length; i++) {
    const obs = sortedObs[i];
    const daa = Math.max(0, parseInt(obs.daa ?? obs.day ?? obs.DAA ?? 0, 10));

    // Calculate WCE percentage (0 to 100%)
    let wce = null;
    if (obs.wce !== undefined && obs.wce !== null) {
      wce = parseFloat(obs.wce);
    } else if (obs.controlPct !== undefined && obs.controlPct !== null) {
      wce = parseFloat(obs.controlPct);
    } else if (obs.weedCover !== undefined && obs.weedCover !== null) {
      const cover = parseFloat(obs.weedCover);
      const baselineCover = parseFloat(sortedObs[0]?.weedCover ?? 100) || 100;
      wce = baselineCover > 0 ? Math.max(0, 100 - (cover / baselineCover) * 100) : 100 - cover;
    }

    // Default to 100% if no metric recorded yet
    if (wce === null || isNaN(wce)) wce = 100;

    // Scientific Threshold: Effective control requires WCE >= 70%
    if (wce >= 70) {
      if (!breakdownOccurred) {
        effectiveControlDays = Math.max(effectiveControlDays, daa);
      }
    } else {
      // Regrowth breakdown detected (< 70% control)!
      // Control duration is locked to the last successful DAA before breakdown
      breakdownOccurred = true;
    }
  }

  // If no regrowth breakdown occurred throughout the trial, control equals max DAA or total span
  if (!breakdownOccurred && effectiveControlDays === 0 && sortedObs.length > 0) {
    const maxDAA = Math.max(...sortedObs.map(o => parseInt(o.daa ?? o.day ?? 0, 10) || 0));
    effectiveControlDays = maxDAA;
  }

  return effectiveControlDays;
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
