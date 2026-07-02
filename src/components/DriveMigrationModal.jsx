import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  HardDriveDownload, FolderSync, CheckCircle, AlertTriangle, Copy,
  ChevronRight, Loader2, Shield, ArrowRight, Image as ImageIcon,
  X, RefreshCw, Eye, FolderOpen, CloudUpload, Info, Download,
  ExternalLink, ChevronDown, ChevronUp, FileText
} from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { getDriveFileId, resolvePhotoSrc } from '../utils/photoUtils.js';

// ─── Apps Script code that admin must add to their Code.gs ─────────────────
const APPS_SCRIPT_CODE = `
/**
 * migrateDrivePhotos — Copy all files from one Drive folder to another.
 * Preserves subfolder structure. Returns { oldId → newId } mapping.
 * Add this function to your Code.gs file.
 */
function migrateDrivePhotos(payload) {
  var sourceFolderId = payload.sourceFolderId;
  var targetFolderId = payload.targetFolderId;
  
  if (!sourceFolderId || !targetFolderId) {
    return { status: 'error', message: 'Source and target folder IDs are required.' };
  }
  
  try {
    var sourceFolder = DriveApp.getFolderById(sourceFolderId);
    var targetFolder = DriveApp.getFolderById(targetFolderId);
  } catch (e) {
    return { status: 'error', message: 'Cannot access folders: ' + e.message };
  }
  
  var mapping = {};
  var fileCount = 0;
  var errorCount = 0;
  var errors = [];
  
  function copyFolder(source, target) {
    // Copy all files
    var files = source.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      try {
        var newFile = file.makeCopy(file.getName(), target);
        // Make new file publicly viewable (same as original photo sharing)
        try { newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e2) {}
        mapping[file.getId()] = newFile.getId();
        fileCount++;
      } catch (e) {
        errorCount++;
        errors.push({ file: file.getName(), error: e.message });
      }
    }
    
    // Recurse into subfolders
    var subfolders = source.getFolders();
    while (subfolders.hasNext()) {
      var subfolder = subfolders.next();
      var newSubfolder;
      
      // Check if subfolder already exists in target
      var existingFolders = target.getFoldersByName(subfolder.getName());
      if (existingFolders.hasNext()) {
        newSubfolder = existingFolders.next();
      } else {
        newSubfolder = target.createFolder(subfolder.getName());
      }
      
      copyFolder(subfolder, newSubfolder);
    }
  }
  
  copyFolder(sourceFolder, targetFolder);
  
  return {
    status: 'success',
    mapping: mapping,
    fileCount: fileCount,
    errorCount: errorCount,
    errors: errors.slice(0, 20) // Limit error details
  };
}

// Add this to your handleRequest function's switch/if-else:
// case 'migrateDrivePhotos': return migrateDrivePhotos(payload);
`.trim();

// ─── Helper: extract folder ID from a URL or raw ID ──────────────────────
function extractFolderId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  // Already a raw ID (25+ alphanumeric chars)
  if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) return trimmed;
  // Extract from URL
  const m = trimmed.match(/[-\w]{25,}/);
  return m ? m[0] : null;
}

// ─── Helper: count photos across all trials ──────────────────────────────
function analyzeTrialPhotos(trials) {
  let totalPhotos = 0;
  let trialsWithPhotos = 0;
  let drivePhotoIds = new Set();
  let nonDrivePhotos = 0;

  for (const trial of trials) {
    const photos = safeJsonParse(trial.PhotoURLs, []);
    const weedPhotos = safeJsonParse(trial.WeedPhotosJSON, []);
    const allPhotos = [...photos, ...weedPhotos];

    if (allPhotos.length > 0) trialsWithPhotos++;
    totalPhotos += allPhotos.length;

    for (const p of allPhotos) {
      const src = resolvePhotoSrc(p);
      if (!src) continue;
      const driveId = getDriveFileId(src);
      if (driveId) {
        drivePhotoIds.add(driveId);
      } else if (typeof src === 'string' && src.startsWith('http')) {
        nonDrivePhotos++;
      }
    }
  }

  return {
    totalPhotos,
    trialsWithPhotos,
    uniqueDriveFiles: drivePhotoIds.size,
    nonDrivePhotos,
    drivePhotoIds: [...drivePhotoIds]
  };
}

