# App Upgrade Bugfix Design

## Overview

This design document outlines the comprehensive improvements to fix critical performance issues, enhance reporting capabilities, improve data storage reliability, and resolve synchronization problems in the Herbicide Trial Manager app. The upgrade addresses 10 key bug conditions affecting UI responsiveness, statistical calculations, photo handling, storage management, and cloud synchronization.

The fix strategy follows a layered approach: implementing memoized selectors for state management to prevent unnecessary re-renders; offloading statistical computations to Web Workers; adding automatic image compression and lazy loading; implementing list virtualization; enhancing storage quota management; adding exponential backoff retry for photo uploads; implementing conflict resolution for bidirectional sync; adding real-time report preview; implementing timeout protection for heavy calculations; and adding automatic storage cleanup.

## Glossary

- **Bug_Condition (C)**: A predicate function that identifies inputs triggering performance or reliability issues — includes `isPerformanceIssue()`, `isStatisticalHeavyOperation()`, `isPhotoMemoryIssue()`, `isStorageQuotaRisk()`, and `isSyncReliabilityIssue()`
- **Property (P)**: The expected correct behavior after fixes — includes memoization achieving <10% re-renders, Web Worker execution without UI blocking, image compression to <150KB, storage quota <80%, and retry with exponential backoff
- **Preservation**: Existing behaviors that must remain unchanged — includes viewer role enforcement, Firebase real-time sync, all trial data fields, 11-sheet Excel format, bulk operation progress indicators, auto-initialize Firebase, and category-specific observation configurations
- **useAppState**: The React Context in `src/hooks/useAppState.jsx` that provides global application state via useReducer, currently causing full re-renders on any state change
- **selectors**: Memoized functions that extract specific state slices, only recomputing when their dependencies change
- **Web Worker**: A background thread for running JavaScript without blocking the main UI thread
- **Virtualization**: A rendering technique that only draws visible list items plus a small buffer, dramatically reducing DOM nodes for long lists
- **localStorage quota**: The ~5-10MB storage limit in browsers, currently causing sync failures when exceeded
- **sheetMirrorQueue**: The localStorage-based queue in `src/services/sheetMirror.js` that mirrors writes to Google Sheets

## Bug Details

### Bug Condition

The bug manifests when any of five conditions are met: large state with many items causes unnecessary re-renders; statistical calculations block the UI thread; photos exceed memory limits; storage quota approaches capacity; or sync operations fail without proper retry.

**Formal Specification:**
```
FUNCTION isPerformanceIssue(state)
  INPUT: state of type AppState
  OUTPUT: boolean
  
  RETURN state.trials.length > 50 OR 
         state.photoQueue.length > 10 OR
         hasUnmemoizedContextConsumers(state)
END FUNCTION

FUNCTION isStatisticalHeavyOperation(dataset)
  INPUT: dataset of type TrialDataset
  OUTPUT: boolean
  
  RETURN dataset.observations.length > 100 OR
         dataset.treatmentCount > 10 OR
         dataset.replicationCount > 4
END FUNCTION

FUNCTION isPhotoMemoryIssue(trial)
  INPUT: trial of type Trial
  OUTPUT: boolean
  
  photos ← safeJsonParse(trial.PhotoURLs, [])
  RETURN photos EXISTS p WHERE p.fileData.length > 500000
END FUNCTION

FUNCTION isStorageQuotaRisk()
  OUTPUT: boolean
  
  used ← estimateLocalStorageUsed()
  quota ← getLocalStorageQuota()
  RETURN (used / quota) > 0.7
END FUNCTION

FUNCTION isSyncReliabilityIssue(syncItem)
  INPUT: syncItem of type SyncQueueItem
  OUTPUT: boolean
  
  RETURN syncItem.attempts >= 3 OR
         (syncItem.action = 'photoUpload' AND syncItem.status = 'failed')
END FUNCTION
```

### Examples

