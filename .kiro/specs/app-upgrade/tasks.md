# Implementation Plan - Trial Manager Advanced Upgrade Bugfix

This document contains the implementation task list following the exploratory bugfix workflow. All tasks reference specifications from the design document.

## Task Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                           IMPLEMENTATION TASK DEPENDENCIES                                   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  [1. Bug Condition Exploration] ──────┐                                                    │
│        (Write tests BEFORE fix)        │                                                    │
│                                        │                                                    │
│  [2. Preservation Tests]              │                                                    │
│        (Write tests BEFORE fix)        │                                                    │
│                                        ▼                                                    │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                          IMPLEMENTATION PHASE                                       │   │
│  │                                                                                     │   │
│  │  3.1 State Management Optimization ◄─────────────────────────────┐                │   │
│  │       (Selectors + React.memo)                                   │                │   │
│  │                                                               │    │                │   │
│  │  3.2 Web Worker for Statistics ◄───────────────────────────────┤    │                │   │
│  │       (StatsWorker.js)                                          │    │                │   │
│  │                                                                 │    │                │   │
│  │  3.3 Photo Compression ◄───────────────────────────────────────┤    │                │   │
│  │       (imageCompression.js, CameraCapture.jsx)                  │    │                │   │
│  │                                                                 │    │                │   │
│  │  3.4 List Virtualization ◄──────────────────────────────────────┤    │                │   │
│  │       (VirtualizedList.jsx)                                      │    │                │   │
│  │                                                                 │    │                │   │
│  │  3.5 Storage Quota Management ◄─────────────────────────────────┤    │                │   │
│  │       (storageQuotaManager.js) ──► 3.6 Exponential Backoff ────┘    │                │   │
│  │       (Uses quota management)        (retryHandler.js)              │                │   │
│  │                                                               │    │                │   │
│  │  3.6 Exponential Backoff Retry ◄──────────────────────────────┘    │                │   │
│  │       (retryHandler.js)                                            │                │   │
│  │                                                               │    │                │   │
│  │  3.7 Conflict Resolution UI ◄────────────────────────────────────┘    │                │   │
│  │       (ConflictResolverModal.jsx, dataLayer.js)                       │                │   │
│  │                                                               │    │                │   │
│  │  3.8 Real-time Report Preview ◄──────────────────────────────────────┘                │   │
│  │       (advancedReportGenerator.js)                                                          │   │
│  │                                                               │    │                       │
│  │  3.9 Calculation Timeout Protection ◄───────────────────────────────┘                   │   │
│  │       (statsWorker.js timeout)                                                            │   │
│  │                                                               │    │                       │
│  │  3.10 Automatic IndexedDB Cleanup ◄──────────────────────────────────────────────────────┘   │
│       (offlineStorage.js cleanup)                                                               │
│                                                                                              │
│  └────────────────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                                    │
│                                        ▼                                                    │
│  [4. Checkpoint]                                                                             │
│       (Ensure all tests pass)                                                                │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Bug Condition Exploration Tests (Write BEFORE implementing fix)

These tests verify that the bug conditions exist in the unfixed code. They should FAIL on unfixed code.

---

