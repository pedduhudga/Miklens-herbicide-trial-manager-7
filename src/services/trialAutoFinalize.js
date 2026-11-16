/**
 * trialAutoFinalize.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Execution Engine for Trial Auto-Finalization and Notification Dispatch.
 *
 * NOTE: Auto-finalization based on photo inactivity (2-day reminders, 3-day
 * auto-finalize, 7-day stale cleanup) is STRICTLY EXCLUSIVE to herbicide trials.
 * All other categories (nutrition, fungicide, pesticide, biostimulant) have
 * distinct crop growth and evaluation timelines and must NEVER be auto-finalized.
 */

import { partitionTrialsByLifecycle, getTrialLastActivityDate, calculateEffectiveControlDays } from '../utils/trialLifecycle.js';
import { fbCatUpdateTrial } from './firebaseDB.js';

/**
 * Executes auto-finalization on a list of trials and dispatches notifications.
 * Strictly guards against non-herbicide trials.
 */
export async function executeAutoFinalization(trialItems, getAppState, reason = 'No photo activity for 3+ days') {
  if (!Array.isArray(trialItems) || trialItems.length === 0) return 0;

  const state = getAppState ? getAppState() : (window.appState || {});
  const activeCategory = (state.activeCategory || 'herbicide').toLowerCase();

  let count = 0;

  for (const item of trialItems) {
    const trial = item.trial || item;
    const itemCat = (trial.Category || activeCategory || 'herbicide').toLowerCase();

    // Auto-finalization rules strictly apply ONLY to herbicide trials
    if (itemCat !== 'herbicide') {
      console.warn(`[AutoFinalize] Skipping non-herbicide trial ${trial.ID} (${itemCat}): photo auto-finalization is exclusive to herbicide.`);
      continue;
    }

    const lastDateObj = item.lastActivityDate || getTrialLastActivityDate(trial);
    const finDateStr = lastDateObj.toISOString().split('T')[0];

    // Compute scientific effective control duration (WCE >= 70% duration threshold)
    const effectiveControlDays = calculateEffectiveControlDays(trial);

    const updatePayload = {
      ID: trial.ID,
      id: trial.ID,
      Category: trial.Category || activeCategory,
      IsCompleted: true,
      ControlFinalized: true,
      FinalizationDate: finDateStr,
      FinalControlDuration: String(effectiveControlDays),
      AutoFinalized: true,
      AutoFinalizedReason: reason,
      AutoFinalizedAt: new Date().toISOString(),
      IsLive: false // Auto-finalized trials are marked IsLive: false (inactive)
    };

    try {
      await fbCatUpdateTrial(trial.Category || activeCategory, updatePayload);
      count++;

      // Trigger custom toast with direct navigation link
      if (typeof window !== 'undefined') {
        const trialName = trial.FormulationName || 'Trial';
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: {
            msg: `Trial "${trialName}" auto-finalized to ${finDateStr} (${reason})`,
            type: 'warning',
            trialId: trial.ID,
            actionLabel: 'View Trial',
          }
        }));
      }
    } catch (err) {
      console.error(`[AutoFinalize] Failed to auto-finalize trial ${trial.ID}:`, err);
    }
  }

  return count;
}

/**
 * Runs daily auto-finalize check for scientists/admins.
 * Enforces herbicide exclusivity and auto-heals any mistakenly auto-finalized non-herbicide trials.
 */