- **Performance Issue Example**: When a user with 100 trials opens the app, typing in a search field triggers re-render of all components consuming useAppState, causing visible UI lag (200ms+ per keystroke)
- **Statistical Heavy Operation Example**: Running ANOVA on a dataset with 500 observations across 8 treatments with 6 replications freezes the UI for 3-5 seconds during calculation
- **Photo Memory Issue Example**: A trial with 20 photos stored at full resolution (~3MB each) consumes 60MB+ of memory, causing the browser to become sluggish on mobile devices
- **Storage Quota Risk Example**: When localStorage reaches 7MB of 10MB limit, adding a new sync item fails silently with "QuotaExceededError", losing data
- **Sync Reliability Issue Example**: A photo upload fails due to network timeout on first attempt, retries twice immediately with same result, and is abandoned without user notification

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Viewer role access must continue to enforce read-only permissions and disable all download/modify actions
- Firebase as primary data provider must continue to support real-time synchronization and offline-first capabilities
- Existing trial data must preserve all fields including PhotoURLs, EfficacyDataJSON, and custom observation fields after any migration
- Advanced report generation must continue to produce the 11-sheet Excel format with ANOVA tables and AI narratives
- Bulk operations on trials must continue to show progress indicators and allow cancellation
- App initialization with saved settings must continue to auto-initialize Firebase from stored configuration
- Category selection (herbicide, fungicide, etc.) must continue to apply correct observation field configurations and primary metrics

**Scope:**
All inputs that do NOT involve the five bug conditions should be completely unaffected by this fix. This includes:
- Small datasets (<50 items) with existing state management
- Light statistical operations (<100 observations)
- Newly captured photos (which will now be automatically compressed)
- Storage usage below 70% quota
- Successful sync operations on first attempt

## Hypothesized Root Cause

Based on code analysis, the most likely issues are:

1. **Missing Memoized Selectors in useAppState**: The current implementation uses a single Context that propagates the entire state object. When any state slice changes, all consuming components re-render regardless of whether they use that slice. The `perfUtils.js` file contains memoization utilities but they are not integrated into the state management.

2. **Main Thread Statistical Execution**: The `advancedReportGenerator.js` runs heavy calculations (ANOVA, Tukey HSD, dose-response curves) synchronously on the main JavaScript thread. While jStat is used for some calculations, the overall flow blocks UI rendering.

3. **No Automatic Image Compression**: `CameraCapture.jsx` captures at 1920x1080 resolution with 0.95 JPEG quality, producing files averaging 500KB-1MB. The `toBase64()` helper exists in report generator but is not applied to captured photos.

4. **Primitive localStorage Management**: The sheet mirror queue in `sheetMirror.js` and sync queue in `db.js` both use localStorage without quota monitoring or proactive cleanup. When quota is exceeded, operations fail.

5. **No Exponential Backoff Retry**: Current retry logic in `sheetMirror.js` marks items as failed after 3 immediate attempts without exponential backoff delay, causing network-flaky failures to exhaust retries quickly.

6. **Missing Virtualization**: No components implement windowing/virtualization for long lists. The `perfUtils.js` has `createVirtualList()` but it is not used in any list components.

7. **No Conflict Resolution UI**: When Firebase and Sheets both have changes to the same record, there is no mechanism to present conflict resolution options to users.

8. **No Real-time Report Preview**: `AdvancedReportGenerator` builds the entire Excel file before exposing any preview. Users wait for full generation to see partial results.

9. **No Calculation Timeout Protection**: Large statistical operations can run indefinitely without chunking or timeout, causing browser to become unresponsive.

10. **Unbounded IndexedDB Growth**: The `offlineStorage.js` saves photos and data to IndexedDB but never cleans up old items, causing storage to grow unbounded.

## Correctness Properties

Property 1: Performance Optimization - Memoized Selectors

_For any_ state where isPerformanceIssue(state) returns true after implementing memoized selectors, the fixed implementation SHALL ensure that only components dependent on changed state slices re-render, achieving at least 90% reduction in re-render count and maintaining 55+ FPS UI frame rate.

