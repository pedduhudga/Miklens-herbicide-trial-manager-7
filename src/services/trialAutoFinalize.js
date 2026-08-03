/**
 * trialAutoFinalize.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Execution Engine for Trial Auto-Finalization and Notification Dispatch.
 */

import { partitionTrialsByLifecycle, getTrialLastActivityDate } from '../utils/trialLifecycle.js';
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

    // Compute control duration from start date to last activity date
    let controlDuration = null;
    if (trial.Date) {
      const start = new Date(trial.Date);
      if (!isNaN(start.getTime())) {
        controlDuration = Math.max(0, Math.round((lastDateObj - start) / (1000 * 60 * 60 * 24)));
      }
    }

    const updatePayload = {
      ID: trial.ID,
      id: trial.ID,
      Category: trial.Category || activeCategory,
      IsCompleted: true,
      ControlFinalized: true,
      FinalizationDate: finDateStr,
      FinalControlDuration: controlDuration !== null ? String(controlDuration) : (trial.FinalControlDuration || '0'),
      AutoFinalized: true,
      AutoFinalizedReason: reason,
      AutoFinalizedAt: new Date().toISOString(),
      IsLive: true // Keep QR code active for 7 days grace period
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

  // 3. Deactivate QR code (IsLive = false) for auto-finalized trials after 7 days grace period
  const now = Date.now();
  const state = getAppState ? getAppState() : (window.appState || {});
  const activeCategory = state.activeCategory || 'herbicide';

  for (const trial of trials) {
    if (trial.AutoFinalized && trial.AutoFinalizedAt && String(trial.IsLive) !== 'false') {
      const autoFinalizedDate = new Date(trial.AutoFinalizedAt);
      if (!isNaN(autoFinalizedDate.getTime())) {
        const daysSinceAutoFinalized = Math.floor((now - autoFinalizedDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceAutoFinalized >= 7) {
          try {
            await fbCatUpdateTrial(trial.Category || activeCategory, {
              ID: trial.ID,
              id: trial.ID,
              IsLive: false
            });
            console.log(`[AutoFinalize] 7-day grace period ended for trial ${trial.ID}. QR code deactivated (IsLive = false).`);
          } catch (err) {
            console.error(`[AutoFinalize] Failed to deactivate trial ${trial.ID}:`, err);
          }
        }
      }
    }
  }
}