// ─── Helper: rewrite photo URLs using an ID mapping ──────────────────────
function rewritePhotoArray(jsonStr, idMapping) {
  const photos = safeJsonParse(jsonStr, []);
  if (!photos.length) return { json: jsonStr, rewritten: 0 };

  let rewritten = 0;
  const updated = photos.map(p => {
    if (!p || typeof p !== 'object') return p;
    const copy = { ...p };

    // Rewrite url/src/fileUrl/photoUrl fields
    for (const field of ['url', 'src', 'fileUrl', 'photoUrl']) {
      if (typeof copy[field] === 'string') {
        const oldId = getDriveFileId(copy[field]);
        if (oldId && idMapping[oldId]) {
          copy[field] = copy[field].replace(oldId, idMapping[oldId]);
          rewritten++;
        }
      }
    }

    // Rewrite driveId/fileId/driveFileId fields
    for (const field of ['driveId', 'fileId', 'driveFileId']) {
      if (typeof copy[field] === 'string' && idMapping[copy[field]]) {
        copy[field] = idMapping[copy[field]];
        rewritten++;
      }
    }

    return copy;
  });

  return { json: JSON.stringify(updated), rewritten };
}

// ─── Stepper Steps ───────────────────────────────────────────────────────
const STEPS = [
  { id: 'preflight', label: 'Pre-flight Check', icon: Eye },
  { id: 'script',    label: 'Apps Script Setup', icon: FileText },
  { id: 'target',    label: 'Target Folder', icon: FolderOpen },
  { id: 'migrate',   label: 'Copy Files', icon: CloudUpload },
  { id: 'rewrite',   label: 'Update Records', icon: RefreshCw },
  { id: 'verify',    label: 'Verify & Finish', icon: CheckCircle },
];