- [ ] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Performance Issue Detection
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists

  ### 1.1 Performance Issue Exploration Test
  - Test that changing a single state slice causes ALL components consuming useAppState to re-render
  - Create 100+ trial objects in state, trigger filter change
  - Measure render time with React DevTools Profiler
  - Run test on UNFIXED code - EXPECTED OUTCOME: Frame time >100ms when filtering large list
  - Document counterexamples found (e.g., "Changing filterState triggers re-render of TrialCard, PhotoGallery, Analytics even though they don't use filterState")
  - _Requirements: 2.1_

  ### 1.2 Statistical Heavy Operation Exploration Test
  - Test that ANOVA, Tukey HSD calculations block the UI thread
  - Generate dataset with 500 observations across 8 treatments with 6 replications
  - Run statistical calculations and measure UI responsiveness
  - Run test on UNFIXED code - EXPECTED OUTCOME: UI blocked for 3+ seconds
  - Document counterexamples found
  - _Requirements: 2.2_

  ### 1.3 Photo Memory Issue Exploration Test
  - Test that full-resolution photos consume excessive memory
  - Load trial with 20 uncompressed photos (~3MB each)
  - Measure total memory usage
  - Run test on UNFIXED code - EXPECTED OUTCOME: Memory usage >100MB
  - Document counterexamples found
  - _Requirements: 2.3_

  ### 1.4 Storage Quota Risk Exploration Test
  - Test that localStorage quota is not managed
  - Fill localStorage to 8MB, attempt another write
  - Run test on UNFIXED code - EXPECTED OUTCOME: QuotaExceededError thrown
  - Document counterexamples found
  - _Requirements: 2.5_

  ### 1.5 Sync Reliability Issue Exploration Test
  - Test that sync failures don't have proper retry logic
  - Simulate network failure 3 times
  - Observe retry behavior - should have no exponential backoff
  - Run test on UNFIXED code - EXPECTED OUTCOME: Immediate retries without delay, no queuing for later
  - Document counterexamples found
  - _Requirements: 2.6_

  ### 1.6 List Virtualization Issue Exploration Test
  - Test that lists render all items without virtualization
  - Render list with 100 items
  - Measure DOM node count
  - Run test on UNFIXED code - EXPECTED OUTCOME: All 100 items in DOM
  - Document counterexamples found
  - _Requirements: 2.4_

  ### 1.7 Conflict Resolution Missing Exploration Test
  - Test that conflicts between Firebase and Sheets are not detected
  - Modify same record in both Firebase and Sheets
  - Run test on UNFIXED code - EXPECTED OUTCOME: No conflict detection or resolution UI
  - Document counterexamples found
  - _Requirements: 2.7_

  ### 1.8 Real-time Preview Missing Exploration Test
  - Test that report generation doesn't yield progress
  - Generate advanced report with multiple sheets
  - Run test on UNFIXED code - EXPECTED OUTCOME: No progress updates until complete
  - Document counterexamples found
  - _Requirements: 2.8_

  ### 1.9 Timeout Protection Missing Exploration Test
  - Test that statistical calculations have no timeout
  - Run calculations on very large dataset
  - Run test on UNFIXED code - EXPECTED OUTCOME: No timeout, browser may crash
  - Document counterexamples found
  - _Requirements: 2.9_

  ### 1.10 IndexedDB Growth Exploration Test
  - Test that IndexedDB grows unbounded without cleanup
  - Add many items to IndexedDB over time
  - Run test on UNFIXED code - EXPECTED OUTCOME: No automatic cleanup
  - Document counterexamples found
  - _Requirements: 2.10_

---

## Phase 2: Preservation Property Tests (Write BEFORE implementing fix)

These tests verify that existing behavior is preserved for inputs where bug conditions do NOT apply.

---

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Buggy Input Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs
  - Write property-based tests capturing observed behavior patterns

  ### 2.1 Small Dataset Preservation Test
  - **GOAL**: Verify filtering works identically for small datasets (<50 items)
  - Observe: Filter behavior on unfixed code with 30 trials
  - Write property-based test: for all filter operations on <50 items, result equals expected filtered output
  - Run test on UNFIXED code - EXPECTED OUTCOME: Test PASSES
  - _Requirements: 3.1, 3.2_

  ### 2.2 Simple Statistics Preservation Test
  - **GOAL**: Verify basic statistics produce same results after worker migration
  - Observe: Mean, SD, variance calculations on unfixed code with small dataset
  - Write property-based test: statistical results from worker must match main thread calculations
  - Run test on UNFIXED code - EXPECTED OUTCOME: Test PASSES
  - _Requirements: 3.4_

  ### 2.3 Small Photo Preservation Test
  - **GOAL**: Verify small photos (<100KB) are handled correctly
  - Observe: Photo handling behavior on unfixed code with small images
  - Write property-based test: small photos maintain quality and accessibility
  - Run test on UNFIXED code - EXPECTED OUTCOME: Test PASSES
  - _Requirements: 3.3_

  ### 2.4 Low Storage Preservation Test
  - **GOAL**: Verify operations work normally when storage <50%
  - Observe: Sync and storage operations when quota is low
  - Write property-based test: all operations succeed below 50% quota
  - Run test on UNFIXED code - EXPECTED OUTCOME: Test PASSES
  - _Requirements: 2.5_

  ### 2.5 Viewer Role Preservation Test
  - **GOAL**: Verify viewer role enforcement unchanged
  - Observe: Access control on unfixed code
  - Write property-based test: viewer role cannot modify data
  - Run test on UNFIXED code - EXPECTED OUTCOME: Test PASSES
  - _Requirements: 3.1_

  ### 2.6 Firebase Sync Preservation Test
  - **GOAL**: Verify Firebase real-time sync unchanged
  - Observe: Firebase behavior on unfixed code
  - Write property-based test: Firebase sync continues to work
  - Run test on UNFIXED code - EXPECTED OUTCOME: Test PASSES
  - _Requirements: 3.2_

  ### 2.7 Report Format Preservation Test
  - **GOAL**: Verify 11-sheet Excel format unchanged
  - Observe: Report generation output on unfixed code
  - Write property-based test: report contains all 11 sheets with correct data
  - Run test on UNFIXED code - EXPECTED OUTCOME: Test PASSES
  - _Requirements: 3.4_

  ### 2.8 Category Configuration Preservation Test
  - **GOAL**: Verify category-specific observation fields unchanged
  - Observe: Category selection behavior on unfixed code
  - Write property-based test: correct observation fields per category
  - Run test on UNFIXED code - EXPECTED OUTCOME: Test PASSES
  - _Requirements: 3.7_

