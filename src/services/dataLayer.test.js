// src/services/dataLayer.test.js
import { describe, it, expect, vi } from 'vitest';
import * as dataLayer from './dataLayer.js';

// Mock Firebase and Sheets services
vi.mock('./firebaseDB.js', () => ({
  fbGetAllData: vi.fn().mockResolvedValue({ trials: [], projects: [], formulations: [] }),
  fbCatGetTrials: vi.fn().mockResolvedValue([]),
  fbCatAddTrial: vi.fn().mockResolvedValue({ id: 'test-id', success: true }),
  fbCatGetProjects: vi.fn().mockResolvedValue([]),
  fbCatAddProject: vi.fn().mockResolvedValue({ id: 'test-id', success: true }),
  fbCatGetFormulations: vi.fn().mockResolvedValue([]),
  fbCatAddFormulation: vi.fn().mockResolvedValue({ id: 'test-id', success: true }),
  fbCatGetIngredients: vi.fn().mockResolvedValue([]),
  fbCatAddIngredient: vi.fn().mockResolvedValue({ id: 'test-id', success: true }),
}));

vi.mock('./db.js', () => ({
  getAllData: vi.fn().mockResolvedValue({ trials: [], projects: [], formulations: [] }),
  getTrials: vi.fn().mockResolvedValue([]),
  addTrial: vi.fn().mockResolvedValue({ id: 'test-id', success: true }),
  getProjects: vi.fn().mockResolvedValue([]),
  addProject: vi.fn().mockResolvedValue({ id: 'test-id', success: true }),
  getFormulations: vi.fn().mockResolvedValue([]),
  addFormulation: vi.fn().mockResolvedValue({ id: 'test-id', success: true }),
}));

vi.mock('./sheetMirror.js', () => ({
  mirrorWrite: vi.fn(),
}));

vi.mock('./firebaseAuth.js', () => ({
  fbGetAllUsers: vi.fn(),
  fbUpdateUserProfile: vi.fn(),
}));

describe('DataLayer Category Enforcement', () => {
  const mockGetAppState = (activeCategory = 'fungicide', useFirebase = true) => () => ({
    activeCategory,
    settings: {
      firebaseEnabled: useFirebase,
      sheetMirrorEnabled: false,
    },
    auth: {
      uid: 'test-user-123',
      user: {
        ID: 'test-user-123',
        Role: 'scientist'
      }
    },
    trials: [],
    projects: [],
    formulations: [],
  });

  describe('Category Validation', () => {
    it('should throw error for invalid category', async () => {
      const getAppState = () => ({ activeCategory: 'invalid-category' });
      
      await expect(dataLayer.getTrials({}, getAppState))
        .rejects
        .toThrow('Invalid category: invalid-category');
    });

    it('should accept valid categories', async () => {
      const validCategories = ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'];
      
      for (const category of validCategories) {
        const getAppState = mockGetAppState(category);
        // This should not throw
        await expect(dataLayer.getTrials({}, getAppState)).resolves.toBeDefined();
      }
    });
  });

  describe('CRUD Operations Category Enforcement', () => {
    it('should enforce category for addTrial', async () => {
      const getAppState = mockGetAppState('pesticide');
      const trialData = { name: 'Test Trial', Category: 'herbicide' };

      await expect(dataLayer.addTrial(trialData, getAppState))
        .rejects
        .toThrow('Category isolation violation: Cannot addTrial herbicide data when active category is pesticide');
    });

    it('should allow addTrial with matching category', async () => {
      const getAppState = mockGetAppState('nutrition');
      const trialData = { name: 'Test Trial', Category: 'nutrition' };

      // This should not throw and should auto-set category
      await expect(dataLayer.addTrial(trialData, getAppState)).resolves.toBeDefined();
    });

    it('should auto-set category for new records', async () => {
      const getAppState = mockGetAppState('biostimulant');
      const trialData = { name: 'Test Trial' }; // No category specified

      // Should auto-set to active category
      await expect(dataLayer.addTrial(trialData, getAppState)).resolves.toBeDefined();
    });
  });

  describe('Data Filtering for Google Sheets', () => {
    it('should filter data by category for Google Sheets backend', async () => {
      const mockDb = await import('./db.js');
      mockDb.getAllData.mockResolvedValue({
        trials: [
          { ID: '1', name: 'Herbicide Trial', Category: 'herbicide' },
          { ID: '2', name: 'Fungicide Trial', Category: 'fungicide' },
          { ID: '3', name: 'Legacy Trial' }, // No category
        ],
        projects: [
          { ID: '1', name: 'Herbicide Project', Category: 'herbicide' },
          { ID: '2', name: 'Fungicide Project', Category: 'fungicide' },
        ]
      });

      const getAppState = () => ({
        activeCategory: 'fungicide',
        settings: { firebaseEnabled: false }, // Use Google Sheets
      });

      const result = await dataLayer.getAllData({}, getAppState);

      expect(result.trials).toHaveLength(1);
      expect(result.trials[0].name).toBe('Fungicide Trial');
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('Fungicide Project');
    });

    it('should include legacy records without category for herbicide', async () => {
      const mockDb = await import('./db.js');
      mockDb.getAllData.mockResolvedValue({
        trials: [
          { ID: '1', name: 'Herbicide Trial', Category: 'herbicide' },
          { ID: '2', name: 'Legacy Trial' }, // No category
          { ID: '3', name: 'Fungicide Trial', Category: 'fungicide' },
        ]
      });

      const getAppState = () => ({
        activeCategory: 'herbicide',
        settings: { firebaseEnabled: false },
      });

      const result = await dataLayer.getAllData({}, getAppState);

      expect(result.trials).toHaveLength(2);
      expect(result.trials.map(t => t.name)).toContain('Herbicide Trial');
      expect(result.trials.map(t => t.name)).toContain('Legacy Trial');
    });
  });
});