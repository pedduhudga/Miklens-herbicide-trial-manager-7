import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTrialLifecycleStatus, partitionTrialsByLifecycle } from '../utils/trialLifecycle.js';
import { executeAutoFinalization, runDailyLifecycleCheck } from '../services/trialAutoFinalize.js';
import * as fbDB from '../services/firebaseDB.js';

vi.mock('../services/firebaseDB.js', () => ({
  fbCatUpdateTrial: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Trial Lifecycle Exclusivity to Herbicide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTrialLifecycleStatus', () => {
    it('should assign auto_finalize_due to herbicide trials with no photo for 3+ days', () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
      const trial = {
        ID: 'herb-1',
        Category: 'herbicide',
        Date: fourDaysAgo,
        IsCompleted: false,
        ControlFinalized: false,
        EfficacyDataJSON: '[]',
        PhotoURLs: '[]',
      };
      const status = getTrialLifecycleStatus(trial);
      expect(status.status).toBe('auto_finalize_due');
      expect(status.daysSince).toBeGreaterThanOrEqual(3);
    });

    it('should assign reminder to herbicide trials with no photo for 2 days', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const trial = {
        ID: 'herb-2',
        Category: 'herbicide',
        Date: twoDaysAgo,
        IsCompleted: false,
        ControlFinalized: false,
        EfficacyDataJSON: '[]',
        PhotoURLs: '[]',
      };
      const status = getTrialLifecycleStatus(trial);
      expect(status.status).toBe('reminder');
    });

    it('should NEVER assign auto_finalize_due or reminder to nutrition trials', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const trial = {
        ID: 'nutr-1',
        Category: 'nutrition',
        FormulationName: 'NPK POWDER NEW',
        Date: tenDaysAgo,
        IsCompleted: false,
        ControlFinalized: false,
        EfficacyDataJSON: '[]',
        PhotoURLs: '[]',
      };
      const status = getTrialLifecycleStatus(trial);
      expect(status.status).toBe('healthy');
    });

    it('should NEVER assign auto_finalize_due to fungicide, pesticide, or biostimulant trials', () => {
      const longAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      ['fungicide', 'pesticide', 'biostimulant'].forEach(cat => {
        const trial = {
          ID: `${cat}-1`,
          Category: cat,
          Date: longAgo,
          IsCompleted: false,
          ControlFinalized: false,
          EfficacyDataJSON: '[]',
          PhotoURLs: '[]',
        };
        const status = getTrialLifecycleStatus(trial);
        expect(status.status).toBe('healthy');
      });
    });
  });

  describe('partitionTrialsByLifecycle', () => {
    it('should partition herbicide trials into autoFinalize but strictly exclude nutrition trials', () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
      const trials = [
        {
          ID: 'herb-1',
          Category: 'herbicide',
          Date: fourDaysAgo,
          IsCompleted: false,
        },
        {
          ID: 'nutr-1',
          Category: 'nutrition',
          FormulationName: 'NPK POWDER NEW',
          Date: fourDaysAgo,
          IsCompleted: false,
        },
        {
          ID: 'fung-1',
          Category: 'fungicide',
          Date: fourDaysAgo,
          IsCompleted: false,
        }
      ];

      const buckets = partitionTrialsByLifecycle(trials);
      expect(buckets.autoFinalize.some(b => b.trial.ID === 'herb-1')).toBe(true);
      expect(buckets.autoFinalize.some(b => b.trial.ID === 'nutr-1')).toBe(false);
      expect(buckets.autoFinalize.some(b => b.trial.ID === 'fung-1')).toBe(false);
      expect(buckets.reminders.length).toBe(0);
    });
  });

  describe('executeAutoFinalization', () => {
    it('should ignore non-herbicide trials passed to executeAutoFinalization', async () => {
      const items = [
        { trial: { ID: 'nutr-1', Category: 'nutrition' } },
        { trial: { ID: 'herb-1', Category: 'herbicide', Date: '2026-11-01' } },
      ];
      const count = await executeAutoFinalization(items, () => ({ activeCategory: 'nutrition' }));
      expect(count).toBe(1); // Only herb-1 finalized
      expect(fbDB.fbCatUpdateTrial).toHaveBeenCalledWith(
        'herbicide',
        expect.objectContaining({ ID: 'herb-1', AutoFinalized: true })
      );
      expect(fbDB.fbCatUpdateTrial).not.toHaveBeenCalledWith(
        'nutrition',
        expect.objectContaining({ ID: 'nutr-1' })
      );
    });
  });

  describe('runDailyLifecycleCheck self-healing / un-finalizing', () => {
    it('should automatically restore any nutrition trial that was previously auto-finalized', async () => {
      const mockState = {
        activeCategory: 'nutrition',
        trials: [
          {
            ID: 'nutr-err-1',
            Category: 'nutrition',
            FormulationName: 'NPK POWDER NEW ( with U )',
            IsCompleted: true,
            ControlFinalized: true,
            AutoFinalized: true,
            AutoFinalizedReason: 'No photo captured for 3+ days',
            IsLive: false
          }
        ]
      };

      await runDailyLifecycleCheck(mockState.trials, { role: 'admin' }, () => mockState);

      expect(fbDB.fbCatUpdateTrial).toHaveBeenCalledWith(
        'nutrition',
        expect.objectContaining({
          ID: 'nutr-err-1',
          IsCompleted: false,
          ControlFinalized: false,
          AutoFinalized: false,
          IsLive: true
        })
      );

      // Verify in-memory state was also updated
      expect(mockState.trials[0].IsCompleted).toBe(false);
      expect(mockState.trials[0].ControlFinalized).toBe(false);
      expect(mockState.trials[0].AutoFinalized).toBe(false);
      expect(mockState.trials[0].IsLive).toBe(true);
    });

    it('should not alter legitimate manually finalized trials that lack AutoFinalized flags', async () => {
      const mockState = {
        activeCategory: 'nutrition',
        trials: [
          {
            ID: 'nutr-manual-1',
            Category: 'nutrition',
            FormulationName: 'Manual Completed Study',
            IsCompleted: true,
            ControlFinalized: true,
            AutoFinalized: false,
            AutoFinalizedReason: '',
            IsLive: false
          }
        ]
      };

      await runDailyLifecycleCheck(mockState.trials, { role: 'admin' }, () => mockState);

      expect(fbDB.fbCatUpdateTrial).not.toHaveBeenCalled();
      expect(mockState.trials[0].IsCompleted).toBe(true);
    });
  });
});