---

## Phase 3: Implementation

---

### 3.1 State Management Optimization
**Description**: Implement memoized selectors in useAppState.jsx to prevent unnecessary re-renders

**Files to Create**:
- (none - using existing file)

**Files to Modify**:
- `src/hooks/useAppState.jsx` - Add memoized selectors and React.memo

**Implementation Details**:
1. Import createSelector from reselect or implement custom memoized selectors
2. Create selector functions for each state slice:
   - `selectTrials` - extracts trials array
   - `selectProjects` - extracts projects array
   - `selectFormulations` - extracts formulations array
   - `selectSettings` - extracts settings object
   - `selectAuth` - extracts auth state
   - `selectFilterState` - extracts filter state
   - `selectFilteredTrials` - memoized filtered trials based on filter state
   - `selectPhotoQueue` - extracts photo upload queue
3. Replace single context value object with individual memoized values
4. Add React.memo to components that receive filtered data (TrialCard, PhotoGallery, etc.)

**Dependencies**: None (first implementation task)

**Validation**:
- Re-run exploration test 1.1 - should PASS after fix
- Re-run preservation test 2.1 - should still PASS
- Measure: re-render count reduced by >90%, UI frame rate >=55fps

**Annotations**:
- _Bug_Condition: isPerformanceIssue(state) where state.trials.length > 50 OR state.photoQueue.length > 10_
- _Expected_Behavior: Only components dependent on changed state slices re-render_
- _Preservation: Small datasets (<50 items) with existing state management work identically_
- _Requirements: 2.1, 3.1, 3.2_

---

### 3.2 Web Worker for Statistical Calculations
**Description**: Create Web Worker to offload ANOVA, Tukey HSD, and dose-response calculations

**Files to Create**:
- `src/workers/statsWorker.js` - Web Worker for statistical computations

**Files to Modify**:
- `src/services/advancedReportGenerator.js` - Integrate worker for heavy calculations
- `src/pages/Analytics.jsx` - Add progress callbacks

**Implementation Details**:
1. Create statsWorker.js:
   - Implement message-based communication
   - Move ANOVA, Tukey HSD, dose-response calculations to worker
   - Add progress callbacks (emit percentage complete)
   - Add cancellation support via AbortController pattern
   - Add timeout wrapper (30 second max)
2. Modify advancedReportGenerator.js:
   - Import and instantiate statsWorker
   - Replace synchronous calculation calls with async worker.postMessage
   - Add progress callback handling for UI updates
   - Add graceful degradation to simpler statistics if worker fails

**Dependencies**: 
- Requires 3.1 (State Management) for progress callback infrastructure

**Validation**:
- Re-run exploration test 1.2 - should PASS after fix (UI not blocked)
- Re-run preservation test 2.2 - should still PASS (same statistical results)
- Measure: UI remains responsive during calculations, progress updates shown