**Validates: Requirements 2.1**

Property 2: Statistical Calculations in Web Worker

_For any_ dataset where isStatisticalHeavyOperation(dataset) returns true, the fixed implementation SHALL execute statistical calculations in a Web Worker thread without blocking the UI, completing within 30 seconds timeout, and providing progress updates.

**Validates: Requirements 2.2**

Property 3: Photo Compression

_For any_ trial where isPhotoMemoryIssue(trial) returns true, the fixed implementation SHALL compress all photos to maximum dimension 600px at 70% JPEG quality, achieving <150KB per photo while preserving original aspect ratio.

**Validates: Requirements 2.3**

Property 4: Storage Quota Management

_For any_ context where isStorageQuotaRisk() returns true, the fixed implementation SHALL proactively prune completed sync items, warn users of pending items at risk, and maintain quota usage below 80%.

**Validates: Requirements 2.5, 2.10**

Property 5: Sync Reliability with Exponential Backoff

_For any_ sync item where isSyncReliabilityIssue(item) returns true after initial attempts, the fixed implementation SHALL implement exponential backoff retry (3 attempts minimum with increasing delays), queue failed items for later retry, and provide clear error feedback to users.

**Validates: Requirements 2.6**

Property 6: List Virtualization

_For any_ list display with more than 20 items, the fixed implementation SHALL use virtualization to render only visible items plus overscan buffer, reducing DOM nodes by at least 80% and maintaining smooth scrolling at 60fps.

**Validates: Requirements 2.4**

Property 7: Preservation - Non-Performance Issues

_For any_ input where NONE of the bug conditions hold (isPerformanceIssue, isStatisticalHeavyOperation, isPhotoMemoryIssue, isStorageQuotaRisk, isSyncReliabilityIssue all return false), the fixed implementation SHALL produce exactly the same behavior as the original implementation, preserving all existing functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

**1. State Management Optimization (Requirement 2.1)**

File: `src/hooks/useAppState.jsx`

Changes:
- Import createSelector from reselect or implement custom memoized selectors
- Create selector functions for each state slice: `selectTrials`, `selectProjects`, `selectFormulations`, `selectSettings`, `selectAuth`, `selectFilterState`, etc.
- Replace single context value object with individual values wrapped in useMemo
- Add React.memo to components that receive filtered data
- Example implementation pattern:

```javascript
// Create memoized selectors
const selectTrials = (state) => state.trials;
const selectFilterState = (state) => state.filterState;
const selectFilteredTrials = createSelector(
  [selectTrials, selectFilterState],
  (trials, filter) => {
    // Filtering logic with memoization
    return trials.filter(t => /* filter logic */);
  }
);
```

**2. Web Worker for Statistical Calculations (Requirement 2.2)**

File: `src/workers/statsWorker.js` (NEW)

Implementation:
- Create new Web Worker file for statistical computations
- Move ANOVA, Tukey HSD, dose-response calculations to worker
- Implement message-based communication with progress updates
- Add cancellation support via AbortController pattern

File: `src/services/advancedReportGenerator.js`

Changes:
- Import and instantiate statsWorker
- Replace synchronous calculation calls with async worker.postMessage
- Add progress callback handling for UI updates
- Add timeout wrapper (30 second max)
- Add graceful degradation to simpler statistics if worker fails

**3. Automatic Photo Compression (Requirement 2.3)**

File: `src/utils/imageCompression.js` (NEW)

Implementation:
- Create `compressImage(base64, maxDimension, quality)` function
- Default: maxDimension=600, quality=0.7 (70% JPEG)
- Return compressed base64 string
- Preserve EXIF orientation

File: `src/components/CameraCapture.jsx`

Changes:
- Import compressImage utility
- Apply compression in handleCapture before onCapture callback
- Also compress existing uncompressed photos on app load

File: `src/services/offlineStorage.js`

