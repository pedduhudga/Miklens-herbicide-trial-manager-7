# Bugfix Requirements Document

## Introduction

This document defines requirements for comprehensive improvements to the Herbicide Trial Manager app. The upgrade addresses critical performance issues, enhances reporting capabilities, improves data storage and statistical analysis, fixes Firebase/Google Sheets sync reliability, and resolves Google Drive photo upload problems. These improvements are essential to ensure the app can handle larger datasets, provide better analytical capabilities, and maintain reliable data synchronization across platforms.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN any state item changes in the global app state (useAppState) THEN all components consuming the context re-render unnecessarily, causing UI freezing on data-heavy operations

1.2 WHEN statistical calculations (ANOVA, Tukey HSD, dose-response) are performed THEN they execute on the main JavaScript thread, blocking the UI and causing unresponsive behavior with large datasets

1.3 WHEN photos are captured or loaded THEN full-resolution base64 images are stored in memory without compression, causing memory exhaustion on devices with many photos

1.4 WHEN lists with more than 50 items are displayed (trials, projects, observations) THEN all items are rendered simultaneously without virtualization, causing slow scrolling and memory issues

1.5 WHEN the sheet mirror queue exceeds localStorage quota THEN data synchronization fails silently and mirror writes are lost

1.6 WHEN Google Drive photo uploads encounter network errors THEN there is no retry mechanism or resume capability, resulting in orphaned photos not attached to trials

1.7 WHEN Firebase and Google Sheets are both enabled THEN there is no conflict resolution strategy for bidirectional data changes, leading to data inconsistencies

1.8 WHEN users generate advanced reports THEN there is no real-time preview capability, forcing users to wait for full generation to see results

1.9 WHEN large trial datasets are processed for statistical analysis THEN the calculations timeout or crash the browser due to unlimited computational load

1.10 WHEN offline mode is used extensively THEN IndexedDB storage grows unbounded without cleanup, eventually causing storage quota errors

### Expected Behavior (Correct)

2.1 WHEN any state item changes THEN the system SHALL use memoized selectors to ensure only components dependent on changed data re-render, maintaining 60fps UI performance

2.2 WHEN statistical calculations are performed THEN the system SHALL execute them in a Web Worker thread to prevent UI blocking, with progress updates and cancellation support

2.3 WHEN photos are captured THEN the system SHALL automatically compress images to maximum dimension of 600px at 70% JPEG quality before storing, reducing memory footprint by ~90%

2.4 WHEN lists with more than 20 items are displayed THEN the system SHALL use virtualization (windowing) to render only visible items plus a small overscan buffer

2.5 WHEN sheet mirror queue approaches localStorage quota THEN the system SHALL proactively prune completed items and warn users about pending sync items at risk

2.6 WHEN Google Drive photo uploads fail THEN the system SHALL implement exponential backoff retry (3 attempts minimum), queue failed uploads for later, and provide clear error feedback

2.7 WHEN Firebase and Google Sheets detect conflicting changes THEN the system SHALL present a conflict resolution UI allowing users to choose which version to keep

2.8 WHEN users generate advanced reports THEN the system SHALL provide real-time preview of each section as it is generated, with the ability to cancel or modify before final export

2.9 WHEN large datasets trigger statistical analysis THEN the system SHALL implement timeout protection (30 second max), chunked processing, and graceful degradation to simpler statistics if needed

2.10 WHEN offline storage reaches 80% of quota THEN the system SHALL automatically clean up old cached photos and sync completed items to cloud storage

### Unchanged Behavior (Regression Prevention)

3.1 WHEN users with viewer role access the app THEN the system SHALL CONTINUE TO enforce read-only permissions and disable all download/modify actions

3.2 WHEN Firebase is the primary data provider THEN the system SHALL CONTINUE TO support real-time synchronization and offline-first capabilities

3.3 WHEN existing trial data is present THEN the system SHALL CONTINUE TO preserve all fields including PhotoURLs, EfficacyDataJSON, and custom observation fields

3.4 WHEN advanced report generation is executed THEN the system SHALL CONTINUE TO produce the 11-sheet Excel format with ANOVA tables and AI narratives