**Annotations**:
- _Bug_Condition: isStatisticalHeavyOperation(dataset) where dataset.observations.length > 100_
- _Expected_Behavior: Statistical calculations execute in Web Worker without blocking UI_
- _Preservation: Basic statistics (mean, SD) produce identical results_
- _Requirements: 2.2, 3.4_

---

### 3.3 Photo Compression
**Description**: Implement automatic image compression to reduce memory footprint

**Files to Create**:
- `src/utils/imageCompression.js` - Compression utility functions

**Files to Modify**:
- `src/components/CameraCapture.jsx` - Compress photos on capture
- `src/services/offlineStorage.js` - Add migration for existing photos

**Implementation Details**:
1. Create imageCompression.js:
   - `compressImage(base64, maxDimension, quality)` function
   - Default: maxDimension=600, quality=0.7 (70% JPEG)
   - Return compressed base64 string
   - Preserve EXIF orientation
2. Modify CameraCapture.jsx:
   - Import compressImage utility
   - Apply compression in handleCapture before onCapture callback
3. Modify offlineStorage.js:
   - Add migration function to compress existing photos in IndexedDB
   - Run compression in background using requestIdleCallback

**Dependencies**: None (can be done in parallel with other tasks)

**Validation**:
- Re-run exploration test 1.3 - should PASS after fix (memory <50MB)
- Re-run preservation test 2.3 - should still PASS (small photos maintained)
- Measure: Photo size reduced to <150KB, aspect ratio preserved

**Annotations**:
- _Bug_Condition: isPhotoMemoryIssue(trial) where any photo.fileData.length > 500000_
- _Expected_Behavior: All photos compressed to max 600px at 70% quality, <150KB each_
- _Preservation: Small photos (<100KB) maintain quality, all photo fields preserved_
- _Requirements: 2.3, 3.3_

---

### 3.4 List Virtualization
**Description**: Implement virtualized list component to reduce DOM nodes

**Files to Create**:
- `src/components/VirtualizedList.jsx` - Reusable virtualized list component

**Files to Modify**:
- `src/components/TrialCard.jsx` - Apply virtualization to trial list
- `src/components/PhotoGallery.jsx` - Apply virtualization to photo gallery
- `src/pages/Analytics.jsx` - Apply virtualization to data tables

**Implementation Details**:
1. Create VirtualizedList.jsx:
   - Accept items array, itemHeight, renderItem function
   - Use Intersection Observer or scroll event with position calculation
   - Default overscan of 5 items above/below visible area
   - Handle dynamic item heights optionally
2. Apply to components with long lists:
   - Trial list pages (>20 trials)
   - Project list pages (>20 projects)
   - Photo gallery (>20 photos)
   - Observation data tables

**Dependencies**: None (can be done in parallel)

**Validation**:
- Re-run exploration test 1.6 - should PASS after fix (only visible items in DOM)
- Measure: DOM nodes reduced by >80%, smooth 60fps scrolling

**Annotations**:
- _Bug_Condition: List display with >20 items_
- _Expected_Behavior: Only visible items plus overscan buffer rendered_
- _Preservation: Small lists (<20 items) work identically to before_
- _Requirements: 2.4_

---

### 3.5 Storage Quota Management
**Description**: Implement storage quota monitoring and proactive cleanup

**Files to Create**:
- `src/services/storageQuotaManager.js` - Storage quota management utilities

**Files to Modify**:
- `src/services/sheetMirror.js` - Integrate quota management
- `src/services/offlineStorage.js` - Integrate quota management

**Implementation Details**:
1. Create storageQuotaManager.js:
   - `estimateLocalStorageUsed()` - Estimate bytes used
   - `getLocalStorageQuota()` - Get quota (estimate ~5MB for most browsers)
   - `pruneSyncQueue(keepCount)` - Remove completed items, keep pending
   - `cleanupOldPhotos(olderThanDays)` - Remove old photos from IndexedDB
   - `checkQuotaRisk()` - Returns true if >70% used
   - Emit warning event when quota >70%
2. Modify sheetMirror.js:
   - Import storageQuotaManager
   - Call pruneSyncQueue before saveQueue when at risk
   - Add warning toast for users with pending items
3. Modify offlineStorage.js:
   - Import storageQuotaManager
   - Add scheduled cleanup for photos older than 90 days
   - Monitor IndexedDB storage quota

