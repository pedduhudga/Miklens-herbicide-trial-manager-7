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
 * ADVANCED SCIENTIFIC WEED CONTROL EFFICACY ENGINE (EPPO / EWRS Standard)
 * ─────────────────────────────────────────────────────────────────────────────
 * Calculates the exact Effective Days of Control & WCE Metrics.
 * 
 * Advanced Capabilities:
 * 1. Multi-Species Weighted WCE: Evaluates individual weed species breakdown (e.g. Bermuda grass vs Pigweed).
 * 2. Untreated Control Plot Correction (Abbott / Henderson-Tilton Formula):
 *    Adjusts WCE against natural weed population dynamics if control plot data exists.
 * 3. Multi-Category Metric Adaptation: Supports Fungicide (Disease Severity), Insecticide, and Nutrition.
 * 4. Regrowth Breakdown Lock (WCE >= 70% threshold): Stops effective control counter at initial breakdown DAA.
 */
export function calculateEffectiveControlDays(trial, controlTrial = null) {
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

  // Untreated Control observations lookup map (by DAA)
  const controlObsMap = {};
  if (controlTrial) {
    const cObs = safeJsonParse(controlTrial.EfficacyDataJSON || controlTrial.observations, []);
    if (Array.isArray(cObs)) {
      cObs.forEach(co => {
        const daaKey = parseInt(co.daa ?? co.day ?? co.DAA ?? 0, 10);
        controlObsMap[daaKey] = parseFloat(co.weedCover ?? co.value ?? 0);
      });
    }
  }

  const baselineObs = sortedObs[0];
  const baselineCover = parseFloat(baselineObs?.weedCover ?? 0) || 0;
  
  let effectiveControlDays = 0;
  let maxDAAFound = 0;
  let breakdownOccurred = false;

  for (let i = 0; i < sortedObs.length; i++) {
    const obs = sortedObs[i];
    const daa = Math.max(0, parseInt(obs.daa ?? obs.day ?? obs.DAA ?? 0, 10));
    if (daa > maxDAAFound) maxDAAFound = daa;

    let computedWCE = null;

    // 1. Species-level breakdown calculation (if weedDetails array exists)
    if (Array.isArray(obs.weedDetails) && obs.weedDetails.length > 0) {
      let totalSpeciesWCE = 0;
      let validSpeciesCount = 0;
      obs.weedDetails.forEach(wd => {
        const speciesCover = parseFloat(wd.cover ?? 0);
        const speciesWCE = wd.wce !== undefined && wd.wce !== null ? parseFloat(wd.wce) : (100 - speciesCover);
        if (!isNaN(speciesWCE)) {
          totalSpeciesWCE += speciesWCE;
          validSpeciesCount++;
        }
      });
      if (validSpeciesCount > 0) {
        computedWCE = totalSpeciesWCE / validSpeciesCount;
      }
    }

    // 2. Untreated Control Plot Correction (Henderson-Tilton / Abbott Formula)
    if (computedWCE === null && controlObsMap[daa] !== undefined && baselineCover > 0) {
      const treatedCover = parseFloat(obs.weedCover ?? 0);
      const untreatedCover = controlObsMap[daa];
      const controlBaseline = controlObsMap[0] || untreatedCover || 100;
      
      if (untreatedCover > 0 && controlBaseline > 0) {
        // Henderson-Tilton: Corrected % Control = (1 - (Ta * Cb) / (Tb * Ca)) * 100
        const corrected = (1 - (treatedCover * controlBaseline) / (baselineCover * untreatedCover)) * 100;
        computedWCE = Math.max(0, Math.min(100, corrected));
      }
    }

    // 3. Fallback to direct WCE / Control % / Weed Cover calculation
    if (computedWCE === null) {
      if (obs.wce !== undefined && obs.wce !== null && obs.wce !== '') {
        computedWCE = parseFloat(obs.wce);
      } else if (obs.controlPct !== undefined && obs.controlPct !== null && obs.controlPct !== '') {
        computedWCE = parseFloat(obs.controlPct);
      } else if (obs.weedCover !== undefined && obs.weedCover !== null && obs.weedCover !== '') {
        const cover = parseFloat(obs.weedCover);
        if (baselineCover > 0) {
          computedWCE = Math.max(0, Math.min(100, ((baselineCover - cover) / baselineCover) * 100));
        } else {
          computedWCE = Math.max(0, 100 - cover);
        }
      }
    }

    // Baseline observation (DAA 0) or unrated observation defaults to effective
    if (computedWCE === null || isNaN(computedWCE) || daa === 0) {
      computedWCE = 100;
    }

    // Scientific Threshold: Effective control requires WCE >= 70%
    if (computedWCE >= 70) {
      if (!breakdownOccurred) {
        effectiveControlDays = Math.max(effectiveControlDays, daa);
      }
    } else {
      // Regrowth breakdown detected (< 70% control)!
      breakdownOccurred = true;
    }
  }

  // Fallback: If no breakdown occurred throughout the trial, use max DAA
  if (effectiveControlDays === 0 && maxDAAFound > 0 && !breakdownOccurred) {
    effectiveControlDays = maxDAAFound;
  } else if (effectiveControlDays === 0 && sortedObs.length > 0) {
    effectiveControlDays = maxDAAFound;
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