Changes:
- Add migration function to compress existing photos in IndexedDB
- Run compression in background using requestIdleCallback

**4. List Virtualization (Requirement 2.4)**

File: `src/components/VirtualizedList.jsx` (NEW)

Implementation:
- Create reusable VirtualizedList component using windowing
- Accept items array, itemHeight, renderItem function
- Use Intersection Observer or scroll event with position calculation
- Default overscan of 5 items above/below visible area

File: Components with long lists

Changes:
- Replace existing list rendering with VirtualizedList in:
  - Trial list pages
  - Project list pages
  - Photo gallery (if >20 photos)
  - Observation data tables

**5. Storage Quota Management (Requirements 2.5, 2.10)**

File: `src/services/storageQuotaManager.js` (NEW)

Implementation:
- Create `estimateLocalStorageUsed()` function
- Create `getLocalStorageQuota()` function (estimate ~5MB for most browsers)
- Create `pruneSyncQueue(keepCount)` function to remove completed items
- Create `cleanupOldPhotos(olderThanDays)` function for IndexedDB
- Add check before adding to any localStorage queue
- Emit warning event when quota >70%

File: `src/services/sheetMirror.js`

Changes:
- Import storageQuotaManager
- Call pruneSyncQueue before saveQueue when at risk
- Add warning toast for users with pending items

File: `src/services/offlineStorage.js`

Changes:
- Import storageQuotaManager
- Add scheduled cleanup for photos older than 90 days
- Monitor IndexedDB storage quota

**6. Exponential Backoff Retry (Requirement 2.6)**

File: `src/services/retryHandler.js` (NEW)

Implementation:
- Create `retryWithBackoff(fn, maxAttempts, baseDelay)` function
- Exponential backoff formula: delay = baseDelay * 2^(attempts-1)
- Add jitter to prevent thundering herd: delay = delay * (0.5 + Math.random()*0.5)
- Maximum delay cap of 30 seconds
- Return promise that resolves with result or rejects after max attempts

File: `src/services/sheetMirror.js`

Changes:
- Replace immediate retry with retryWithBackoff
- Increase max attempts to 5 with exponential backoff
- Queue failed items to syncQueue with 'pending_retry' status

File: `src/services/googleDriveUpload.js` (or photo upload service)

Changes:
- Apply retryWithBackoff to photo uploads
- Show retry status in UI
- Allow manual retry for failed uploads

**7. Conflict Resolution UI (Requirement 2.7)**

File: `src/components/ConflictResolverModal.jsx` (EXISTING - enhance)

Changes:
- Accept conflicting records as props (local version, remote version)
- Show side-by-side comparison
- Allow user to choose "Keep Local", "Keep Remote", or "Merge"
- Emit resolved record back to parent

File: `src/services/dataLayer.js`

Changes:
- Add conflict detection logic when fetching from both Firebase and Sheets
- When conflict detected, pause sync and show ConflictResolverModal
- After resolution, continue sync with user choice

**8. Real-time Report Preview (Requirement 2.8)**

File: `src/services/advancedReportGenerator.js`

Changes:
- Refactor generateCompleteReport to yield intermediate results
- Add progress callback that emits current sheet being generated
- Return preview data structure with completed sheets + current progress
- Add cancel support via AbortController

File: `src/pages/ReportPreview.jsx` (NEW or integrate into existing)

Implementation:
- Use generateCompleteReport with progress callback
- Render completed sheets in real-time as they finish
- Show progress bar with percentage and current sheet name
- Allow cancel button to abort generation

**9. Calculation Timeout Protection (Requirement 2.9)**

File: `src/workers/statsWorker.js` (from item 2)

Changes:
- Add timeout wrapper in worker
- Chunk large dataset processing into batches
- Yield to main thread between chunks
- Return partial results if timeout approaches

File: `src/services/advancedReportGenerator.js`

Changes:
- Add 30-second timeout wrapper around worker calls
- If timeout occurs, fall back to simplified statistics (mean, SD only)
- Show warning that full analysis was not possible

