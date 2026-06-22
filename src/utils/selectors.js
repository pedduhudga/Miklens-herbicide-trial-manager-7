/**
 * Memoized selectors for optimized state access
 * Implements the selector pattern to prevent unnecessary re-renders
 */

// Base selector factory - creates a memoized selector
export function createSelector(selectors, compute) {
  let lastInputs = null;
  let lastResult = null;

  return function selector(state) {
    const inputs = selectors.map(fn => fn(state));
    
    // Check if inputs changed
    let changed = false;
    if (lastInputs === null || inputs.length !== lastInputs.length) {
      changed = true;
    } else {
      for (let i = 0; i < inputs.length; i++) {
        if (inputs[i] !== lastInputs[i]) {
          changed = true;
          break;
        }
      }
    }
    
    if (changed) {
      lastInputs = inputs;
      lastResult = compute(...inputs);
    }
    
    return lastResult;
  };
}

// Simple selector - extracts a single slice from state
export const createSimpleSelector = (sliceKey) => (state) => state[sliceKey];

// Individual state slice selectors
export const selectAuth = (state) => state.auth;
export const selectCurrentPage = (state) => state.currentPage;
export const selectIngredients = (state) => state.ingredients;
export const selectFormulations = (state) => state.formulations;
export const selectTrials = (state) => state.trials;
export const selectOrganisations = (state) => state.organisations;
export const selectProjects = (state) => state.projects;
export const selectBlocks = (state) => state.blocks;
export const selectSelectedTrials = (state) => state.selectedTrials;
export const selectPhotoQueue = (state) => state.photoQueue;
export const selectCroppedPhotosData = (state) => state.croppedPhotosData;
export const selectSettings = (state) => state.settings;
export const selectCharts = (state) => state.charts;
export const selectEfficacyDataForModal = (state) => state.efficacyDataForModal;
export const selectBulkAnalysisState = (state) => state.bulkAnalysisState;
export const selectBackgroundQueue = (state) => state.backgroundQueue;
export const selectSyncQueue = (state) => state.syncQueue;
export const selectAiQueue = (state) => state.aiQueue;
export const selectIsAiQueueRunning = (state) => state.isAiQueueRunning;
export const selectFilterState = (state) => state.filterState;
export const selectUserAdminFilters = (state) => state.userAdminFilters;
export const selectUsers = (state) => state.users;
export const selectHasLoadedInitialData = (state) => state.hasLoadedInitialData;
export const selectActiveCategory = (state) => state.activeCategory;
export const selectAiChatHistory = (state) => state.aiChatHistory;
export const selectAiChatSessions = (state) => state.aiChatSessions;
export const selectCurrentAiChatSessionId = (state) => state.currentAiChatSessionId;

// Derived selectors with computation

// Filtered trials based on filter state
export const selectFilteredTrials = createSelector(
  [selectTrials, selectFilterState],
  (trials, filterState) => {
    if (!trials || !filterState) return trials || [];
    
    let filtered = [...trials];
    
    // Filter by search
    if (filterState.search) {
      const searchLower = filterState.search.toLowerCase();
      filtered = filtered.filter(trial => {
        const searchableText = [
          trial.FormulationName,
          trial.InvestigatorName,
          trial.Location,
          trial.Crop,
          trial.ProjectName
        ].filter(Boolean).join(' ').toLowerCase();
        return searchableText.includes(searchLower);
      });
    }
    
    // Filter by formulation
    if (filterState.formulation) {
      filtered = filtered.filter(t => 
        t.FormulationName?.toLowerCase().includes(filterState.formulation.toLowerCase())
      );
    }
    
    // Filter by date range
    if (filterState.startDate) {
      filtered = filtered.filter(t => t.Date >= filterState.startDate);
    }
    if (filterState.endDate) {
      filtered = filtered.filter(t => t.Date <= filterState.endDate);
    }
    
    // Sort
    if (filterState.sortBy) {
      switch (filterState.sortBy) {
        case 'date':
          filtered.sort((a, b) => new Date(b.Date) - new Date(a.Date));
          break;
        case 'name':
          filtered.sort((a, b) => (a.FormulationName || '').localeCompare(b.FormulationName || ''));
          break;
        case 'location':
          filtered.sort((a, b) => (a.Location || '').localeCompare(b.Location || ''));
          break;
      }
    }
    
    return filtered;
  }
);

// Filtered users based on admin filters
export const selectFilteredUsers = createSelector(
  [selectUsers, selectUserAdminFilters],
  (users, filters) => {
    if (!users || !filters) return users || [];
    
    let filtered = [...users];
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(user => 
        (user.email || '').toLowerCase().includes(searchLower) ||
        (user.name || '').toLowerCase().includes(searchLower)
      );
    }
    
    if (filters.role && filters.role !== 'all') {
      filtered = filtered.filter(user => user.role === filters.role);
    }
    
    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter(user => user.status === filters.status);
    }
    
    return filtered;
  }
);

// Trial count by status
export const selectTrialCountByStatus = createSelector(
  [selectTrials],
  (trials) => {
    if (!trials) return { total: 0, active: 0, completed: 0 };
    
    return {
      total: trials.length,
      active: trials.filter(t => t.Status === 'Active').length,
      completed: trials.filter(t => t.Status === 'Completed').length
    };
  }
);

// User session info
export const selectUserSession = createSelector(
  [selectAuth],
  (auth) => {
    if (!auth?.user) return { isAuthenticated: false, user: null, role: null };
    
    return {
      isAuthenticated: true,
      user: auth.user,
      role: auth.user.role || 'user',
      token: auth.token
    };
  }
);

// Settings sub-selectors
export const selectFirebaseConfig = createSelector(
  [selectSettings],
  (settings) => settings?.firebaseConfig || {}
);

export const selectIsFirebaseEnabled = createSelector(
  [selectSettings],
  (settings) => settings?.firebaseEnabled || false
);

export const selectIsSheetMirrorEnabled = createSelector(
  [selectSettings],
  (settings) => settings?.sheetMirrorEnabled || false
);

// Photo queue with pending uploads
export const selectPendingPhotoUploads = createSelector(
  [selectPhotoQueue],
  (queue) => queue?.filter(item => item.status === 'pending') || []
);

// Sync queue stats
export const selectSyncQueueStats = createSelector(
  [selectSyncQueue],
  (queue) => {
    if (!queue) return { total: 0, pending: 0, failed: 0, completed: 0 };
    
    return {
      total: queue.length,
      pending: queue.filter(i => i.status === 'pending').length,
      failed: queue.filter(i => i.status === 'failed').length,
      completed: queue.filter(i => i.status === 'completed').length
    };
  }
);

// Bulk analysis progress
export const selectBulkAnalysisProgress = createSelector(
  [selectBulkAnalysisState],
  (state) => {
    if (!state || !state.isRunning) return null;
    
    const progress = state.totalToProcess > 0 
      ? ((state.lastProcessedIndex + 1) / state.totalToProcess) * 100 
      : 0;
    
    return {
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      progress,
      processed: state.lastProcessedIndex + 1,
      total: state.totalToProcess
    };
  }
);