**Dependencies**: None (can be done in parallel)

**Validation**:
- Re-run exploration test 1.4 - should PASS after fix (no QuotaExceededError)
- Re-run preservation test 2.4 - should still PASS
- Measure: Quota usage maintained below 80%

**Annotations**:
- _Bug_Condition: isStorageQuotaRisk() where (used/quota) > 0.7_
- _Expected_Behavior: Proactively prune completed items, warn users, maintain <80% quota_
- _Preservation: Operations below 50% quota work identically_
- _Requirements: 2.5, 2.10_

---

### 3.6 Exponential Backoff Retry
**Description**: Implement retry handler with exponential backoff for failed operations

**Files to Create**:
- `src/services/retryHandler.js` - Retry handler utility

**Files to Modify**:
- `src/services/sheetMirror.js` - Use retry for sheet sync
- `src/components/CloudBackup.jsx` - Use retry for photo uploads
- `src/services/googleDriveUpload.js` (or equivalent) - Apply retry logic

**Implementation Details**:
1. Create retryHandler.js:
   - `retryWithBackoff(fn, maxAttempts, baseDelay)` function
   - Exponential backoff formula: delay = baseDelay * 2^(attempts-1)
   - Add jitter: delay = delay * (0.5 + Math.random()*0.5)
   - Maximum delay cap of 30 seconds
   - Return promise that resolves with result or rejects after max attempts
2. Modify sheetMirror.js:
   - Replace immediate retry with retryWithBackoff
   - Increase max attempts to 5 with exponential backoff
   - Queue failed items to syncQueue with 'pending_retry' status
3. Modify photo upload services:
   - Apply retryWithBackoff to photo uploads
   - Show retry status in UI
   - Allow manual retry for failed uploads

**Dependencies**: 
- Requires 3.5 (Storage Quota Management) for proper queue management

**Validation**:
- Re-run exploration test 1.5 - should PASS after fix (proper backoff delays)
- Measure: Failed operations retried with increasing delays, user notified

**Annotations**:
- _Bug_Condition: isSyncReliabilityIssue(syncItem) where syncItem.attempts >= 3_
- _Expected_Behavior: Exponential backoff retry with delays, queue failed items for later_
- _Preservation: Successful syncs complete without change on first attempt_
- _Requirements: 2.6_

---

### 3.7 Conflict Resolution UI
**Description**: Enhance conflict resolver to handle Firebase/Sheets bidirectional sync conflicts

**Files to Create**:
- (none - enhancing existing)

**Files to Modify**:
- `src/components/ConflictResolverModal.jsx` - Enhance with side-by-side comparison
- `src/services/dataLayer.js` - Add conflict detection logic

**Implementation Details**:
1. Enhance ConflictResolverModal.jsx:
   - Accept conflicting records as props (local version, remote version)
   - Show side-by-side comparison with highlighted differences
   - Allow user to choose "Keep Local", "Keep Remote", or "Merge"
   - Emit resolved record back to parent
2. Modify dataLayer.js:
   - Add conflict detection logic when fetching from both Firebase and Sheets
   - Compare timestamps and content hash to detect conflicts
   - When conflict detected, pause sync and show ConflictResolverModal
   - After resolution, continue sync with user choice

**Dependencies**: None (can be done in parallel)

**Validation**:
- Re-run exploration test 1.7 - should PASS after fix (conflicts detected and resolved)
- Measure: Users can see differences and choose resolution

**Annotations**:
- _Bug_Condition: Firebase and Sheets both have changes to same record_
- _Expected_Behavior: Present conflict resolution UI with side-by-side comparison_
- _Preservation: Non-conflicting changes sync normally_
- _Requirements: 2.7_

---

### 3.8 Real-time Report Preview
**Description**: Add progress reporting to report generation for real-time preview

**Files to Modify**:
- `src/services/advancedReportGenerator.js` - Yield progress updates
- `src/pages/ReportPreview.jsx` (or integrate into existing report page)

**Implementation Details**:
1. Modify advancedReportGenerator.js:
   - Refactor generateCompleteReport to yield intermediate results
   - Add progress callback that emits current sheet being generated
   - Return preview data structure with completed sheets + current progress
   - Add cancel support via AbortController