3.5 WHEN users perform bulk operations on trials THEN the system SHALL CONTINUE TO show progress indicators and allow cancellation

3.6 WHEN the app initializes with saved settings THEN the system SHALL CONTINUE TO auto-initialize Firebase from stored configuration

3.7 WHEN category (herbicide, fungicide, etc.) is selected THEN the system SHALL CONTINUE TO apply the correct observation field configurations and primary metrics

---

## Bug Condition Derivation

Based on the requirements above, the following bug conditions and properties are derived:

### Bug Condition Functions

```pascal
FUNCTION isPerformanceIssue(state)
  INPUT: state of type AppState
  OUTPUT: boolean
  
  // Returns true when performance issues are present
  RETURN state.trials.length > 50 OR 
         state.photoQueue.length > 10 OR
         hasUnmemoizedContextConsumers(state)
END FUNCTION

FUNCTION isStatisticalHeavyOperation(dataset)
  INPUT: dataset of type TrialDataset
  OUTPUT: boolean
  
  // Returns true when dataset requires heavy statistical processing
  RETURN dataset.observations.length > 100 OR
         dataset.treatmentCount > 10 OR
         dataset.replicationCount > 4
END FUNCTION

FUNCTION isPhotoMemoryIssue(trial)
  INPUT: trial of type Trial
  OUTPUT: boolean
  
  // Returns true when trial contains uncompressed photos
  photos ← safeJsonParse(trial.PhotoURLs, [])
  RETURN photos EXISTS p WHERE p.fileData.length > 500000  // >500KB indicates uncompressed
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
  
  // Returns true when sync item has failed multiple times
  RETURN syncItem.attempts >= 3 OR
         (syncItem.action = 'photoUpload' AND syncItem.status = 'failed')
END FUNCTION
```

### Property Specifications

```pascal
// Property: Fix Checking - Performance Optimization
FOR ALL state WHERE isPerformanceIssue(state) DO
  result ← optimizeStateManagement(state)
  ASSERT result.reRenderCount < originalReRenderCount * 0.1
  ASSERT result.uiFrameRate >= 55  // 60fps target, allow some margin
END FOR

// Property: Fix Checking - Statistical Calculations in Worker
FOR ALL dataset WHERE isStatisticalHeavyOperation(dataset) DO
  result ← calculateStatsInWorker(dataset)
  ASSERT result.completedWithoutUIBlock = true
  ASSERT result.timeoutNotExceeded = true
END FOR

// Property: Fix Checking - Photo Compression
FOR ALL trial WHERE isPhotoMemoryIssue(trial) DO
  result ← compressTrialPhotos(trial)
  ASSERT result.maxPhotoSize <= 150000  // <150KB after compression
  ASSERT result.originalAspectRatioPreserved = true
END FOR

// Property: Fix Checking - Storage Quota Management
FOR ALL context WHERE isStorageQuotaRisk() DO
  result ← manageStorageQuota(context)
  ASSERT result.quotaUsage < 0.8
  ASSERT result.pendingSyncItemsPreserved = true
END FOR

// Property: Fix Checking - Sync Reliability
FOR ALL item WHERE isSyncReliabilityIssue(item) DO
  result ← improveSyncReliability(item)
  ASSERT result.retryWithBackoff = true
  ASSERT result.userNotifiedOfFailure = true
END FOR

// Property: Preservation Checking - Non-Performance Issues
FOR ALL state WHERE NOT isPerformanceIssue(state) DO
  originalBehavior ← state.currentBehavior
  optimizedBehavior ← optimizeStateManagement(state)
  ASSERT optimizedBehavior = originalBehavior
END FOR
```

### Key Definitions

- **F**: Original unoptimized functions (state management, stats calculations, photo handling, sync)
- **F'**: Optimized fixed functions with memoization, web workers, compression, and retry logic
- **C(X)**: Bug condition functions that identify inputs triggering performance or reliability issues
- **P(result)**: Properties defining expected correct behavior after fixes
- **¬C(X)**: Inputs that do not trigger bugs - behavior must be preserved exactly