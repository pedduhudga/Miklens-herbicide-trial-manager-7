import React, { useState, useRef, useCallback } from "react";
import {
  Camera,
  Sprout,
  Image,
  FileText,
  X,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  Repeat2,
  FlipHorizontal2,
  Loader2,
  QrCode,
  ChevronRight,
  Clock,
  MapPin,
  FlaskConical,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import QRScanner from "../components/QRScanner.jsx";
import TopBar from "../components/TopBar.jsx";
import { useAppState } from "../hooks/useAppState.jsx";
import CameraCapture from "../components/CameraCapture.jsx";
import CropperModal from "../components/CropperModal.jsx";
import {
  uploadPhoto as uploadPhotoToDrive,
  updateTrial,
} from "../services/dataLayer.js";
import { getCategoryConfig, getPrimaryObservationField, getObservationPrimaryValue } from "../utils/categoryConfig.js";
import { compressImage } from "../utils/imageCompression.js";
import { toDatetimeLocal, formatDateTime, calculateDAA } from "../utils/dateUtils.js";
import { safeJsonParse } from "../utils/helpers.js";
import { resolvePhotoSrc, getDriveFileId } from "../utils/photoUtils.js";
import { validateEfficacyData } from "../utils/analysisUtils.js";
import { analyzePhoto, generateTextWithAI } from "../services/multiProviderAI.js";

function parseQrData(raw) {
  if (!raw) return null;
  const str = raw.trim();
  // Try JSON first (structured QR)
  try {
    const obj = JSON.parse(str);
    return { type: "json", data: obj };
  } catch {
    /* not json */
  }

  // Check if it's a URL (App URL or Google Apps Script URL)
  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      // Handle Google Apps Script URL format: scriptUrl?trialId=ID&spreadsheetId=ID
      if (str.includes('trialId=')) {
        const urlObj = new URL(str);
        const trialId = urlObj.searchParams.get('trialId');
        if (trialId) {
          return { type: "id", data: trialId };
        }
      }
      // Handle route-based URL format: https://domain.app/#/live/ID or https://domain.app/#live/ID or /live/ID
      const liveMatch = str.match(/live\/([a-zA-Z0-9_-]+)/);
      if (liveMatch) {
        return { type: "id", data: liveMatch[1] };
      }
    } catch (e) {
      console.warn("Failed to parse QR URL:", e);
    }
  }

  // Handle offline plain-text trial QR
  if (str.includes('MIKLENS-TRIAL') || str.includes('ID:')) {
    const match = str.match(/ID:([^\s\n]+)/);
    if (match && match[1]) {
      return { type: "id", data: match[1].trim() };
    }
  }

  // Plain trial ID
  return { type: "id", data: str };
}

function resolveTrialFromQr(parsed, trials) {
  if (!parsed || !trials?.length) return null;
  if (parsed.type === "json") {
    const d = parsed.data;
    // match by ID, or fall back to FormulationName+Date
    return (
      trials.find(
        (t) =>
          (d.ID && String(t.ID) === String(d.ID)) ||
          (d.id && String(t.ID) === String(d.id)) ||
          (d.FormulationName &&
            t.FormulationName === d.FormulationName &&
            d.Date &&
            t.Date === d.Date),
      ) || null
    );
  }
  // plain id (coerce to string to prevent numeric/string type mismatches)
  return trials.find((t) => String(t.ID) === String(parsed.data)) || null;
}

function formatDate(str) {
  if (!str) return "—";
  try {
    return new Date(str).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return str;
  }
}

// ─── Quick-Action Modal ────────────────────────────────────────────────────────