2. Update report preview UI:
   - Use generateCompleteReport with progress callback
   - Render completed sheets in real-time as they finish
   - Show progress bar with percentage and current sheet name
   - Allow cancel button to abort generation

**Dependencies**: Requires 3.2 (Web Worker) for async progress updates

**Validation**:
- Re-run exploration test 1.8 - should PASS after fix (progress updates shown)
- Measure: Users see real-time progress during report generation

**Annotations**:
- _Bug_Condition: Report generation with multiple sheets_
- _Expected_Behavior: Real-time preview of each section as it is generated_
- _Preservation: Final output identical to before (11-sheet Excel)_
- _Requirements: 2.8, 3.4_

---

### 3.9 Calculation Timeout Protection
**Description**: Add timeout wrapper and graceful degradation to statistical calculations

**Files to Modify**:
- `src/workers/statsWorker.js` - Add timeout wrapper (from 3.2)
- `src/services/advancedReportGenerator.js` - Add graceful degradation

**Implementation Details**:
1. In statsWorker.js:
   - Add timeout wrapper using setTimeout
   - Chunk large dataset processing into batches
   - Yield to main thread between chunks using postMessage
   - Return partial results if timeout approaches
2. In advancedReportGenerator.js:
   - Add 30-second timeout wrapper around worker calls
   - If timeout occurs, fall back to simplified statistics (mean, SD only)
   - Show warning that full analysis was not possible

**Dependencies**: Requires 3.2 (Web Worker)

**Validation**:
- Re-run exploration test 1.9 - should PASS after fix (timeout prevents crash)
- Measure: Large calculations complete within timeout or degrade gracefully

**Annotations**:
- _Bug_Condition: Large dataset triggers statistical analysis_
- _Expected_Behavior: 30-second timeout, chunked processing, graceful degradation_
- _Preservation: Small datasets produce full statistical analysis_
- _Requirements: 2.9_

---

### 3.10 Automatic IndexedDB Cleanup
**Description**: Implement automatic cleanup of old cached data in IndexedDB

**Files to Modify**:
- `src/services/offlineStorage.js` - Add cleanup functions

**Implementation Details**:
1. Add cleanup functions to offlineStorage.js:
   - `cleanupOldPhotos(olderThanDays = 90)` - Remove photos not accessed in 90 days
   - `cleanupCompletedSyncItems(olderThanDays = 30)` - Remove completed sync items
   - `getStorageUsage()` - Return current storage usage statistics
2. Run cleanup on app initialization (when storage >80% quota)
3. Add settings to control cleanup thresholds (in settings UI)

**Dependencies**: 
- Requires 3.5 (Storage Quota Management) for quota monitoring
- Requires 3.3 (Photo Compression) for migration

**Validation**:
- Re-run exploration test 1.10 - should PASS after fix (automatic cleanup runs)
- Measure: IndexedDB size remains bounded, old data removed

**Annotations**:
- _Bug_Condition: Offline storage reaches 80% of quota_
- _Expected_Behavior: Automatically clean up old cached photos and sync items_
- _Preservation: Recent data and pending sync items preserved_
- _Requirements: 2.10, 2.5_

---

## Phase 4: Validation & Checkpoint

---

- [ ] 4. Checkpoint - Ensure all tests pass
  - **CRITICAL**: Verify all exploration tests now PASS (bugs fixed)
  - **CRITICAL**: Verify all preservation tests still PASS (no regressions)
  - Run full test suite to confirm:
    - [ ] Performance: Re-render count reduced by >90%, frame rate >=55fps
    - [ ] Statistics: UI not blocked, progress shown, timeout works
    - [ ] Photos: Compressed to <150KB, aspect ratio preserved
    - [ ] Lists: DOM nodes reduced >80%, smooth scrolling
    - [ ] Storage: Quota <80%, no data loss
    - [ ] Retry: Exponential backoff works, user notified
    - [ ] Conflicts: Resolution UI works, data preserved
    - [ ] Preview: Real-time progress shown
    - [ ] Timeout: 30-second limit, graceful degradation
    - [ ] Cleanup: Old data removed, storage bounded
  - Ensure all preservation requirements still met (3.1-3.7)
  - Ask user if questions arise before marking complete