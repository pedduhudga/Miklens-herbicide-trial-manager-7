/**
 * trialAutoFinalize.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Execution Engine for Trial Auto-Finalization and Notification Dispatch.
 */

import { partitionTrialsByLifecycle, getTrialLastActivityDate, calculateEffectiveControlDays } from '../utils/trialLifecycle.js';
import { fbCatUpdateTrial } from './firebaseDB.js';

/**
 * Executes auto-finalization on a list of trials and dispatches notifications.
 */
export async function executeAutoFinalization(trialItems, getAppState, reason = 'No photo activity for 3+ days') {
  if (!Array.isArray(trialItems) || trialItems.length === 0) return 0;

  const state = getAppState ? getAppState() : (window.appState || {});
  const activeCategory = state.activeCategory || 'herbicide';

  let count = 0;

  for (const item of trialItems) {
    const trial = item.trial || item;
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
 */
export async function runDailyLifecycleCheck(trials, user, getAppState) {
  if (!Array.isArray(trials) || trials.length === 0) return;

  const userEmail = user?.email || user?.AuthorEmail || null;
  const isAdmin = user?.role === 'admin';

  const { reminders, autoFinalize, bulkStale } = partitionTrialsByLifecycle(trials, userEmail, isAdmin);

  // 1. Dispatch Reminders for trials missing photos for 2 days
  reminders.forEach(({ trial, daysSince }) => {
    if (typeof window !== 'undefined') {
      // Check if reminder toast already shown today to avoid spamming
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

  // 2. Execute Auto-Finalize for 3-day stale and 7-day bulk stale trials
  const trialsToFinalize = [...autoFinalize, ...bulkStale];
  if (trialsToFinalize.length > 0) {
    console.log(`[AutoFinalize] Auto-finalizing ${trialsToFinalize.length} inactive trials...`);
    await executeAutoFinalization(trialsToFinalize, getAppState, 'No photo captured for 3+ days');
  }

  // 3. Self-Correction: Reactivate any trial that was auto-finalized by mistake but actually has recent activity (< 3 days)
  const now = Date.now();
  const state = getAppState ? getAppState() : (window.appState || {});
  const activeCategory = state.activeCategory || 'herbicide';

  for (const trial of trials) {
    const isCompleted = trial.IsCompleted === true || trial.IsCompleted === 'true';
    if (isCompleted && trial.AutoFinalized) {
      const lastActivity = getTrialLastActivityDate(trial);
      const daysSinceLastActivity = Math.floor((now - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
      
      // If last activity is less than 3 days ago, this trial is active! Un-finalize it automatically.
      if (daysSinceLastActivity < 3) {
        console.log(`[AutoFinalize] Self-correcting trial ${trial.ID} (${trial.FormulationName}): found recent activity (${daysSinceLastActivity} days ago). Reactivating trial...`);
        try {
          await fbCatUpdateTrial(trial.Category || activeCategory, {
            ID: trial.ID,
            id: trial.ID,
            IsCompleted: false,
            ControlFinalized: false,
            FinalizationDate: '',
            FinalControlDuration: '',
            AutoFinalized: false,
            IsLive: true
          });
          // Update memory state
          if (state.trials) {
            const updatedList = state.trials.map(t => String(t.ID) === String(trial.ID) ? {
              ...t,
              IsCompleted: false,
              ControlFinalized: false,
              FinalizationDate: '',
              FinalControlDuration: '',
              AutoFinalized: false,
              IsLive: true
            } : t);
            if (typeof window !== 'undefined' && window.appState) {
              window.appState.trials = updatedList;
            }
          }
        } catch (err) {
          console.error(`[AutoFinalize] Failed to self-correct trial ${trial.ID}:`, err);
        }
      }
    }
  }
}