**10. Automatic IndexedDB Cleanup (Requirement 2.10)**

File: `src/services/offlineStorage.js`

Changes:
- Add cleanup function: `cleanupOldPhotos(olderThanDays = 90)`
- Add cleanup function: `cleanupCompletedSyncItems(olderThanDays = 30)`
- Run cleanup on app initialization
- Add settings to control cleanup thresholds

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write tests that simulate the bug conditions and verify the problematic behavior occurs. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Performance Test**: Create 100 trial objects in state, trigger filter change, measure render time with React DevTools Profiler (will exceed 16ms frame time on unfixed code)
2. **Statistical Worker Test**: Generate dataset with 500 observations, run ANOVA, observe UI freeze (main thread blocked on unfixed code)
3. **Photo Memory Test**: Load trial with 20 uncompressed photos (~3MB each), measure memory usage (will exceed 50MB on unfixed code)
4. **Storage Quota Test**: Fill localStorage to 8MB, attempt another write, observe QuotaExceededError (will fail on unfixed code)
5. **Sync Retry Test**: Simulate network failure 3 times, observe immediate retries without backoff (no delay on unfixed code)

**Expected Counterexamples**:
- Performance: Frame time >100ms when filtering large list
- Worker: UI blocked for 3+ seconds during statistics
- Memory: Total memory usage >100MB for photo-heavy trial
- Storage: QuotaExceededError on normal operation
- Sync: Failed uploads exhausted after immediate 3 attempts

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL state WHERE isPerformanceIssue(state) DO
  result := useAppState_fixed(state)
  ASSERT result.reRenderCount < originalReRenderCount * 0.1
  ASSERT result.uiFrameRate >= 55
END FOR

FOR ALL dataset WHERE isStatisticalHeavyOperation(dataset) DO
  result := calculateStatsInWorker(dataset)
  ASSERT result.completedWithoutUIBlock = true
  ASSERT result.timeoutNotExceeded = true
END FOR

FOR ALL trial WHERE isPhotoMemoryIssue(trial) DO
  result := compressTrialPhotos(trial)
  ASSERT result.maxPhotoSize <= 150000
  ASSERT result.originalAspectRatioPreserved = true
END FOR

FOR ALL context WHERE isStorageQuotaRisk() DO
  result := manageStorageQuota(context)
  ASSERT result.quotaUsage < 0.8
  ASSERT result.pendingSyncItemsPreserved = true
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL state WHERE NOT isPerformanceIssue(state) DO
  originalBehavior := state.currentBehavior
  optimizedBehavior := optimizeStateManagement(state)
  ASSERT optimizedBehavior = originalBehavior
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug inputs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Small Dataset Preservation**: Verify filtering works identically for small datasets (<50 items)
2. **Simple Statistics Preservation**: Verify basic statistics (mean, SD) produce same results
3. **Small Photo Preservation**: Verify small photos (<100KB) are handled correctly
4. **Low Storage Preservation**: Verify operations work normally when storage <50%
5. **Successful Sync Preservation**: Verify successful syncs complete without change

### Unit Tests

- Test memoized selectors return correct state slices
- Test image compression produces file under size limit
- Test retry handler exponential backoff timing
- Test storage quota estimation accuracy
- Test conflict comparison detects differences
- Test virtual list calculates correct visible range

### Property-Based Tests

- Generate random state objects and verify memoization prevents unnecessary renders
- Generate random datasets and verify worker produces same results as main thread
- Generate random photos and verify compression preserves aspect ratio
- Generate random storage loads and verify quota management prevents overflow
- Generate random sync sequences and verify retry behavior

### Integration Tests

- Full user flow: capture photo → compress → save → sync to Firebase/Sheets
- Full report generation: select trials → run ANOVA → generate Excel → download
- Offline flow: go offline → create trial → come online → sync queue processes
- Conflict resolution flow: modify on both Firebase and Sheets → detect conflict → resolve