export default function DriveMigrationModal({ isOpen, onClose, state, updateSettings, getAppState, toast }) {
  const [step, setStep] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [targetFolderInput, setTargetFolderInput] = useState('');
  const [scriptCopied, setScriptCopied] = useState(false);
  const [scriptConfirmed, setScriptConfirmed] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteResult, setRewriteResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [showScriptCode, setShowScriptCode] = useState(false);
  const [migrationLog, setMigrationLog] = useState([]);
  const logRef = useRef(null);

  const s = state?.settings || {};
  const trials = state?.trials || [];
  const currentFolderId = extractFolderId(s.folderId);
  const targetFolderId = extractFolderId(targetFolderInput);

  // ── Step 0: Run pre-flight analysis ──
  useEffect(() => {
    if (isOpen && !analysis) {
      const result = analyzeTrialPhotos(trials);
      setAnalysis(result);
    }
  }, [isOpen, trials, analysis]);

  const addLog = useCallback((msg, type = 'info') => {
    setMigrationLog(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString() }]);
    setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }), 50);
  }, []);

  // ── Step 3: Execute migration (copy files via client-side batching) ──
  const executeMigration = useCallback(async () => {
    if (!currentFolderId || !targetFolderId) return;
    setMigrating(true);
    setMigrationLog([]);
    addLog('Starting Google Drive file migration...');
    addLog(`Source folder: ${currentFolderId}`);
    addLog(`Target folder: ${targetFolderId}`);

    try {
      const { apiCall } = await import('../services/dataLayer.js');

      addLog('Fetching list of all files in source folder recursively...');
      const fileListRes = await apiCall('listAllFilesRecursive', {
        sourceFolderId: currentFolderId
      }, false, getAppState);

      if (fileListRes?._errType || fileListRes?.status === 'error') {
        const errMsg = fileListRes?.message || 'Failed to list source files';
        addLog(`Error: ${errMsg}`, 'error');
        toast?.(`Failed listing files: ${errMsg}`, 'error');
        setMigrating(false);
        return;
      }

      const filesToMigrate = fileListRes.files || [];
      const totalFiles = filesToMigrate.length;
      addLog(`Found ${totalFiles} files to migrate.`, 'success');
      addLog('Beginning copy process with real-time logging. Please keep this tab open...');

      let mapping = {};
      let copiedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      // Process files in batches of 12 parallel requests to stay fast and avoid rate limits
      const batchSize = 12;
      for (let i = 0; i < totalFiles; i += batchSize) {
        const batch = filesToMigrate.slice(i, i + batchSize);
        const batchPromises = batch.map(async (file, idx) => {
          const globalIndex = i + idx + 1;
          try {
            const res = await apiCall('copySingleFile', {
              fileId: file.id,
              targetFolderId: targetFolderId,
              path: file.path,
              name: file.name
            }, false, getAppState);

            if (res?.status === 'success') {
              mapping[file.id] = res.newId;
              copiedCount++;
              addLog(`[${globalIndex}/${totalFiles}] Copied: ${file.name}`, 'success');
            } else if (res?.status === 'skipped') {
              mapping[file.id] = res.newId;
              skippedCount++;
              addLog(`[${globalIndex}/${totalFiles}] Skipped (exists): ${file.name}`, 'info');
            } else {
              errorCount++;
              addLog(`[${globalIndex}/${totalFiles}] Failed: ${file.name} - ${res?.message || 'Unknown error'}`, 'error');
            }
          } catch (err) {
            errorCount++;
            addLog(`[${globalIndex}/${totalFiles}] Exception: ${file.name} - ${err.message}`, 'error');
          }
        });

        // Wait for this small batch to complete before launching the next one
        await Promise.all(batchPromises);
      }

      addLog(`----------------------------------------`);
      addLog(`✓ Drive migration complete!`, 'success');
      addLog(`Total files processed: ${totalFiles}`);
      addLog(`  → Newly Copied: ${copiedCount}`);
      addLog(`  → Skipped (already exists): ${skippedCount}`);
      if (errorCount > 0) addLog(`  → Errors: ${errorCount}`, 'warning');

      setMigrationResult({ mapping, copiedCount: Object.keys(mapping).length, errorCount });
      addLog('File copy/mapping verification complete. Ready to update trial records.');
      setStep(4);
    } catch (err) {
      addLog(`Critical error: ${err.message}`, 'error');
      toast?.(`Migration error: ${err.message}`, 'error');
    } finally {
      setMigrating(false);
    }
  }, [currentFolderId, targetFolderId, analysis, getAppState, addLog, toast]);

  // ── Step 4: Rewrite photo URLs in all trial records ──
  const executeRewrite = useCallback(async () => {
    if (!migrationResult?.mapping) return;
    setRewriting(true);
    const mapping = migrationResult.mapping;
    addLog(`Rewriting photo URLs using ${Object.keys(mapping).length} ID mappings...`);

    let totalRewritten = 0;
    let trialsUpdated = 0;
    let errors = 0;

    try {
      const { updateTrial } = await import('../services/dataLayer.js');

      for (const trial of trials) {
        const photoResult = rewritePhotoArray(trial.PhotoURLs, mapping);
        const weedResult = rewritePhotoArray(trial.WeedPhotosJSON, mapping);

        if (photoResult.rewritten > 0 || weedResult.rewritten > 0) {
          const updatePayload = { ID: trial.ID };
          if (photoResult.rewritten > 0) updatePayload.PhotoURLs = photoResult.json;
          if (weedResult.rewritten > 0) updatePayload.WeedPhotosJSON = weedResult.json;

          try {
            await updateTrial(updatePayload, getAppState);
            totalRewritten += photoResult.rewritten + weedResult.rewritten;
            trialsUpdated++;
            addLog(`  Updated trial "${trial.FormulationName || trial.ID}" (${photoResult.rewritten + weedResult.rewritten} links)`, 'success');
          } catch (err) {
            errors++;
            addLog(`  Failed to update trial "${trial.FormulationName || trial.ID}": ${err.message}`, 'error');
          }
        }
      }

      addLog(`Rewrite complete: ${totalRewritten} photo links updated in ${trialsUpdated} trials`, 'success');
      if (errors > 0) addLog(`${errors} trial updates failed`, 'warning');

      // Update the folder ID in settings
      if (targetFolderId) {
        updateSettings({ folderId: targetFolderId });
        addLog(`Settings updated: new folder ID = ${targetFolderId}`, 'success');
      }

      setRewriteResult({ totalRewritten, trialsUpdated, errors });
      setStep(5);
    } catch (err) {
      addLog(`Critical error during rewrite: ${err.message}`, 'error');
      toast?.(`Rewrite error: ${err.message}`, 'error');
    } finally {
      setRewriting(false);
    }
  }, [migrationResult, trials, getAppState, targetFolderId, updateSettings, addLog, toast]);

  // ── Step 5: Verify a sample of photos load from the new Drive ──
  const executeVerify = useCallback(async () => {
    setVerifying(true);
    addLog('Verifying sample photos from new Drive...');

    const sampleSize = Math.min(5, analysis?.drivePhotoIds?.length || 0);
    if (sampleSize === 0) {
      addLog('No photos to verify.', 'warning');
      setVerifyResult({ checked: 0, passed: 0, failed: 0 });
      setVerifying(false);
      return;
    }

    const mapping = migrationResult?.mapping || {};
    const sampleIds = analysis.drivePhotoIds.slice(0, sampleSize);
    let passed = 0;
    let failed = 0;

    for (const oldId of sampleIds) {
      const newId = mapping[oldId];
      if (!newId) {
        addLog(`  ? Old ID ${oldId.substring(0, 12)}... has no mapping - skipped`, 'warning');
        continue;
      }
      const thumbUrl = `https://drive.google.com/thumbnail?id=${newId}&sz=w100`;
      try {
        const img = new window.Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = thumbUrl;
          setTimeout(reject, 8000);
        });
        passed++;
        addLog(`  Photo ${newId.substring(0, 12)}... loads OK`, 'success');
      } catch {
        failed++;
        addLog(`  Photo ${newId.substring(0, 12)}... failed to load`, 'error');
      }
    }

    setVerifyResult({ checked: sampleSize, passed, failed });
    addLog(`Verification done: ${passed}/${sampleSize} passed`, passed === sampleSize ? 'success' : 'warning');
    setVerifying(false);
  }, [analysis, migrationResult, addLog]);

  // ── Copy script to clipboard ──
  const handleCopyScript = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      setScriptCopied(true);
      toast?.('Apps Script code copied to clipboard!', 'success');
      setTimeout(() => setScriptCopied(false), 3000);
    } catch {
      toast?.('Failed to copy - please select and copy manually', 'error');
    }
  }, [toast]);

  // ── Download migration mapping as JSON backup ──
  const downloadMapping = useCallback(() => {
    if (!migrationResult?.mapping) return;
    const data = {
      timestamp: new Date().toISOString(),
      sourceFolderId: currentFolderId,
      targetFolderId: targetFolderId,
      mapping: migrationResult.mapping,
      copiedCount: migrationResult.copiedCount
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drive-migration-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [migrationResult, currentFolderId, targetFolderId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
         onClick={(e) => e.target === e.currentTarget && !migrating && !rewriting && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <FolderSync className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Google Drive Migration</h2>
              <p className="text-sm text-white/70">Move photos to a new Drive account safely</p>
            </div>
          </div>
          {!migrating && !rewriting && (
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 px-5 py-3 bg-slate-50 border-b overflow-x-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <React.Fragment key={s.id}>
                {i > 0 && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive ? 'bg-indigo-100 text-indigo-700' :
                  isDone ? 'text-emerald-600' : 'text-slate-400'
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* ── Step 0: Pre-flight ── */}
          {step === 0 && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-800 text-sm">Safe, Non-destructive Migration</h3>
                  <p className="text-xs text-blue-700 mt-1">
                    Files are <strong>copied</strong> to the new folder &mdash; nothing is deleted from the old folder. 
                    You can revert at any time by changing the folder ID back.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Current Folder" value={currentFolderId ? `...${currentFolderId.slice(-8)}` : 'Not set'} icon={FolderOpen} color="slate" />
                <StatCard label="Total Photos" value={analysis?.totalPhotos || 0} icon={ImageIcon} color="purple" />
                <StatCard label="Trials with Photos" value={analysis?.trialsWithPhotos || 0} icon={FileText} color="blue" />
                <StatCard label="Unique Drive Files" value={analysis?.uniqueDriveFiles || 0} icon={HardDriveDownload} color="emerald" />
              </div>

              {!currentFolderId && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    <strong>No folder ID configured.</strong> Set your current Drive Photo Folder in Settings before migrating.
                  </p>
                </div>
              )}

              {analysis?.nonDrivePhotos > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-xs text-slate-600">
                    <Info className="w-3.5 h-3.5 inline mr-1" />
                    {analysis.nonDrivePhotos} photo(s) are external URLs (not Google Drive) &mdash; these will not need migration.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── Step 1: Apps Script Setup ── */}
          {step === 1 && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h3 className="font-semibold text-amber-800 text-sm mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> One-time Setup Required
                </h3>
                <p className="text-xs text-amber-700 mb-3">
                  The migration function is already included in your updated <code>Google sheet webapp script.txt</code>. 
                  You just need to copy the updated script to your Apps Script project and redeploy.
                </p>
                
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setShowScriptCode(!showScriptCode)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-300 transition"
                  >
                    {showScriptCode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {showScriptCode ? 'Hide Migration Code' : 'View Migration Code'}
                  </button>
                </div>

                {showScriptCode && (
                  <pre className="bg-slate-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto font-mono">
                    {APPS_SCRIPT_CODE}
                  </pre>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="font-semibold text-slate-800 text-sm">Steps:</h4>
                <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside">
                  <li>Open your Google Apps Script project</li>
                  <li>Replace the entire <code>Code.gs</code> with the latest <code>Google sheet webapp script.txt</code> from your project</li>
                  <li>Click <strong>Deploy &rarr; Manage deployments &rarr; Edit (pencil icon) &rarr; New version</strong></li>
                  <li>Click <strong>Deploy</strong> to update your web app</li>
                  <li>Come back here and confirm</li>
                </ol>
              </div>

              <label className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl cursor-pointer hover:bg-emerald-100 transition">
                <input
                  type="checkbox"
                  checked={scriptConfirmed}
                  onChange={(e) => setScriptConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600"
                />
                <span className="text-sm font-medium text-emerald-800">
                  I have updated my Apps Script with the latest code and redeployed
                </span>
              </label>
            </>
          )}

          {/* ── Step 2: Target Folder ── */}
          {step === 2 && (
            <>
              <div className="space-y-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-1">Current Drive Folder</h4>
                  <p className="text-xs text-slate-500 font-mono">{currentFolderId || 'Not configured'}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    New Drive Folder URL or ID
                  </label>
                  <input
                    type="text"
                    value={targetFolderInput}
                    onChange={(e) => setTargetFolderInput(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/... or folder ID"
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none transition"
                  />
                  {targetFolderInput && (
                    <p className="mt-2 text-xs">
                      {targetFolderId ? (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Folder ID: <code className="font-mono">{targetFolderId}</code>
                        </span>
                      ) : (
                        <span className="text-red-500 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Could not extract a valid folder ID
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {targetFolderId && targetFolderId === currentFolderId && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      Target folder is the same as the current folder. Please use a different folder.
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-blue-800 mb-2">How to create a new Drive folder:</h4>
                <ol className="text-xs text-blue-700 space-y-1.5 list-decimal list-inside">
                  <li>Go to <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer" className="underline">drive.google.com</a> (on the new account)</li>
                  <li>Create a new folder (e.g., &quot;Trial Photos&quot;)</li>
                  <li>Right-click &rarr; Share &rarr; Change to &quot;Anyone with the link can view&quot;</li>
                  <li>Copy the folder URL and paste it above</li>
                  <li><strong>Important:</strong> Share this folder with the Apps Script service account email if different accounts</li>
                </ol>
              </div>
            </>
          )}

          {/* ── Step 3: Migrate (Copy) ── */}
          {step === 3 && (
            <>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <h3 className="font-semibold text-indigo-800 text-sm mb-2 flex items-center gap-2">
                  <CloudUpload className="w-4 h-4" /> Ready to Copy Files
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs text-indigo-700 mt-3">
                  <div><strong>From:</strong> <code className="font-mono text-[10px]">{currentFolderId}</code></div>
                  <div><strong>To:</strong> <code className="font-mono text-[10px]">{targetFolderId}</code></div>
                  <div><strong>Files to copy:</strong> ~{analysis?.uniqueDriveFiles || 0}</div>
                  <div><strong>Trials affected:</strong> {analysis?.trialsWithPhotos || 0}</div>
                </div>
              </div>

              {!migrating && !migrationResult && (
                <button
                  onClick={executeMigration}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-sm hover:from-indigo-700 hover:to-purple-700 transition flex items-center justify-center gap-2"
                >
                  <FolderSync className="w-5 h-5" /> Start File Migration
                </button>
              )}

              {migrating && (
                <div className="flex items-center justify-center gap-3 py-4">
                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  <span className="text-sm font-semibold text-indigo-700">
                    Copying files... This may take several minutes for large folders.
                  </span>
                </div>
              )}

              {/* Migration Log */}
              {migrationLog.length > 0 && (
                <div ref={logRef} className="bg-slate-900 rounded-xl p-4 max-h-56 overflow-y-auto font-mono text-xs space-y-1">
                  {migrationLog.map((log, i) => (
                    <div key={i} className={`${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warning' ? 'text-amber-400' :
                      log.type === 'success' ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
                      <span className="text-slate-500">[{log.time}]</span> {log.msg}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Step 4: Rewrite URLs ── */}
          {step === 4 && (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <h3 className="font-semibold text-emerald-800 text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Files Copied Successfully
                </h3>
                <p className="text-xs text-emerald-700 mt-1">
                  {migrationResult?.copiedCount || 0} files copied. Now updating all trial records to use the new Drive file IDs.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={downloadMapping}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-300 transition"
                >
                  <Download className="w-4 h-4" /> Download Backup Mapping
                </button>
              </div>

              {!rewriting && !rewriteResult && (
                <button
                  onClick={executeRewrite}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold text-sm hover:from-emerald-700 hover:to-teal-700 transition flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-5 h-5" /> Update All Trial Photo Links
                </button>
              )}

              {rewriting && (
                <div className="flex items-center justify-center gap-3 py-4">
                  <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                  <span className="text-sm font-semibold text-emerald-700">
                    Rewriting photo URLs in trial records...
                  </span>
                </div>
              )}

              {migrationLog.length > 0 && (
                <div ref={logRef} className="bg-slate-900 rounded-xl p-4 max-h-56 overflow-y-auto font-mono text-xs space-y-1">
                  {migrationLog.map((log, i) => (
                    <div key={i} className={`${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warning' ? 'text-amber-400' :
                      log.type === 'success' ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
                      <span className="text-slate-500">[{log.time}]</span> {log.msg}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Step 5: Verify & Finish ── */}
          {step === 5 && (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <h3 className="font-semibold text-emerald-800 text-sm flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" /> Migration Complete!
                </h3>
                <div className="grid grid-cols-3 gap-4 mt-3 text-center">
                  <div className="bg-white rounded-lg p-3 border border-emerald-100">
                    <p className="text-2xl font-bold text-emerald-600">{migrationResult?.copiedCount || 0}</p>
                    <p className="text-xs text-slate-600">Files Copied</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-emerald-100">
                    <p className="text-2xl font-bold text-indigo-600">{rewriteResult?.totalRewritten || 0}</p>
                    <p className="text-xs text-slate-600">Links Updated</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-emerald-100">
                    <p className="text-2xl font-bold text-blue-600">{rewriteResult?.trialsUpdated || 0}</p>
                    <p className="text-xs text-slate-600">Trials Modified</p>
                  </div>
                </div>
              </div>

              {!verifyResult && (
                <button
                  onClick={executeVerify}
                  disabled={verifying}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-sm hover:from-blue-700 hover:to-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {verifying ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Verifying photos...</>
                  ) : (
                    <><Eye className="w-5 h-5" /> Verify Sample Photos</>
                  )}
                </button>
              )}

              {verifyResult && (
                <div className={`rounded-xl p-4 border ${
                  verifyResult.failed > 0 
                    ? 'bg-amber-50 border-amber-200' 
                    : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <p className="text-sm font-semibold">
                    {verifyResult.failed === 0 ? 'All sample photos verified!' : `${verifyResult.failed} of ${verifyResult.checked} photos failed to load`}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {verifyResult.passed}/{verifyResult.checked} photos loaded successfully from the new Drive.
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={downloadMapping}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-300 transition"
                >
                  <Download className="w-4 h-4" /> Save Backup Mapping
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
                >
                  <CheckCircle className="w-4 h-4" /> Done
                </button>
              </div>

              {migrationLog.length > 0 && (
                <div ref={logRef} className="bg-slate-900 rounded-xl p-4 max-h-40 overflow-y-auto font-mono text-xs space-y-1">
                  {migrationLog.map((log, i) => (
                    <div key={i} className={`${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warning' ? 'text-amber-400' :
                      log.type === 'success' ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
                      <span className="text-slate-500">[{log.time}]</span> {log.msg}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="border-t px-5 py-3 flex items-center justify-between bg-slate-50">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0 || migrating || rewriting}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            &larr; Back
          </button>
          <span className="text-xs text-slate-400">
            Step {step + 1} of {STEPS.length}
          </span>
          {step < 3 && (
            <button
              onClick={() => setStep(step + 1)}
              disabled={
                (step === 0 && !currentFolderId) ||
                (step === 1 && !scriptConfirmed) ||
                (step === 2 && (!targetFolderId || targetFolderId === currentFolderId))
              }
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center gap-1"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {step >= 3 && step < 5 && (
            <span className="text-xs text-slate-400 italic">Follow the instructions above</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stat Card sub-component ──
function StatCard({ label, value, icon: Icon, color }) {
  const colors = {
    slate: 'bg-slate-50 border-slate-200 text-slate-600',
    purple: 'bg-purple-50 border-purple-200 text-purple-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-600',
  };
  return (
    <div className={`rounded-xl border p-3 text-center ${colors[color] || colors.slate}`}>
      <Icon className="w-5 h-5 mx-auto mb-1 opacity-70" />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</p>
    </div>
  );
}