export async function runDailyLifecycleCheck(trials, user, getAppState) {
  if (!Array.isArray(trials) || trials.length === 0) return;

  const state = getAppState ? getAppState() : (window.appState || {});
  const activeCategory = (state.activeCategory || 'herbicide').toLowerCase();

  // 1. SELF-CORRECTION & RESTORATION:
  // Non-herbicide categories (nutrition, fungicide, pesticide, biostimulant) must NEVER be auto-finalized
  // by herbicide photo-inactivity logic. If any non-herbicide trial was previously auto-finalized,
  // immediately restore it to live active status!
  for (const trial of trials) {
    const trialCat = (trial.Category || activeCategory).toLowerCase();
    if (trialCat !== 'herbicide') {
      const isAutoFin = trial.AutoFinalized === true || trial.AutoFinalized === 'true';
      const hasAutoReason = !!trial.AutoFinalizedReason;
      if (isAutoFin || hasAutoReason) {
        console.log(`[AutoFinalize] Restoring mistakenly auto-finalized ${trialCat} trial: ${trial.ID} ("${trial.FormulationName || trial.TreatmentName || 'Trial'}"). Reactivating to Live/Active status...`);
        const restorePayload = {
          ID: trial.ID,
          id: trial.ID,
          Category: trial.Category || activeCategory,
          IsCompleted: false,
          ControlFinalized: false,
          FinalizationDate: '',
          FinalControlDuration: '',
          AutoFinalized: false,
          AutoFinalizedReason: '',
          AutoFinalizedAt: '',
          IsLive: true
        };

        try {
          await fbCatUpdateTrial(trial.Category || activeCategory, restorePayload);

          // Update the trial reference in-place and memory state
          Object.assign(trial, restorePayload);
          if (state.trials) {
            state.trials = state.trials.map(t => String(t.ID) === String(trial.ID) ? {
              ...t,
              ...restorePayload
            } : t);
            if (typeof window !== 'undefined' && window.appState) {
              window.appState.trials = state.trials;
            }
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('app:toast', {
              detail: {
                msg: `Restored ${trialCat} trial "${trial.FormulationName || 'Trial'}" to active status`,
                type: 'info',
                trialId: trial.ID
              }
            }));
          }
        } catch (err) {
          console.error(`[AutoFinalize] Failed to restore non-herbicide trial ${trial.ID}:`, err);
        }
      }
    }
  }

  // 2. Photo-inactivity auto-finalization is STRICTLY EXCLUSIVE to herbicide trials
  const herbicideTrials = trials.filter(t => (t.Category || activeCategory).toLowerCase() === 'herbicide');
  if (herbicideTrials.length === 0) {
    return; // No herbicide trials to process
  }

  const userEmail = user?.email || user?.AuthorEmail || null;
  const isAdmin = user?.role === 'admin';

  const { reminders, autoFinalize, bulkStale } = partitionTrialsByLifecycle(herbicideTrials, userEmail, isAdmin);

  // 3. Dispatch Reminders for herbicide trials missing photos for 2 days
  reminders.forEach(({ trial, daysSince }) => {
    if (typeof window !== 'undefined') {
      const remKey = `reminder_shown_${trial.ID}_${new Date().toISOString().split('T')[0]}`;
      if (!localStorage.getItem(remKey)) {
        localStorage.setItem(remKey, 'true');
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: {
            msg: `⚠️ Photo reminder: "${trial.FormulationName || 'Trial'}" has no photo for 2 days! Add a photo today or it will auto-finalize tomorrow.`,
            type: 'info',
            trialId: trial.ID,
            actionLabel: 'View Trial'
          }
        }));
      }
    }
  });

  // 4. Execute Auto-Finalize for 3-day stale and 7-day bulk stale herbicide trials
  const trialsToFinalize = [...autoFinalize, ...bulkStale];
  if (trialsToFinalize.length > 0) {
    console.log(`[AutoFinalize] Auto-finalizing ${trialsToFinalize.length} inactive herbicide trials...`);
    await executeAutoFinalization(trialsToFinalize, getAppState, 'No photo captured for 3+ days');
  }

  // 5. Herbicide Self-Correction: Reactivate any herbicide trial that was auto-finalized by mistake but actually has recent activity (< 3 days)
  const now = Date.now();
  for (const trial of herbicideTrials) {
    const isCompleted = trial.IsCompleted === true || trial.IsCompleted === 'true';
    if (isCompleted && trial.AutoFinalized) {
      const lastActivity = getTrialLastActivityDate(trial);
      const daysSinceLastActivity = Math.floor((now - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
      
      // If last activity is less than 3 days ago, this trial is active! Un-finalize it automatically.
      if (daysSinceLastActivity < 3) {
        console.log(`[AutoFinalize] Self-correcting herbicide trial ${trial.ID} (${trial.FormulationName}): found recent activity (${daysSinceLastActivity} days ago). Reactivating trial...`);
        const reactivatePayload = {
          ID: trial.ID,
          id: trial.ID,
          Category: 'herbicide',
          IsCompleted: false,
          ControlFinalized: false,
          FinalizationDate: '',
          FinalControlDuration: '',
          AutoFinalized: false,
          AutoFinalizedReason: '',
          AutoFinalizedAt: '',
          IsLive: true
        };

        try {
          await fbCatUpdateTrial('herbicide', reactivatePayload);
          Object.assign(trial, reactivatePayload);
          if (state.trials) {
            state.trials = state.trials.map(t => String(t.ID) === String(trial.ID) ? {
              ...t,
              ...reactivatePayload
            } : t);
            if (typeof window !== 'undefined' && window.appState) {
              window.appState.trials = state.trials;
            }
          }
        } catch (err) {
          console.error(`[AutoFinalize] Failed to self-correct herbicide trial ${trial.ID}:`, err);
        }
      }
    }
  }
}