function QuickActionModal({ trial, rawQr, onClose, onAction, activeCategory = 'herbicide' }) {
  if (!trial && !rawQr) return null;

  const categoryId = trial?.Category || activeCategory;
  const catConfig = getCategoryConfig(categoryId);
  const targetField = catConfig.targetField || 'WeedSpecies';
  const targetVal = trial ? (trial[targetField] || trial.WeedSpecies || trial.DiseaseTarget || trial.PestTarget || trial.NutrientType || trial.BiostimulantType) : '';

  const actions = [
    {
      id: "camera",
      label: "Add Photo",
      sub: "Capture general trial image",
      icon: <Camera className="w-6 h-6" />,
      bg: "bg-blue-50 hover:bg-blue-100 border-blue-200",
      iconBg: "bg-blue-500",
    },
    {
      id: "weed",
      label: categoryId === 'herbicide' ? "Identify Weeds" : categoryId === 'fungicide' ? "Identify Diseases" : categoryId === 'pesticide' ? "Identify Pests" : "Analyze Health & Vigor",
      sub: `AI ${catConfig.name} Analysis`,
      icon: <Sprout className="w-6 h-6" />,
      bg: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200",
      iconBg: "bg-emerald-500",
    },
    {
      id: "gallery",
      label: "Upload from Gallery",
      sub: "Pick from device",
      icon: <Image className="w-6 h-6" />,
      bg: "bg-purple-50 hover:bg-purple-100 border-purple-200",
      iconBg: "bg-purple-500",
    },
    {
      id: "details",
      label: "View Details",
      sub: "Full trial data & history",
      icon: <FileText className="w-6 h-6" />,
      bg: "bg-slate-50 hover:bg-slate-100 border-slate-200",
      iconBg: "bg-slate-500",
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-emerald-50">
          <h3 className="font-bold text-lg text-emerald-800">
            {trial ? "Trial Found" : "QR Scanned"}
          </h3>
          <p className="text-xs text-emerald-600 mt-0.5">
            {trial
              ? "Select an action for this plot"
              : "No matching trial — raw data shown"}
          </p>
        </div>

        {/* Trial info */}
        {trial ? (
          <div className="px-5 py-3 bg-white border-b text-sm space-y-1.5">
            <div className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
              <FlaskConical className="w-4 h-4 text-emerald-500 shrink-0" />
              {trial.FormulationName || "Unknown Treatment"}
            </div>
            <div className="flex gap-4 text-slate-500 flex-wrap">
              {trial.InvestigatorName && (
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> {trial.InvestigatorName}
                </span>
              )}
              {trial.Date && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {formatDate(trial.Date)}
                </span>
              )}
              {trial.Location && (
                <span className="flex items-center gap-1 truncate max-w-[160px]">
                  <MapPin className="w-3.5 h-3.5" /> {trial.Location}
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap text-xs pt-0.5">
              {trial.Dosage && (
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {trial.Dosage}
                </span>
              )}
              {targetVal && (
                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full truncate max-w-[180px]">
                  {targetVal}
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded-full ${trial.IsCompleted ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-700"}`}
              >
                {trial.IsCompleted ? "Completed" : "Ongoing"}
              </span>
            </div>
          </div>
        ) : (
          <div className="px-5 py-3 bg-amber-50 border-b text-xs text-amber-800 font-mono break-all">
            {rawQr}
          </div>
        )}

        {/* Action buttons */}
        <div className="p-4 grid grid-cols-1 gap-3">
          {actions.map((a) => (
            <button
              key={a.id}
              onClick={() => onAction(a.id, trial)}
              disabled={!trial && a.id !== "details"}
              className={`flex items-center gap-4 p-4 border rounded-xl transition group disabled:opacity-40 disabled:cursor-not-allowed ${a.bg}`}
            >
              <div
                className={`${a.iconBg} text-white p-2.5 rounded-full shadow-md group-hover:scale-110 transition-transform shrink-0`}
              >
                {a.icon}
              </div>
              <div className="text-left">
                <span className="block font-bold text-gray-800">{a.label}</span>
                <span className="block text-xs text-gray-500">{a.sub}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 ml-auto shrink-0" />
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-slate-50 flex justify-center">
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 text-sm font-medium px-4 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// CameraModal removed in favor of standard CameraCapture component

// ─── Scan History Item ─────────────────────────────────────────────────────────

function ScanHistoryItem({ item, onRescan }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
      <div
        className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${item.matched ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}
      >
        {item.matched ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <AlertTriangle className="w-4 h-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm truncate">
          {item.trialName || item.raw}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{item.time}</p>
        {item.action && (
          <span className="inline-block mt-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {item.action}
          </span>
        )}
      </div>
      <button
        onClick={() => onRescan(item)}
        className="text-slate-400 hover:text-emerald-600 p-1"
      >
        <Repeat2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main PlotScanner Page ─────────────────────────────────────────────────────

export default function PlotScanner({ onMenuClick }) {
  const { state, getAppState, updateState } = useAppState();
  const navigate = useNavigate();
  const galleryInputRef = useRef(null);

  const activeCategory = state.activeCategory || 'herbicide';
  const catConfig = getCategoryConfig(activeCategory);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [quickModal, setQuickModal] = useState(null); // { trial, raw }
  const [cameraModal, setCameraModal] = useState(null); // { mode, trialId }
  const [history, setHistory] = useState([]);
  const [uploadStatus, setUploadStatus] = useState(null); // { msg, type }
  const [pendingPhotoSetup, setPendingPhotoSetup] = useState(null); // { dataUrl, mimeType, trialId, mode, date, tag, label }
  const pendingGalleryTrialRef = useRef(null);
  const pendingGalleryModeRef = useRef("general");

  // Cropper modal state variables
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropSource, setCropSource] = useState(null);
  const cropCallbackRef = useRef(null);

  const openCropperFor = (dataUrl, callback) => {
    setCropSource(dataUrl);
    cropCallbackRef.current = callback;
    setCropperOpen(true);
  };

  const handleCropComplete = (croppedUrl) => {
    setCropperOpen(false);
    setCropSource(null);
    if (cropCallbackRef.current) {
      cropCallbackRef.current(croppedUrl);
      cropCallbackRef.current = null;
    }
  };

  // ── Scan result handler ───────────────────────────────────────────────────
  const handleScan = useCallback(
    (raw) => {
      setScannerOpen(false);
      const parsed = parseQrData(raw);
      const trial = resolveTrialFromQr(parsed, state.trials);
      const now = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      setHistory((prev) => [
        {
          raw,
          trialName: trial?.FormulationName || null,
          matched: !!trial,
          time: now,
          action: null,
          trialId: trial?.ID || null,
        },
        ...prev.slice(0, 9),
      ]);

      setQuickModal({ trial, raw });
    },
    [state.trials],
  );

  // ── Quick action handler ──────────────────────────────────────────────────
  const handleAction = useCallback(
    (actionId, trial) => {
      setQuickModal(null);

      if (actionId === "details") {
        if (trial) {
          navigate("/trials");
          window.dispatchEvent(
            new CustomEvent("app:openTrial", { detail: { id: trial.ID } }),
          );
        }
        return;
      }

      if (!trial) return;

      if (actionId === "camera") {
        setCameraModal({ mode: "general", trialId: trial.ID });
        return;
      }
      if (actionId === "weed") {
        setCameraModal({ mode: "weed", trialId: trial.ID });
        return;
      }
      if (actionId === "gallery") {
        pendingGalleryTrialRef.current = trial.ID;
        pendingGalleryModeRef.current = "general";
        galleryInputRef.current?.click();
        return;
      }
    },
    [navigate],
  );

  const updatePhotoAiStatus = useCallback(async (trialId, photoSrc, status, errorMsg = '', aiData = null, photoKey = 'PhotoURLs') => {
    const currentTrials = getAppState().trials || [];
    const trial = currentTrials.find(t => t.ID === trialId);
    if (!trial) return;
    const photos = safeJsonParse(trial[photoKey], []);
    const updatedPhotos = photos.map(p => {
      const src = resolvePhotoSrc(p);
      if (src === photoSrc || p.tempId === photoSrc) {
        const updated = { ...p, aiStatus: status, aiError: errorMsg };
        if (aiData) {
          updated.aiData = aiData;
        }
        return updated;
      }
      return p;
    });
    const patch = { ID: trial.ID, [photoKey]: JSON.stringify(updatedPhotos) };
    const updatedTrial = { ...trial, ...patch };
    updateState({ trials: currentTrials.map(t => t.ID === trialId ? updatedTrial : t) });
    try {
      await updateTrial(patch, getAppState);
    } catch (e) {
      console.error('Failed to update photo AI status:', e);
    }
  }, [getAppState, updateState]);

  const createObservationFromAI = async (trial, daa, aiData, obsDate = null, photoUrl = null, weatherData = null) => {
    const latestTrial = getAppState().trials.find(t => t.ID === trial.ID) || trial;
    const trialCat = latestTrial.Category || activeCategory;
    const catConfig = getCategoryConfig(trialCat);
    const efficacyData = validateEfficacyData(safeJsonParse(latestTrial.EfficacyDataJSON, []), trialCat);

    const getNormalizedTargetName = (name) => {
      if (!name) return 'Unknown';
      const clean = name.trim().toLowerCase();
      if (clean.includes('leafminer') || clean.includes('leaf miner') || clean.includes('leaf mining')) {
        return 'Leafminer Damage';
      }
      if (clean.includes('plant vigor') || clean.includes('general vigor') || clean.includes('visual vigor')) {
        return 'General Plant Vigor';
      }
      if (clean.includes('plant health') || clean.includes('general plant health')) {
        return 'General Plant Health';
      }
      if (clean.includes('leaf health') || clean.includes('general leaf health')) {
        return 'General Leaf Health';
      }
      if (clean.includes('foliage') || clean.includes('general foliage')) {
        return 'General Foliage';
      }
      if (clean.includes('vegetative development') || clean.includes('vegetative growth')) {
        return 'General Vegetative Development';
      }
      return name.replace(/\b\w/g, c => c.toUpperCase());
    };

    // Normalize target details list
    const isHerbicide = trialCat === 'herbicide';
    const aiTargetsList = isHerbicide ? (aiData.weeds || []) : (aiData.targets || []);
    
    const isDetectedVal = (coverVal, statusStr) => {
      const s = String(statusStr || '').toLowerCase();
      return s !== 'not detected' && s !== 'absent' && parseFloat(coverVal || 0) > 0;
    };

    const normalizedWeeds = aiTargetsList.map(w => {
      let rawStatus = String(w.status || '').trim();
      if (!isHerbicide && (rawStatus === 'Unaffected' || !rawStatus)) {
        rawStatus = 'Healthy';
      }
      const rawSpecies = w.species || w.name || 'Unknown';
      const cleanSpecies = isHerbicide ? rawSpecies : getNormalizedTargetName(rawSpecies);
      
      // Stage-appropriate metrics (Growth-Stage Filtering)
      const isReproductiveMetric = ['fruit count', 'marketable yield', 'unmarketable yield'].includes(cleanSpecies.toLowerCase());
      let isEarlyStage = false;
      const bbchVal = aiData.bbchStage || '';
      const m = bbchVal.match(/BBCH\s*(\d+)/i);
      const bbchNum = m ? parseInt(m[1], 10) : null;
      if (bbchNum !== null) {
        if (bbchNum < 60) isEarlyStage = true;
      } else if (Number(daa) < 30) {
        isEarlyStage = true;
      }

      if (!isHerbicide && isReproductiveMetric && isEarlyStage) {
        return {
          species: cleanSpecies,
          cover: 0,
          status: 'N/A',
          growthStage: '',
          notes: 'Not applicable at early growth stage',
          confidence: null,
          detectedCount: 0,
          incidence: 0.0
        };
      }

      const coverVal = typeof w.cover === 'number' ? w.cover : parseFloat(w.cover || w.value || 0);
      const det = isDetectedVal(coverVal, rawStatus) ? 1 : 0;
      return {
        species: cleanSpecies,
        cover: coverVal,
        status: rawStatus,
        growthStage: String(w.growthStage || '').trim(),
        notes: String(w.notes || '').trim(),
        confidence: w.confidence !== undefined ? parseInt(w.confidence, 10) : null,
        detectedCount: det,
        incidence: det ? 100.0 : 0.0
      };
    });

    // Calculate primary values
    const primaryObsField = getPrimaryObservationField(trialCat);
    let primaryValue = 0;
    
    if (isHerbicide) {
      primaryValue = typeof aiData.totalWeedCover === 'number'
        ? aiData.totalWeedCover
        : normalizedWeeds.reduce((sum, w) => sum + (w.cover || 0), 0);
    } else {
      if (aiData.metrics && typeof aiData.metrics[primaryObsField] === 'number') {
        primaryValue = aiData.metrics[primaryObsField];
      } else if (aiData.metrics && aiData.metrics[primaryObsField] !== undefined) {
        primaryValue = parseFloat(aiData.metrics[primaryObsField] || 0);
      } else {
        primaryValue = normalizedWeeds.reduce((sum, w) => sum + (w.cover || 0), 0);
      }
    }

    const deduplicateText = (existingText, newText) => {
      if (!existingText) return newText || '';
      if (!newText) return existingText || '';
      const splitSentences = (txt) => {
        return txt.split(/[.|;\n]/).map(s => s.trim()).filter(s => s.length > 5);
      };
      const getWordSet = (str) => new Set(str.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").split(/\s+/).filter(Boolean));
      const getSimilarity = (s1, s2) => {
        const set1 = getWordSet(s1);
        const set2 = getWordSet(s2);
        if (set1.size === 0 || set2.size === 0) return 0;
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        return intersection.size / Math.min(set1.size, set2.size);
      };
      
      const existingParts = splitSentences(existingText);
      const newParts = splitSentences(newText);
      const combined = [...existingParts];
      newParts.forEach(part => {
        const words = part.split(/\s+/).filter(Boolean).length;
        const threshold = words < 10 || part.length < 50 ? 0.75 : 0.65;
        const isDuplicate = combined.some(existingPart => {
          const sim = getSimilarity(existingPart, part);
          return sim > threshold;
        });
        if (!isDuplicate) {
          combined.push(part);
        }
      });
      return combined.join('. ') + (combined.length > 0 && !combined[combined.length - 1].endsWith('.') ? '.' : '');
    };

    const aiNotes = [];
    if (aiData.efficacyAssessment || aiData.overallAssessment) aiNotes.push(aiData.efficacyAssessment || aiData.overallAssessment);
    if (aiData.notes) aiNotes.push(aiData.notes);

    let cleanNotes = aiNotes.length > 0 ? deduplicateText('', aiNotes.join('. ')) : `AI-analyzed on ${formatDateTime(new Date())}`;
    let cleanEfficacy = aiData.efficacyAssessment || aiData.overallAssessment || '';

    if (Number(daa) > 0) {
      const rxDaa = new RegExp(`\\b(at|on|for|from|during)\\s+daa\\s*0\\b`, 'gi');
      const rxDay = new RegExp(`\\b(at|on|for|from|during)\\s+day\\s*0\\b`, 'gi');
      cleanNotes = cleanNotes.replace(rxDaa, `$1 DAA ${daa}`).replace(rxDay, `$1 Day ${daa}`);
      cleanEfficacy = cleanEfficacy.replace(rxDaa, `$1 DAA ${daa}`).replace(rxDay, `$1 Day ${daa}`);
      
      cleanNotes = cleanNotes.replace(/\bDAA\s*0\b/g, `DAA ${daa}`).replace(/\bDay\s*0\b/g, `Day ${daa}`);
      cleanEfficacy = cleanEfficacy.replace(/\bDAA\s*0\b/g, `DAA ${daa}`).replace(/\bDay\s*0\b/g, `Day ${daa}`);
    }

    const newObs = {
      date: obsDate || toDatetimeLocal(new Date()),
      daa: Number(daa),
      [primaryObsField]: primaryValue,
      weedCover: isHerbicide ? primaryValue : null,
      weedDetails: normalizedWeeds.length > 0 ? normalizedWeeds : [{ species: isHerbicide ? 'No weeds detected' : 'No targets detected', cover: 0, status: '', notes: aiData.notes || 'AI-analyzed', confidence: null, detectedCount: 0, incidence: 0.0 }],
      notes: cleanNotes,
      aiConfidence: aiData.confidence || 'MEDIUM',
      aiEfficacyAssessment: cleanEfficacy,
      competitionLevel: aiData.competitionLevel || '',
      status: 'Analyzed',
      source: 'AI',
      photoUrl: photoUrl || '',
      bbchStage: aiData.bbchStage || '',
      ...(weatherData ? {
        weatherTemp: weatherData.temp,
        weatherHumidity: weatherData.hum,
        weatherWind: weatherData.wind,
        weatherRain: weatherData.rain
      } : {})
    };

    // Save all dynamic metrics fields directly into the observation
    if (aiData.metrics && typeof aiData.metrics === 'object') {
      Object.entries(aiData.metrics).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') return;
        const num = parseFloat(v);
        if (!isNaN(num)) {
          newObs[k] = num;
        }
      });
    }

    const existingIdx = efficacyData.findIndex(o => Number(o.daa) === Number(daa));
    if (existingIdx >= 0) {
      const existing = efficacyData[existingIdx];
      const count = Number(existing.sampleCount || 1);
      
      const existingPrimaryValue = parseFloat(existing[primaryObsField] ?? 0) || 0;
      const mergedPrimaryValue = parseFloat(((existingPrimaryValue * count) + primaryValue) / (count + 1));
      
      const mergedObs = {
        ...existing,
        sampleCount: count + 1,
        [primaryObsField]: Number(mergedPrimaryValue.toFixed(2)),
      };
      if (primaryObsField === 'weedCover') {
        mergedObs.weedCover = Number(mergedPrimaryValue.toFixed(2));
      } else {
        mergedObs.weedCover = existing.weedCover ?? null;
      }

      // Average all dynamic metrics
      if (aiData.metrics && typeof aiData.metrics === 'object') {
        Object.entries(aiData.metrics).forEach(([k, v]) => {
          if (v === null || v === undefined || v === '') return;
          const num = parseFloat(v);
          if (!isNaN(num)) {
            const oldVal = parseFloat(existing[k]);
            if (!isNaN(oldVal)) {
              mergedObs[k] = Number((((oldVal * count) + num) / (count + 1)).toFixed(2));
            } else {
              mergedObs[k] = num;
            }
          }
        });
      }

      // Synthesize notes with AI
      if (newObs.notes || existing.notes) {
        const combined = [existing.notes, newObs.notes].filter(Boolean).join(' | ');
        try {
          const prompt = `You are a professional agricultural scientist.
We are merging observations from multiple plant scans/samples at DAA ${daa} for Treatment: ${latestTrial.FormulationName || latestTrial.FormulationId || 'Unknown'} (Category: ${trialCat}, Crop: ${latestTrial.CropCrop || latestTrial.Crop || 'Crop'}).
Here are the plant-level raw notes:
${combined}

Please synthesize these raw notes into a single, cohesive, publication-grade scientific summary of 1-2 sentences.
Rules:
1. Deduplicate similar observations.
2. Reconcile any contradictions.
3. Keep it strictly factual, professional, and concise. Do NOT give advice, recommendations, or monitoring schedules.
4. Do NOT include markdown headers or bullet points.`;
          
          const synth = await generateTextWithAI(prompt, 'You are a professional agronomist.');
          if (synth && synth.trim()) {
            mergedObs.notes = synth.trim();
          } else {
            mergedObs.notes = deduplicateText(existing.notes, newObs.notes);
          }
        } catch (e) {
          console.warn('Failed to synthesize notes:', e);
          mergedObs.notes = deduplicateText(existing.notes, newObs.notes);
        }
      }

      // Synthesize efficacy assessment with AI
      if (newObs.aiEfficacyAssessment || existing.aiEfficacyAssessment) {
        const combined = [existing.aiEfficacyAssessment, newObs.aiEfficacyAssessment].filter(Boolean).join(' | ');
        try {
          const prompt = `You are a professional agricultural scientist.
We are merging observations from multiple plant scans/samples at DAA ${daa} for Treatment: ${latestTrial.FormulationName || latestTrial.FormulationId || 'Unknown'} (Category: ${trialCat}, Crop: ${latestTrial.CropCrop || latestTrial.Crop || 'Crop'}).
Here are the plant-level efficacy assessments:
${combined}

Please synthesize these assessments into a single, cohesive, publication-grade scientific summary of 1-2 sentences.
Rules:
1. Deduplicate similar observations.
2. Reconcile any contradictions.
3. Keep it strictly factual, professional, and concise. Do NOT give advice, recommendations, or monitoring schedules.
4. Do NOT include markdown headers or bullet points.`;
          
          const synth = await generateTextWithAI(prompt, 'You are a professional agronomist.');
          if (synth && synth.trim()) {
            mergedObs.aiEfficacyAssessment = synth.trim();
          } else {
            mergedObs.aiEfficacyAssessment = deduplicateText(existing.aiEfficacyAssessment, newObs.aiEfficacyAssessment);
          }
        } catch (e) {
          console.warn('Failed to synthesize efficacy assessment:', e);
          mergedObs.aiEfficacyAssessment = deduplicateText(existing.aiEfficacyAssessment, newObs.aiEfficacyAssessment);
        }
      }

      // Merge photoUrls (comma separated list)
      if (photoUrl) {
        const urls = existing.photoUrl ? existing.photoUrl.split(',').map(u => u.trim()).filter(Boolean) : [];
        if (!urls.includes(photoUrl)) {
          urls.push(photoUrl);
        }
        mergedObs.photoUrl = urls.join(', ');
      }

      // Merge targets/weeds details list with clean normalization match
      const mergedWeedDetails = [...(existing.weedDetails || [])];
      normalizedWeeds.forEach(newW => {
        const matchIdx = mergedWeedDetails.findIndex(w => {
          const wName = getNormalizedTargetName(w.species || w.name).toLowerCase();
          const newName = getNormalizedTargetName(newW.species || newW.name).toLowerCase();
          return wName === newName;
        });
        if (matchIdx >= 0) {
          const oldW = mergedWeedDetails[matchIdx];
          const oldConf = oldW.confidence !== undefined && oldW.confidence !== null ? parseFloat(oldW.confidence) : null;
          const newConf = newW.confidence !== undefined && newW.confidence !== null ? parseFloat(newW.confidence) : null;
          let mergedConf = null;
          if (oldConf !== null && newConf !== null) {
            mergedConf = Math.round(((oldConf * count) + newConf) / (count + 1));
          } else {
            mergedConf = newConf !== null ? newConf : oldConf;
          }
          
          const oldDetCount = oldW.detectedCount !== undefined ? parseInt(oldW.detectedCount, 10) : (isDetectedVal(oldW.cover || 0, oldW.status) ? count : 0);
          const newDetCount = isDetectedVal(newW.cover, newW.status) ? 1 : 0;
          const mergedDetCount = oldDetCount + newDetCount;
          const mergedIncidence = parseFloat((mergedDetCount / (count + 1) * 100).toFixed(1));

          mergedWeedDetails[matchIdx] = {
            ...oldW,
            species: getNormalizedTargetName(oldW.species || oldW.name),
            status: newW.status === 'N/A' || oldW.status === 'N/A' ? 'N/A' : (newW.status || oldW.status),
            cover: newW.status === 'N/A' || oldW.status === 'N/A' ? 0 : Number((((parseFloat(oldW.cover || 0) * count) + newW.cover) / (count + 1)).toFixed(2)),
            confidence: newW.status === 'N/A' || oldW.status === 'N/A' ? null : mergedConf,
            detectedCount: mergedDetCount,
            incidence: mergedIncidence,
            notes: deduplicateText(oldW.notes, newW.notes)
          };
        } else {
          const det = isDetectedVal(newW.cover, newW.status) ? 1 : 0;
          mergedWeedDetails.push({
            ...newW,
            species: getNormalizedTargetName(newW.species || newW.name),
            detectedCount: det,
            incidence: parseFloat((det / (count + 1) * 100).toFixed(1))
          });
        }
      });
      mergedObs.weedDetails = mergedWeedDetails;

      efficacyData[existingIdx] = mergedObs;
    } else {
      newObs.sampleCount = 1;
      efficacyData.push(newObs);
    }
    efficacyData.sort((a, b) => a.daa - b.daa);

    // Calculate Result rating dynamically based on remaining severity/cover
    let resultRating = 'Unrated';
    if (efficacyData.length > 0) {
      const latestObs = [...efficacyData].sort((a, b) => (parseFloat(b.daa) || 0) - (parseFloat(a.daa) || 0))[0];
      const val = Number(getObservationPrimaryValue(trialCat, latestObs) ?? 0);
      
      if (trialCat === 'nutrition' || trialCat === 'biostimulant') {
        const firstObs = [...efficacyData].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0))[0];
        const baseVal = getObservationPrimaryValue(trialCat, firstObs) || 1;
        const pctImprovement = ((val / baseVal) - 1) * 100;
        if (pctImprovement >= 15) {
          resultRating = 'Excellent';
        } else if (pctImprovement >= 8) {
          resultRating = 'Good';
        } else if (pctImprovement >= 3) {
          resultRating = 'Fair';
        } else {
          resultRating = 'Poor';
        }
      } else {
        if (val <= 10) {
          resultRating = 'Excellent';
        } else if (val <= 25) {
          resultRating = 'Good';
        } else if (val <= 50) {
          resultRating = 'Fair';
        } else {
          resultRating = 'Poor';
        }
      }
    }

    const targetField = catConfig.targetField || 'WeedSpecies';
    const targetsString = normalizedWeeds.length > 0 ? normalizedWeeds.map(w => w.species).join(', ') : 'None detected';

    const updated = {
      ...latestTrial,
      EfficacyDataJSON: JSON.stringify(efficacyData),
      Result: resultRating,
      [targetField]: targetsString,
      ...(isHerbicide ? { WeedSpecies: targetsString } : {}),
      ...(Number(daa) === 0 ? {
        ApplicationTiming: latestTrial.ApplicationTiming || aiData.applicationTiming || '',
        WeedGrowthStage: latestTrial.WeedGrowthStage || aiData.overallWeedGrowthStage || ''
      } : {})
    };

    updateState({ trials: getAppState().trials.map(t => t.ID === updated.ID ? updated : t) });

    const patch = {
      ID: latestTrial.ID,
      EfficacyDataJSON: updated.EfficacyDataJSON,
      Result: updated.Result,
      [targetField]: updated[targetField],
      ...(isHerbicide ? { WeedSpecies: updated.WeedSpecies } : {}),
      ...(Number(daa) === 0 ? {
        ApplicationTiming: updated.ApplicationTiming,
        WeedGrowthStage: updated.WeedGrowthStage
      } : {})
    };

    try {
      await updateTrial(patch, getAppState);
    } catch (e) {
      console.error('Failed to save AI observation:', e);
    }
  };

  // ── Photo upload (add to trial state + queue sync) ────────────────────────
  const handlePhotoUpload = useCallback(
    async (dataUrl, mimeType, trialId, mode, customDate, customTag, customLabel) => {
      setUploadStatus({ msg: "Saving photo…", type: "info" });
      
      let finalDataUrl = dataUrl;
      let finalMimeType = mimeType;
      try {
        finalDataUrl = await compressImage(dataUrl, 1920, 0.95);
        finalMimeType = 'image/jpeg';
      } catch (err) {
        console.warn("Failed to compress image, using original", err);
      }

      const appState = getAppState();
      const trial = appState.trials?.find((t) => t.ID === trialId);
      if (!trial) {
        setUploadStatus({ msg: "Trial not found.", type: "error" });
        setTimeout(() => setUploadStatus(null), 3000);
        return;
      }

      const isWeed = mode === "weed";
      // YYYY-MM-DD date format
      const photoDate = customDate ? customDate.split("T")[0] : new Date().toISOString().split("T")[0];
      const photoLabel = customLabel || (isWeed ? "Weed Photo" : "Field Observation");
      const photoTagValue = customTag || (isWeed ? "Weed Photo" : "Whole Canopy");
      const photoKey = isWeed ? "WeedPhotosJSON" : "PhotoURLs";
      const existing = (() => {
        try {
          return JSON.parse(trial[photoKey] || "[]");
        } catch {
          return [];
        }
      })();
      const tempId = `scan_${Date.now()}`;
      const optimisticEntry = {
        tempId,
        fileData: finalDataUrl,
        mimeType: finalMimeType,
        date: photoDate,
        label: photoLabel,
        tag: photoTagValue,
        aiStatus: 'pending'
      };

      const optimisticList = [...existing, optimisticEntry];
      const optimisticTrial = {
        ...trial,
        [photoKey]: JSON.stringify(optimisticList),
      };
      updateState({
        trials: (appState.trials || []).map((t) =>
          t.ID === trialId ? optimisticTrial : t,
        ),
      });

      try {
        const driveResult = await uploadPhotoToDrive(
          {
            trialId,
            fileData: finalDataUrl,
            mimeType: finalMimeType,
            fileName: `scan_${trialId}_${Date.now()}.jpg`,
            isWeed,
            label: photoLabel,
            date: photoDate,
            tag: photoTagValue,
          },
          getAppState,
        );

        if (driveResult?._errType)
          throw new Error(driveResult.message || "Upload failed");

        const driveUrl = driveResult?.url || driveResult?.fileUrl || null;
        const finalEntry = driveUrl
          ? { url: driveUrl, driveId: driveResult?.id || getDriveFileId(driveUrl), date: photoDate, label: photoLabel, tag: photoTagValue, identifications: [], aiStatus: 'pending' }
          : { fileData: finalDataUrl, mimeType: finalMimeType, date: photoDate, label: photoLabel, tag: photoTagValue, identifications: [], aiStatus: 'pending' };
        const finalList = existing.concat(finalEntry);
        const persistedTrial = {
          ...trial,
          [photoKey]: JSON.stringify(finalList),
        };

        updateState({
          trials: (getAppState().trials || []).map((t) =>
            t.ID === trialId ? persistedTrial : t,
          ),
        });
        await updateTrial(
          { ID: trialId, [photoKey]: persistedTrial[photoKey] },
          getAppState,
        );

        setUploadStatus({
          msg: `Photo saved. Starting AI analysis...`,
          type: "info",
        });

        // Calculate Days After Application (DAA)
        const daa = calculateDAA(photoDate, trial.Date);

        // Fetch weather conditions
        const fetchWeatherForPhoto = async (lat, lon) => {
          try {
            const today = new Date().toISOString().split('T')[0];
            let wUrl;
            if (photoDate < today) {
              wUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${photoDate}&end_date=${photoDate}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`;
            } else {
              wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`;
            }
            const wr = await fetch(wUrl);
            const wd = await wr.json();
            let temp, hum, wind, rain;
            if (photoDate < today && wd.hourly) {
              const midday = wd.hourly.time?.findIndex(t => t.includes('T12:')) ?? 6;
              const idx = midday >= 0 ? midday : 6;
              temp = wd.hourly.temperature_2m?.[idx];
              hum = wd.hourly.relative_humidity_2m?.[idx];
              wind = wd.hourly.wind_speed_10m?.[idx];
              rain = wd.hourly.precipitation?.[idx];
            } else if (wd.current) {
              temp = wd.current.temperature_2m;
              hum = wd.current.relative_humidity_2m;
              wind = wd.current.wind_speed_10m;
              rain = wd.current.precipitation;
            }
            return { temp, hum, wind, rain };
          } catch(we) {
            console.warn('Weather fetch failed:', we.message);
            return null;
          }
        };

        let weatherInfo = null;
        if (trial.Lat && trial.Lon) {
          weatherInfo = await fetchWeatherForPhoto(trial.Lat, trial.Lon);
        } else if (navigator.geolocation) {
          weatherInfo = await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              async (pos) => {
                const res = await fetchWeatherForPhoto(pos.coords.latitude.toFixed(8), pos.coords.longitude.toFixed(8));
                resolve(res);
              },
              () => {
                console.warn('Geolocation denied — weather not fetched');
                resolve(null);
              },
              {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
              }
            );
          });
        }

        // Run Gemini AI analysis
        await updatePhotoAiStatus(trial.ID, driveUrl || finalDataUrl, 'processing', '', null, photoKey);
        const result = await analyzePhoto(finalDataUrl, {
          treatment: trial.FormulationName,
          daa,
          rep: trial.Replication || 1,
          category: trial.Category || activeCategory,
          photoTag: photoTagValue
        }, (msg) => {
          setUploadStatus({ msg, type: "info" });
        });

        if (result.success) {
          await createObservationFromAI(trial, daa, result.data, photoDate, driveUrl || finalDataUrl, weatherInfo);
          await updatePhotoAiStatus(trial.ID, driveUrl || finalDataUrl, 'completed', '', result.data, photoKey);
          
          setUploadStatus({
            msg: `AI complete! Logged observation at DAA ${daa}`,
            type: "success",
          });
          setHistory((prev) =>
            prev.map((h, i) =>
              i === 0
                ? { ...h, action: `AI observation logged (DAA ${daa})` }
                : h,
            ),
          );
        } else {
          await updatePhotoAiStatus(trial.ID, driveUrl || finalDataUrl, 'failed', result.error || 'AI analysis skipped', null, photoKey);
          setUploadStatus({
            msg: `Photo saved, but AI analysis skipped: ${result.error}`,
            type: "warning",
          });
        }
      } catch (err) {
        console.error("Photo upload/analysis error:", err);
        setUploadStatus({
          msg: `Error saving or analyzing photo: ${err.message}`,
          type: "error",
        });
      }
      setTimeout(() => setUploadStatus(null), 5000);
    },
    [getAppState, updateState, activeCategory, updatePhotoAiStatus, createObservationFromAI],
  );

  // ── Camera capture callback ───────────────────────────────────────────────
  const handleCapture = useCallback(
    async (dataUrl, mode) => {
      const { trialId } = cameraModal || {};
      setCameraModal(null);
      if (!trialId) return;

      const defaultLabel = mode === 'weed' ? 'Weed Photo' : 'Field Observation';
      openCropperFor(dataUrl, (croppedUrl) => {
        setPendingPhotoSetup({
          dataUrl: croppedUrl,
          mimeType: "image/jpeg",
          trialId,
          mode,
          date: toDatetimeLocal(new Date()),
          tag: "",
          label: defaultLabel
        });
      });
    },
    [cameraModal],
  );

  // ── Gallery selection ─────────────────────────────────────────────────────
  const handleGalleryChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      const trialId = pendingGalleryTrialRef.current;
      const mode = pendingGalleryModeRef.current || "general";
      if (!trialId) return;

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const defaultLabel = mode === 'weed' ? 'Weed Photo' : 'Field Observation';
        openCropperFor(ev.target.result, (croppedUrl) => {
          setPendingPhotoSetup({
            dataUrl: croppedUrl,
            mimeType: "image/jpeg",
            trialId,
            mode,
            date: toDatetimeLocal(new Date()),
            tag: "",
            label: defaultLabel
          });
        });
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  const handleRescan = useCallback(
    (item) => {
      if (item.trialId) {
        const trial = state.trials.find((t) => t.ID === item.trialId);
        setQuickModal({ trial: trial || null, raw: item.raw });
      } else {
        setScannerOpen(true);
      }
    },
    [state.trials],
  );

  const recentCount = history.filter((h) => h.matched).length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TopBar title="Plot Scanner" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto bg-slate-50">
        {/* Upload status toast */}
        {uploadStatus && (
          <div
            className={`mx-4 mt-3 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 shadow
            ${
              uploadStatus.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : uploadStatus.type === "warning"
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : uploadStatus.type === "error"
                    ? "bg-red-50 text-red-800 border border-red-200"
                    : "bg-blue-50 text-blue-800 border border-blue-200"
            }`}
          >
            {uploadStatus.type === "success" && (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            {uploadStatus.type === "info" && (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
            )}
            {uploadStatus.type === "warning" && (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            {uploadStatus.msg}
          </div>
        )}

        {/* Hero scan card */}
        <div className="p-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <QrCode className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-1">
              Plot Scanner
            </h2>
            <p className="text-sm text-slate-500 mb-6 max-w-xs">
              Scan QR codes on field plots to instantly add photos, identify
              weeds, or view trial data.
            </p>

            <button
              onClick={() => setScannerOpen(true)}
              className="w-full max-w-xs py-4 rounded-xl font-bold text-white text-base flex items-center justify-center gap-2 shadow-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-95 transition-all"
            >
              <ScanLine className="w-5 h-5" />
              Open Camera Scanner
            </button>

            {recentCount > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                {recentCount} trial{recentCount !== 1 ? "s" : ""} scanned this
                session
              </p>
            )}
          </div>
        </div>

        {/* Quick-tip info cards */}
        <div className="px-4 grid grid-cols-2 gap-3 mb-4">
          {[
            {
              icon: <Camera className="w-5 h-5 text-blue-500" />,
              bg: "bg-blue-50",
              title: "Add Photo",
              desc: "Capture trial images instantly after scanning",
            },
            {
              icon: <Sprout className="w-5 h-5 text-emerald-500" />,
              bg: "bg-emerald-50",
              title: (state.activeCategory || 'herbicide') === 'herbicide' ? "Weed ID" : (state.activeCategory || 'herbicide') === 'fungicide' ? "Disease ID" : (state.activeCategory || 'herbicide') === 'pesticide' ? "Pest ID" : "Plant Health",
              desc: (state.activeCategory || 'herbicide') === 'herbicide' ? "AI-powered weed identification from photo" : (state.activeCategory || 'herbicide') === 'fungicide' ? "AI-powered disease identification from photo" : (state.activeCategory || 'herbicide') === 'pesticide' ? "AI-powered pest identification from photo" : "AI-powered plant health and vigor analysis",
            },
            {
              icon: <Image className="w-5 h-5 text-purple-500" />,
              bg: "bg-purple-50",
              title: "Gallery",
              desc: "Upload existing photos from your device",
            },
            {
              icon: <FileText className="w-5 h-5 text-slate-500" />,
              bg: "bg-slate-50",
              title: "View Details",
              desc: "Open full trial data and history",
            },
          ].map((c, i) => (
            <div
              key={i}
              className={`${c.bg} rounded-xl p-3 border border-slate-100`}
            >
              <div className="mb-1">{c.icon}</div>
              <p className="font-semibold text-slate-700 text-sm">{c.title}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                {c.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Scan history */}
        {history.length > 0 && (
          <div className="px-4 mb-6">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">
              Recent Scans
            </h3>
            <div className="space-y-2">
              {history.map((item, i) => (
                <ScanHistoryItem key={i} item={item} onRescan={handleRescan} />
              ))}
            </div>
          </div>
        )}

        {/* Empty history placeholder */}
        {history.length === 0 && (
          <div className="px-4 mb-6">
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
              <FlipHorizontal2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">
                No scans yet this session
              </p>
              <p className="text-slate-400 text-xs mt-1">
                Tap the button above to scan your first plot
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Hidden gallery file input */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleGalleryChange}
      />

      {/* QR Scanner overlay */}
      <QRScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        continuous={false}
      />

      {/* Quick Action Modal */}
      {quickModal && (
        <QuickActionModal
          trial={quickModal.trial}
          rawQr={quickModal.raw}
          onClose={() => setQuickModal(null)}
          onAction={handleAction}
          activeCategory={state.activeCategory || 'herbicide'}
        />
      )}

      {/* Camera Modal for photo capture */}
      {cameraModal && (
        <CameraCapture
          onCapture={(dataUrl) => handleCapture(dataUrl, cameraModal.mode)}
          onClose={() => setCameraModal(null)}
          initialAspectRatio="3:4"
        />
      )}

      {/* Cropper Modal */}
      <CropperModal
        isOpen={cropperOpen}
        imageSrc={cropSource}
        onClose={() => {
          setCropperOpen(false);
          setCropSource(null);
          cropCallbackRef.current = null;
        }}
        onCropComplete={handleCropComplete}
      />

      {/* Photo Details Setup Modal */}
      {pendingPhotoSetup && (() => {
        const targetTrial = state.trials?.find(t => t.ID === pendingPhotoSetup.trialId);
        const proj = state.projects?.find(p => String(p.ID) === String(targetTrial?.ProjectID));
        const isPotTrial = (targetTrial?.TrialDesign === 'PotTrial') || (proj?.Design === 'PotTrial');
        
        const SCIENTIFIC_FOCUS_TAGS = [
          { value: 'Whole Canopy (Standard)', label: 'Whole Canopy (Standard)', hint: 'Hold the camera parallel to the ground to avoid perspective bias for ground cover.' },
          { value: 'Leaf Close-up (Top / Adaxial)', label: 'Leaf Close-up (Top / Adaxial)', hint: 'Ensure leaf is centered and in focus. Avoid casting shadows.' },
          { value: 'Leaf Close-up (Underside / Abaxial)', label: 'Leaf Close-up (Underside / Abaxial)', hint: 'Turn the leaf over to check for rust, spores, eggs, or pests.' },
          { value: 'Leaf Close-up (New Growth)', label: 'Leaf Close-up (New Growth)', hint: 'Capture young leaves at the top of the plant to detect immobile deficiencies.' },
          { value: 'Leaf Close-up (Old Growth)', label: 'Leaf Close-up (Old Growth)', hint: 'Capture mature leaves near the bottom to detect mobile deficiencies.' },
          { value: 'Stem / Meristem Close-up', label: 'Stem / Meristem Close-up', hint: 'Focus directly on stems or node junctions.' },
          { value: 'Fruit / Produce Close-up', label: 'Fruit / Produce Close-up', hint: 'Focus closely on fruit/produce.' }
        ];

        const defaultTag = isPotTrial ? 'Plant 1 (Pot A) - Whole Canopy (Standard)' : 'Whole Canopy (Standard)';
        const currentTag = pendingPhotoSetup.tag || defaultTag;

        return (
          <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  Photo details & setup
                </h3>
                <button onClick={() => setPendingPhotoSetup(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Photo Date</label>
                <input 
                  type="datetime-local"
                  value={pendingPhotoSetup.date}
                  onChange={e => setPendingPhotoSetup(p => ({ ...p, date: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Description / Title</label>
                <input 
                  type="text"
                  value={pendingPhotoSetup.label}
                  onChange={e => setPendingPhotoSetup(p => ({ ...p, label: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Photo Tag / Focus Type</label>
                <select
                  value={currentTag}
                  onChange={e => setPendingPhotoSetup(p => ({ ...p, tag: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-slate-800 font-medium"
                >
                  {(() => {
                    if (!isPotTrial) {
                      return SCIENTIFIC_FOCUS_TAGS.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ));
                    }
                    
                    const potObsMode = proj?.PotObsMode || targetTrial?.PotObsMode || 'row-wise';
                    let potCount = 3;
                    if (potObsMode === 'column-wise' && proj) {
                      const blocksCount = parseInt(proj.PotBlocks) || 3;
                      potCount = Math.floor((parseInt(proj.PotRows) || 9) / blocksCount);
                    } else if (potObsMode === 'row-wise' && proj) {
                      potCount = parseInt(proj.PotCols) || 4;
                    } else if (targetTrial?.PotLabel) {
                      const m = targetTrial.PotLabel.match(/(\d+)\s*Pots?/i);
                      if (m) potCount = parseInt(m[1], 10);
                    }
                    
                    const options = [];
                    for (let idx = 0; idx < potCount; idx++) {
                      const potLetter = String.fromCharCode(65 + idx); // A, B, C...
                      SCIENTIFIC_FOCUS_TAGS.forEach(f => {
                        const val = `Plant ${idx + 1} (Pot ${potLetter}) - ${f.value}`;
                        options.push(
                          <option key={val} value={val}>
                            Plant {idx + 1} (Pot {potLetter}) - {f.label}
                          </option>
                        );
                      });
                    }
                    return options;
                  })()}
                </select>
              </div>

              {targetTrial?.Date && pendingPhotoSetup.date ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800">
                  DAA: <strong>{Math.max(0, Math.round((new Date(pendingPhotoSetup.date) - new Date(targetTrial.Date)) / 86400000))}</strong> days after application
                </div>
              ) : null}

              <div className="flex justify-end gap-3 pt-2 border-t">
                <button onClick={() => setPendingPhotoSetup(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                <button
                  onClick={() => {
                    const { dataUrl, mimeType, trialId, mode, date, tag, label } = pendingPhotoSetup;
                    setPendingPhotoSetup(null);
                    handlePhotoUpload(dataUrl, mimeType, trialId, mode, date, tag || defaultTag, label);
                  }}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-2"
                >
                  Save & Upload
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
