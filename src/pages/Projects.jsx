import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import TopBar from '../components/TopBar.jsx';
import Modal from '../components/Modal.jsx';
import { addProject, deleteProject, addBlock, deleteBlock, updateProject, addBatchTrials, deleteTrial } from '../services/dataLayer.js';
import {
  Plus, Trash2, Edit, Layers, Beaker, Activity, ChevronRight, ArrowLeft,
  Lock, Unlock, Download, FileText, RefreshCw, BarChart2, Shuffle,
  ClipboardList, Package, Sparkles, Save, Loader2, CheckCircle2,
  AlertTriangle, AlertCircle, ShieldAlert, LayoutGrid, TrendingUp,
  Sigma, Printer, MapPin, Thermometer, Droplets, CloudRain, Image, Share2
} from 'lucide-react';
import Chart from 'chart.js/auto';
import { safeJsonParse } from '../utils/helpers.js';
import { AnalysisEngine } from '../utils/analysisUtils.js';
import PlotMap from '../components/PlotMap.jsx';
import { formatDate, formatDateTime, toDatetimeLocal, calculateDAA } from '../utils/dateUtils.js';
import { getCategoryConfig, getPrimaryObservationField, getObservationPrimaryValue, calculateEfficacy } from '../utils/categoryConfig.js';
import TrialDesignGuideModal from '../components/TrialDesignGuideModal.jsx';
import { Info } from 'lucide-react';
import { AdvancedReportGenerator } from '../services/advancedReportGenerator.js';
import { generateTextWithAI } from '../services/multiProviderAI.js';
import AppSharingModal from '../components/AppSharingModal.jsx';
import {
  generateMasterComprehensivePdf,
  exportMasterDocx,
  generateMasterPpt
} from '../services/trialReports.js';

// ── helpers ────────────────────────────────────────────────────────────────
export function getThemeClasses(accentColor = 'emerald') {
  const accentMap = {
    emerald: {
      bg: 'bg-emerald-600 hover:bg-emerald-700',
      bgSecondary: 'bg-emerald-600',
      text: 'text-emerald-600',
      textDark: 'text-emerald-700',
      ring: 'focus:ring-emerald-400',
      bgLight: 'bg-emerald-50',
      textLight: 'text-emerald-700',
      badge: 'bg-emerald-100 text-emerald-700',
      border: 'border-emerald-200',
      borderLight: 'border-emerald-100',
      hoverBgLight: 'hover:bg-emerald-50 text-emerald-700',
      hoverTextLight: 'hover:text-emerald-700',
      ringFocus: 'focus:ring-emerald-500',
    },
    indigo: {
      bg: 'bg-indigo-600 hover:bg-indigo-700',
      bgSecondary: 'bg-indigo-600',
      text: 'text-indigo-600',
      textDark: 'text-indigo-700',
      ring: 'focus:ring-indigo-400',
      bgLight: 'bg-indigo-50',
      textLight: 'text-indigo-700',
      badge: 'bg-indigo-100 text-indigo-700',
      border: 'border-indigo-200',
      borderLight: 'border-indigo-100',
      hoverBgLight: 'hover:bg-indigo-50 text-indigo-700',
      hoverTextLight: 'hover:text-indigo-700',
      ringFocus: 'focus:ring-indigo-500',
    },
    red: {
      bg: 'bg-red-600 hover:bg-red-700',
      bgSecondary: 'bg-red-600',
      text: 'text-red-600',
      textDark: 'text-red-700',
      ring: 'focus:ring-red-400',
      bgLight: 'bg-red-50',
      textLight: 'text-red-700',
      badge: 'bg-red-100 text-red-700',
      border: 'border-red-200',
      borderLight: 'border-red-100',
      hoverBgLight: 'hover:bg-red-50 text-red-700',
      hoverTextLight: 'hover:text-red-700',
      ringFocus: 'focus:ring-red-500',
    },
    amber: {
      bg: 'bg-amber-600 hover:bg-amber-700',
      bgSecondary: 'bg-amber-600',
      text: 'text-amber-600',
      textDark: 'text-amber-700',
      ring: 'focus:ring-amber-400',
      bgLight: 'bg-amber-50',
      textLight: 'text-amber-700',
      badge: 'bg-amber-100 text-amber-700',
      border: 'border-amber-200',
      borderLight: 'border-amber-100',
      hoverBgLight: 'hover:bg-amber-50 text-amber-700',
      hoverTextLight: 'hover:text-amber-700',
      ringFocus: 'focus:ring-amber-500',
    },
    teal: {
      bg: 'bg-teal-600 hover:bg-teal-700',
      bgSecondary: 'bg-teal-600',
      text: 'text-teal-600',
      textDark: 'text-teal-700',
      ring: 'focus:ring-teal-400',
      bgLight: 'bg-teal-50',
      textLight: 'text-teal-700',
      badge: 'bg-teal-100 text-teal-700',
      border: 'border-teal-200',
      borderLight: 'border-teal-100',
      hoverBgLight: 'hover:bg-teal-50 text-teal-700',
      hoverTextLight: 'hover:text-teal-700',
      ringFocus: 'focus:ring-teal-500',
    },
  };
  return accentMap[accentColor] || accentMap.emerald;
}

const toast = (msg, type = 'success') =>
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg, type } }));

function MiniBar({ value, max, color = 'bg-slate-400' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Inline bar chart — no external lib
function InlineBarChart({ data, color = '#10b981', height = 120 }) {
  if (!data || data.length === 0) return <p className="text-xs text-slate-400 text-center py-4">No data</p>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group min-w-0">
          <span className="text-[8px] text-slate-400 hidden group-hover:block truncate">{d.value.toFixed(1)}</span>
          <div
            className="w-full rounded-t transition-all hover:opacity-80"
            style={{ height: `${Math.max(4, (d.value / max) * (height - 20))}px`, background: color }}
            title={`${d.label}: ${d.value.toFixed(1)}`}
          />
          <span className="text-[8px] text-slate-400 truncate w-full text-center leading-tight">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function NormalityPlot({ residuals }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !residuals || residuals.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Calculate mean, std dev
    const n = residuals.length;
    const mean = residuals.reduce((a, b) => a + b, 0) / n;
    const variance = residuals.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1 || 1);
    const std = Math.sqrt(variance) || 1;

    // Generate normal distribution curve points
    const points = [];
    const minX = mean - 3.5 * std;
    const maxX = mean + 3.5 * std;
    const rangeX = maxX - minX;

    // Fit PDF helper
    const pdf = (x) => {
      return (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / std, 2));
    };

    // Draw grid lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let xOffset = 0.1; xOffset < 1; xOffset += 0.2) {
      ctx.beginPath();
      ctx.moveTo(xOffset * w, 0);
      ctx.lineTo(xOffset * w, h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, xOffset * h);
      ctx.lineTo(w, xOffset * h);
      ctx.stroke();
    }

    // Plot theoretical normal bell curve (Green line)
    ctx.beginPath();
    ctx.strokeStyle = '#10b981'; // emerald-500
    ctx.lineWidth = 2.5;
    const maxPdfVal = pdf(mean);

    for (let i = 0; i <= 100; i++) {
      const xVal = minX + (i / 100) * rangeX;
      const yVal = pdf(xVal);

      const canvasX = 15 + (i / 100) * (w - 30);
      const canvasY = h - 15 - (yVal / maxPdfVal) * (h - 30);

      if (i === 0) ctx.moveTo(canvasX, canvasY);
      else ctx.lineTo(canvasX, canvasY);
    }
    ctx.stroke();

    // Plot actual residuals points/kernel density or a simple line representing actual sorted residuals!
    const sorted = [...residuals].sort((a, b) => a - b);
    
    // Draw raw residual points as vertical ticks on the bottom axis (rug plot)
    ctx.strokeStyle = '#ef4444'; // red-500
    ctx.lineWidth = 1.5;
    sorted.forEach(val => {
      const pct = (val - minX) / rangeX;
      if (pct >= 0 && pct <= 1) {
        const tickX = 15 + pct * (w - 30);
        ctx.beginPath();
        ctx.moveTo(tickX, h - 15);
        ctx.lineTo(tickX, h - 25);
        ctx.stroke();
      }
    });

    // Draw kernel density estimate of residuals (Red curve)
    const bandwidth = 1.06 * std * Math.pow(n, -0.2) || 1;
    const kde = (x) => {
      let sum = 0;
      sorted.forEach(val => {
        sum += (1 / (bandwidth * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - val) / bandwidth, 2));
      });
      return sum / n;
    };

    const kdeVals = [];
    for (let i = 0; i <= 100; i++) {
      kdeVals.push(kde(minX + (i / 100) * rangeX));
    }
    const maxKdeVal = Math.max(...kdeVals) || 1;

    ctx.beginPath();
    ctx.strokeStyle = '#ef4444'; // red-500
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 2]); // Dashed line for empirical curve
    for (let i = 0; i <= 100; i++) {
      const xVal = minX + (i / 100) * rangeX;
      const yVal = kde(xVal);
      const canvasX = 15 + (i / 100) * (w - 30);
      const canvasY = h - 15 - (yVal / maxKdeVal) * (h - 30);
      if (i === 0) ctx.moveTo(canvasX, canvasY);
      else ctx.lineTo(canvasX, canvasY);
    }
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // Add labels
    ctx.fillStyle = '#64748b'; // slate-500
    ctx.font = '8px monospace';
    ctx.fillText('Normal Curve (ideal)', 20, 15);
    ctx.fillStyle = '#ef4444';
    ctx.fillText('Residuals KDE (actual)', 20, 26);

  }, [residuals]);

  return (
    <div className="relative bg-white border rounded-lg p-2.5 shadow-inner mt-2">
      <canvas ref={canvasRef} width={220} height={110} className="w-full h-auto block" />
    </div>
  );
}

// ── Plot mini card ─────────────────────────────────────────────────────────
function PlotMiniCard({ trial, activeCategory = 'herbicide', onClick, outlierInfo, isDimmed }) {
  const isControl = String(trial.IsControl).toLowerCase() === 'true';
  const isCheck = String(trial.IsStandardCheck).toLowerCase() === 'true';
  const isCompleted = String(trial.IsCompleted).toLowerCase() === 'true';

  const bg = isControl ? 'bg-orange-50 border-orange-300' : isCheck ? 'bg-purple-50 border-purple-300' : 'bg-blue-50 border-blue-200';
  const ribbon = isControl ? 'bg-orange-500' : isCheck ? 'bg-purple-500' : 'bg-blue-500';
  const badge = isControl
    ? <span className="text-[7px] font-extrabold bg-orange-500 text-white px-1 py-0.5 rounded uppercase">Control</span>
    : isCheck
      ? <span className="text-[7px] font-extrabold bg-purple-500 text-white px-1 py-0.5 rounded uppercase">Standard</span>
      : <span className="text-[7px] font-extrabold bg-blue-500 text-white px-1 py-0.5 rounded uppercase">Exptl</span>;

  const categoryId = trial.Category || activeCategory;
  const projectConfig = getCategoryConfig(categoryId);
  const primaryObsField = getPrimaryObservationField(categoryId);
  const theme = getThemeClasses(projectConfig.color.accent);

  const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
  const latest = efficacy.length ? efficacy[efficacy.length - 1] : null;
  const plotNum = trial.RandomizationOrder || trial.PlotNumber || '?';

  const metricVal = latest ? latest[primaryObsField] : null;

  const borderStyle = outlierInfo ? 'border-red-400 ring-1 ring-red-400 ring-opacity-50 shadow-red-50' : '';

  return (
    <div onClick={onClick} className={`w-40 flex-shrink-0 border-2 rounded-lg p-3 shadow-sm hover:shadow-md transition-all relative overflow-hidden cursor-pointer ${bg} ${borderStyle} ${isDimmed ? 'opacity-20 scale-95 border-dashed pointer-events-none' : ''}`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${ribbon}`} />
      <div className="flex justify-between items-start mb-1">
        <span className="text-[9px] font-bold text-slate-400">PLOT {plotNum}</span>
        <div className="flex gap-1 items-center">
          {outlierInfo && (
            <span className="text-[7px] font-extrabold bg-red-500 text-white px-1 py-0.5 rounded uppercase" title={`Outlier detected (Z = ${outlierInfo.zScore.toFixed(2)})`}>
              Outlier
            </span>
          )}
          {badge}
        </div>
      </div>
      <p className="font-bold text-xs text-slate-800 truncate mb-0.5" title={trial.FormulationName}>{trial.FormulationName || '—'}</p>
      <p className="text-[9px] text-slate-500 truncate">{trial.Dosage || '—'}</p>
      {trial.TrialDesign === 'Split-Plot' && trial.SubFactor && (
        <p className="text-[9px] font-semibold text-slate-500 truncate">Sub: {trial.SubFactor}</p>
      )}
      {trial.TrialDesign === 'Factorial' && (trial.MainFactor || trial.SubFactor) && (
        <p className="text-[8px] font-semibold text-slate-500 truncate">Fac: {trial.MainFactor || 'A'} x {trial.SubFactor || 'B'}</p>
      )}
      {trial.TrialDesign === 'Strip-Plot' && (trial.MainFactor || trial.SubFactor) && (
        <p className="text-[8px] font-semibold text-slate-500 truncate">Strip: {trial.MainFactor} x {trial.SubFactor}</p>
      )}
      {trial.TrialDesign === 'Lattice' && trial.SubBlockID && (
        <p className="text-[9px] font-semibold text-slate-500 truncate">Blk: {trial.SubBlockID}</p>
      )}
      {metricVal !== undefined && metricVal !== null && (
        <div className={`mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 ${theme.bgLight} border ${theme.border} rounded text-[8px]`}>
          <span className={`font-bold ${theme.textDark}`}>{metricVal}{projectConfig.primaryMetric.unit || ''} {projectConfig.primaryMetric.key}</span>
        </div>
      )}
      <div className="mt-1.5 flex justify-end">
        <span className={`text-[9px] font-bold ${isCompleted ? theme.text : 'text-amber-500'}`}>
          {isCompleted ? 'DONE' : 'ACTIVE'}
        </span>
      </div>
    </div>
  );
}

// ── Block card ─────────────────────────────────────────────────────────────
function BlockCard({ block, trials, activeCategory, onPlotClick, onDeleteBlock, onAddPlot, isLocked, outliers, highlightedTreatment }) {
  const projectConfig = getCategoryConfig(activeCategory);
  const theme = getThemeClasses(projectConfig.color.accent);
  const controls = trials.filter(t => String(t.IsControl).toLowerCase() === 'true');
  const hasControl = controls.length > 0;
  const tooMany = controls.length > 1;
  const icon = tooMany
    ? <AlertCircle className="w-4 h-4 text-red-500 animate-pulse" title="Multiple controls!" />
    : hasControl
      ? <CheckCircle2 className={`w-4 h-4 ${theme.text}`} title="Control present" />
      : <AlertTriangle className="w-4 h-4 text-amber-500" title="Missing control!" />;

  const designType = trials[0]?.TrialDesign || 'RCBD';

  const renderPlotsContent = () => {
    if (trials.length === 0) {
      return <p className="text-xs text-slate-400 italic py-3">No plots in this block.</p>;
    }

    if (designType === 'Split-Plot') {
      const groups = {};
      trials.forEach(t => {
        const key = t.MainFactor || 'No Main Factor';
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
      });
      return (
        <div className="space-y-4">
          {Object.entries(groups).map(([mainFactor, groupTrials]) => (
            <div key={mainFactor} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
              <div className="text-[10px] font-bold text-indigo-600 mb-1.5 uppercase tracking-wider">Main Factor: {mainFactor}</div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {[...groupTrials].sort((a, b) => (parseInt(a.RandomizationOrder) || 999) - (parseInt(b.RandomizationOrder) || 999))
                  .map(t => {
                    const isDimmed = highlightedTreatment !== 'all' && t.FormulationName !== highlightedTreatment;
                    return <PlotMiniCard key={t.ID} trial={t} activeCategory={activeCategory} onClick={() => onPlotClick && onPlotClick(t.ID)} outlierInfo={outliers?.[t.ID]} isDimmed={isDimmed} />;
                  })}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (designType === 'Lattice') {
      const groups = {};
      trials.forEach(t => {
        const key = t.SubBlockID || 'No Sub-Block';
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
      });
      return (
        <div className="space-y-4">
          {Object.entries(groups).map(([subBlock, groupTrials]) => (
            <div key={subBlock} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
              <div className="text-[10px] font-bold text-indigo-600 mb-1.5 uppercase tracking-wider">Sub-Block: {subBlock}</div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {[...groupTrials].sort((a, b) => (parseInt(a.RandomizationOrder) || 999) - (parseInt(b.RandomizationOrder) || 999))
                  .map(t => {
                    const isDimmed = highlightedTreatment !== 'all' && t.FormulationName !== highlightedTreatment;
                    return <PlotMiniCard key={t.ID} trial={t} activeCategory={activeCategory} onClick={() => onPlotClick && onPlotClick(t.ID)} outlierInfo={outliers?.[t.ID]} isDimmed={isDimmed} />;
                  })}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (designType === 'Strip-Plot') {
      const groups = {};
      trials.forEach(t => {
        const key = t.MainFactor || 'No Main Factor';
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
      });
      return (
        <div className="space-y-4">
          {Object.entries(groups).map(([mainFactor, groupTrials]) => (
            <div key={mainFactor} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
              <div className="text-[10px] font-bold text-indigo-600 mb-1.5 uppercase tracking-wider">Row Factor (Main): {mainFactor}</div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {[...groupTrials].sort((a, b) => (parseInt(a.RandomizationOrder) || 999) - (parseInt(b.RandomizationOrder) || 999))
                  .map(t => {
                    const isDimmed = highlightedTreatment !== 'all' && t.FormulationName !== highlightedTreatment;
                    return <PlotMiniCard key={t.ID} trial={t} activeCategory={activeCategory} onClick={() => onPlotClick && onPlotClick(t.ID)} outlierInfo={outliers?.[t.ID]} isDimmed={isDimmed} />;
                  })}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex gap-3 min-w-max pb-1">
        {[...trials].sort((a, b) => (parseInt(a.RandomizationOrder) || 999) - (parseInt(b.RandomizationOrder) || 999))
          .map(t => {
            const isDimmed = highlightedTreatment !== 'all' && t.FormulationName !== highlightedTreatment;
            return <PlotMiniCard key={t.ID} trial={t} activeCategory={activeCategory} onClick={() => onPlotClick && onPlotClick(t.ID)} outlierInfo={outliers?.[t.ID]} isDimmed={isDimmed} />;
          })}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 flex justify-between items-center border-b">
        <div className="flex items-center gap-3">
          <div className={`${theme.bg} text-white w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs`}>
            R{block.ReplicationNum || '?'}
          </div>
          <span className="font-bold text-slate-800 text-sm">{block.Name}</span>
          {icon}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{trials.length} plot{trials.length !== 1 ? 's' : ''}</span>
          {!isLocked && onAddPlot && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddPlot(block.ID); }}
              className={`p-1 rounded ${theme.hoverBgLight} ${theme.text} transition`} title="Add plot to this block"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {!isLocked && onDeleteBlock && (
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteBlock(block.ID, block.Name); }}
              className="p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition" title="Delete block"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="p-3 overflow-x-auto">
        {renderPlotsContent()}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Projects({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const { isViewer, isAdmin, user } = useAuth();
  const navigate = useNavigate();

  const isOwnData = useCallback((record) => {
    if (isAdmin) return true;
    if (!record) return true;
    const ownUid = user?.uid || user?.ID || user?.id;
    return !record.CreatedBy || record.CreatedBy === ownUid;
  }, [user, isAdmin]);
  const activeCategory = state.activeCategory || 'herbicide';
  const config = getCategoryConfig(activeCategory);
  const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 'N/A';

  const theme = useMemo(() => getThemeClasses(config.color.accent), [config.color.accent]);
  const INPUT = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${theme.ring} bg-white`;

  // list view state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharingProject, setSharingProject] = useState(null);

  const handleOpenShareModal = useCallback((e, project) => {
    e.stopPropagation();
    setSharingProject(project);
    setIsShareModalOpen(true);
  }, []);

  const handleSaveSharing = useCallback(async (sharedWith, sharedWithEdit) => {
    if (!sharingProject) return;
    setIsShareModalOpen(false);
    
    const updatedProject = {
      ...sharingProject,
      SharedWith: sharedWith,
      SharedWithEdit: sharedWithEdit
    };
    const newProjects = state.projects.map(p => p.ID === sharingProject.ID ? updatedProject : p);
    updateState({ projects: newProjects });

    try {
      await updateProject(updatedProject, getAppState);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Sharing permissions updated successfully', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Failed to update sharing permissions', type: 'error' } }));
      updateState({ projects: state.projects });
    }
  }, [sharingProject, state.projects, updateState, getAppState]);
  const [formData, setFormData] = useState({ 
    Name: '', 
    Metric: config.primaryMetric.label, 
    TargetWeed: '', 
    Crop: '', 
    Location: '', 
    Investigator: '', 
    StartDate: '',
    Lat: '',
    Lon: '',
    WeatherTemp: '',
    WeatherHumidity: '',
    WeatherWind: '',
    WeatherRain: '',
    WeatherDetails: ''
  });

  const [isFetchingGeo, setIsFetchingGeo] = useState(false);
  const [isFetchingGeoProtocol, setIsFetchingGeoProtocol] = useState(false);

  const handleAutofetchLocationAndWeather = () => {
    if (!navigator.geolocation) {
      toast('Geolocation is not supported by this browser', 'error');
      return;
    }
    setIsFetchingGeo(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lon = position.coords.longitude.toFixed(6);
        
        setFormData(prev => ({
          ...prev,
          Location: prev.Location || `Lat: ${lat}, Lon: ${lon}`
        }));
        
        try {
          const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`);
          const data = await response.json();
          if (data && data.current) {
            const temp = data.current.temperature_2m;
            const hum = data.current.relative_humidity_2m;
            const wind = data.current.wind_speed_10m;
            const rain = data.current.precipitation;
            
            setFormData(prev => ({
              ...prev,
              Lat: lat,
              Lon: lon,
              WeatherTemp: temp,
              WeatherHumidity: hum,
              WeatherWind: wind,
              WeatherRain: rain,
              WeatherDetails: `${temp}°C, Hum: ${hum}%, Wind: ${wind} km/h, Rain: ${rain}mm`
            }));
            
            toast('Location & current weather fetched successfully!');
          }
        } catch (err) {
          console.warn('Weather fetch failed:', err);
          toast('Location fetched, but weather details could not be retrieved', 'warning');
        } finally {
          setIsFetchingGeo(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        toast(`Failed to get location: ${error.message}`, 'error');
        setIsFetchingGeo(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleAutofetchLocationAndWeatherForProtocol = () => {
    if (!navigator.geolocation) {
      toast('Geolocation is not supported by this browser', 'error');
      return;
    }
    setIsFetchingGeoProtocol(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lon = position.coords.longitude.toFixed(6);
        
        setProtocolForm(prev => ({
          ...prev,
          Location: prev.Location || `Lat: ${lat}, Lon: ${lon}`
        }));
        
        try {
          const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh`);
          const data = await response.json();
          if (data && data.current) {
            const temp = data.current.temperature_2m;
            const hum = data.current.relative_humidity_2m;
            const wind = data.current.wind_speed_10m;
            const rain = data.current.precipitation;
            
            setProtocolForm(prev => ({
              ...prev,
              Lat: lat,
              Lon: lon,
              WeatherTemp: temp,
              WeatherHumidity: hum,
              WeatherWind: wind,
              WeatherRain: rain,
              WeatherDetails: `${temp}°C, Hum: ${hum}%, Wind: ${wind} km/h, Rain: ${rain}mm`
            }));
            
            toast('Location & current weather fetched successfully!');
          }
        } catch (err) {
          console.warn('Weather fetch failed:', err);
          toast('Location fetched, but weather details could not be retrieved', 'warning');
        } finally {
          setIsFetchingGeoProtocol(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        toast(`Failed to get location: ${error.message}`, 'error');
        setIsFetchingGeoProtocol(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Reset/sync Metric default when activeCategory changes
  useEffect(() => {
    setFormData(prev => ({ ...prev, Metric: config.primaryMetric.label }));
  }, [activeCategory, config.primaryMetric.label]);

  // dashboard state
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [postHocMethod, setPostHocMethod] = useState('lsd');
  const [narrative, setNarrative] = useState('');
  const [isSavingNarrative, setIsSavingNarrative] = useState(false);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [blockForm, setBlockForm] = useState({ Name: '', ReplicationNum: '' });
  const [showMap, setShowMap] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' | 'report' | 'split-viewer'
  const [blocksViewMode, setBlocksViewMode] = useState('list'); // 'list' | 'grid'
  const [selectedControlTrialId, setSelectedControlTrialId] = useState('');
  const [selectedTreatedTrialId, setSelectedTreatedTrialId] = useState('');
  const [selectedDaa, setSelectedDaa] = useState(0);
  const [heatmapMode, setHeatmapMode] = useState('none');

  const [selectedLayoutBlock, setSelectedLayoutBlock] = useState('all');
  const [selectedLayoutTreatment, setSelectedLayoutTreatment] = useState('all');

  useEffect(() => {
    setSelectedLayoutBlock('all');
    setSelectedLayoutTreatment('all');
  }, [activeProjectId]);

  const wceChartRef = useRef(null);
  const perfChartRef = useRef(null);
  const speciesChartRef = useRef(null);
  const radarChartRef = useRef(null);
  const yieldChartRef = useRef(null);

  const [isDesignGuideOpen, setIsDesignGuideOpen] = useState(false);
  const [randomizeForm, setRandomizeForm] = useState({
    investigatorName: '',
    dosage: '',
    weedSpecies: '',
    date: new Date().toISOString().split('T')[0],
    replications: '4',
    trialDesign: 'RCBD',
    mainFactorLevels: '',
    subFactorLevels: '',
    potRows: '9',
    potCols: '4',
    potLayout: 'stripe',
    potStripeDirection: 'Horizontal Rows',
    potObsMode: 'row-wise',
    potDataMethod: 'total',
    potFields: ['Plant Height', 'Branches', 'Flowers', 'Fruit Count', 'Yield'],
    potIdentifierFormat: 'row-col',
    potBlocks: '3'
  });
  const [selectedTreatments, setSelectedTreatments] = useState({});
  const [randomizeTreatments, setRandomizeTreatments] = useState([]);
  const [customiseReportModalOpen, setCustomiseReportModalOpen] = useState(false);
  const [reportFieldSelection, setReportFieldSelection] = useState({});
  const [pendingReportExport, setPendingReportExport] = useState(null);

  const activeFormulations = useMemo(() => {
    return (state.formulations || []).filter(f => f.Category === activeCategory || (!f.Category && activeCategory === 'herbicide'));
  }, [state.formulations, activeCategory]);

  const allocationPreview = useMemo(() => {
    if (randomizeForm.trialDesign !== 'PotTrial') return null;
    const potRows = parseInt(randomizeForm.potRows) || 9;
    const potCols = parseInt(randomizeForm.potCols) || 4;
    const potLayout = randomizeForm.potLayout || 'stripe';
    const potStripeDirection = randomizeForm.potStripeDirection || 'Horizontal Rows';
    const potObsMode = randomizeForm.potObsMode || 'row-wise';

    const trtList = randomizeTreatments.map(t => {
      const f = activeFormulations.find(form => String(form.ID) === String(t.formulationId));
      return t.name.trim() || f?.Name || 'Unnamed Treatment';
    });

    if (trtList.length === 0) return null;

    const uniqueTrts = [...new Set(trtList)];

    const allocations = uniqueTrts.map(tName => {
      let rowsVal = null;
      let colsVal = null;
      let potsVal = 0;

      if (potLayout === 'stripe' || potLayout === 'randomized-row') {
        if (String(potStripeDirection).toLowerCase().includes('horizontal')) {
          let rCount = 0;
          if (potLayout === 'stripe') {
            for (let r = 0; r < potRows; r++) {
              if (trtList[r % trtList.length] === tName) rCount++;
            }
          } else {
            const baseList = [];
            while (baseList.length < potRows) {
              trtList.forEach(t => { if (baseList.length < potRows) baseList.push(t); });
            }
            baseList.forEach(t => { if (t === tName) rCount++; });
          }
          rowsVal = rCount;
          potsVal = rCount * potCols;
        } else {
          // Vertical Columns
          let cCount = 0;
          if (potLayout === 'stripe') {
            for (let c = 0; c < potCols; c++) {
              if (trtList[c % trtList.length] === tName) cCount++;
            }
          } else {
            const baseList = [];
            while (baseList.length < potCols) {
              trtList.forEach(t => { if (baseList.length < potCols) baseList.push(t); });
            }
            baseList.forEach(t => { if (t === tName) cCount++; });
          }
          colsVal = cCount;
          potsVal = cCount * potRows;
        }
      } else if (potLayout === 'rcbd-pot') {
        const blocksCount = parseInt(randomizeForm.potBlocks) || 3;
        const rowsPerBlock = Math.floor(potRows / blocksCount);
        potsVal = rowsPerBlock * blocksCount;
      } else {
        // balanced-pot
        let pCount = 0;
        for (let r = 0; r < potRows; r++) {
          const baseList = [];
          while (baseList.length < potCols) {
            trtList.forEach(t => { if (baseList.length < potCols) baseList.push(t); });
          }
          baseList.forEach(t => { if (t === tName) pCount++; });
        }
        potsVal = pCount;
      }

      return {
        name: tName,
        rows: rowsVal,
        cols: colsVal,
        pots: potsVal
      };
    });

    let isBalanced = true;
    if (potLayout === 'stripe' || potLayout === 'randomized-row') {
      if (String(potStripeDirection).toLowerCase().includes('horizontal')) {
        const rowCounts = allocations.map(a => a.rows);
        isBalanced = rowCounts.every(c => c === rowCounts[0]);
      } else {
        const colCounts = allocations.map(a => a.cols);
        isBalanced = colCounts.every(c => c === colCounts[0]);
      }
    } else if (potLayout === 'rcbd-pot') {
      const blocksCount = parseInt(randomizeForm.potBlocks) || 3;
      isBalanced = (potRows % blocksCount === 0);
    } else {
      const potCounts = allocations.map(a => a.pots);
      isBalanced = potCounts.every(c => c === potCounts[0]);
    }

    return {
      allocations,
      isBalanced,
      potLayout,
      potStripeDirection,
      potObsMode,
      potRows,
      potCols,
      potBlocks: parseInt(randomizeForm.potBlocks) || 3,
      trtCount: trtList.length
    };
  }, [randomizeForm, randomizeTreatments, activeFormulations]);

  const projects = useMemo(() => {
    return (state.projects || []).filter(p => p.Category === activeCategory || (!p.Category && activeCategory === 'herbicide'));
  }, [state.projects, activeCategory]);

  const activeProject = activeProjectId ? projects.find(p => String(p.ID) === String(activeProjectId)) : null;

  const projectBlocks = useMemo(() => activeProject ? (state.blocks || []).filter(b => String(b.ProjectID) === String(activeProject.ID)) : [], [activeProject, state.blocks]);
  const projectTrials = useMemo(() => activeProject ? (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID)) : [], [activeProject, state.trials]);
  const treatments = useMemo(() => [...new Set(projectTrials.map(t => t.FormulationName).filter(Boolean))], [projectTrials]);
  const isLocked = activeProject ? activeProject.Status === 'Locked' : false;
  const isEffectiveLocked = isLocked || isViewer;
  const projectCategory = activeProject?.Category || activeCategory;
  const projectConfig = getCategoryConfig(projectCategory);
  const projectTheme = getThemeClasses(projectConfig.color?.accent || 'emerald');

  const meansChartData = useMemo(() => {
    if (!analysisResults?.grouping) return [];
    return analysisResults.grouping.map(g => ({
      label: g.name,
      value: isFinite(g.mean) ? g.mean : 0
    }));
  }, [analysisResults]);

  // ── Design completeness ─────────────────────────────────────────────────
  const designCheck = useMemo(() => {
    if (!activeProject) return null;
    const blocks = (state.blocks || []).filter(b => String(b.ProjectID) === String(activeProject.ID));
    const trials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    const treatmentKeys = [...new Set(trials.map(t => t.FormulationName || t.FormulationID || 'Unknown'))];
    const expectedCells = blocks.length * treatmentKeys.length;

    const blockTrtCounts = {};
    blocks.forEach(b => { blockTrtCounts[b.ID] = {}; });
    const duplicates = [];
    trials.forEach(t => {
      if (!t.BlockID) return;
      const key = t.FormulationName || t.FormulationID || 'Unknown';
      if (!blockTrtCounts[t.BlockID]) blockTrtCounts[t.BlockID] = {};
      blockTrtCounts[t.BlockID][key] = (blockTrtCounts[t.BlockID][key] || 0) + 1;
      if (blockTrtCounts[t.BlockID][key] > 1) duplicates.push({ blockId: t.BlockID, key });
    });

    const missing = [];
    let observed = 0;
    blocks.forEach(b => {
      treatmentKeys.forEach(k => {
        const count = blockTrtCounts[b.ID]?.[k] || 0;
        if (count > 0) observed++;
        else missing.push({ blockName: b.Name || b.ID, key: k });
      });
    });
    const coveragePct = expectedCells > 0 ? Math.round((observed / expectedCells) * 100) : 0;
    const isBalanced = missing.length === 0 && duplicates.length === 0;

    // control integrity
    const blockControlChecks = blocks.map(b => {
      const bt = trials.filter(t => t.BlockID === b.ID);
      const count = bt.filter(t => String(t.IsControl).toLowerCase() === 'true').length;
      return { blockName: b.Name || b.ID, count };
    });
    const noControl = blockControlChecks.filter(x => x.count === 0);
    const multiControl = blockControlChecks.filter(x => x.count > 1);

    return { blocks, trials, treatmentKeys, expectedCells, observed, coveragePct, isBalanced, missing, duplicates, noControl, multiControl };
  }, [activeProject, state.blocks, state.trials]);

  // ── Per-treatment WCE over time ─────────────────────────────────────────
  const wceTimelineData = useMemo(() => {
    if (!activeProject) return { daas: [], series: [] };
    const trials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    const daaSet = new Set();
    trials.forEach(t => safeJsonParse(t.EfficacyDataJSON, []).forEach(e => { if (e.daa > 0) daaSet.add(e.daa); }));
    const daas = [...daaSet].sort((a, b) => a - b);
    const treatmentNames = [...new Set(trials.map(t => t.FormulationName).filter(Boolean))];
    const primaryObsField = getPrimaryObservationField(activeCategory);

    // Find UTC for WCE calc
    const utcName = treatmentNames.find(n => /control|untreated|check/i.test(n));

    const series = treatmentNames.map(name => {
      const trtTrials = trials.filter(t => t.FormulationName === name);
      const values = daas.map(daa => {
        const covers = trtTrials.map(t => {
          const eff = safeJsonParse(t.EfficacyDataJSON, []);
          const obs = eff.find(e => e.daa === daa);
          return obs ? Number(getObservationPrimaryValue(activeCategory, obs) ?? 0) : null;
        }).filter(v => v !== null);
        if (covers.length === 0) return null;
        const meanCover = covers.reduce((s, v) => s + v, 0) / covers.length;

        if (utcName && utcName !== name) {
          const utcTrials = trials.filter(t => t.FormulationName === utcName);
          const utcCovers = utcTrials.map(t => {
            const eff = safeJsonParse(t.EfficacyDataJSON, []);
            const obs = eff.find(e => e.daa === daa);
            return obs ? Number(getObservationPrimaryValue(activeCategory, obs) ?? 0) : null;
          }).filter(v => v !== null);
          if (utcCovers.length > 0) {
            const utcMean = utcCovers.reduce((s, v) => s + v, 0) / utcCovers.length;
            if (utcMean > 0) {
              return parseFloat(calculateEfficacy(activeCategory, meanCover, utcMean).toFixed(1));
            }
            return 0;
          }
        }
        return parseFloat(meanCover.toFixed(1));
      });
      return { name, values };
    });
    return { daas: daas.map(d => `DAA ${d}`), series };
  }, [activeProject, state.trials, activeCategory]);

  // ── Treatment performance chart data ───────────────────────────────────
  const perfChartData = useMemo(() => {
    if (!analysisResults?.means) return [];
    return Object.entries(analysisResults.means)
      .map(([name, mean]) => ({ label: name.length > 12 ? name.slice(0, 10) + '…' : name, value: isFinite(mean) ? mean : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [analysisResults]);

  // ── Per-treatment stats (Mean, SD, CV, WCE) ────────────────────────────
  const treatmentStats = useMemo(() => {
    if (!activeProject || !analysisResults?.means) return [];
    const trials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    const utcName = Object.keys(analysisResults.means).find(n => /control|untreated|check/i.test(n));
    const utcMean = utcName ? (analysisResults.means[utcName] ?? 0) : 0;
    const primaryObsField = getPrimaryObservationField(activeCategory);

    return (analysisResults.grouping || []).map(g => {
      const trtTrials = trials.filter(t => t.FormulationName === g.name);
      const repValues = trtTrials.map(t => {
        const eff = safeJsonParse(t.EfficacyDataJSON, []);
        if (!eff.length) return null;
        const last = eff.sort((a, b) => b.daa - a.daa)[0];
        return last ? Number(getObservationPrimaryValue(activeCategory, last) ?? 0) : null;
      }).filter(v => v !== null);
      const n = repValues.length;
      const mean = n > 0 ? repValues.reduce((s, v) => s + v, 0) / n : 0;
      const variance = n > 1 ? repValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1) : 0;
      const sd = Math.sqrt(variance);
      const cv = mean > 0 ? (sd / mean) * 100 : 0;
      let wce = 0;
      if (utcMean > 0) {
        wce = calculateEfficacy(activeCategory, mean, utcMean);
      }
      return { name: g.name, n, mean, sd, cv, wce, grouping: g.grouping, repValues };
    });
  }, [activeProject, analysisResults, state.trials, activeCategory]);

  // ── Open project dashboard ──────────────────────────────────────────────
  const openProject = (id) => {
    setActiveProjectId(id);
    setViewMode('dashboard');
    setAnalysisResults(null);
    setPostHocMethod('lsd');
    const p = projects.find(x => String(x.ID) === String(id));
    setNarrative(p?.Narrative || '');
  };

  // ── Run analysis ────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async (method = postHocMethod) => {
    if (!activeProjectId) return;
    setIsAnalyzing(true);
    try {
      const currentState = getAppState();
      const engine = new AnalysisEngine(activeProjectId, currentState, getAppState);
      // Detect primary metric: prefer yield if any trial has yield data, otherwise use category's primary observation field
      const hasYield = (currentState.trials || []).filter(t => String(t.ProjectID) === String(activeProjectId)).some(t => parseFloat(t.Yield || t.YieldValue) > 0);
      const primaryMetric = hasYield ? 'yield' : getPrimaryObservationField(activeCategory);
      const results = await engine.analyze(primaryMetric, null, null, { postHoc: method, persist: true });
      setAnalysisResults(results);
    } catch (e) {
      toast('Analysis failed: ' + e.message, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [activeProjectId, getAppState, postHocMethod, activeCategory]);

  // Auto-run analysis when project opens
  useEffect(() => {
    if (activeProjectId) runAnalysis(postHocMethod);
  }, [activeProjectId, postHocMethod, runAnalysis]); // eslint-disable-line

  // Initialize and update Chart.js instances for the Scientific Report
  useEffect(() => {
    if (viewMode !== 'report' || !activeProject || !analysisResults) return;

    const projectCategory = activeProject?.Category || activeCategory;
    const projectConfig = getCategoryConfig(projectCategory);
    const chartInstances = [];

    const safeDestroy = (instance) => {
      if (instance) instance.destroy();
    };

    // 1. WCE Over Time (Line Chart)
    const ctxWce = wceChartRef.current;
    if (ctxWce && wceTimelineData.daas.length > 0 && wceTimelineData.series.length > 0) {
      const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
      const datasets = wceTimelineData.series.map((s, index) => ({
        label: s.name,
        data: s.values,
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length],
        fill: false,
        tension: 0.1
      }));
      const chart = new Chart(ctxWce, {
        type: 'line',
        data: {
          labels: wceTimelineData.daas,
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } }
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: `% ${projectConfig.primaryMetric.key}` } }
          }
        }
      });
      chartInstances.push(chart);
    }

    // 2. Final Performance (Bar Chart)
    const ctxPerf = perfChartRef.current;
    if (ctxPerf && perfChartData.length > 0) {
      const chart = new Chart(ctxPerf, {
        type: 'bar',
        data: {
          labels: perfChartData.map(d => d.label),
          datasets: [{
            label: `Mean ${activeProject.Metric}`,
            data: perfChartData.map(d => d.value),
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: 'Mean' } }
          }
        }
      });
      chartInstances.push(chart);
    }

    // 3. Species Cover (Stacked Bar)
    const ctxSpecies = speciesChartRef.current;
    if (ctxSpecies) {
      const engine = new AnalysisEngine(activeProject.ID, state, getAppState);
      const allSpecies = new Set();
      const projectTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
      projectTrials.forEach(t => {
        const eff = safeJsonParse(t.EfficacyDataJSON, []);
        eff.forEach(e => {
          if (e.weedDetails && Array.isArray(e.weedDetails)) {
            e.weedDetails.forEach(w => {
              if (w.species && w.species.toLowerCase() !== 'total') {
                allSpecies.add(w.species);
              }
            });
          }
        });
      });

      const speciesList = [...allSpecies];
      const treatments = engine.treatments;

      if (speciesList.length > 0 && treatments.length > 0) {
        const datasets = speciesList.map((species, i) => {
          const data = treatments.map(tName => {
            const repValues = engine.getData('cover', species, null)[tName] || [];
            return repValues.length > 0 ? (repValues.reduce((s, v) => s + v, 0) / repValues.length) : 0;
          });
          const colors = ['#059669', '#d97706', '#7c3aed', '#db2777', '#2563eb', '#dc2626', '#0891b2', '#ea580c'];
          return {
            label: species,
            data: data,
            backgroundColor: colors[i % colors.length],
            borderColor: colors[i % colors.length],
            borderWidth: 1
          };
        });

        const chart = new Chart(ctxSpecies, {
          type: 'bar',
          data: {
            labels: treatments.map(t => t.length > 12 ? t.slice(0, 10) + '…' : t),
            datasets
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              tooltip: { mode: 'index', intersect: false },
              legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } }
            },
            scales: {
              x: { stacked: true },
              y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Cover (%)' } }
            }
          }
        });
        chartInstances.push(chart);
      } else {
        const ctx = ctxSpecies.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, ctxSpecies.width, ctxSpecies.height);
          ctx.font = '12px sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
          ctx.fillText(`No ${projectConfig.targetLabel.toLowerCase()} data recorded`, ctxSpecies.width / 2, ctxSpecies.height / 2);
        }
      }
    }

    // 4. Radar (Control Spectrum)
    const ctxRadar = radarChartRef.current;
    if (ctxRadar) {
      const engine = new AnalysisEngine(activeProject.ID, state, getAppState);
      const utcName = engine.utcName;
      const treatments = engine.treatments;

      const allSpecies = new Set();
      const projectTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
      projectTrials.forEach(t => {
        const eff = safeJsonParse(t.EfficacyDataJSON, []);
        eff.forEach(e => {
          if (e.weedDetails && Array.isArray(e.weedDetails)) {
            e.weedDetails.forEach(w => {
              if (w.species && w.species.toLowerCase() !== 'total') {
                allSpecies.add(w.species);
              }
            });
          }
        });
      });
      const speciesList = [...allSpecies];

      if (treatments.length > 0 && speciesList.length >= 3) {
        const utcMeans = {};
        if (utcName) {
          speciesList.forEach(s => {
            const vals = engine.getData('cover', s, null)[utcName] || [];
            utcMeans[s] = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
          });
        }

        const datasets = treatments.filter(t => t !== utcName).map((tName, i) => {
          const data = speciesList.map(s => {
            const tVals = engine.getData('cover', s, null)[tName] || [];
            const tMean = tVals.length > 0 ? (tVals.reduce((a, b) => a + b, 0) / tVals.length) : 0;
            let control = 0;
            if (utcName && utcMeans[s] > 0) {
              control = ((utcMeans[s] - tMean) / utcMeans[s]) * 100;
            } else if (!utcName) {
              control = Math.max(0, 100 - tMean);
            }
            return Math.min(100, Math.max(0, control));
          });

          const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
          return {
            label: tName,
            data,
            borderColor: colors[i % colors.length],
            backgroundColor: colors[i % colors.length] + '22',
            fill: true,
            pointRadius: 2
          };
        });

        const chart = new Chart(ctxRadar, {
          type: 'radar',
          data: { labels: speciesList, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } }
            },
            scales: {
              r: {
                min: 0,
                max: 100,
                ticks: { display: false, stepSize: 20 },
                pointLabels: { font: { size: 9 } }
              }
            }
          }
        });
        chartInstances.push(chart);
      } else {
        const ctx = ctxRadar.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, ctxRadar.width, ctxRadar.height);
          ctx.font = '12px sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
          ctx.fillText(`Need 3+ ${projectConfig.targetLabel.toLowerCase()} species for Radar`, ctxRadar.width / 2, ctxRadar.height / 2);
        }
      }
    }

    // 5. Yield Chart (Bar)
    const ctxYield = yieldChartRef.current;
    if (ctxYield) {
      const engine = new AnalysisEngine(activeProject.ID, state, getAppState);
      const yieldData = engine.getData('yield');
      const hasYield = Object.values(yieldData).some(arr => arr.values && arr.values.some(v => v > 0));

      if (hasYield) {
        const container = document.getElementById('project-yield-container');
        if (container) container.classList.remove('hidden');

        const labels = engine.treatments;
        const means = labels.map(t => {
          const vals = yieldData[t]?.values || [];
          return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
        });

        const colors = labels.map((t, i) => ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5]);

        const chart = new Chart(ctxYield, {
          type: 'bar',
          data: {
            labels: labels.map(t => t.length > 12 ? t.slice(0, 10) + '…' : t),
            datasets: [{
              label: 'Mean Yield',
              data: means,
              backgroundColor: colors,
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, title: { display: true, text: 'Yield' } }
            }
          }
        });
        chartInstances.push(chart);
      } else {
        const container = document.getElementById('project-yield-container');
        if (container) container.classList.add('hidden');
      }
    }

    return () => {
      chartInstances.forEach(safeDestroy);
    };
  }, [viewMode, activeProject, analysisResults, wceTimelineData, perfChartData, state.trials, state.formulations, activeCategory]);

  // Re-run when post-hoc method changes
  const handlePostHocChange = (method) => {
    setPostHocMethod(method);
    runAnalysis(method);
  };

  // ── Significance formatter ─────────────────────────────────────────────
  const sigStars = (p) => {
    if (!isFinite(p)) return 'N/A';
    if (p < 0.001) return '*** (p<0.001)';
    if (p < 0.01)  return '**  (p<0.01)';
    if (p < 0.05)  return '*   (p<0.05)';
    return 'ns  (p≥0.05)';
  };

  // ── Add block ───────────────────────────────────────────────────────────
  const handleAddBlock = async (e) => {
    e.preventDefault();
    if (isViewer) {
      toast('Viewer role cannot add blocks.', 'error');
      return;
    }
    if (!activeProjectId || !blockForm.Name.trim()) return;
    const payload = {
      ID: Date.now().toString(),
      ProjectID: activeProjectId,
      Name: blockForm.Name.trim(),
      ReplicationNum: blockForm.ReplicationNum || String((state.blocks || []).filter(b => String(b.ProjectID) === String(activeProjectId)).length + 1),
      CreatedAt: new Date().toISOString(),
      Category: activeCategory,
    };
    updateState({ blocks: [...(state.blocks || []), payload] });
    setBlockForm({ Name: '', ReplicationNum: '' });
    setIsAddingBlock(false);
    try {
      await addBlock(payload, getAppState);
      toast('Block added');
    } catch { toast('Failed to save block', 'error'); }
  };

  const renderLayoutPreview = () => {
    const potRows = parseInt(randomizeForm.potRows) || 9;
    const potCols = parseInt(randomizeForm.potCols) || 4;
    const potLayout = randomizeForm.potLayout || 'stripe';
    const potStripeDirection = randomizeForm.potStripeDirection || 'Horizontal Rows';
    const isHorizontal = String(potStripeDirection).toLowerCase().includes('horizontal');
    const blocksCount = parseInt(randomizeForm.potBlocks) || 3;
    const rowsPerBlock = Math.floor(potRows / blocksCount) || 1;
    const potObsMode = randomizeForm.potObsMode || 'row-wise';

    const trts = randomizeTreatments.map(t => {
      const f = activeFormulations.find(form => String(form.ID) === String(t.formulationId));
      return {
        name: t.name.trim() || f?.Name || 'Unnamed',
        role: t.role
      };
    });

    if (trts.length === 0) {
      return <p className="text-xs text-slate-400 italic text-center py-2">Add treatments to see preview.</p>;
    }

    const uniqueTrts = [...new Set(trts.map(t => t.name))];

    // Helper for deterministic pseudo-random shuffling (to avoid shifting preview on every render)
    const getSeedRandom = (seed) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    const shuffleDeterministic = (array, seed) => {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const r = getSeedRandom(seed + i);
        const j = Math.floor(r * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
      }
      return arr;
    };

    // Generate grid matrix
    const matrix = [];
    for (let r = 0; r < potRows; r++) {
      matrix[r] = [];
      for (let c = 0; c < potCols; c++) {
        matrix[r][c] = { name: '?', role: 'none' };
      }
    }

    if (potLayout === 'stripe') {
      const numUnits = isHorizontal ? potRows : potCols;
      for (let i = 0; i < numUnits; i++) {
        const t = trts[i % trts.length];
        if (isHorizontal) {
          for (let c = 0; c < potCols; c++) matrix[i][c] = t;
        } else {
          for (let r = 0; r < potRows; r++) matrix[r][i] = t;
        }
      }
    } else if (potLayout === 'randomized-row') {
      const numUnits = isHorizontal ? potRows : potCols;
      const baseList = [];
      while (baseList.length < numUnits) {
        trts.forEach(t => { if (baseList.length < numUnits) baseList.push(t); });
      }
      const shuffled = shuffleDeterministic(baseList, 123);
      for (let i = 0; i < numUnits; i++) {
        const t = shuffled[i];
        if (isHorizontal) {
          for (let c = 0; c < potCols; c++) matrix[i][c] = t;
        } else {
          for (let r = 0; r < potRows; r++) matrix[r][i] = t;
        }
      }
    } else if (potLayout === 'rcbd-pot') {
      for (let b = 0; b < blocksCount; b++) {
        const startRow = b * rowsPerBlock;
        const endRow = Math.min((b + 1) * rowsPerBlock, potRows);
        const numRowsInBlock = endRow - startRow;
        
        if (isHorizontal) {
          const blockTrts = [];
          while (blockTrts.length < numRowsInBlock) {
            trts.forEach(t => { if (blockTrts.length < numRowsInBlock) blockTrts.push(t); });
          }
          const shuffled = shuffleDeterministic(blockTrts, b + 50);
          for (let r = startRow; r < endRow; r++) {
            for (let c = 0; c < potCols; c++) {
              matrix[r][c] = shuffled[r - startRow] || { name: '?', role: 'none' };
            }
          }
        } else {
          const blockTrts = [];
          while (blockTrts.length < potCols) {
            trts.forEach(t => { if (blockTrts.length < potCols) blockTrts.push(t); });
          }
          const shuffled = shuffleDeterministic(blockTrts, b + 50);
          for (let r = startRow; r < endRow; r++) {
            for (let c = 0; c < potCols; c++) {
              matrix[r][c] = shuffled[c] || { name: '?', role: 'none' };
            }
          }
        }
      }
    } else {
      // balanced-pot
      const allPots = [];
      while (allPots.length < potRows * potCols) {
        trts.forEach(t => { if (allPots.length < potRows * potCols) allPots.push(t); });
      }
      const shuffled = shuffleDeterministic(allPots, 999);
      let idx = 0;
      for (let r = 0; r < potRows; r++) {
        for (let c = 0; c < potCols; c++) {
          matrix[r][c] = shuffled[idx++];
        }
      }
    }

    const gridElements = [];
    for (let r = 0; r < potRows; r++) {
      const rowCells = [];
      for (let c = 0; c < potCols; c++) {
        const t = matrix[r][c];
        const label = t.name;
        const abbrev = label.length > 6 ? label.substring(0, 5) + '..' : label;
        const colorClasses = getTreatmentColor(label, uniqueTrts);

        rowCells.push(
          <div 
            key={c} 
            className={`w-14 h-10 border rounded flex flex-col items-center justify-center text-[9px] font-bold shadow-sm cursor-help relative group select-none transition-all hover:scale-105 ${colorClasses}`}
            title={`Row ${r+1}, Col ${c+1}: ${label} (${t.role})`}
          >
            <span className="text-[7px] text-slate-400 absolute top-0.5 left-1">R{r+1}C{c+1}</span>
            <span className="truncate max-w-[50px] mt-2 leading-tight">{abbrev}</span>
          </div>
        );
      }

      if (potLayout === 'rcbd-pot' && r > 0 && r % rowsPerBlock === 0) {
        const blockNum = Math.floor(r / rowsPerBlock) + 1;
        gridElements.push(
          <div key={`block-divider-${r}`} className="w-full flex items-center gap-2 my-2 py-1 border-t border-dashed border-emerald-300 justify-center">
            <span className="bg-emerald-50 px-2 py-0.5 rounded text-[8px] font-bold text-emerald-800 uppercase tracking-wider">
              Block {blockNum}
            </span>
          </div>
        );
      }

      gridElements.push(
        <div key={r} className="flex gap-1.5 justify-center min-w-max py-0.5">
          {rowCells}
        </div>
      );
    }

    if (potLayout === 'rcbd-pot') {
      gridElements.unshift(
        <div key="block-divider-0" className="w-full flex items-center gap-2 mb-2 pb-1 border-b border-dashed border-emerald-300 justify-center">
          <span className="bg-emerald-50 px-2 py-0.5 rounded text-[8px] font-bold text-emerald-800 uppercase tracking-wider">
            Block 1
          </span>
        </div>
      );
    }

    const layoutNameMap = {
      'stripe': 'Stripe Layout',
      'randomized-row': 'Randomized Row',
      'balanced-pot': 'Balanced Pot',
      'rcbd-pot': 'RCBD Pot Trial'
    };

    return (
      <div className="mt-3 p-4 bg-emerald-50/30 rounded-xl border border-emerald-100 space-y-3">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Greenhouse Layout Preview</span>
          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
            {potRows} Rows × {potCols} Cols ({potRows * potCols} Pots)
          </span>
        </div>
        <div className="max-h-[300px] overflow-auto p-3 bg-white rounded-lg border shadow-inner">
          <div className="flex flex-col gap-1 items-center justify-center min-w-max">
            {gridElements}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-500 bg-white p-2.5 rounded-lg border">
          <div>Design: <span className="font-bold text-slate-700">{layoutNameMap[potLayout] || potLayout}</span></div>
          <div>Stripe: <span className="font-bold text-slate-700">{potStripeDirection}</span></div>
          <div>Obs Mode: <span className="font-bold text-slate-700">{potObsMode}</span></div>
          {potLayout === 'rcbd-pot' && <div>Blocks: <span className="font-bold text-slate-700">{blocksCount} ({rowsPerBlock} rows/block)</span></div>}
        </div>
      </div>
    );
  };

  const getTreatmentColor = (name, projectTreatments = []) => {
    if (!name) return 'bg-slate-100 border-slate-300 text-slate-400';
    const lower = name.toLowerCase();
    
    // Check standard hardcoded matches first
    if (lower === 'c' || lower.includes('control') || lower.includes('utc')) {
      return 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-600';
    }
    if (lower === 'l' || lower.includes('liquid') || lower.includes('liq')) {
      return 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-700';
    }
    if (lower === 'p' || lower.includes('powder') || lower.includes('pwd')) {
      return 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-700';
    }
    if (lower === 's' || lower.includes('synthetic') || lower.includes('syn')) {
      return 'bg-purple-50 hover:bg-purple-100 border-purple-300 text-purple-700';
    }

    const colors = [
      'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-700',
      'bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700',
      'bg-indigo-50 hover:bg-indigo-100 border-indigo-300 text-indigo-700',
      'bg-pink-50 hover:bg-pink-100 border-pink-300 text-pink-700',
      'bg-teal-50 hover:bg-teal-100 border-teal-300 text-teal-700',
      'bg-orange-50 hover:bg-orange-100 border-orange-300 text-orange-700',
      'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700',
      'bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-700',
      'bg-lime-50 hover:bg-lime-100 border-lime-300 text-lime-700',
      'bg-violet-50 hover:bg-violet-100 border-violet-300 text-violet-700'
    ];

    if (projectTreatments && projectTreatments.length > 0) {
      const idx = projectTreatments.findIndex(t => t && t.toLowerCase() === lower);
      if (idx !== -1) {
        return colors[idx % colors.length];
      }
    }

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const renderGreenhousePotGrid = () => {
    if (activeProject?.Design !== 'PotTrial') return null;

    const potRows = activeProject.PotRows || 9;
    const potCols = activeProject.PotCols || 4;
    const potLayout = activeProject.PotLayout || 'stripe';
    const potStripeDirection = activeProject.PotStripeDirection || 'Horizontal Rows';
    const potObsMode = activeProject.PotObsMode || 'row-wise';

    const projectCategory = activeProject?.Category || activeCategory;
    const categoryConfig = getCategoryConfig(projectCategory);
    const obsFields = categoryConfig.observationFields || [];

    const projectTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    const uniqueTreatments = [...new Set(projectTrials.map(t => t.FormulationName || 'Unnamed Treatment'))];

    const projectBlocks = (state.blocks || []).filter(b => String(b.ProjectID) === String(activeProject.ID));
    const blocksCount = projectBlocks.length || 3;
    const rowsPerBlock = Math.floor(potRows / blocksCount) || 3;

    // Helpers for Heatmap scaling
    const allHeatmapVals = projectTrials.map(t => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      const latest = eff.length ? eff[eff.length - 1] : null;
      if (heatmapMode === 'efficacy') {
        const sorted = [...eff].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
        if (sorted.length >= 2) {
          const baseline = sorted[0];
          const primaryObsField = getPrimaryObservationField(projectCategory);
          const baseVal = parseFloat(baseline?.[primaryObsField] ?? 100) || 100;
          const latestVal = parseFloat(sorted[sorted.length - 1]?.[primaryObsField] ?? 0) || 0;
          return calculateEfficacy(projectCategory, latestVal, baseVal);
        }
      } else if (latest && heatmapMode !== 'none') {
        return parseFloat(latest[heatmapMode]);
      }
      return null;
    }).filter(v => v !== null && !isNaN(v));

    const minVal = allHeatmapVals.length ? Math.min(...allHeatmapVals) : 0;
    const maxVal = allHeatmapVals.length ? Math.max(...allHeatmapVals) : 100;

    const gridRows = [];
    for (let r = 1; r <= potRows; r++) {
      if (potLayout === 'rcbd-pot') {
        const isBlockStart = (r - 1) % rowsPerBlock === 0;
        if (isBlockStart) {
          const blockNum = Math.floor((r - 1) / rowsPerBlock) + 1;
          const startRow = (blockNum - 1) * rowsPerBlock + 1;
          const endRow = Math.min(blockNum * rowsPerBlock, potRows);
          gridRows.push(
            <div key={`block-header-${blockNum}`} className="pt-4 pb-2 border-t-2 border-dashed border-slate-200 mt-4 first:mt-0 first:pt-0 first:border-t-0 flex items-center justify-between text-[11px] font-bold text-slate-700">
              <span className="uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                BLOCK {blockNum} (Replication {blockNum})
              </span>
              <span className="text-slate-500 font-medium">
                Rows {startRow}–{endRow}
              </span>
            </div>
          );
        }
      }

      const rowCells = [];
      for (let c = 1; c <= potCols; c++) {
        let trial;
        const blockNum = Math.floor((r - 1) / rowsPerBlock) + 1;
        if (potLayout === 'rcbd-pot') {
          if (potObsMode === 'column-wise') {
            trial = projectTrials.find(t => String(t.Replication) === String(blockNum) && String(t.PotCol) === String(c));
          } else if (potObsMode === 'row-wise') {
            trial = projectTrials.find(t => String(t.Replication) === String(blockNum) && String(t.PotRow) === String(r));
          } else {
            trial = projectTrials.find(t => String(t.Replication) === String(blockNum) && String(t.PotRow) === String(r) && String(t.PotCol) === String(c));
          }
        } else if (potObsMode === 'row-wise') {
          if (String(potStripeDirection).toLowerCase().includes('horizontal')) {
            trial = projectTrials.find(t => String(t.PotRow) === String(r));
          } else {
            trial = projectTrials.find(t => String(t.PotCol) === String(c));
          }
        } else {
          trial = projectTrials.find(t => (String(t.PotRow) === String(r) && String(t.PotCol) === String(c)) || String(t.PlotNumber) === String(r * 100 + c) || t.PotLabel === `R${r}C${c}`);
        }

        const trtName = trial?.FormulationName || (trial?.FormulationID ? ((state.formulations || []).find(f => String(f.ID) === String(trial.FormulationID))?.Name) : null) || (trial ? 'Unnamed' : 'No Treatment');
        const colorClasses = getTreatmentColor(trtName, uniqueTreatments);
        const dataStatus = trial?.Status || 'No Data';

        const matchesBlock = selectedLayoutBlock === 'all' || (trial && String(trial.BlockID) === String(selectedLayoutBlock));
        const matchesTreatment = selectedLayoutTreatment === 'all' || (trial && trial.FormulationName === selectedLayoutTreatment);
        const isHighlighted = matchesBlock && matchesTreatment;

        let heatmapStyle = {};
        let heatmapValLabel = '';
        if (heatmapMode !== 'none' && trial) {
          const eff = safeJsonParse(trial.EfficacyDataJSON, []);
          const latest = eff.length ? eff[eff.length - 1] : null;
          let val = null;
          let label = '';
          let isHighGood = true;

          if (heatmapMode === 'efficacy') {
            const sorted = [...eff].sort((a, b) => (parseFloat(a.daa) || 0) - (parseFloat(b.daa) || 0));
            if (sorted.length >= 2) {
              const baseline = sorted[0];
              const primaryObsField = getPrimaryObservationField(projectCategory);
              const baseVal = parseFloat(baseline?.[primaryObsField] ?? 100) || 100;
              const latestVal = parseFloat(sorted[sorted.length - 1]?.[primaryObsField] ?? 0) || 0;
              val = calculateEfficacy(projectCategory, latestVal, baseVal);
              label = `${val.toFixed(1)}%`;
            }
          } else {
            const field = obsFields.find(f => f.key === heatmapMode);
            if (latest && field) {
              val = parseFloat(latest[heatmapMode]);
              label = `${val}${field.unit || ''}`;
              isHighGood = field.isHighGood !== false;
            }
          }

          if (val !== null && !isNaN(val)) {
            const range = maxVal - minVal || 1;
            const pct = (val - minVal) / range;
            const hue = isHighGood ? (pct * 120) : ((1 - pct) * 120);
            heatmapStyle = {
              backgroundColor: `hsla(${hue}, 85%, 93%, 0.95)`,
              borderColor: `hsla(${hue}, 80%, 45%, 0.8)`,
              color: `hsla(${hue}, 90%, 20%, 1)`
            };
            heatmapValLabel = label;
          }
        }

        rowCells.push(
          <div 
            key={`${r}-${c}`}
            onClick={() => trial && navigate(`/trials?focus=${trial.ID}`)}
            style={heatmapMode !== 'none' && trial ? heatmapStyle : {}}
            className={`flex-1 aspect-square rounded-lg border-2 flex flex-col items-center justify-center p-1.5 cursor-pointer shadow-sm relative group transition-all duration-300 ${heatmapMode !== 'none' && trial ? '' : colorClasses} ${
              isHighlighted 
                ? 'scale-100 ring-2 ring-emerald-500 ring-offset-1 z-10' 
                : 'opacity-10 scale-90 border-dashed pointer-events-none'
            }`}
            title={`Pot R${r}C${c}: ${trtName}`}
          >
            <span className="text-[10px] font-bold">{(potLayout === 'rcbd-pot' || potObsMode === 'column-wise') ? `R${r}C${c}` : (trial?.PotLabel || `R${r}C${c}`)}</span>
            
            {heatmapMode !== 'none' && heatmapValLabel ? (
              <span className="text-[10px] font-extrabold mt-1 text-center bg-white/70 px-1 py-0.5 rounded shadow-sm border border-slate-200/50">
                {heatmapValLabel}
              </span>
            ) : (
              <>
                {trial && (
                  <span className="text-[8px] opacity-75 font-semibold mt-0.5 truncate max-w-full">
                    Block {trial.Replication || '1'}
                  </span>
                )}
                {trial && (
                  <span className="text-[9px] font-bold mt-1 text-center truncate max-w-full leading-tight">
                    {trtName}
                  </span>
                )}
              </>
            )}
            
            <div className="absolute z-20 hidden group-hover:block bg-slate-900 text-white text-[10px] rounded-lg p-2.5 shadow-xl -top-20 left-1/2 -translate-x-1/2 w-48 pointer-events-none">
              <p className="font-bold border-b border-slate-700 pb-1 mb-1">Pot Position: Row {r}, Col {c}</p>
              <p><span className="text-slate-400">Treatment:</span> {trtName}</p>
              {trial?.Dosage && <p><span className="text-slate-400">Dosage:</span> {trial.Dosage}</p>}
              {heatmapMode !== 'none' && heatmapValLabel && <p><span className="text-slate-400">Heatmap Value:</span> {heatmapValLabel}</p>}
              <p><span className="text-slate-400">Status:</span> <span className={dataStatus === 'Final' ? 'text-emerald-400 font-bold' : 'text-amber-400'}>{dataStatus}</span></p>
              <p className="text-[8px] text-slate-500 mt-1 italic text-center">Click to open data entry sheet</p>
            </div>
          </div>
        );
      }
      gridRows.push(
        <div key={r} className="flex gap-2 items-center">
          <div 
            onClick={() => {
              const rowTrial = projectTrials.find(t => t.PotRow === r || t.Replication === String(r));
              if (rowTrial) navigate(`/trials?focus=${rowTrial.ID}`);
            }}
            className="w-12 text-[10px] font-bold text-slate-400 hover:text-emerald-600 cursor-pointer uppercase text-right pr-2 hover:underline transition-colors"
            title={`Click to edit Row ${r} observations`}
          >
            R{r}
          </div>
          <div className="flex-1 flex gap-2">{rowCells}</div>
        </div>
      );
    }

    return (
      <div id="greenhouse-layout-container" className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
        {/* Heatmap Mode Controller */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="font-bold text-slate-800 text-sm">Spatial Heatmap Overlay</h4>
            <p className="text-xs text-slate-500">Render real-time color gradients across pots based on observation metrics.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Overlay Metric:</span>
            <select
              value={heatmapMode}
              onChange={e => setHeatmapMode(e.target.value)}
              className="text-xs border rounded-lg px-2.5 py-1.5 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <option value="none">Default (Treatment Colors)</option>
              <option value="efficacy">Efficacy (calculated %)</option>
              {obsFields.map(f => (
                <option key={f.key} value={f.key}>{f.label} ({f.unit || 'rating'})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Project Summary Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase">Design</span>
            <span className="font-semibold text-slate-700">{potLayout === 'rcbd-pot' ? 'RCBD Pot Trial' : 'Pot Trial'}</span>
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase">Observation Mode</span>
            <span className="font-semibold text-slate-700">
              {potObsMode === 'column-wise' ? 'Treatment Column-Wise (12 Units)' : 'Plant-Wise (36 Units)'}
            </span>
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase">Blocks × Treatments</span>
            <span className="font-semibold text-slate-700">{blocksCount} × {uniqueTreatments.length || 4}</span>
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 uppercase">Physical Pots × Analysis</span>
            <span className="font-semibold text-slate-700">
              {potRows * potCols} Pots · {potLayout === 'rcbd-pot' ? 'RCBD ANOVA' : 'Standard ANOVA'}
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center border-b pb-3">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Greenhouse Layout Visualization</h3>
            <p className="text-xs text-slate-400">Interactive 2D pot matrix. Click any pot to enter observation records.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadGreenhousePDF}
              data-pdf-download-btn
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
              title="Download full Greenhouse layout visualization as PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Greenhouse: {potRows} Rows × {potCols} Columns
            </div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <div className="w-12" />
          <div className="flex-1 flex gap-2">
            {Array.from({ length: potCols }).map((_, idx) => (
              <div key={idx} className="flex-1 text-center text-[10px] font-bold text-slate-400 uppercase">C{idx + 1}</div>
            ))}
          </div>
        </div>

        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {gridRows}
        </div>

        <div className="border-t border-slate-100 pt-3">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Treatments Legend</h4>
          <div className="flex flex-wrap gap-3">
            {uniqueTreatments.map(name => (
              <div key={name} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded border ${getTreatmentColor(name, uniqueTreatments)}`} />
                <span className="text-xs font-semibold text-slate-700">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── Delete block ────────────────────────────────────────────────────────
  const handleDeleteBlock = async (blockId, blockName) => {
    if (isViewer) {
      toast('Viewer role cannot delete blocks.', 'error');
      return;
    }
    if (!activeProjectId) return;
    const blockTrials = (state.trials || []).filter(t => String(t.BlockID) === String(blockId));
    const confirmMsg = blockTrials.length > 0
      ? `Delete block "${blockName}" and its ${blockTrials.length} plot(s)? This cannot be undone.`
      : `Delete block "${blockName}"? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    // Remove block and its trials from state
    const updatedBlocks = (state.blocks || []).filter(b => String(b.ID) !== String(blockId));
    const updatedTrials = (state.trials || []).filter(t => String(t.BlockID) !== String(blockId));
    updateState({ blocks: updatedBlocks, trials: updatedTrials });

    try {
      await deleteBlock({ ID: blockId }, getAppState, true); // Keep overlay for the single block deletion itself
      // Also delete associated trials from Firebase in parallel without overlays
      const { deleteTrial } = await import('../services/dataLayer.js');
      await Promise.all(
        blockTrials.map(t => deleteTrial({ ID: t.ID }, getAppState, false).catch(() => {}))
      );
      toast(`Block "${blockName}" deleted`);
    } catch { toast('Failed to delete block', 'error'); }
  };

  // ── Add plot to block (navigate to Trials page with block pre-selected) ──
  const handleAddPlotToBlock = (blockId) => {
    if (isViewer) {
      toast('Viewer role cannot add plots.', 'error');
      return;
    }
    navigate(`/trials?addNew=true&projectId=${activeProjectId}&blockId=${blockId}`);
  };

  // ── Lock / Unlock ───────────────────────────────────────────────────────
  const handleLockToggle = async () => {
    if (isViewer) {
      toast('Viewer role cannot lock/unlock projects.', 'error');
      return;
    }
    if (!activeProject) return;
    const newStatus = activeProject.Status === 'Locked' ? 'Draft' : 'Locked';
    const updated = (state.projects || []).map(p => String(p.ID) === String(activeProject.ID) ? { ...p, Status: newStatus } : p);
    updateState({ projects: updated });
    try {
      await updateProject({ ID: activeProject.ID, Status: newStatus }, getAppState);
      toast(`Project ${newStatus === 'Locked' ? 'locked' : 'unlocked'}`);
    } catch { toast('Failed to update project', 'error'); }
  };

  // ── Save narrative ──────────────────────────────────────────────────────
  const handleSaveNarrative = async () => {
    if (isViewer) {
      toast('Viewer role cannot save narratives.', 'error');
      return;
    }
    if (!narrative.trim()) { toast('Narrative is empty', 'error'); return; }
    setIsSavingNarrative(true);
    try {
      await updateProject({ ID: activeProjectId, Narrative: narrative }, getAppState);
      const updated = projects.map(p => String(p.ID) === String(activeProjectId) ? { ...p, Narrative: narrative } : p);
      updateState({ projects: updated });
      toast('Narrative saved');
    } catch { toast('Failed to save narrative', 'error'); }
    finally { setIsSavingNarrative(false); }
  };

  // ── Generate AI narrative ───────────────────────────────────────────────
  const handleGenerateNarrative = async () => {
    if (isViewer) {
      toast('Viewer role cannot generate AI narratives.', 'error');
      return;
    }
    if (!analysisResults) { toast('Run analysis first', 'error'); return; }
    setIsGeneratingNarrative(true);
    try {
      const groupingText = (analysisResults.grouping || [])
        .map(g => `- ${g.name}: mean=${isFinite(g.mean) ? g.mean.toFixed(2) : 'N/A'} (Group ${g.grouping})`)
        .join('\n');
      const prompt = `Act as an Agronomist. Analyze trial data for '${activeProject?.Name}'.
Metric: ${activeProject?.Metric}
Treatments & Means:
${groupingText}
Post-hoc: ${postHocMethod === 'tukey' ? 'Tukey HSD' : "Fisher's LSD"} (alpha=0.05)
ANOVA P-Value: ${isFinite(analysisResults.anova?.pVal) ? analysisResults.anova.pVal.toFixed(5) : 'N/A'}
Write a 3-paragraph Narrative covering Methodology, Results and Conclusions.`;

      const text = await generateTextWithAI(prompt, 'Act as an Agronomist.');
      setNarrative(text);
    } catch (e) {
      toast('AI error: ' + e.message, 'error');
    } finally {
      setIsGeneratingNarrative(false);
    }
  };

  const getTrialMetricValue = (t) => {
      if (config.primaryMetric.key === 'Yield' || config.primaryMetric.key === 'YieldValue') {
        return parseFloat(t.Yield || t.YieldValue || 0);
      }
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (!eff.length) return 0;
      const latest = eff.sort((a, b) => b.daa - a.daa)[0];
      return latest ? Number(getObservationPrimaryValue(activeCategory, latest) ?? 0) : 0;
  };

  // ── Recalculate DAA for project trials ──────────────────────────────────
  const handleRecalcDAA = async () => {
    if (!activeProject) return;
    const pTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    let updated = 0;
    const newTrials = (state.trials || []).map(t => {
      if (String(t.ProjectID) !== String(activeProject.ID) || !t.Date) return t;
      const appDate = new Date(t.Date);
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      const recalculated = eff.map(obs => {
        if (!obs.date) return obs;
        const obsDate = new Date(obs.date);
        const daa = Math.round((obsDate - appDate) / (1000 * 60 * 60 * 24));
        return { ...obs, daa: Math.max(0, daa) };
      });
      const changed = JSON.stringify(recalculated) !== JSON.stringify(eff);
      if (changed) updated++;
      return { ...t, EfficacyDataJSON: JSON.stringify(recalculated) };
    });
    
    // Save to local state first
    updateState({ trials: newTrials });
    
    try {
      const modifiedTrials = newTrials.filter(t => String(t.ProjectID) === String(activeProject.ID));
      await addBatchTrials({ trials: modifiedTrials }, getAppState);
      toast(`Recalculated and saved DAA for ${updated} trial(s)`, 'success');
      if (updated > 0) runAnalysis(postHocMethod);
    } catch (err) {
      console.error(err);
      toast('Failed to save recalculated DAA to database.', 'error');
    }
  };

  const handleDownloadGreenhousePDF = async () => {
    try {
      const element = document.getElementById('greenhouse-layout-container');
      if (!element) {
        toast('Greenhouse layout container not found.', 'error');
        return;
      }

      toast('Generating Greenhouse Layout PDF...', 'info');

      // Import html2canvas and jsPDF
      const html2canvasModule = await import('html2canvas');
      const html2canvas = html2canvasModule.default || html2canvasModule;
      const jsPDFModule = await import('jspdf');
      const { jsPDF } = jsPDFModule;

      // ── OKLCH / OKLAB → RGB conversion math ─────────────────────────────
      const parseOklch = (colorStr) => {
        const match = colorStr.match(/oklch\(\s*([\d%.]+)\s+([\d%.]+)\s+([\d%.]+)(?:\s*\/\s*([\d%.]+))?\s*\)/i);
        if (!match) return null;
        let L = parseFloat(match[1]);
        if (match[1].endsWith('%')) L = parseFloat(match[1]) / 100;
        let C = parseFloat(match[2]);
        if (match[2].endsWith('%')) C = parseFloat(match[2]) / 100;
        let H = parseFloat(match[3]);
        let A = match[4] !== undefined ? parseFloat(match[4]) : 1;
        if (match[4] && match[4].endsWith('%')) A = parseFloat(match[4]) / 100;
        return { L, C, H, A };
      };

      const parseOklab = (colorStr) => {
        const match = colorStr.match(/oklab\(\s*([\d%.]+)\s+([\d%.+-]+)\s+([\d%.+-]+)(?:\s*\/\s*([\d%.]+))?\s*\)/i);
        if (!match) return null;
        let L = parseFloat(match[1]);
        if (match[1].endsWith('%')) L = parseFloat(match[1]) / 100;
        let a = parseFloat(match[2]);
        if (match[2].endsWith('%')) a = parseFloat(match[2]) / 100;
        let b = parseFloat(match[3]);
        if (match[3].endsWith('%')) b = parseFloat(match[3]) / 100;
        let A = match[4] !== undefined ? parseFloat(match[4]) : 1;
        if (match[4] && match[4].endsWith('%')) A = parseFloat(match[4]) / 100;
        return { L, a, b, A };
      };

      const oklchToOklab = (L, C, H) => {
        const hRad = (H * Math.PI) / 180;
        return { L, a: C * Math.cos(hRad), b: C * Math.sin(hRad) };
      };

      const oklabToLms = (L, a, b) => {
        const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
        const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
        const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
        return {
          l: Math.pow(Math.max(0, l_), 3),
          m: Math.pow(Math.max(0, m_), 3),
          s: Math.pow(Math.max(0, s_), 3)
        };
      };

      const lmsToLinearSrgb = (l, m, s) => ({
        r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
      });

      const linearToSrgb = (c) =>
        c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

      const clamp = (val) => Math.max(0, Math.min(255, Math.round(val)));

      // Convert a single oklch(...) or oklab(...) occurrence to rgb()/rgba()
      const convertSingleColorFn = (fnStr) => {
        const trimmed = fnStr.trim().toLowerCase();

        if (trimmed.startsWith('oklch(')) {
          const parsed = parseOklch(fnStr);
          if (parsed) {
            const { L, C, H, A } = parsed;
            const { a, b } = oklchToOklab(L, C, H);
            const { l, m, s } = oklabToLms(L, a, b);
            const lin = lmsToLinearSrgb(l, m, s);
            const R = clamp(linearToSrgb(lin.r) * 255);
            const G = clamp(linearToSrgb(lin.g) * 255);
            const B = clamp(linearToSrgb(lin.b) * 255);
            return A === 1 ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${A})`;
          }
        }

        if (trimmed.startsWith('oklab(')) {
          const parsed = parseOklab(fnStr);
          if (parsed) {
            const { L, a, b, A } = parsed;
            const { l, m, s } = oklabToLms(L, a, b);
            const lin = lmsToLinearSrgb(l, m, s);
            const R = clamp(linearToSrgb(lin.r) * 255);
            const G = clamp(linearToSrgb(lin.g) * 255);
            const B = clamp(linearToSrgb(lin.b) * 255);
            return A === 1 ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${A})`;
          }
        }

        return fnStr; // unchanged
      };

      // Convert ALL oklch()/oklab() occurrences in a compound CSS value string
      // e.g. "0px 4px 6px oklch(0.5 0.1 200), inset 0px 0px 0px oklch(0.9 0.05 120)"
      const convertAllColorsInValue = (value) => {
        if (!value) return value;
        if (!value.includes('oklch(') && !value.includes('oklab(')) return value;
        // Replace each oklch(...) or oklab(...) occurrence (including nested parens for / alpha)
        return value.replace(/ok(?:lch|lab)\([^)]*\)/gi, (match) => convertSingleColorFn(match));
      };

      // ── Curated list of CSS properties to copy inline ───────────────────
      const VISUAL_PROPS = [
        'background', 'backgroundColor',
        'color',
        'border', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius',
        'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
        'boxShadow',
        'outline', 'outlineColor',
        'textDecoration', 'textDecorationColor',
        'font', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
        'letterSpacing', 'textAlign', 'textTransform', 'whiteSpace', 'wordBreak',
        'display', 'flex', 'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink',
        'justifyContent', 'alignItems', 'alignSelf',
        'gap', 'rowGap', 'columnGap',
        'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
        'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
        'position', 'top', 'left', 'right', 'bottom',
        'overflow', 'overflowX', 'overflowY',
        'opacity', 'transform',
        'zIndex', 'visibility',
        'aspectRatio', 'boxSizing',
        'verticalAlign', 'cursor'
      ];

      let convertedCount = 0;

      // Recursively copy selected computed styles from src (original) → dest (clone)
      const copySelectedComputedStyles = (src, dest) => {
        const computed = window.getComputedStyle(src);

        for (const prop of VISUAL_PROPS) {
          try {
            // getComputedStyle returns camelCase values via property access
            let value = computed[prop];
            if (value === undefined || value === '') continue;

            // Convert any oklch/oklab values in this property
            if (typeof value === 'string' && (value.includes('oklch(') || value.includes('oklab('))) {
              const original = value;
              value = convertAllColorsInValue(value);
              convertedCount++;
              console.log('Element with unsupported color:', src.tagName + (src.id ? '#' + src.id : ''), 'Property:', prop);
              console.log('Original value:', original);
              console.log('Converted value:', value);
            }

            dest.style[prop] = value;
          } catch (e) {
            // Some shorthand properties may not be readable; skip silently
          }
        }

        // Recurse into child elements
        const srcChildren = src.children;
        const destChildren = dest.children;
        for (let i = 0; i < srcChildren.length; i++) {
          if (destChildren[i]) {
            copySelectedComputedStyles(srcChildren[i], destChildren[i]);
          }
        }
      };

      // ── Build the export clone ──────────────────────────────────────────
      const clone = element.cloneNode(true);

      // Remove the download button from the clone (so it doesn't appear in the PDF)
      const downloadBtn = clone.querySelector('[data-pdf-download-btn]');
      if (downloadBtn) downloadBtn.remove();

      // Remove hover tooltips (hidden divs that shouldn't render)
      clone.querySelectorAll('.group-hover\\:block, [class*="group-hover"]').forEach(el => el.remove());

      // Append clone to body so getComputedStyle works on the original element
      // Position off-screen but keep it in flow for correct layout computation
      clone.style.position = 'fixed';
      clone.style.top = '0';
      clone.style.left = '-9999px';
      clone.style.width = element.offsetWidth + 'px';
      clone.style.height = 'auto';
      clone.style.zIndex = '-1';
      clone.style.backgroundColor = '#ffffff';
      document.body.appendChild(clone);



      // ── Copy computed styles from original → clone ──────────────────────
      console.log('[PDF Export] Starting computed style copy...');
      copySelectedComputedStyles(element, clone);
      console.log(`[PDF Export] Converted ${convertedCount} oklch/oklab color values to RGB.`);

      // ── Strip ALL class attributes so html2canvas never resolves Tailwind CSS ─
      clone.removeAttribute('class');
      clone.querySelectorAll('*').forEach(el => {
        el.removeAttribute('class');
      });
      console.log('[PDF Export] Stripped all class attributes from clone.');

      // ── Prepend a Beautifully Styled Header for the PDF ──────────────────
      const headerDiv = document.createElement('div');
      headerDiv.style.padding = '24px';
      headerDiv.style.marginBottom = '25px';
      headerDiv.style.borderBottom = '2px solid #e2e8f0';
      headerDiv.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      headerDiv.style.backgroundColor = '#ffffff';

      // Title Section
      const title = document.createElement('h1');
      title.innerText = activeProject?.Name || 'Greenhouse Trial Layout';
      title.style.fontSize = '24px';
      title.style.fontWeight = '800';
      title.style.color = '#0f172a';
      title.style.margin = '0 0 16px 0';
      headerDiv.appendChild(title);

      // Info Grid
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      grid.style.gap = '20px';
      grid.style.marginBottom = '20px';

      // Col 1: Investigator & Location
      const col1 = document.createElement('div');
      col1.innerHTML = `
        <div style="margin-bottom: 12px;">
          <div style="color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">Investigator</div>
          <div style="font-size: 14px; color: #1e293b; font-weight: 600; margin-top: 2px;">${activeProject?.Investigator || 'N/A'}</div>
        </div>
        <div>
          <div style="color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">Location</div>
          <div style="font-size: 14px; color: #1e293b; font-weight: 600; margin-top: 2px;">${activeProject?.Location || 'N/A'}</div>
        </div>
      `;
      grid.appendChild(col1);

      // Col 2: Crop
      const col2 = document.createElement('div');
      col2.innerHTML = `
        <div>
          <div style="color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">Crop</div>
          <div style="font-size: 14px; color: #1e293b; font-weight: 600; margin-top: 2px;">${activeProject?.Crop || 'N/A'}</div>
        </div>
      `;
      grid.appendChild(col2);

      // Col 3: Design & Metric
      const col3 = document.createElement('div');
      col3.innerHTML = `
        <div style="margin-bottom: 12px;">
          <div style="color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">Design / Layout</div>
          <div style="font-size: 14px; color: #1e293b; font-weight: 600; margin-top: 2px;">
            ${activeProject?.Design === 'PotTrial' ? 'Pot Trial' : 'RCBD Pot Trial'} (${projectBlocks?.length || 0} Blocks)
          </div>
        </div>
        <div>
          <div style="color: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">Evaluation Metric</div>
          <div style="font-size: 14px; color: #1e293b; font-weight: 600; margin-top: 2px;">${activeProject?.Metric || 'Weed Control Efficiency'}</div>
        </div>
      `;
      grid.appendChild(col3);

      headerDiv.appendChild(grid);

      // Treatment Details list
      const uniqueTreatmentsMap = new Map();
      projectTrials.forEach(t => {
        if (!t.FormulationName) return;
        const key = `${t.FormulationName} (Dosage: ${t.Dosage || 'Default'})`;
        uniqueTreatmentsMap.set(key, { name: t.FormulationName, dosage: t.Dosage, isControl: String(t.IsControl).toLowerCase() === 'true' });
      });

      if (uniqueTreatmentsMap.size > 0) {
        const trSection = document.createElement('div');
        trSection.style.marginTop = '16px';
        trSection.style.paddingTop = '16px';
        trSection.style.borderTop = '1px dashed #e2e8f0';

        const trTitle = document.createElement('div');
        trTitle.innerText = 'Treatment Details';
        trTitle.style.color = '#64748b';
        trTitle.style.fontSize = '10px';
        trTitle.style.fontWeight = '700';
        trTitle.style.letterSpacing = '0.05em';
        trTitle.style.textTransform = 'uppercase';
        trTitle.style.marginBottom = '10px';
        trSection.appendChild(trTitle);

        const trList = document.createElement('div');
        trList.style.display = 'flex';
        trList.style.flexWrap = 'wrap';
        trList.style.gap = '8px';

        uniqueTreatmentsMap.forEach((tr) => {
          const badge = document.createElement('span');
          badge.style.display = 'inline-block';
          badge.style.padding = '5px 10px';
          badge.style.backgroundColor = tr.isControl ? '#f8fafc' : '#f0fdf4';
          badge.style.border = tr.isControl ? '1px solid #cbd5e1' : '1px solid #bbf7d0';
          badge.style.color = tr.isControl ? '#475569' : '#166534';
          badge.style.borderRadius = '8px';
          badge.style.fontSize = '12px';
          badge.style.fontWeight = '600';
          badge.innerText = `${tr.name}${tr.dosage ? ` (${tr.dosage})` : ''}`;
          trList.appendChild(badge);
        });

        trSection.appendChild(trList);
        headerDiv.appendChild(trSection);
      }

      clone.prepend(headerDiv);


      // ── Expand ALL scrollable containers AFTER style copy ────────────────
      // This must run after copySelectedComputedStyles, because that function
      // copies the original element's overflow/maxHeight (e.g. overflow:auto,
      // max-height:500px) which would re-constrain the clone.
      clone.querySelectorAll('*').forEach(el => {
        const isScrollable = el.scrollHeight > el.clientHeight ||
          el.style.overflow === 'auto' || el.style.overflow === 'scroll' ||
          el.style.overflowY === 'auto' || el.style.overflowY === 'scroll' ||
          el.style.maxHeight !== 'none';
        if (isScrollable) {
          el.style.maxHeight = 'none';
          el.style.height = 'auto';
          el.style.overflow = 'visible';
          el.style.overflowY = 'visible';
          el.style.overflowX = 'visible';
        }
      });

      // Expand the root clone itself to its full content size
      clone.style.position = 'absolute';
      clone.style.top = '0';
      clone.style.left = '0';
      clone.style.zIndex = '99999';
      clone.style.backgroundColor = '#ffffff';
      clone.style.overflow = 'visible';
      clone.style.maxHeight = 'none';
      clone.style.height = clone.scrollHeight + 'px';

      console.log('[PDF Export] Scroll Height:', clone.scrollHeight);
      console.log('[PDF Export] Client Height:', clone.clientHeight);

      // ── Capture with html2canvas ────────────────────────────────────────
      console.log('[PDF Export] Starting html2canvas capture...');
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: true,
        windowWidth: clone.scrollWidth,
        windowHeight: clone.scrollHeight
      });
      console.log(`[PDF Export] Canvas captured: ${canvas.width}x${canvas.height}`);

      // Clean up the clone
      document.body.removeChild(clone);

      // ── Verify canvas has colors (not all black) ────────────────────────
      const ctx = canvas.getContext('2d');
      const sampleData = ctx.getImageData(
        Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 10, 10
      ).data;
      let hasColor = false;
      for (let i = 0; i < sampleData.length; i += 4) {
        const r = sampleData[i], g = sampleData[i + 1], b = sampleData[i + 2];
        // Check if any pixel is not pure black and not pure white
        if (!((r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255))) {
          hasColor = true;
          break;
        }
      }
      console.log(`[PDF Export] Canvas color check: ${hasColor ? 'PASS - colors detected' : 'WARNING - only black/white detected'}`);

      // ── Generate PDF ────────────────────────────────────────────────────
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // Convert px to mm for PDF (at scale=2, effective DPI ≈ 192, so ÷ 7.56 for mm)
      const scaleFactor = 2;
      const pxPerMm = (96 * scaleFactor) / 25.4; // 96 DPI * scale / mm-per-inch
      const pdfWidth = imgWidth / pxPerMm;
      const pdfHeight = imgHeight / pxPerMm;
      
      const pdf = new jsPDF({
        orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [pdfWidth, pdfHeight]
      });

      const imgData = canvas.toDataURL('image/png', 1.0);
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      const fileName = `${activeProject?.Name || 'Project'}-greenhouse-layout.pdf`;
      pdf.save(fileName);
      toast('Greenhouse layout PDF downloaded successfully!', 'success');
    } catch (error) {
      console.error('[PDF Export] Failed to generate PDF:', error);
      toast('Failed to generate PDF: ' + error.message, 'error');
    }
  };


  // ── Randomize Layout ────────────────────────────────────────────────────
  const [isRandomizeModalOpen, setIsRandomizeModalOpen] = useState(false);

  const handleRandomizeLayout = () => {
    if (!activeProject) return;
    const pBlocks = (state.blocks || []).filter(b => String(b.ProjectID) === String(activeProject.ID));
    const pTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    
    const initialTreatments = [];
    
    if (pTrials.length > 0) {
      const seen = new Set();
      pTrials.forEach((t, idx) => {
        const key = `${t.FormulationID || ''}_${t.FormulationName || ''}_${t.Dosage || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          const isCtrl = String(t.IsControl).toLowerCase() === 'true';
          initialTreatments.push({
            id: `trt_${Date.now()}_${idx}`,
            name: t.FormulationName || (isCtrl ? 'Untreated Control' : 'Unnamed'),
            formulationId: t.FormulationID || '',
            dosage: t.Dosage || '',
            role: isCtrl ? 'control' : (String(t.IsStandardCheck).toLowerCase() === 'true' ? 'standard' : 'experimental')
          });
        }
      });
    }
    
    if (initialTreatments.length === 0) {
      initialTreatments.push({
        id: 'control_' + Date.now(),
        name: 'Untreated Control',
        formulationId: '',
        dosage: '',
        role: 'control'
      });
    }
    
    setRandomizeTreatments(initialTreatments);
    
    setRandomizeForm({
      investigatorName: activeProject.Investigator || '',
      dosage: '',
      weedSpecies: activeProject.TargetWeed || '',
      date: activeProject.StartDate ? activeProject.StartDate.split('T')[0] : new Date().toISOString().split('T')[0],
      replications: String(pBlocks.length || 4),
      trialDesign: activeProject.Design || 'RCBD',
      potRows: String(activeProject.PotRows || 9),
      potCols: String(activeProject.PotCols || 4),
      potLayout: activeProject.PotLayout || 'stripe',
      potStripeDirection: activeProject.PotStripeDirection || 'Horizontal Rows',
      potObsMode: activeProject.PotObsMode || 'row-wise',
      potDataMethod: activeProject.PotDataMethod || 'total',
      potFields: activeProject.PotFields || ['Plant Height', 'Branches', 'Flowers', 'Fruit Count', 'Yield'],
      potIdentifierFormat: activeProject.PotIdentifierFormat || 'row-col',
      potBlocks: String(activeProject.PotBlocks || 3)
    });
    
    setIsRandomizeModalOpen(true);
  };

  const addTreatmentRow = () => {
    setRandomizeTreatments(prev => [
      ...prev,
      {
        id: 'trt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: '',
        formulationId: '',
        dosage: '',
        role: 'experimental'
      }
    ]);
  };

  const updateTreatmentRow = (id, field, value) => {
    setRandomizeTreatments(prev => prev.map(t => {
      if (t.id !== id) return t;
      const updated = { ...t, [field]: value };
      
      if (field === 'formulationId') {
        const form = activeFormulations.find(f => String(f.ID) === String(value));
        if (form) {
          updated.name = form.Name;
          updated.role = form.Name.toLowerCase().includes('check') || form.Name.toLowerCase().includes('standard') ? 'standard' : 'experimental';
        } else if (value === '') {
          updated.name = 'Untreated Control';
          updated.role = 'control';
        }
      }
      return updated;
    }));
  };

  const deleteTreatmentRow = (id) => {
    const row = randomizeTreatments.find(t => t.id === id);
    const rowName = row && row.name ? `"${row.name}"` : 'this row';
    if (!window.confirm(`Delete ${rowName}?`)) return;
    setRandomizeTreatments(prev => prev.filter(t => t.id !== id));
  };

  const handleAddPotField = (newField) => {
    if (!newField.trim()) return;
    if ((randomizeForm.potFields || []).includes(newField.trim())) {
      toast('Field already exists', 'error');
      return;
    }
    setRandomizeForm(p => ({
      ...p,
      potFields: [...(p.potFields || []), newField.trim()]
    }));
  };

  const handleRemovePotField = (field) => {
    setRandomizeForm(p => ({
      ...p,
      potFields: (p.potFields || []).filter(f => f !== field)
    }));
  };

  const handleMovePotField = (index, direction) => {
    const newFields = [...(randomizeForm.potFields || [])];
    if (direction === 'up' && index > 0) {
      [newFields[index], newFields[index - 1]] = [newFields[index - 1], newFields[index]];
    } else if (direction === 'down' && index < newFields.length - 1) {
      [newFields[index], newFields[index + 1]] = [newFields[index + 1], newFields[index]];
    }
    setRandomizeForm(p => ({
      ...p,
      potFields: newFields
    }));
  };

  const generateFactorialCombinations = () => {
    const mainLvl = (randomizeForm.mainFactorLevels || '').split(',').map(x => x.trim()).filter(Boolean);
    const subLvl = (randomizeForm.subFactorLevels || '').split(',').map(x => x.trim()).filter(Boolean);
    
    if (mainLvl.length === 0 || subLvl.length === 0) {
      toast('Please enter both Factor A and Factor B levels.', 'error');
      return;
    }
    
    const combined = [];
    mainLvl.forEach(m => {
      subLvl.forEach(s => {
        combined.push({
          id: Math.random().toString(36).substring(2, 9),
          name: `${m} x ${s}`,
          formulationId: '',
          dosage: randomizeForm.dosage || '',
          role: 'experimental',
          mainFactor: m,
          subFactor: s
        });
      });
    });
    
    combined.push({
      id: Math.random().toString(36).substring(2, 9),
      name: 'Untreated Control',
      formulationId: '',
      dosage: '',
      role: 'control',
      mainFactor: 'Control',
      subFactor: 'Control'
    });
    
    setRandomizeTreatments(combined);
    toast(`Generated ${combined.length} factorial combinations!`, 'success');
  };

  const applyRandomization = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isViewer) {
      toast('Viewer role cannot randomize or modify layouts.', 'error');
      return;
    }
    
    let potRows = 9;
    let potCols = 4;
    let potLayout = 'stripe';
    let potStripeDirection = 'Horizontal Rows';
    let potObsMode = 'row-wise';
    let potDataMethod = 'total';
    
    // Get list of treatments
    const trtList = randomizeTreatments.map(t => {
      const f = activeFormulations.find(form => String(form.ID) === String(t.formulationId));
      return {
        fid: t.formulationId || '',
        name: t.name.trim() || f?.Name || 'Unnamed Treatment',
        role: t.role,
        dosage: t.dosage || '',
        mainFactor: t.mainFactor || '',
        subFactor: t.subFactor || ''
      };
    });
      
    if (trtList.length === 0) {
      toast('Please add at least one treatment.', 'error');
      return;
    }
    
    const controls = trtList.filter(t => t.role === 'control');
    if (controls.length === 0) {
      if (!window.confirm("You have not selected an Untreated Control. Do you want to proceed with generating the layout anyway?")) {
        return;
      }
    } else if (controls.length > 1) {
      toast('You cannot have more than one Untreated Control.', 'error');
      return;
    }
    
    setIsRandomizeModalOpen(false);
    toast('Generating randomized layout and blocks...');

    const designType = randomizeForm.trialDesign || 'RCBD';
    const numReps = parseInt(randomizeForm.replications) || 4;
    const blocksToSave = [];
    const trialsToSave = [];

    if (designType === 'CRD') {
      const blockId = 'block_' + Date.now() + '_crd_' + Math.random().toString(36).substring(2, 7);
      const block = {
        ID: blockId,
        ProjectID: activeProject.ID,
        Name: 'CRD Field Layout',
        ReplicationNum: '1',
        CreatedAt: new Date().toISOString(),
        Category: activeCategory
      };
      blocksToSave.push(block);

      const allPlots = [];
      for (let r = 1; r <= numReps; r++) {
        trtList.forEach(t => {
          allPlots.push({
            ...t,
            repNum: r
          });
        });
      }

      for (let i = allPlots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPlots[i], allPlots[j]] = [allPlots[j], allPlots[i]];
      }

      allPlots.forEach((t, index) => {
        const trialId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
        const targetField = config.targetField || 'WeedSpecies';
        
        const tToSave = {
          ID: trialId,
          ProjectID: activeProject.ID,
          BlockID: block.ID,
          FormulationID: t.fid,
          FormulationName: t.name,
          InvestigatorName: randomizeForm.investigatorName || '',
          Dosage: t.dosage || randomizeForm.dosage || '',
          Date: randomizeForm.date || new Date().toISOString().split('T')[0],
          Replication: String(t.repNum),
          RandomizationOrder: index + 1,
          IsControl: t.role === 'control',
          IsStandardCheck: t.role === 'standard',
          Status: 'Draft',
          IsLive: true,
          EfficacyDataJSON: '[]',
          PhotoURLs: '[]',
          WeedPhotosJSON: '[]',
          PlotNumber: 100 + index + 1,
          AISummariesJSON: JSON.stringify({ plotNum: 100 + index + 1 }),
          Category: activeCategory,
          TrialDesign: 'CRD',
          [targetField]: randomizeForm.weedSpecies || ''
        };
        trialsToSave.push(tToSave);
      });

    } else if (designType === 'Split-Plot') {
      for (let r = 1; r <= numReps; r++) {
        const blockId = 'block_' + Date.now() + '_' + r + '_' + Math.random().toString(36).substring(2, 7);
        const blockName = `Rep ${String.fromCharCode(64 + r)}`;
        const block = {
          ID: blockId,
          ProjectID: activeProject.ID,
          Name: blockName,
          ReplicationNum: String(r),
          CreatedAt: new Date().toISOString(),
          Category: activeCategory
        };
        blocksToSave.push(block);

        const mainFactors = [...new Set(trtList.map(t => t.mainFactor || 'Control'))];
        
        const shuffledMainFactors = [...mainFactors];
        for (let i = shuffledMainFactors.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledMainFactors[i], shuffledMainFactors[j]] = [shuffledMainFactors[j], shuffledMainFactors[i]];
        }

        let plotIndex = 1;
        shuffledMainFactors.forEach((mf) => {
          const subPlots = trtList.filter(t => (t.mainFactor || 'Control') === mf);
          
          const shuffledSubPlots = [...subPlots];
          for (let i = shuffledSubPlots.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledSubPlots[i], shuffledSubPlots[j]] = [shuffledSubPlots[j], shuffledSubPlots[i]];
          }

          shuffledSubPlots.forEach((t) => {
            const trialId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
            const targetField = config.targetField || 'WeedSpecies';
            
            const tToSave = {
              ID: trialId,
              ProjectID: activeProject.ID,
              BlockID: block.ID,
              FormulationID: t.fid,
              FormulationName: t.name,
              InvestigatorName: randomizeForm.investigatorName || '',
              Dosage: t.dosage || randomizeForm.dosage || '',
              Date: randomizeForm.date || new Date().toISOString().split('T')[0],
              Replication: block.ReplicationNum,
              RandomizationOrder: plotIndex,
              IsControl: t.role === 'control',
              IsStandardCheck: t.role === 'standard',
              Status: 'Draft',
              IsLive: true,
              EfficacyDataJSON: '[]',
              PhotoURLs: '[]',
              WeedPhotosJSON: '[]',
              PlotNumber: r * 100 + plotIndex,
              AISummariesJSON: JSON.stringify({ plotNum: r * 100 + plotIndex }),
              Category: activeCategory,
              TrialDesign: 'Split-Plot',
              MainFactor: mf,
              SubFactor: t.subFactor || 'N/A',
              [targetField]: randomizeForm.weedSpecies || ''
            };
            trialsToSave.push(tToSave);
            plotIndex++;
          });
        });
      }

    } else if (designType === 'Strip-Plot') {
      for (let r = 1; r <= numReps; r++) {
        const blockId = 'block_' + Date.now() + '_' + r + '_' + Math.random().toString(36).substring(2, 7);
        const blockName = `Rep ${String.fromCharCode(64 + r)}`;
        const block = {
          ID: blockId,
          ProjectID: activeProject.ID,
          Name: blockName,
          ReplicationNum: String(r),
          CreatedAt: new Date().toISOString(),
          Category: activeCategory
        };
        blocksToSave.push(block);

        const mainFactors = [...new Set(trtList.map(t => t.mainFactor || 'Control'))];
        const subFactors = [...new Set(trtList.map(t => t.subFactor || 'Control'))];

        const shuffledRows = [...mainFactors];
        for (let i = shuffledRows.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledRows[i], shuffledRows[j]] = [shuffledRows[j], shuffledRows[i]];
        }

        const shuffledCols = [...subFactors];
        for (let i = shuffledCols.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledCols[i], shuffledCols[j]] = [shuffledCols[j], shuffledCols[i]];
        }

        let plotIndex = 1;
        shuffledRows.forEach((rowFactor) => {
          shuffledCols.forEach((colFactor) => {
            const t = trtList.find(x => (x.mainFactor || 'Control') === rowFactor && (x.subFactor || 'Control') === colFactor) || trtList[0];
            
            const trialId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
            const targetField = config.targetField || 'WeedSpecies';
            
            const tToSave = {
              ID: trialId,
              ProjectID: activeProject.ID,
              BlockID: block.ID,
              FormulationID: t.fid,
              FormulationName: t.name,
              InvestigatorName: randomizeForm.investigatorName || '',
              Dosage: t.dosage || randomizeForm.dosage || '',
              Date: randomizeForm.date || new Date().toISOString().split('T')[0],
              Replication: block.ReplicationNum,
              RandomizationOrder: plotIndex,
              IsControl: t.role === 'control',
              IsStandardCheck: t.role === 'standard',
              Status: 'Draft',
              IsLive: true,
              EfficacyDataJSON: '[]',
              PhotoURLs: '[]',
              WeedPhotosJSON: '[]',
              PlotNumber: r * 100 + plotIndex,
              AISummariesJSON: JSON.stringify({ plotNum: r * 100 + plotIndex }),
              Category: activeCategory,
              TrialDesign: 'Strip-Plot',
              MainFactor: rowFactor,
              SubFactor: colFactor,
              [targetField]: randomizeForm.weedSpecies || ''
            };
            trialsToSave.push(tToSave);
            plotIndex++;
          });
        });
      }

    } else if (designType === 'Lattice') {
      const k = Math.ceil(Math.sqrt(trtList.length));
      
      for (let r = 1; r <= numReps; r++) {
        const shuffledTrts = [...trtList];
        for (let i = shuffledTrts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledTrts[i], shuffledTrts[j]] = [shuffledTrts[j], shuffledTrts[i]];
        }

        const blockId = 'block_' + Date.now() + '_' + r + '_' + Math.random().toString(36).substring(2, 7);
        const blockName = `Rep ${String.fromCharCode(64 + r)}`;
        const block = {
          ID: blockId,
          ProjectID: activeProject.ID,
          Name: blockName,
          ReplicationNum: String(r),
          CreatedAt: new Date().toISOString(),
          Category: activeCategory
        };
        blocksToSave.push(block);

        let plotIndex = 1;
        for (let bNum = 1; bNum <= k; bNum++) {
          const blockSlice = shuffledTrts.slice((bNum - 1) * k, bNum * k);
          const subBlockId = `Block ${String.fromCharCode(64 + r)}${bNum}`;
          
          blockSlice.forEach((t) => {
            const trialId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
            const targetField = config.targetField || 'WeedSpecies';
            
            const tToSave = {
              ID: trialId,
              ProjectID: activeProject.ID,
              BlockID: block.ID,
              FormulationID: t.fid,
              FormulationName: t.name,
              InvestigatorName: randomizeForm.investigatorName || '',
              Dosage: t.dosage || randomizeForm.dosage || '',
              Date: randomizeForm.date || new Date().toISOString().split('T')[0],
              Replication: block.ReplicationNum,
              RandomizationOrder: plotIndex,
              IsControl: t.role === 'control',
              IsStandardCheck: t.role === 'standard',
              Status: 'Draft',
              IsLive: true,
              EfficacyDataJSON: '[]',
              PhotoURLs: '[]',
              WeedPhotosJSON: '[]',
              PlotNumber: r * 100 + plotIndex,
              AISummariesJSON: JSON.stringify({ plotNum: r * 100 + plotIndex }),
              Category: activeCategory,
              TrialDesign: 'Lattice',
              SubBlockID: subBlockId,
              [targetField]: randomizeForm.weedSpecies || ''
            };
            trialsToSave.push(tToSave);
            plotIndex++;
          });
        }
      }

    } else if (designType === 'PotTrial') {
      potRows = parseInt(randomizeForm.potRows) || 9;
      potCols = parseInt(randomizeForm.potCols) || 4;
      potLayout = randomizeForm.potLayout || 'stripe';
      potStripeDirection = randomizeForm.potStripeDirection || 'Horizontal Rows';
      potObsMode = randomizeForm.potObsMode || 'row-wise';
      potDataMethod = randomizeForm.potDataMethod || 'total';

      if (potLayout === 'rcbd-pot') {
        const blocksCount = parseInt(randomizeForm.potBlocks) || 3;
        const rowsPerBlock = Math.floor(potRows / blocksCount);
        const isHorizontal = String(potStripeDirection).toLowerCase().includes('horizontal');

        console.log('Randomization parameters:', {
          potLayout,
          potObsMode,
          potStripeDirection,
          experimentalUnit: potObsMode === 'row-wise' ? 'Row' : (potObsMode === 'column-wise' ? 'Treatment Column' : 'Pot')
        });

        let plotIndex = 1;
        for (let b = 1; b <= blocksCount; b++) {
          const blockId = 'block_' + Date.now() + '_pot_rcbd_' + b + '_' + Math.random().toString(36).substring(2, 7);
          const block = {
            ID: blockId,
            ProjectID: activeProject.ID,
            Name: `Block ${b}`,
            ReplicationNum: String(b),
            CreatedAt: new Date().toISOString(),
            Category: activeCategory
          };
          blocksToSave.push(block);

          const startRow = (b - 1) * rowsPerBlock + 1;
          const endRow = b * rowsPerBlock;
          const numRowsInBlock = endRow - startRow + 1;

          if (isHorizontal) {
            const blockTrtList = [];
            while (blockTrtList.length < numRowsInBlock) {
              trtList.forEach(t => {
                if (blockTrtList.length < numRowsInBlock) {
                  blockTrtList.push(t);
                }
              });
            }
            for (let i = blockTrtList.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              const temp = blockTrtList[i];
              blockTrtList[i] = blockTrtList[j];
              blockTrtList[j] = temp;
            }

            if (potObsMode === 'row-wise' || potObsMode === 'column-wise') {
              for (let r = startRow; r <= endRow; r++) {
                const t = blockTrtList[r - startRow];
                const trialId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
                const targetField = config.targetField || 'WeedSpecies';
                const label = `Row ${r} (${potCols} Pots)`;
                const plotNum = b * 100 + (r - startRow + 1);

                const tToSave = {
                  ID: trialId,
                  ProjectID: activeProject.ID,
                  BlockID: block.ID,
                  FormulationID: t.fid,
                  FormulationName: t.name,
                  InvestigatorName: randomizeForm.investigatorName || '',
                  Dosage: t.dosage || randomizeForm.dosage || '',
                  Date: randomizeForm.date || new Date().toISOString().split('T')[0],
                  Replication: String(b),
                  RandomizationOrder: plotIndex,
                  IsControl: t.role === 'control',
                  IsStandardCheck: t.role === 'standard',
                  Status: 'Draft',
                  IsLive: true,
                  EfficacyDataJSON: '[]',
                  PhotoURLs: '[]',
                  WeedPhotosJSON: '[]',
                  PlotNumber: plotNum,
                  AISummariesJSON: JSON.stringify({ plotNum, label, row: r }),
                  Category: activeCategory,
                  TrialDesign: 'PotTrial',
                  PotRow: r,
                  PotCol: null,
                  PotLabel: label,
                  [targetField]: randomizeForm.weedSpecies || ''
                };
                trialsToSave.push(tToSave);
                plotIndex++;
              }
            } else {
              for (let r = startRow; r <= endRow; r++) {
                const t = blockTrtList[r - startRow];
                for (let c = 1; c <= potCols; c++) {
                  const trialId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
                  const targetField = config.targetField || 'WeedSpecies';
                  const label = randomizeForm.potIdentifierFormat === 'sequential' 
                    ? `P${String((r - 1) * potCols + c).padStart(3, '0')}` 
                    : `R${r}C${c}`;
                  const plotNum = r * 100 + c;

                  const tToSave = {
                    ID: trialId,
                    ProjectID: activeProject.ID,
                    BlockID: block.ID,
                    FormulationID: t.fid,
                    FormulationName: t.name,
                    InvestigatorName: randomizeForm.investigatorName || '',
                    Dosage: t.dosage || randomizeForm.dosage || '',
                    Date: randomizeForm.date || new Date().toISOString().split('T')[0],
                    Replication: String(b),
                    RandomizationOrder: plotIndex,
                    IsControl: t.role === 'control',
                    IsStandardCheck: t.role === 'standard',
                    Status: 'Draft',
                    IsLive: true,
                    EfficacyDataJSON: '[]',
                    PhotoURLs: '[]',
                    WeedPhotosJSON: '[]',
                    PlotNumber: plotNum,
                    AISummariesJSON: JSON.stringify({ plotNum, label, row: r, col: c }),
                    Category: activeCategory,
                    TrialDesign: 'PotTrial',
                    PotRow: r,
                    PotCol: c,
                    PotLabel: label,
                    [targetField]: randomizeForm.weedSpecies || ''
                  };
                  trialsToSave.push(tToSave);
                  plotIndex++;
                }
              }
            }
          } else {
            const blockTrtList = [];
            while (blockTrtList.length < potCols) {
              trtList.forEach(t => {
                if (blockTrtList.length < potCols) {
                  blockTrtList.push(t);
                }
              });
            }
            for (let i = blockTrtList.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              const temp = blockTrtList[i];
              blockTrtList[i] = blockTrtList[j];
              blockTrtList[j] = temp;
            }

            if (potObsMode === 'column-wise' || potObsMode === 'row-wise') {
              for (let c = 1; c <= potCols; c++) {
                const t = blockTrtList[c - 1];
                const trialId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
                const targetField = config.targetField || 'WeedSpecies';
                const label = `Col ${c} (${numRowsInBlock} Pots)`;
                const plotNum = b * 100 + c;

                const tToSave = {
                  ID: trialId,
                  ProjectID: activeProject.ID,
                  BlockID: block.ID,
                  FormulationID: t.fid,
                  FormulationName: t.name,
                  InvestigatorName: randomizeForm.investigatorName || '',
                  Dosage: t.dosage || randomizeForm.dosage || '',
                  Date: randomizeForm.date || new Date().toISOString().split('T')[0],
                  Replication: String(b),
                  RandomizationOrder: plotIndex,
                  IsControl: t.role === 'control',
                  IsStandardCheck: t.role === 'standard',
                  Status: 'Draft',
                  IsLive: true,
                  EfficacyDataJSON: '[]',
                  PhotoURLs: '[]',
                  WeedPhotosJSON: '[]',
                  PlotNumber: plotNum,
                  AISummariesJSON: JSON.stringify({ plotNum, label, col: c }),
                  Category: activeCategory,
                  TrialDesign: 'PotTrial',
                  PotCol: c,
                  PotRow: null,
                  PotLabel: label,
                  [targetField]: randomizeForm.weedSpecies || ''
                };
                trialsToSave.push(tToSave);
                plotIndex++;
              }
            } else {
              for (let r = startRow; r <= endRow; r++) {
                for (let c = 1; c <= potCols; c++) {
                  const t = blockTrtList[c - 1];
                  const trialId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
                  const targetField = config.targetField || 'WeedSpecies';
                  const label = randomizeForm.potIdentifierFormat === 'sequential' 
                    ? `P${String((r - 1) * potCols + c).padStart(3, '0')}` 
                    : `R${r}C${c}`;
                  const plotNum = r * 100 + c;

                  const tToSave = {
                    ID: trialId,
                    ProjectID: activeProject.ID,
                    BlockID: block.ID,
                    FormulationID: t.fid,
                    FormulationName: t.name,
                    InvestigatorName: randomizeForm.investigatorName || '',
                    Dosage: t.dosage || randomizeForm.dosage || '',
                    Date: randomizeForm.date || new Date().toISOString().split('T')[0],
                    Replication: String(b),
                    RandomizationOrder: plotIndex,
                    IsControl: t.role === 'control',
                    IsStandardCheck: t.role === 'standard',
                    Status: 'Draft',
                    IsLive: true,
                    EfficacyDataJSON: '[]',
                    PhotoURLs: '[]',
                    WeedPhotosJSON: '[]',
                    PlotNumber: plotNum,
                    AISummariesJSON: JSON.stringify({ plotNum, label, row: r, col: c }),
                    Category: activeCategory,
                    TrialDesign: 'PotTrial',
                    PotRow: r,
                    PotCol: c,
                    PotLabel: label,
                    [targetField]: randomizeForm.weedSpecies || ''
                  };
                  trialsToSave.push(tToSave);
                  plotIndex++;
                }
              }
            }
          }
        }
      } else {
        const blockId = 'block_' + Date.now() + '_pot_' + Math.random().toString(36).substring(2, 7);
        const block = {
          ID: blockId,
          ProjectID: activeProject.ID,
          Name: 'Greenhouse Pot Layout',
          ReplicationNum: '1',
          CreatedAt: new Date().toISOString(),
          Category: activeCategory
        };
        blocksToSave.push(block);

        if (potObsMode === 'row-wise') {
          const isHorizontal = String(potStripeDirection).toLowerCase().includes('horizontal');
          const numUnits = isHorizontal ? potRows : potCols;

          let assignedTreatments = [];
          if (potLayout === 'stripe') {
            for (let i = 0; i < numUnits; i++) {
              assignedTreatments.push(trtList[i % trtList.length]);
            }
          } else {
            const baseList = [];
            while (baseList.length < numUnits) {
              trtList.forEach(t => {
                if (baseList.length < numUnits) {
                  baseList.push(t);
                }
              });
            }
            for (let i = baseList.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [baseList[i], baseList[j]] = [baseList[j], baseList[i]];
            }
            assignedTreatments = baseList;
          }

          assignedTreatments.forEach((t, index) => {
            const trialId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
            const targetField = config.targetField || 'WeedSpecies';
            const unitIndex = index + 1;
            const label = isHorizontal ? `Row ${unitIndex}` : `Column ${unitIndex}`;

            const tToSave = {
              ID: trialId,
              ProjectID: activeProject.ID,
              BlockID: block.ID,
              FormulationID: t.fid,
              FormulationName: t.name,
              InvestigatorName: randomizeForm.investigatorName || '',
              Dosage: t.dosage || randomizeForm.dosage || '',
              Date: randomizeForm.date || new Date().toISOString().split('T')[0],
              Replication: String(unitIndex),
              RandomizationOrder: unitIndex,
              IsControl: t.role === 'control',
              IsStandardCheck: t.role === 'standard',
              Status: 'Draft',
              IsLive: true,
              EfficacyDataJSON: '[]',
              PhotoURLs: '[]',
              WeedPhotosJSON: '[]',
              PlotNumber: unitIndex,
              AISummariesJSON: JSON.stringify({ plotNum: unitIndex, label }),
              Category: activeCategory,
              TrialDesign: 'PotTrial',
              PotRow: isHorizontal ? unitIndex : null,
              PotCol: isHorizontal ? null : unitIndex,
              PotLabel: label,
              [targetField]: randomizeForm.weedSpecies || ''
            };
            trialsToSave.push(tToSave);
          });
        } else {
          const isHorizontal = String(potStripeDirection).toLowerCase().includes('horizontal');
          let rowColAssignments = {};

          if (potLayout === 'stripe') {
            const numUnits = isHorizontal ? potRows : potCols;
            for (let i = 1; i <= numUnits; i++) {
              rowColAssignments[i] = trtList[(i - 1) % trtList.length];
            }
          } else if (potLayout === 'randomized-row') {
            const numUnits = isHorizontal ? potRows : potCols;
            const baseList = [];
            while (baseList.length < numUnits) {
              trtList.forEach(t => {
                if (baseList.length < numUnits) {
                  baseList.push(t);
                }
              });
            }
            for (let i = baseList.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [baseList[i], baseList[j]] = [baseList[j], baseList[i]];
            }
            for (let i = 1; i <= numUnits; i++) {
              rowColAssignments[i] = baseList[i - 1];
            }
          }

          let plotIndex = 1;
          for (let r = 1; r <= potRows; r++) {
            let rowTreatments = [];
            if (potLayout === 'balanced-pot') {
              const numUnits = potCols;
              const baseList = [];
              while (baseList.length < numUnits) {
                trtList.forEach(t => {
                  if (baseList.length < numUnits) {
                    baseList.push(t);
                  }
                });
              }
              for (let i = baseList.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [baseList[i], baseList[j]] = [baseList[j], baseList[i]];
              }
              rowTreatments = baseList;
            }

            for (let c = 1; c <= potCols; c++) {
              let t;
              if (potLayout === 'balanced-pot') {
                t = rowTreatments[c - 1];
              } else {
                const unitKey = isHorizontal ? r : c;
                t = rowColAssignments[unitKey];
              }

              const trialId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
              const targetField = config.targetField || 'WeedSpecies';
              const label = randomizeForm.potIdentifierFormat === 'sequential' 
                ? `P${String((r - 1) * potCols + c).padStart(3, '0')}` 
                : `R${r}C${c}`;
              const plotNum = r * 100 + c;

              const tToSave = {
                ID: trialId,
                ProjectID: activeProject.ID,
                BlockID: block.ID,
                FormulationID: t.fid,
                FormulationName: t.name,
                InvestigatorName: randomizeForm.investigatorName || '',
                Dosage: t.dosage || randomizeForm.dosage || '',
                Date: randomizeForm.date || new Date().toISOString().split('T')[0],
                Replication: String(plotNum),
                RandomizationOrder: plotIndex,
                IsControl: t.role === 'control',
                IsStandardCheck: t.role === 'standard',
                Status: 'Draft',
                IsLive: true,
                EfficacyDataJSON: '[]',
                PhotoURLs: '[]',
                WeedPhotosJSON: '[]',
                PlotNumber: plotNum,
                AISummariesJSON: JSON.stringify({ plotNum, label, row: r, col: c }),
                Category: activeCategory,
                TrialDesign: 'PotTrial',
                PotRow: r,
                PotCol: c,
                PotLabel: label,
                [targetField]: randomizeForm.weedSpecies || ''
              };
              trialsToSave.push(tToSave);
              plotIndex++;
            }
          }
        }
      }

      await updateProject({
        ID: activeProject.ID,
        Design: 'PotTrial',
        PotRows: potRows,
        PotCols: potCols,
        PotLayout: potLayout,
        PotStripeDirection: potStripeDirection,
        PotObsMode: potObsMode,
        PotDataMethod: potDataMethod,
        PotFields: randomizeForm.potFields || ['Plant Height', 'Branches', 'Flowers', 'Fruit Count', 'Yield'],
        PotIdentifierFormat: randomizeForm.potIdentifierFormat || 'row-col'
      }, getAppState);

    } else {
      for (let r = 1; r <= numReps; r++) {
        const blockId = 'block_' + Date.now() + '_' + r + '_' + Math.random().toString(36).substring(2, 7);
        const blockName = `Rep ${String.fromCharCode(64 + r)}`;
        blocksToSave.push({
          ID: blockId,
          ProjectID: activeProject.ID,
          Name: blockName,
          ReplicationNum: String(r),
          CreatedAt: new Date().toISOString(),
          Category: activeCategory
        });
      }

      blocksToSave.forEach(block => {
        const blockTreatments = trtList.map(t => ({
          FormulationID: t.fid,
          FormulationName: t.name,
          IsControl: t.role === 'control',
          IsStandardCheck: t.role === 'standard',
          dosage: t.dosage,
          mainFactor: t.mainFactor,
          subFactor: t.subFactor
        }));

        for (let i = blockTreatments.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [blockTreatments[i], blockTreatments[j]] = [blockTreatments[j], blockTreatments[i]];
        }

        blockTreatments.forEach((t, index) => {
          const trialId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
          const targetField = config.targetField || 'WeedSpecies';

          const tToSave = {
            ID: trialId,
            ProjectID: activeProject.ID,
            BlockID: block.ID,
            FormulationID: t.FormulationID,
            FormulationName: t.FormulationName,
            InvestigatorName: randomizeForm.investigatorName || '',
            Dosage: t.dosage || randomizeForm.dosage || '',
            Date: randomizeForm.date || new Date().toISOString().split('T')[0],
            Replication: block.ReplicationNum || '1',
            RandomizationOrder: index + 1,
            IsControl: t.IsControl,
            IsStandardCheck: t.IsStandardCheck,
            Status: 'Draft',
            IsLive: true,
            EfficacyDataJSON: '[]',
            PhotoURLs: '[]',
            WeedPhotosJSON: '[]',
            PlotNumber: index + 1,
            AISummariesJSON: JSON.stringify({ plotNum: index + 1 }),
            Category: activeCategory,
            TrialDesign: designType,
            MainFactor: t.mainFactor || '',
            SubFactor: t.subFactor || '',
            [targetField]: randomizeForm.weedSpecies || ''
          };
          trialsToSave.push(tToSave);
        });
      });
    }

    const currentBlocks = state.blocks || [];
    const otherBlocks = currentBlocks.filter(b => String(b.ProjectID) !== String(activeProject.ID));
    const currentTrials = state.trials || [];
    const otherTrials = currentTrials.filter(t => String(t.ProjectID) !== String(activeProject.ID));

    const updatedProjects = (state.projects || []).map(p => {
      if (String(p.ID) === String(activeProject.ID)) {
        if (designType === 'PotTrial') {
          return {
            ...p,
            Design: 'PotTrial',
            PotRows: potRows,
            PotCols: potCols,
            PotLayout: potLayout,
            PotStripeDirection: potStripeDirection,
            PotObsMode: potObsMode,
            PotDataMethod: potDataMethod,
            PotFields: randomizeForm.potFields || ['Plant Height', 'Branches', 'Flowers', 'Fruit Count', 'Yield'],
            PotIdentifierFormat: randomizeForm.potIdentifierFormat || 'row-col',
            PotBlocks: parseInt(randomizeForm.potBlocks) || 3
          };
        } else {
          return {
            ...p,
            Design: designType
          };
        }
      }
      return p;
    });

    updateState({
      projects: updatedProjects,
      blocks: [...otherBlocks, ...blocksToSave],
      trials: [...otherTrials, ...trialsToSave]
    });

    const oldBlocks = currentBlocks.filter(b => String(b.ProjectID) === String(activeProject.ID));
    const oldTrials = currentTrials.filter(t => String(t.ProjectID) === String(activeProject.ID));

    try {
      await Promise.all([
        ...oldTrials.map(t => deleteTrial({ ID: t.ID }, getAppState, false).catch(e => console.error(e))),
        ...oldBlocks.map(b => deleteBlock({ ID: b.ID }, getAppState, false).catch(e => console.error(e)))
      ]);

      await Promise.all(
        blocksToSave.map(b => addBlock(b, getAppState, false).catch(e => console.error(e)))
      );

      await addBatchTrials({ trials: trialsToSave }, getAppState, false);
      toast('Randomized layout generated successfully!', 'success');
      runAnalysis(postHocMethod);
    } catch (err) {
      console.error(err);
      toast('Failed to save randomized layout to database.', 'error');
    }
  };

  // ── Protocol Settings ───────────────────────────────────────────────────
  const [isProtocolModalOpen, setIsProtocolModalOpen] = useState(false);
  const [protocolForm, setProtocolForm] = useState({ 
    Name: '',
    TargetWeed: '', 
    Crop: '', 
    Metric: 'Weed Control Efficiency', 
    ApplicationTiming: '', 
    SprayVolume: '', 
    Notes: '',
    Location: '',
    Investigator: '',
    Lat: '',
    Lon: '',
    WeatherTemp: '',
    WeatherHumidity: '',
    WeatherWind: '',
    WeatherRain: '',
    WeatherDetails: ''
  });

  const openProtocolSettings = () => {
    if (!activeProject) return;
    setProtocolForm({
      Name: activeProject.Name || '',
      TargetWeed: activeProject.TargetWeed || '',
      Crop: activeProject.Crop || '',
      Metric: activeProject.Metric || 'Weed Control Efficiency',
      ApplicationTiming: activeProject.ApplicationTiming || '',
      SprayVolume: activeProject.SprayVolume || '',
      Notes: activeProject.Notes || '',
      Location: activeProject.Location || '',
      Investigator: activeProject.Investigator || '',
      Lat: activeProject.Lat || '',
      Lon: activeProject.Lon || '',
      WeatherTemp: activeProject.WeatherTemp || '',
      WeatherHumidity: activeProject.WeatherHumidity || '',
      WeatherWind: activeProject.WeatherWind || '',
      WeatherRain: activeProject.WeatherRain || '',
      WeatherDetails: activeProject.WeatherDetails || ''
    });
    setIsProtocolModalOpen(true);
  };

  const saveProtocolSettings = async () => {
    if (isViewer) {
      toast('Viewer role cannot modify protocol settings.', 'error');
      return;
    }
    if (!activeProject) return;
    const updated = projects.map(p => p.ID === activeProject.ID ? { ...p, ...protocolForm } : p);
    updateState({ projects: updated });
    try {
      await updateProject({ ID: activeProject.ID, ...protocolForm }, getAppState);
      toast('Project & protocol settings saved');
      setIsProtocolModalOpen(false);
    } catch { toast('Failed to save', 'error'); }
  };

  // ── Scientific Report ─────────────────────────────────────────────────────
  const triggerExportWithCustomisation = (exportFn) => {
    const projectCategory = activeProject?.Category || activeCategory;
    const fields = activeProject?.Design === 'PotTrial'
      ? (activeProject.PotFields || ['Plant Height', 'Branches', 'Flowers', 'Fruit Count', 'Yield']).map(f => ({ key: f, label: f }))
      : (getCategoryConfig(projectCategory).observationFields || []);
    const initialSelection = {};
    fields.forEach(f => {
      initialSelection[f.key] = true;
    });
    setReportFieldSelection(initialSelection);
    setPendingReportExport(() => exportFn);
    setCustomiseReportModalOpen(true);
  };

  const handleScientificReport = () => {
    if (!activeProject || !analysisResults) { toast('Run analysis first', 'error'); return; }
    setViewMode('report');
    toast('Scientific report view loaded');
  };

  const handleExportAdvancedExcel = async () => {
    if (!activeProject) {
      toast('No active project selected.', 'error');
      return;
    }
    const pTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    if (!pTrials.length) {
      toast('No sub-trials/plots found in this project to export.', 'error');
      return;
    }
    const projectCategory = activeProject?.Category || activeCategory;
    toast('Generating Project-wide Advanced Excel Report...', 'info');
    try {
      const generator = new AdvancedReportGenerator(pTrials, projectCategory);
      await generator.generateCompleteReport();
      toast('Project report generated successfully!', 'success');
    } catch (err) {
      console.error(err);
      toast(`Failed to generate project report: ${err.message}`, 'error');
    }
  };

  // ── Regulatory DOCX Export ────────────────────────────────────────────────
  const handleRegulatoryDOCX = async () => {
    if (!activeProject || !analysisResults) { toast('Run analysis first', 'error'); return; }
    const pTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    try {
      await exportMasterDocx(activeProject, pTrials, {
        aiSummary: narrative,
        analysis: analysisResults
      });
    } catch (err) {
      console.error(err);
      toast(`Failed to generate Regulatory DOCX: ${err.message}`, 'error');
    }
  };

  const handleDownloadMasterPDF = async () => {
    if (!activeProject) return;
    const pTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    const projectCategory = activeProject?.Category || activeCategory;
    try {
      await generateMasterComprehensivePdf(activeProject, pTrials, {
        withIngredients: true,
        withWeeds: true,
        withTimeline: true,
        showPhotoDates: true,
        formulations: state.formulations || [],
        aiSummary: narrative,
        analysis: analysisResults
      });
    } catch (err) {
      console.error(err);
      toast(`Failed to generate Master PDF: ${err.message}`, 'error');
    }
  };

  const handleDownloadMasterDocx = async () => {
    if (!activeProject) return;
    const pTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    try {
      await exportMasterDocx(activeProject, pTrials, {
        aiSummary: narrative,
        analysis: analysisResults
      });
    } catch (err) {
      console.error(err);
      toast(`Failed to generate Master DOCX: ${err.message}`, 'error');
    }
  };

  const handleDownloadMasterPpt = async () => {
    if (!activeProject) return;
    const pTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    try {
      await generateMasterPpt(activeProject, pTrials);
    } catch (err) {
      console.error(err);
      toast(`Failed to generate Master PPT: ${err.message}`, 'error');
    }
  };

  // ── Regulatory PDF ────────────────────────────────────────────────────
  const handleRegulatoryPDF = () => {
    if (!activeProject || !analysisResults) { toast('Run analysis first', 'error'); return; }
    const projectCategory = activeProject?.Category || activeCategory;
    const projectConfig = getCategoryConfig(projectCategory);
    const pTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    const pBlocks = (state.blocks || []).filter(b => String(b.ProjectID) === String(activeProject.ID));
    const cv = isFinite(analysisResults.anova?.cv) ? analysisResults.anova.cv.toFixed(1) : 'N/A';
    const rows = (analysisResults.grouping || []).map(g => {
      const ts = treatmentStats.find(x => x.name === g.name);
      return `<tr><td style="padding:6px 10px;border:1px solid #ddd">${g.name}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${isFinite(g.mean) ? g.mean.toFixed(2) : '-'}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${ts ? ts.sd.toFixed(2) : '-'}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${ts ? ts.cv.toFixed(1) : '-'}%</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center">${ts ? ts.wce.toFixed(1) : '-'}${projectConfig.primaryMetric.unit || ''}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;font-weight:bold;color:#059669">${g.grouping}</td></tr>`;
    }).join('');

    // Gather all photos from project trials
    const allPhotos = [];
    pTrials.forEach(t => {
      const pList = safeJsonParse(t.PhotoURLs, []);
      pList.forEach(p => {
        allPhotos.push({
          ...p,
          trialName: t.FormulationName || 'Untreated Control',
          rep: t.Replication || 'R1',
          plotNum: t.PlotNumber || ''
        });
      });
    });

    let photosHtml = '';
    if (allPhotos.length > 0) {
      photosHtml = `
        <h2>Photographic Evidence Log</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          ${allPhotos.map((p, idx) => {
            const label = p.label ? `[Plot ${p.plotNum} - ${p.trialName}] ${p.label}` : `Plot ${p.plotNum} - ${p.trialName} - Photo ${idx + 1}`;
            const dateStr = p.date ? new Date(p.date).toLocaleDateString() : '';
            const imgSrc = p.fileData || p.url || p.src || '';
            return `
              <div style="border: 1px solid #ddd; padding: 10px; border-radius: 8px; text-align: center; background: #fff; page-break-inside: avoid;">
                <p style="font-size: 11px; font-weight: bold; margin: 5px 0; color: #1e293b;">${label}</p>
                <p style="font-size: 9px; color: #64748b; margin: 0 0 8px 0;">Captured: ${dateStr}</p>
                ${imgSrc ? `<img src="${imgSrc}" style="max-width: 100%; max-height: 200px; border-radius: 4px; display: block; margin: 0 auto;" />` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    const html = `<!DOCTYPE html><html><head><title>Regulatory Report - ${activeProject.Name}</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#1e293b}h1{color:#065f46}h2{color:#334155;margin-top:24px;font-size:14px;text-transform:uppercase;letter-spacing:1px}table{border-collapse:collapse;width:100%}th{background:#f1f5f9;padding:8px 10px;border:1px solid #ddd;text-align:left;font-size:11px;text-transform:uppercase}td{font-size:12px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:12px;color:#475569}.meta span{font-weight:600;color:#1e293b}.sig{background:#dcfce7;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;color:#166534}</style></head>
<body><h1>RCBD Trial Report: ${activeProject.Name}</h1>
<div class="meta"><div>Location: <span>${activeProject.Location || 'N/A'}</span></div><div>Investigator: <span>${activeProject.Investigator || 'N/A'}</span></div>
<div>Crop: <span>${activeProject.Crop || 'N/A'}</span></div><div>Metric: <span>${activeProject.Metric}</span></div>
<div>Blocks: <span>${pBlocks.length}</span></div><div>Plots: <span>${pTrials.length}</span></div>
<div>Start Date: <span>${formatDateTime(activeProject.StartDate) || 'N/A'}</span></div><div>Generated: <span>${formatDateTime(new Date())}</span></div></div>
<h2>Treatment Means & Statistical Grouping</h2>
<table><thead><tr><th>Treatment</th><th>Mean</th><th>SD</th><th>CV%</th><th>${projectConfig.primaryMetric.key}%</th><th>Group (${postHocMethod === 'tukey' ? 'Tukey' : 'LSD'})</th></tr></thead><tbody>${rows}</tbody></table>
<p style="font-size:11px;color:#64748b;margin-top:6px">Means sharing the same letter are not significantly different (${postHocMethod === 'tukey' ? 'Tukey HSD' : "Fisher's LSD"}, α=0.05). ${postHocMethod === 'tukey' ? 'HSD' : 'LSD'} (0.05): ${isFinite(analysisResults.postHoc?.value) ? analysisResults.postHoc.value.toFixed(2) : 'N/A'}</p>
<h2>ANOVA Table</h2>
<table><thead><tr><th>Source</th><th>DF</th><th>SS</th><th>MS</th><th>F</th><th>P</th><th>Sig</th></tr></thead><tbody>
<tr><td style="padding:6px 10px;border:1px solid #ddd">Treatment</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${analysisResults.anova?.dfTreat ?? '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.ssTreat) ? analysisResults.anova.ssTreat.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.msTreat) ? analysisResults.anova.msTreat.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right;font-weight:bold">${isFinite(analysisResults.anova?.fVal) ? analysisResults.anova.fVal.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.pVal) ? analysisResults.anova.pVal.toFixed(4) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:center" class="sig">${sigStars(analysisResults.anova?.pVal)}</td></tr>
<tr><td style="padding:6px 10px;border:1px solid #ddd">Block</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${analysisResults.anova?.dfBlock ?? '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.ssBlock) ? analysisResults.anova.ssBlock.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.msBlock) ? analysisResults.anova.msBlock.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd"></td><td style="padding:6px 10px;border:1px solid #ddd"></td><td style="padding:6px 10px;border:1px solid #ddd"></td></tr>
<tr><td style="padding:6px 10px;border:1px solid #ddd">Error</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${analysisResults.anova?.dfError ?? '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.ssError) ? analysisResults.anova.ssError.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.msError) ? analysisResults.anova.msError.toFixed(2) : '-'}</td><td style="padding:6px 10px;border:1px solid #ddd"></td><td style="padding:6px 10px;border:1px solid #ddd"></td><td style="padding:6px 10px;border:1px solid #ddd"></td></tr>
<tr style="font-weight:bold;background:#f8fafc"><td style="padding:6px 10px;border:1px solid #ddd">Total</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${analysisResults.anova?.dfTotal ?? '-'}</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${isFinite(analysisResults.anova?.ssTotal) ? analysisResults.anova.ssTotal.toFixed(2) : '-'}</td><td colspan="4" style="padding:6px 10px;border:1px solid #ddd"></td></tr>
</tbody></table>
<p style="font-size:11px;color:#64748b;margin-top:6px">CV: ${cv}% · Design: ${analysisResults.balance?.isBalanced ? 'Balanced RCBD' : 'Unbalanced RCBD'}</p>
${narrative ? `<h2>Agronomist Narrative</h2><p style="font-size:13px;line-height:1.6;white-space:pre-wrap">${narrative}</p>` : ''}
${photosHtml}
</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
    toast('Regulatory report opened for printing');
  };

  // ── Export helpers ──────────────────────────────────────────────────────
  const exportCSV = (filename, rows, headers) => {
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = filename; a.click();
  };

  const handleExportR = () => {
    if (!activeProject) return;
    const key = config.primaryMetric.key;
    const trials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    exportCSV(`${activeProject.Name}_R.csv`, trials.map(t => {
      const val = getTrialMetricValue(t);
      return {
        Treatment: t.FormulationName,
        Block: t.Replication || t.BlockID || '1',
        [key]: val,
        Result: t.Result || val
      };
    }), ['Treatment', 'Block', key, 'Result']);
    toast('Exported for R');
  };

  const handleExportSAS = () => {
    if (!activeProject) return;
    const key = config.primaryMetric.key;
    const keyLower = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const trials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    const lines = ['data rcbd;', `input trt $ block ${keyLower};`, 'datalines;',
      ...trials.map(t => `${(t.FormulationName || 'T').replace(/\s/g, '_')} ${t.Replication || t.BlockID || 1} ${getTrialMetricValue(t)}`),
      ';', 'run;', '', 'proc glm data=rcbd;', '  class trt block;', `  model ${keyLower}=block trt;`, '  lsmeans trt / pdiff adjust=tukey;', 'run;'
    ];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    a.download = `${activeProject.Name}_SAS.sas`; a.click();
    toast('Exported for SAS');
  };

  const handleExportBundle = () => {
    if (!activeProject || !analysisResults) { toast('Run analysis first', 'error'); return; }
    const json = JSON.stringify({ project: activeProject, analysis: analysisResults }, null, 2);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `${activeProject.Name}_analysis_bundle.json`; a.click();
    toast('Analysis bundle exported');
  };

  // ── Create project ──────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (isViewer) {
      toast(editingProject ? 'Viewer role cannot edit projects.' : 'Viewer role cannot create projects.', 'error');
      return;
    }
    if (editingProject) {
      const payload = {
        ...editingProject,
        ...formData,
        UpdatedAt: new Date().toISOString(),
      };
      const updatedList = (state.projects || []).map(p => String(p.ID) === String(editingProject.ID) ? payload : p);
      updateState({ projects: updatedList });
      setIsModalOpen(false);
      try {
        await updateProject(payload, getAppState);
        toast('Project updated');
      } catch {
        toast('Failed to update project', 'error');
      }
    } else {
      const payload = {
        ...formData,
        Category: activeCategory,
        ID: Date.now().toString(),
        Status: 'Draft',
        CreatedAt: new Date().toISOString(),
        BlocksJSON: '[]',
        AnalysisResultsJSON: '{}',
        Narrative: '',
        CreatedBy: state.auth?.user?.id || 'system',
      };
      updateState({ projects: [...(state.projects || []), payload] });
      setIsModalOpen(false);
      try {
        await addProject(payload, getAppState);
        toast('Project created');
      } catch { toast('Failed to create project', 'error'); }
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (isViewer) {
      toast('Viewer role cannot delete projects.', 'error');
      return;
    }
    const proj = (state.projects || []).find(p => String(p.ID) === String(id));
    if (!isOwnData(proj)) {
      toast('This project belongs to another scientist and cannot be deleted.', 'error');
      return;
    }
    const projectName = proj ? proj.Name : 'this project';
    if (!window.confirm(`Are you sure you want to delete "${projectName}"? This will permanently delete the project and all its associated blocks and plots/trials. This cannot be undone.`)) return;
    
    // Find all blocks and trials associated with this project
    const projectBlocks = (state.blocks || []).filter(b => String(b.ProjectID) === String(id));
    const projectTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(id));

    // Update state to remove project, blocks, and trials
    updateState({ 
      projects: (state.projects || []).filter(p => String(p.ID) !== String(id)),
      blocks: (state.blocks || []).filter(b => String(b.ProjectID) !== String(id)),
      trials: (state.trials || []).filter(t => String(t.ProjectID) !== String(id))
    });

    try {
      await deleteProject({ ID: id }, getAppState);
      
      // Delete associated blocks and trials in parallel without blocking screen overlays
      const { deleteTrial } = await import('../services/dataLayer.js');
      await Promise.all([
        ...projectBlocks.map(b => deleteBlock({ ID: b.ID }, getAppState, false).catch(err => console.error('Failed to delete block', b.ID, err))),
        ...projectTrials.map(t => deleteTrial({ ID: t.ID }, getAppState, false).catch(err => console.error('Failed to delete trial', t.ID, err)))
      ]);
      
      toast('Project and all associated blocks and trials deleted');
    } catch { 
      toast('Failed to delete project', 'error'); 
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PROJECT DASHBOARD VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (activeProject) {
    const projectBlocks = (state.blocks || []).filter(b => String(b.ProjectID) === String(activeProject.ID));
    const projectTrials = (state.trials || []).filter(t => String(t.ProjectID) === String(activeProject.ID));
    const treatments = [...new Set(projectTrials.map(t => t.FormulationName).filter(Boolean))];
    const isLocked = activeProject.Status === 'Locked';
    const projectCategory = activeProject?.Category || activeCategory;
    const projectConfig = getCategoryConfig(projectCategory);

    const theme = getThemeClasses(projectConfig.color?.accent || 'emerald');

    if (viewMode === 'split-viewer') {
      const controlTrials = projectTrials.filter(t => t.IsControl === true || t.IsControl === 'true');
      const treatedTrials = projectTrials.filter(t => !(t.IsControl === true || t.IsControl === 'true'));
      
      const activeControlTrial = controlTrials.find(t => t.ID === selectedControlTrialId) || controlTrials[0] || projectTrials[0];
      const activeTreatedTrial = treatedTrials.find(t => t.ID === selectedTreatedTrialId) || treatedTrials[0] || projectTrials[0];

      const allDaas = [...new Set(projectTrials.flatMap(t => {
        const eff = safeJsonParse(t.EfficacyDataJSON, []);
        return eff.map(o => Number(o.daa));
      }))].filter(n => !isNaN(n)).sort((a, b) => a - b);
      if (allDaas.length === 0) allDaas.push(0);

      const currentDaa = allDaas.includes(selectedDaa) ? selectedDaa : allDaas[0];

      const getPhotoForDaa = (trial, targetDaa) => {
        if (!trial) return null;
        const photos = safeJsonParse(trial.PhotoURLs, []);
        if (photos.length === 0) return null;
        const eff = safeJsonParse(trial.EfficacyDataJSON, []);
        const obsAtDaa = eff.find(o => Number(o.daa) === targetDaa);
        if (obsAtDaa && obsAtDaa.date) {
          const obsDate = obsAtDaa.date.split('T')[0];
          const match = photos.find(p => {
            const pSrc = typeof p === 'string' ? p : (p.fileData || p.url || '');
            const pDate = p.date || '';
            return pDate.split('T')[0] === obsDate;
          });
          if (match) return match;
        }
        const calcMatch = photos.find(p => {
          if (!p.date || !trial.Date) return false;
          const diffTime = Math.abs(new Date(p.date.split('T')[0]) - new Date(trial.Date.split('T')[0]));
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
          return diffDays === targetDaa;
        });
        if (calcMatch) return calcMatch;
        return photos[0];
      };

      const controlPhoto = getPhotoForDaa(activeControlTrial, currentDaa);
      const treatedPhoto = getPhotoForDaa(activeTreatedTrial, currentDaa);

      const controlPhotoSrc = controlPhoto ? (typeof controlPhoto === 'string' ? controlPhoto : (controlPhoto.fileData || controlPhoto.url)) : null;
      const treatedPhotoSrc = treatedPhoto ? (typeof treatedPhoto === 'string' ? treatedPhoto : (treatedPhoto.fileData || treatedPhoto.url)) : null;

      const getObsAtDaa = (trial, targetDaa) => {
        if (!trial) return null;
        const eff = safeJsonParse(trial.EfficacyDataJSON, []);
        return eff.find(o => Number(o.daa) === targetDaa);
      };

      const controlObs = getObsAtDaa(activeControlTrial, currentDaa);
      const treatedObs = getObsAtDaa(activeTreatedTrial, currentDaa);

      return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
          <TopBar title={`Side-by-Side Analysis - ${activeProject.Name}`} onMenuClick={onMenuClick} />
          
          <div className="bg-white border-b px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <button onClick={() => setViewMode('dashboard')} className="p-2 rounded-full hover:bg-slate-100 transition">
                <ArrowLeft className="h-6 w-6 text-slate-600" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Side-by-Side Plot Viewer</h1>
                <p className="text-xs text-slate-500">Sync treated and control plot imagery at identical Days After Application (DAA)</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full">
              <span className="text-xs font-semibold text-slate-500 mr-2 shrink-0">Select DAA:</span>
              {allDaas.map(d => (
                <button
                  key={d}
                  onClick={() => setSelectedDaa(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 ${
                    currentDaa === d 
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  DAA {d}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
              
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    <h2 className="font-bold text-sm text-slate-800">Control Plot / Standard Check</h2>
                  </div>
                  <select
                    value={activeControlTrial?.ID || ''}
                    onChange={e => setSelectedControlTrialId(e.target.value)}
                    className="text-xs border rounded-lg px-2.5 py-1.5 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-purple-400 max-w-xs truncate"
                  >
                    {controlTrials.map(t => (
                      <option key={t.ID} value={t.ID}>
                        {t.FormulationName} (Block {t.Replication || '1'})
                      </option>
                    ))}
                    {controlTrials.length === 0 && (
                      <option value="">No Control Trials Available</option>
                    )}
                  </select>
                </div>
                
                <div className="aspect-video w-full bg-slate-900 flex items-center justify-center relative group overflow-hidden">
                  {controlPhotoSrc ? (
                    <img
                      src={controlPhotoSrc}
                      alt="Control plot at selected DAA"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-slate-500">
                      <Image className="w-12 h-12 mx-auto mb-2 opacity-30 text-white" />
                      <p className="text-sm font-semibold">No Image Available</p>
                      <p className="text-xs mt-1">No plot photo uploaded for DAA {currentDaa}</p>
                    </div>
                  )}
                  {controlPhoto && (
                    <div className="absolute bottom-3 left-3 bg-black/70 text-white px-2 py-0.5 rounded text-[10px] font-bold">
                      {controlPhoto.tag || controlPhoto.label || 'Observation'}
                    </div>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-slate-50 rounded-xl p-3 border">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Primary Observation</span>
                        <span className="text-lg font-extrabold text-slate-800">
                          {controlObs ? `${controlObs[projectConfig.primaryMetric.key] ?? '—'}${projectConfig.primaryMetric.unit || ''}` : '—'}
                        </span>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3 border">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Recorded On</span>
                        <span className="text-xs font-bold text-slate-700">
                          {controlObs?.date ? formatDate(controlObs.date) : 'No observation log'}
                        </span>
                      </div>
                    </div>

                    {controlObs?.notes && (
                      <div className="mb-4">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">Observation Notes</span>
                        <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5 border italic">
                          "{controlObs.notes}"
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>Block ID: {activeControlTrial?.BlockID || '—'}</span>
                    <span>Replication: {activeControlTrial?.Replication || '1'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <h2 className="font-bold text-sm text-slate-800">Treated Plot</h2>
                  </div>
                  <select
                    value={activeTreatedTrial?.ID || ''}
                    onChange={e => setSelectedTreatedTrialId(e.target.value)}
                    className="text-xs border rounded-lg px-2.5 py-1.5 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400 max-w-xs truncate"
                  >
                    {treatedTrials.map(t => (
                      <option key={t.ID} value={t.ID}>
                        {t.FormulationName} (Block {t.Replication || '1'})
                      </option>
                    ))}
                    {treatedTrials.length === 0 && (
                      <option value="">No Treated Trials Available</option>
                    )}
                  </select>
                </div>
                
                <div className="aspect-video w-full bg-slate-900 flex items-center justify-center relative group overflow-hidden">
                  {treatedPhotoSrc ? (
                    <img
                      src={treatedPhotoSrc}
                      alt="Treated plot at selected DAA"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-slate-500">
                      <Image className="w-12 h-12 mx-auto mb-2 opacity-30 text-white" />
                      <p className="text-sm font-semibold">No Image Available</p>
                      <p className="text-xs mt-1">No plot photo uploaded for DAA {currentDaa}</p>
                    </div>
                  )}
                  {treatedPhoto && (
                    <div className="absolute bottom-3 left-3 bg-black/70 text-white px-2 py-0.5 rounded text-[10px] font-bold">
                      {treatedPhoto.tag || treatedPhoto.label || 'Observation'}
                    </div>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-slate-50 rounded-xl p-3 border">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Primary Observation</span>
                        <span className="text-lg font-extrabold text-slate-800">
                          {treatedObs ? `${treatedObs[projectConfig.primaryMetric.key] ?? '—'}${projectConfig.primaryMetric.unit || ''}` : '—'}
                        </span>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3 border">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">Recorded On</span>
                        <span className="text-xs font-bold text-slate-700">
                          {treatedObs?.date ? formatDate(treatedObs.date) : 'No observation log'}
                        </span>
                      </div>
                    </div>

                    {treatedObs?.notes && (
                      <div className="mb-4">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">Observation Notes</span>
                        <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5 border italic">
                          "{treatedObs.notes}"
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>Block ID: {activeTreatedTrial?.BlockID || '—'}</span>
                    <span>Replication: {activeTreatedTrial?.Replication || '1'}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
          {renderModals()}
        </div>
      );
    }

    if (viewMode === 'report') {
      const temps = projectTrials.map(t => parseFloat(t.Temperature)).filter(n => isFinite(n));
      const hums = projectTrials.map(t => parseFloat(t.Humidity)).filter(n => isFinite(n));
      const rains = projectTrials.map(t => parseFloat(t.Rain)).filter(n => isFinite(n));
      const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 'N/A';
      const sum = arr => arr.length ? arr.reduce((a, b) => a + b, 0).toFixed(1) : 'N/A';

      return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
          <TopBar title={`Scientific Report - ${activeProject.Name}`} onMenuClick={onMenuClick} />
          <div className="flex-1 overflow-y-auto">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4">
              <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button onClick={() => setViewMode('dashboard')} className="p-2 rounded-full hover:bg-slate-100 transition">
                    <ArrowLeft className="h-6 w-6 text-slate-600" />
                  </button>
                  <div>
                    <h1 className="text-2xl font-bold text-slate-800">Scientific Trial Report</h1>
                    <p className="text-xs text-slate-500">{activeProject.Name} — Metric: {activeProject.Metric}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => triggerExportWithCustomisation(handleDownloadMasterPDF)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md transition text-sm font-bold"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </button>
                  <button
                    onClick={() => triggerExportWithCustomisation(handleDownloadMasterDocx)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md transition text-sm font-bold"
                  >
                    <FileText className="h-4 w-4" />
                    Download Word (DOCX)
                  </button>
                  <button
                    onClick={() => triggerExportWithCustomisation(handleDownloadMasterPpt)}
                    className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md transition text-sm font-bold"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Download PowerPoint (PPTX)
                  </button>
                  <button
                    onClick={handleGenerateNarrative}
                    disabled={isGeneratingNarrative}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md hover:bg-indigo-700 transition text-sm font-bold disabled:opacity-50"
                  >
                    {isGeneratingNarrative ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Generate AI Narrative
                  </button>
                </div>
              </div>
            </div>

            <div className="max-w-7xl mx-auto p-6 space-y-6">
              {/* 1. Protocol & Conditions Summary */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-800 border-b pb-2 mb-4 flex items-center gap-2 text-sm">
                  <ClipboardList className={`h-4 w-4 ${theme.text}`} />
                  Trial Conditions & Protocol
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-600">
                  <div>
                    <h4 className="font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Site Information</h4>
                    <p><span className="text-slate-400">Location:</span> <span className="font-semibold text-slate-700">{activeProject.Location || '—'}</span></p>
                    <p><span className="text-slate-400">Investigator:</span> <span className="font-semibold text-slate-700">{activeProject.Investigator || '—'}</span></p>
                    <p><span className="text-slate-400">Design:</span> <span className="font-semibold text-slate-700">{activeProject.Design || 'RCBD'} ({projectTrials.length} plots)</span></p>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Application Details</h4>
                    <p><span className="text-slate-400">Crop:</span> <span className="font-semibold text-slate-700">{activeProject.Crop || '—'}</span></p>
                    <p><span className="text-slate-400">Spray Volume:</span> <span className="font-semibold text-slate-700">{activeProject.SprayVolume ? `${activeProject.SprayVolume} L/ha` : '—'}</span></p>
                    <p><span className="text-slate-400">Start Date:</span> <span className="font-semibold text-slate-700">{activeProject.StartDate ? formatDate(activeProject.StartDate) : '—'}</span></p>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Avg. Weather Conditions</h4>
                    {temps.length > 0 ? (
                      <div className="flex gap-3 mt-1">
                        <div className="text-center bg-orange-50 p-2 rounded-lg border border-orange-100 flex-1">
                          <Thermometer className="h-4 w-4 mx-auto text-orange-500 mb-1" />
                          <span className="font-bold text-orange-700 text-xs">{avg(temps)}°C</span>
                        </div>
                        <div className="text-center bg-blue-50 p-2 rounded-lg border border-blue-100 flex-1">
                          <Droplets className="h-4 w-4 mx-auto text-blue-500 mb-1" />
                          <span className="font-bold text-blue-700 text-xs">{avg(hums)}%</span>
                        </div>
                        <div className="text-center bg-slate-50 p-2 rounded-lg border border-slate-200 flex-1">
                          <CloudRain className="h-4 w-4 mx-auto text-slate-500 mb-1" />
                          <span className="font-bold text-slate-700 text-xs">{sum(rains)}mm</span>
                        </div>
                      </div>
                    ) : <p className="text-slate-400 italic">No weather data recorded.</p>}
                  </div>
                </div>
              </div>

              {/* 2. Visual Analysis Charts */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-800 border-b pb-2 mb-6 flex items-center gap-2 text-sm">
                  <BarChart2 className={`h-4 w-4 ${theme.text}`} />
                  Visual Analysis
                </h3>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 mb-3 text-center">{projectConfig.primaryMetric.key} % Over Time (per Treatment)</h4>
                    <div className="h-[260px] relative">
                      <canvas ref={wceChartRef}></canvas>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 mb-3 text-center">Final Treatment Performance</h4>
                    <div className="h-[260px] relative">
                      <canvas ref={perfChartRef}></canvas>
                    </div>
                  </div>
                </div>

                {/* Stacked Species, Radar & Yield Charts */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mt-8 border-t pt-8">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 mb-3 text-center">Mean Target Cover by {projectConfig.targetLabel} (Final)</h4>
                    <div className="h-[260px] relative">
                      <canvas ref={speciesChartRef}></canvas>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 mb-3 text-center">{projectConfig.primaryMetric.key} Spectrum (Radar)</h4>
                    <div className="h-[260px] relative">
                      <canvas ref={radarChartRef}></canvas>
                    </div>
                  </div>
                </div>

                {/* Yield Chart Container */}
                <div id="project-yield-container" className="mt-8 border-t pt-8 hidden">
                  <h4 className="text-xs font-semibold text-slate-500 mb-3 text-center">Crop Yield Analysis</h4>
                  <div className="h-[260px] relative max-w-xl mx-auto">
                    <canvas ref={yieldChartRef}></canvas>
                  </div>
                </div>
              </div>

              {/* 3. Detailed Efficacy & Statistical Separation */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Tables */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Means Table */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm">Treatment Means & Significance</h3>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {postHocMethod === 'tukey'
                            ? "Tukey HSD controls family-wise error (more conservative)."
                            : "Fisher's LSD is more powerful but less conservative."}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Post-hoc test</label>
                        <select value={postHocMethod} onChange={e => handlePostHocChange(e.target.value)} className={`text-xs border rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 ${theme.ring}`}>
                          <option value="lsd">Fisher's LSD</option>
                          <option value="tukey">Tukey HSD</option>
                        </select>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase">
                          <tr>
                            <th className="p-3">Treatment</th>
                            <th className="p-3 text-center">Mean</th>
                            <th className="p-3 text-center">Group ({postHocMethod === 'tukey' ? 'Tukey' : 'LSD'})</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {analysisResults && (analysisResults.grouping || []).map((g, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="p-3 font-medium text-slate-700">{g.name}</td>
                              <td className="p-3 text-center">{isFinite(g.mean) ? g.mean.toFixed(2) : '—'}</td>
                              <td className={`p-3 text-center font-bold ${theme.textDark}`}>{g.grouping}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-4 text-[10px] text-slate-400">
                      Means sharing the same letter are not significantly different ({postHocMethod === 'tukey' ? 'Tukey HSD' : "Fisher's LSD"}, α=0.05).
                      {analysisResults?.postHoc?.value && <span className="ml-2 font-semibold">{postHocMethod === 'tukey' ? 'HSD' : 'LSD'} (0.05) = {analysisResults.postHoc.value.toFixed(2)}</span>}
                    </p>
                  </div>

                  {/* ANOVA Table */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-4 text-sm">ANOVA Results</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase">
                          <tr>
                            <th className="p-3">Source</th>
                            <th className="p-3 text-right">DF</th>
                            <th className="p-3 text-right">SS</th>
                            <th className="p-3 text-right">MS</th>
                            <th className="p-3 text-right">F</th>
                            <th className="p-3 text-right">P</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {analysisResults?.anova && (
                            <>
                              <tr>
                                <td className="p-3 font-medium">Treatment</td>
                                <td className="p-3 text-right">{analysisResults.anova.dfTreat ?? '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova.ssTreat) ? analysisResults.anova.ssTreat.toFixed(2) : '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova.msTreat) ? analysisResults.anova.msTreat.toFixed(2) : '—'}</td>
                                <td className="p-3 text-right font-bold">{isFinite(analysisResults.anova.fVal) ? analysisResults.anova.fVal.toFixed(2) : '—'}</td>
                                <td className={`p-3 text-right ${(analysisResults.anova.pVal ?? 1) < 0.05 ? '${theme.text} font-bold' : ''}`}>
                                  {isFinite(analysisResults.anova.pVal) ? analysisResults.anova.pVal.toFixed(4) : '—'}
                                </td>
                              </tr>
                              {isFinite(analysisResults.anova.ssBlock) && (
                                <tr>
                                  <td className="p-3 font-medium">Block</td>
                                  <td className="p-3 text-right">{analysisResults.anova.dfBlock ?? '—'}</td>
                                  <td className="p-3 text-right">{analysisResults.anova.ssBlock.toFixed(2)}</td>
                                  <td className="p-3 text-right">{analysisResults.anova.msBlock.toFixed(2)}</td>
                                  <td className="p-3 text-right"></td>
                                  <td className="p-3 text-right"></td>
                                </tr>
                              )}
                              <tr>
                                <td className="p-3 font-medium">Error</td>
                                <td className="p-3 text-right">{analysisResults.anova.dfError ?? '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova.ssError) ? analysisResults.anova.ssError.toFixed(2) : '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova.msError) ? analysisResults.anova.msError.toFixed(2) : '—'}</td>
                                <td className="p-3 text-right"></td>
                                <td className="p-3 text-right"></td>
                              </tr>
                              {isFinite(analysisResults.anova.ssTotal) && (
                                <tr className="bg-slate-50 font-semibold">
                                  <td className="p-3">Total</td>
                                  <td className="p-3 text-right">{analysisResults.anova.dfTotal ?? '—'}</td>
                                  <td className="p-3 text-right">{analysisResults.anova.ssTotal.toFixed(2)}</td>
                                  <td className="p-3 text-right"></td>
                                  <td className="p-3 text-right"></td>
                                  <td className="p-3 text-right"></td>
                                </tr>
                              )}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right Column: Narrative & Stats Summary */}
                <div className="space-y-6">
                  {/* AI narrative */}
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-xl border border-indigo-100">
                    <h3 className="font-bold text-indigo-900 mb-1 flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4" /> Agronomist Narrative
                    </h3>
                    <p className="text-[10px] text-indigo-700 mb-3">AI-generated summary of findings.</p>
                    <textarea
                      value={narrative}
                      onChange={e => setNarrative(e.target.value)}
                      rows={12}
                      className="w-full p-3 rounded-lg border-0 shadow-inner bg-white/80 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
                      placeholder="Type narrative or generate using AI..."
                    />
                    <button
                      onClick={handleSaveNarrative}
                      disabled={isSavingNarrative}
                      className={`mt-3 w-full ${theme.bg} text-white py-2 rounded-lg font-bold transition text-xs flex items-center justify-center gap-2`}
                    >
                      {isSavingNarrative ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save Narrative
                    </button>
                  </div>

                  {/* Trial Statistics Summary Panel */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-4 text-xs uppercase tracking-wider">Trial Statistics</h3>
                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <span className="text-slate-500">CV (%)</span>
                        <span className="font-bold text-slate-800">
                          {analysisResults?.anova?.cv ? `${analysisResults.anova.cv.toFixed(2)}%` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <span className="text-slate-500">{postHocMethod === 'tukey' ? 'HSD (0.05)' : 'LSD (0.05)'}</span>
                        <span className="font-bold text-slate-800">
                          {analysisResults?.postHoc?.value ? analysisResults.postHoc.value.toFixed(2) : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Design</span>
                        <span className="font-bold text-slate-800">
                          {analysisResults?.balance?.isBalanced ? 'Balanced RCBD' : 'Unbalanced RCBD (robust)'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {renderModals()}
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
        <TopBar title={activeProject.Name} onMenuClick={onMenuClick} />

        <div className="flex-1 overflow-y-auto">
          {/* ── Header ── */}
          <div className="bg-white border-b px-4 py-4">
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => setActiveProjectId(null)} className="p-2 rounded-lg border hover:bg-slate-50 transition shrink-0">
                  <ArrowLeft className="w-4 h-4 text-slate-600" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-800 truncate">{activeProject.Name}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${isLocked ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-700'}`}>
                      {activeProject.Status || 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Metric: {activeProject.Metric} · {projectBlocks.length} blocks · {projectTrials.length} plots · {treatments.length} treatments</p>
                </div>
                <button
                  onClick={() => setShowMap(true)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition shrink-0"
                >
                  <MapPin className="w-4 h-4" />
                  Map
                </button>
                <button
                  onClick={() => runAnalysis(postHocMethod)}
                  disabled={isAnalyzing}
                  className={`flex items-center gap-2 ${theme.bg} disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold transition shrink-0`}
                >
                  {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
                  {isAnalyzing ? 'Analyzing…' : 'Run Analysis'}
                </button>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto p-4 space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">

              {/* ── LEFT: main content ── */}
              <div className="xl:col-span-3 space-y-5">

                {/* ── Design Completeness + Control Integrity ── */}
                {designCheck && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Design Completeness */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                            <LayoutGrid className={`w-4 h-4 ${theme.text}`} /> Design Completeness
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">Every block has every treatment (RCBD).</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${designCheck.isBalanced ? theme.badge : designCheck.missing.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                          {designCheck.isBalanced ? 'Balanced' : designCheck.missing.length > 0 ? 'Incomplete' : 'Check'}
                        </span>
                      </div>
                      <MiniBar value={designCheck.coveragePct} max={100} color={designCheck.isBalanced ? theme.bgSecondary : 'bg-amber-500'} />
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        {[['Coverage', `${designCheck.coveragePct}%`], ['Expected cells', designCheck.expectedCells],
                          ['Missing cells', designCheck.missing.length], ['Duplicates', designCheck.duplicates.length]
                        ].map(([label, val]) => (
                          <div key={label} className="flex justify-between">
                            <span className="text-slate-500">{label}</span>
                            <span className={`font-bold ${(label === 'Missing cells' || label === 'Duplicates') && Number(val) > 0 ? 'text-amber-700' : 'text-slate-700'}`}>{val}</span>
                          </div>
                        ))}
                      </div>
                      {designCheck.missing.length > 0 && (
                        <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-2 text-xs text-amber-800">
                          <div className="font-bold flex items-center gap-1 mb-1"><AlertTriangle className="w-3 h-3" /> Missing cells:</div>
                          {designCheck.missing.slice(0, 4).map((m, i) => (
                            <div key={i} className="flex justify-between"><span>{m.blockName}</span><span className="font-semibold truncate ml-2">{m.key}</span></div>
                          ))}
                          {designCheck.missing.length > 4 && <div className="text-amber-600 mt-1">+{designCheck.missing.length - 4} more</div>}
                        </div>
                      )}
                      {designCheck.isBalanced && (
                        <div className={`mt-3 ${theme.bgLight} border ${theme.borderLight} rounded-lg p-2 text-xs ${theme.textDark} flex items-center gap-1`}>
                          <CheckCircle2 className="w-3 h-3" /> All blocks contain all treatments.
                        </div>
                      )}
                    </div>

                    {/* Control Integrity */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                            <ShieldAlert className={`w-4 h-4 ${theme.text}`} /> Control Integrity
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">Checks untreated control count per block.</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${(designCheck.noControl.length === 0 && designCheck.multiControl.length === 0) ? theme.badge : 'bg-amber-100 text-amber-700'}`}>
                          {(designCheck.noControl.length === 0 && designCheck.multiControl.length === 0) ? 'OK' : 'Attention'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className={`flex justify-between`}><span className={`text-slate-500`}>Blocks w/o control</span><span className={`font-bold ${designCheck.noControl.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{designCheck.noControl.length}</span></div>
                        <div className={`flex justify-between`}><span className={`text-slate-500`}>Blocks {'>'} 1 control</span><span className={`font-bold ${designCheck.multiControl.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{designCheck.multiControl.length}</span></div>
                      </div>
                      {(designCheck.noControl.length > 0 || designCheck.multiControl.length > 0) ? (
                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-xs text-amber-800 space-y-1">
                          {designCheck.noControl.length > 0 && <div><span className="font-bold">No control: </span>{designCheck.noControl.map(b => b.blockName).join(', ')}</div>}
                          {designCheck.multiControl.length > 0 && <div><span className="font-bold">Multiple controls: </span>{designCheck.multiControl.map(b => `${b.blockName}(${b.count})`).join(', ')}</div>}
                        </div>
                      ) : (
                        <div className={`${theme.bgLight} border ${theme.borderLight} rounded-lg p-2 text-xs ${theme.textDark} flex items-center gap-1`}>
                          <CheckCircle2 className="w-3 h-3" /> Each block has exactly one control.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Blocks ── */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className={`font-bold text-slate-800 flex items-center gap-2`}><Layers className={`w-4 h-4 ${theme.text}`} /> Blocks & Plots</h3>
                    <div className="flex items-center gap-3">
                      <div className="inline-flex border rounded-lg overflow-hidden text-xs bg-slate-50 p-0.5 border-slate-200">
                        <button
                          type="button"
                          onClick={() => setBlocksViewMode('list')}
                          className={`px-3 py-1 font-bold rounded-md transition ${blocksViewMode === 'list' ? `${theme.bg} text-white` : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          List
                        </button>
                        <button
                          type="button"
                          onClick={() => setBlocksViewMode('grid')}
                          className={`px-3 py-1 font-bold rounded-md transition ${blocksViewMode === 'grid' ? `${theme.bg} text-white` : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          Field Grid
                        </button>
                      </div>
                      {!isEffectiveLocked && (
                        <button onClick={() => setIsAddingBlock(v => !v)} className={`flex items-center gap-1.5 text-xs ${theme.bg} text-white px-3 py-1.5 rounded-lg font-bold transition`}>
                          <Plus className="w-3.5 h-3.5" /> Add Block
                        </button>
                      )}
                    </div>
                  </div>

                  {isAddingBlock && (
                    <form onSubmit={handleAddBlock} className="mb-4 flex flex-wrap gap-2 items-end bg-slate-50 p-3 rounded-lg border">
                      <div className="flex-1 min-w-36">
                        <label className="text-xs font-bold text-slate-500 block mb-1">Block Name</label>
                        <input required value={blockForm.Name} onChange={e => setBlockForm(v => ({ ...v, Name: e.target.value }))} className={INPUT} placeholder="e.g. Block 1 / Rep A" />
                      </div>
                      <div className="w-28">
                        <label className="text-xs font-bold text-slate-500 block mb-1">Rep #</label>
                        <input type="number" min="1" value={blockForm.ReplicationNum} onChange={e => setBlockForm(v => ({ ...v, ReplicationNum: e.target.value }))} className={INPUT} placeholder="1" />
                      </div>
                      <button type="submit" className={`${theme.bg} text-white px-4 py-2 rounded-lg text-sm font-bold`}>Save</button>
                      <button type="button" onClick={() => setIsAddingBlock(false)} className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
                    </form>
                  )}

                  {/* Highlight / Filter Panel */}
                  {projectBlocks.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap gap-4 items-center justify-between text-xs mb-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Filter & Highlight Layout:</span>
                      </div>
                      <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex items-center gap-1.5">
                          <label className="font-medium text-slate-600">Block:</label>
                          <select 
                            value={selectedLayoutBlock} 
                            onChange={e => setSelectedLayoutBlock(e.target.value)} 
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-700 cursor-pointer"
                          >
                            <option value="all">All Blocks</option>
                            {projectBlocks.map(b => (
                              <option key={b.ID} value={b.ID}>{b.Name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <label className="font-medium text-slate-600">Treatment:</label>
                          <select 
                            value={selectedLayoutTreatment} 
                            onChange={e => setSelectedLayoutTreatment(e.target.value)} 
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-700 cursor-pointer"
                          >
                            <option value="all">All Treatments</option>
                            {treatments.map(tName => (
                              <option key={tName} value={tName}>{tName}</option>
                            ))}
                          </select>
                        </div>
                        {(selectedLayoutBlock !== 'all' || selectedLayoutTreatment !== 'all') && (
                          <button 
                            type="button" 
                            onClick={() => { setSelectedLayoutBlock('all'); setSelectedLayoutTreatment('all'); }}
                            className="text-red-600 hover:text-red-900 font-bold"
                          >
                            Clear Filters
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {activeProject.Design === 'PotTrial' ? (
                    <div className="space-y-6">
                      {renderGreenhousePotGrid()}
                    </div>
                  ) : projectBlocks.length > 0 ? (
                    <div className={blocksViewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" : "space-y-4"}>
                      {projectBlocks.map(b => {
                        const isBlockMatch = selectedLayoutBlock === 'all' || String(b.ID) === String(selectedLayoutBlock);
                        return (
                          <div key={b.ID} className={`transition-all duration-300 ${isBlockMatch ? 'scale-100 opacity-100' : 'opacity-20 scale-95 pointer-events-none'}`}>
                            <BlockCard block={b} trials={projectTrials.filter(t => String(t.BlockID) === String(b.ID))} activeCategory={activeCategory} onPlotClick={(trialId) => navigate(`/trials?focus=${trialId}`)} onDeleteBlock={handleDeleteBlock} onAddPlot={handleAddPlotToBlock} isLocked={isEffectiveLocked} outliers={analysisResults?.outliers} highlightedTreatment={selectedLayoutTreatment} />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      No blocks yet. {!isEffectiveLocked && <button onClick={() => setIsAddingBlock(true)} className={`${theme.text} font-semibold hover:underline`}>Add the first block →</button>}
                    </div>
                  )}
                </div>

                {/* ── Analysis Results ── */}
                {analysisResults && (
                  <div className="space-y-4">
                    {/* Post-hoc selector + Treatment Means Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                        <div>
                          <h3 className="font-bold text-slate-800 text-sm">Treatment Means & Significance</h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {postHocMethod === 'tukey'
                              ? "Tukey HSD — conservative; recommended for many treatments."
                              : "Fisher's LSD — more powerful; use when ANOVA is significant."}
                          </p>
                        </div>
                        <div className="shrink-0">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Post-hoc test</label>
                          <select value={postHocMethod} onChange={e => handlePostHocChange(e.target.value)} className={`text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 ${theme.ring}`}>
                            <optgroup label="Primary Measurements (Default)">
                              <option value="Yield">Yield</option>
                              <option value="Fruit Count">Fruit Count</option>
                              <option value="Flower Count">Flower Count</option>
                              <option value="Plant Height">Plant Height</option>
                              <option value="Branches">Branches</option>
                              <option value="Biomass">Biomass</option>
                              <option value="Root Weight">Root Weight</option>
                            </optgroup>
                            <optgroup label="Secondary Estimates (AI-Derived)">
                              <option value="Canopy Coverage">Canopy Coverage (AI-Derived)</option>
                              <option value="Greenness">Greenness (AI-Derived)</option>
                              <option value="Vigor">Vigor (AI-Derived)</option>
                              <option value="Chlorosis">Chlorosis (AI-Derived)</option>
                              <option value="Phytotoxicity">Phytotoxicity (AI-Derived)</option>
                            </optgroup>
                            <optgroup label="Post-Hoc Options">
                              <option value="lsd">Fisher's LSD</option>
                              <option value="tukey">Tukey HSD</option>
                              <option value="duncan">Duncan's MRT</option>
                            </optgroup>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0">
                          <table className="w-full text-sm text-left min-w-[300px]">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                              <tr>
                                <th className="p-3">Treatment</th>
                                <th className="p-3 text-center">Mean</th>
                                <th className="p-3 text-center">Group ({postHocMethod === 'tukey' ? 'Tukey' : 'LSD'})</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(analysisResults.grouping || []).map((g, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                  <td className="p-3 font-medium text-slate-700">{g.name}</td>
                                  <td className="p-3 text-center">{isFinite(g.mean) ? g.mean.toFixed(2) : '—'}</td>
                                  <td className={`p-3 text-center font-bold ${theme.textDark}`}>{g.grouping}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex flex-col justify-center bg-slate-50 p-4 rounded-xl border border-slate-100 min-h-[160px]">
                          <h4 className="text-[10px] font-bold text-slate-500 mb-3 text-center uppercase tracking-wider">Visual Means Comparison ({config.primaryMetric.key || ''})</h4>
                          <InlineBarChart data={meansChartData} color={config.color.hex} height={140} />
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-slate-400">
                        Means sharing the same letter are not significantly different ({postHocMethod === 'tukey' ? 'Tukey HSD' : postHocMethod === 'duncan' ? "Duncan's MRT" : "Fisher's LSD"}, α=0.05).
                        {isFinite(analysisResults.postHoc?.value) && <span className="ml-2 font-semibold">{postHocMethod === 'tukey' ? 'HSD' : postHocMethod === 'duncan' ? 'Range' : 'LSD'} (0.05): {analysisResults.postHoc.value.toFixed(2)}</span>}
                      </p>
                    </div>

                    {/* Per-treatment stats table */}
                    {treatmentStats.length > 0 && (
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                        <h3 className="font-bold text-slate-800 mb-1 text-sm flex items-center gap-2"><Sigma className="w-4 h-4 text-blue-500" /> Treatment Statistics (Final Observation)</h3>
                        <p className="text-xs text-slate-400 mb-3">Mean {config.primaryMetric.label.toLowerCase()} ± SD from last observation per replicate. {config.primaryMetric.key}% vs untreated control.</p>
                        <div className="overflow-x-auto -mx-5 px-5">
                          <table className="w-full text-sm text-left min-w-[480px]">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                              <tr>
                                {['Treatment','n','Mean','±SD','CV%',`${config.primaryMetric.key}%`,`Group (${postHocMethod === 'tukey' ? 'Tukey' : 'LSD'})`].map(h => (
                                  <th key={h} className="p-3 text-right first:text-left">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {treatmentStats.map((ts, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                  <td className="p-3 font-medium text-slate-700 max-w-[140px] truncate" title={ts.name}>{ts.name}</td>
                                  <td className="p-3 text-right text-slate-500">{ts.n}</td>
                                  <td className="p-3 text-right font-semibold text-slate-800">{ts.mean.toFixed(2)}</td>
                                  <td className="p-3 text-right text-slate-500">{ts.sd.toFixed(2)}</td>
                                  <td className="p-3 text-right">
                                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${ts.cv < 15 ? `${theme.bgLight} ${theme.textDark}` : ts.cv < 30 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                                      {ts.cv.toFixed(1)}%
                                    </span>
                                  </td>
                                  <td className={`p-3 text-right font-bold ${ts.wce >= 80 ? theme.text : ts.wce >= 60 ? 'text-amber-600' : 'text-red-500'}`}>{ts.wce.toFixed(1)}{config.primaryMetric.unit || ''}</td>
                                  <td className={`p-3 text-right font-black ${theme.textDark} tracking-widest`}>{ts.grouping}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                          Means sharing the same letter are not significantly different ({postHocMethod === 'tukey' ? 'Tukey HSD' : postHocMethod === 'duncan' ? "Duncan's MRT" : "Fisher's LSD"}, α=0.05).
                          {isFinite(analysisResults.postHoc?.value) && <span className="ml-2 font-semibold text-slate-500">{postHocMethod === 'tukey' ? 'HSD' : postHocMethod === 'duncan' ? 'Range' : 'LSD'} (0.05) = {analysisResults.postHoc.value.toFixed(2)}</span>}
                        </p>
                      </div>
                    )}

                    {/* ANOVA Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                      <h3 className="font-bold text-slate-800 mb-4 text-sm">ANOVA Results (Two-way RCBD)</h3>
                      <div className="overflow-x-auto -mx-5 px-5">
                        <table className="w-full text-sm text-left min-w-[460px]">
                          <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                            <tr>
                              {['Source', 'DF', 'SS', 'MS', 'F', 'P', 'Sig'].map(h => <th key={h} className="p-3 text-right first:text-left">{h}</th>)}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {analysisResults.anova?.isTwoWay ? (
                              <>
                                <tr>
                                  <td className="p-3 font-medium">{analysisResults.anova.factorA?.name || 'Factor A'}</td>
                                  <td className="p-3 text-right">{analysisResults.anova.factorA?.df ?? '—'}</td>
                                  <td className="p-3 text-right">{isFinite(analysisResults.anova.factorA?.ss) ? analysisResults.anova.factorA.ss.toFixed(2) : '—'}</td>
                                  <td className="p-3 text-right">{isFinite(analysisResults.anova.factorA?.ms) ? analysisResults.anova.factorA.ms.toFixed(2) : '—'}</td>
                                  <td className="p-3 text-right font-bold">{isFinite(analysisResults.anova.factorA?.f) ? analysisResults.anova.factorA.f.toFixed(2) : '—'}</td>
                                  <td className={`p-3 text-right ${(analysisResults.anova.factorA?.p ?? 1) < 0.05 ? `${theme.text} font-bold` : ''}`}>
                                    {isFinite(analysisResults.anova.factorA?.p) ? analysisResults.anova.factorA.p.toFixed(4) : '—'}
                                  </td>
                                  <td className="p-3 text-right">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${ (analysisResults.anova.factorA?.p ?? 1) < 0.05 ? `${theme.badge}` : 'bg-slate-100 text-slate-500'}`}>
                                      {sigStars(analysisResults.anova.factorA?.p)}
                                    </span>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="p-3 font-medium">{analysisResults.anova.factorB?.name || 'Factor B'}</td>
                                  <td className="p-3 text-right">{analysisResults.anova.factorB?.df ?? '—'}</td>
                                  <td className="p-3 text-right">{isFinite(analysisResults.anova.factorB?.ss) ? analysisResults.anova.factorB.ss.toFixed(2) : '—'}</td>
                                  <td className="p-3 text-right">{isFinite(analysisResults.anova.factorB?.ms) ? analysisResults.anova.factorB.ms.toFixed(2) : '—'}</td>
                                  <td className="p-3 text-right font-bold">{isFinite(analysisResults.anova.factorB?.f) ? analysisResults.anova.factorB.f.toFixed(2) : '—'}</td>
                                  <td className={`p-3 text-right ${(analysisResults.anova.factorB?.p ?? 1) < 0.05 ? `${theme.text} font-bold` : ''}`}>
                                    {isFinite(analysisResults.anova.factorB?.p) ? analysisResults.anova.factorB.p.toFixed(4) : '—'}
                                  </td>
                                  <td className="p-3 text-right">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${ (analysisResults.anova.factorB?.p ?? 1) < 0.05 ? `${theme.badge}` : 'bg-slate-100 text-slate-500'}`}>
                                      {sigStars(analysisResults.anova.factorB?.p)}
                                    </span>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="p-3 font-medium">Interaction (A x B)</td>
                                  <td className="p-3 text-right">{analysisResults.anova.interaction?.df ?? '—'}</td>
                                  <td className="p-3 text-right">{isFinite(analysisResults.anova.interaction?.ss) ? analysisResults.anova.interaction.ss.toFixed(2) : '—'}</td>
                                  <td className="p-3 text-right">{isFinite(analysisResults.anova.interaction?.ms) ? analysisResults.anova.interaction.ms.toFixed(2) : '—'}</td>
                                  <td className="p-3 text-right font-bold">{isFinite(analysisResults.anova.interaction?.f) ? analysisResults.anova.interaction.f.toFixed(2) : '—'}</td>
                                  <td className={`p-3 text-right ${(analysisResults.anova.interaction?.p ?? 1) < 0.05 ? `${theme.text} font-bold` : ''}`}>
                                    {isFinite(analysisResults.anova.interaction?.p) ? analysisResults.anova.interaction.p.toFixed(4) : '—'}
                                  </td>
                                  <td className="p-3 text-right">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${ (analysisResults.anova.interaction?.p ?? 1) < 0.05 ? `${theme.badge}` : 'bg-slate-100 text-slate-500'}`}>
                                      {sigStars(analysisResults.anova.interaction?.p)}
                                    </span>
                                  </td>
                                </tr>
                              </>
                            ) : (
                              <tr>
                                <td className="p-3 font-medium">Treatment</td>
                                <td className="p-3 text-right">{analysisResults.anova?.dfTreat ?? '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova?.ssTreat) ? analysisResults.anova.ssTreat.toFixed(2) : '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova?.msTreat) ? analysisResults.anova.msTreat.toFixed(2) : '—'}</td>
                                <td className="p-3 text-right font-bold">{isFinite(analysisResults.anova?.fVal) ? analysisResults.anova.fVal.toFixed(2) : '—'}</td>
                                <td className={`p-3 text-right ${(analysisResults.anova?.pVal ?? 1) < 0.05 ? `${theme.text} font-bold` : ''}`}>
                                  {isFinite(analysisResults.anova?.pVal) ? analysisResults.anova.pVal.toFixed(4) : '—'}
                                </td>
                                <td className="p-3 text-right">
                                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${ (analysisResults.anova?.pVal ?? 1) < 0.05 ? `${theme.badge}` : 'bg-slate-100 text-slate-500'}`}>
                                    {sigStars(analysisResults.anova?.pVal)}
                                  </span>
                                </td>
                              </tr>
                            )}
                            {isFinite(analysisResults.anova?.blocks?.ss ?? analysisResults.anova?.ssBlock) && (
                              <tr>
                                <td className="p-3 font-medium">Block</td>
                                <td className="p-3 text-right">{analysisResults.anova?.blocks?.df ?? analysisResults.anova?.dfBlock ?? '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova?.blocks?.ss ?? analysisResults.anova?.ssBlock) ? (analysisResults.anova.blocks?.ss ?? analysisResults.anova.ssBlock).toFixed(2) : '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova?.blocks?.ms ?? analysisResults.anova?.msBlock) ? (analysisResults.anova.blocks?.ms ?? analysisResults.anova.msBlock).toFixed(2) : '—'}</td>
                                <td className="p-3 text-right"></td><td className="p-3 text-right"></td><td className="p-3 text-right"></td>
                              </tr>
                            )}
                            {isFinite(analysisResults.anova?.error?.ss ?? analysisResults.anova?.ssError) && (
                              <tr>
                                <td className="p-3 font-medium">Error</td>
                                <td className="p-3 text-right">{analysisResults.anova?.error?.df ?? analysisResults.anova?.dfError ?? '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova?.error?.ss ?? analysisResults.anova?.ssError) ? (analysisResults.anova.error?.ss ?? analysisResults.anova.ssError).toFixed(2) : '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova?.error?.ms ?? analysisResults.anova?.msError) ? (analysisResults.anova.error?.ms ?? analysisResults.anova.msError).toFixed(2) : '—'}</td>
                                <td className="p-3 text-right"></td><td className="p-3 text-right"></td><td className="p-3 text-right"></td>
                              </tr>
                            )}
                            {isFinite(analysisResults.anova?.total?.ss ?? analysisResults.anova?.ssTotal) && (
                              <tr className="bg-slate-50 font-semibold">
                                <td className="p-3">Total</td>
                                <td className="p-3 text-right">{analysisResults.anova?.total?.df ?? analysisResults.anova?.dfTotal ?? '—'}</td>
                                <td className="p-3 text-right">{isFinite(analysisResults.anova?.total?.ss ?? analysisResults.anova?.ssTotal) ? (analysisResults.anova.total?.ss ?? analysisResults.anova.ssTotal).toFixed(2) : '—'}</td>
                                <td className="p-3 text-right"></td><td className="p-3 text-right"></td><td className="p-3 text-right"></td><td className="p-3 text-right"></td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                        {isFinite(analysisResults.anova?.cv) && <span>CV: <strong className="text-slate-700">{analysisResults.anova.cv.toFixed(1)}%</strong></span>}
                        {isFinite(analysisResults.postHoc?.value) && <span>{postHocMethod === 'tukey' ? 'HSD' : 'LSD'} (0.05): <strong className="text-slate-700">{analysisResults.postHoc.value.toFixed(2)}</strong></span>}
                        <span>Design: <strong className="text-slate-700">{analysisResults.balance?.isBalanced ? 'Balanced RCBD' : 'Unbalanced RCBD (robust)'}</strong></span>
                        {isFinite(analysisResults.anova?.grandMean) && <span>Grand Mean: <strong className="text-slate-700">{analysisResults.anova.grandMean.toFixed(2)}</strong></span>}
                      </div>
                    </div>

                    {/* ── Agronomic Diagnostics & Quality Report ── */}
                    {(() => {
                      const cv = analysisResults.anova?.cv;
                      const dfError = analysisResults.anova?.dfError || analysisResults.anova?.error?.df;
                      
                      let qualityGrade = 'Acceptable';
                      let qualityColor = 'text-amber-600 bg-amber-50 border-amber-100';
                      if (cv !== undefined && cv !== null && isFinite(cv)) {
                        if (cv < 10 && dfError >= 12) {
                          qualityGrade = 'Excellent (A)';
                          qualityColor = 'text-emerald-700 bg-emerald-50 border-emerald-100';
                        } else if (cv < 15 && dfError >= 10) {
                          qualityGrade = 'Good (B)';
                          qualityColor = 'text-blue-700 bg-blue-50 border-blue-100';
                        } else if (cv > 20) {
                          qualityGrade = 'Caution (C/D)';
                          qualityColor = 'text-rose-700 bg-rose-50 border-rose-100';
                        }
                      }

                      let transformationSuggestion = 'None required. Assumptions met.';
                      const isHomogeneous = analysisResults.bartlett?.homogeneous !== false;
                      const isNormal = analysisResults.normality?.normal !== false;

                      if (!isHomogeneous || !isNormal) {
                        if (config.primaryMetric?.key === 'wce' || activeProject?.Category === 'herbicide' || activeProject?.Category === 'pesticide') {
                          transformationSuggestion = 'Logarithmic Log10(x + 1) or Square Root √(x + 0.5) is recommended for count/percentage variability.';
                        } else {
                          transformationSuggestion = 'Arcsine Square Root transformation is recommended for percentage efficacy data to stabilize variances.';
                        }
                      }

                      return (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
                          <div className="flex items-center justify-between border-b pb-3">
                            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                              <Beaker className="w-4 h-4 text-emerald-600" /> Agronomic Diagnostics & Quality Report (ARM Standard)
                            </h3>
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${qualityColor}`}>
                              Quality Grade: {qualityGrade}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Bartlett's Test */}
                            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 space-y-1.5">
                              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Variance Homogeneity</h4>
                              {analysisResults.bartlett?.error ? (
                                <p className="text-xs text-slate-500 italic">{analysisResults.bartlett.error}</p>
                              ) : (
                                <>
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Bartlett p-value:</span>
                                    <strong className={isHomogeneous ? "text-emerald-600" : "text-rose-600"}>
                                      {analysisResults.bartlett?.pVal !== undefined ? analysisResults.bartlett.pVal.toFixed(4) : '—'}
                                    </strong>
                                  </div>
                                  <div className="flex gap-1.5 items-center mt-1 text-xs">
                                    <span className={`w-2 h-2 rounded-full ${isHomogeneous ? "bg-emerald-500" : "bg-rose-500"}`} />
                                    <span className="text-slate-600 font-semibold">
                                      {isHomogeneous ? 'Pass (Equal Variances)' : 'Fail (Unequal Variances)'}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Normality Check */}
                            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 space-y-1.5">
                              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Residual Normality</h4>
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Residual Skewness:</span>
                                <strong className={isNormal ? "text-slate-800" : "text-rose-600"}>
                                  {analysisResults.normality?.skewness !== undefined ? analysisResults.normality.skewness.toFixed(3) : '—'}
                                </strong>
                              </div>
                              <div className="flex gap-1.5 items-center mt-1 text-xs">
                                <span className={`w-2 h-2 rounded-full ${isNormal ? "bg-emerald-500" : "bg-rose-500"}`} />
                                <span className="text-slate-600 font-semibold">
                                  {analysisResults.normality?.status || '—'}
                                </span>
                              </div>
                              {/* Canvas: KDE vs Normal curve */}
                              {analysisResults.normality?.residuals && analysisResults.normality.residuals.length > 2 && (
                                <NormalityPlot residuals={analysisResults.normality.residuals} />
                              )}
                            </div>

                            {/* Blocking Efficiency */}
                            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 space-y-1.5">
                              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">RCBD Block Efficiency</h4>
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Relative Efficiency (RE):</span>
                                <strong className="text-slate-800">
                                  {analysisResults.blockingEfficiency !== undefined ? `${analysisResults.blockingEfficiency}x` : '—'}
                                </strong>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                                {analysisResults.blockingEfficiency > 1.0 
                                  ? `Blocking reduced error by ${Math.round((analysisResults.blockingEfficiency - 1) * 100)}% compared to a CRD layout.` 
                                  : 'Blocking had no efficiency gains over a completely randomized design (CRD).'}
                              </p>
                            </div>
                          </div>

                          {/* Recommendations banner */}
                          {(!isHomogeneous || !isNormal) && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                              <div>
                                <strong className="font-bold">Assumption Warning:</strong> One or more statistical assumptions of standard ANOVA are violated.
                                <p className="mt-1 font-medium">{transformationSuggestion}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Charts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Per-treatment WCE timeline */}
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                        <h4 className={`font-bold text-sm text-slate-700 mb-3 flex items-center gap-2`}><TrendingUp className={`w-4 h-4 ${theme.text}`} /> {config.primaryMetric.key} % Over Time (per Treatment)</h4>
                        {wceTimelineData.daas.length > 0 && wceTimelineData.series.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="text-xs w-full min-w-max">
                              <thead>
                                <tr className="bg-slate-50">
                                  <th className="p-2 text-left font-semibold text-slate-500">Treatment</th>
                                  {wceTimelineData.daas.map(d => <th key={d} className="p-2 text-center font-semibold text-slate-500">{d}</th>)}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {wceTimelineData.series.map((s, i) => (
                                  <tr key={i} className="hover:bg-slate-50">
                                    <td className="p-2 font-medium text-slate-700 max-w-[120px] truncate" title={s.name}>{s.name}</td>
                                    {s.values.map((v, j) => (
                                      <td key={j} className={`p-2 text-center font-semibold ${
                                        v === null ? 'text-slate-300' : v >= 80 ? '${theme.text}' : v >= 60 ? 'text-amber-600' : 'text-red-500'
                                      }`}>{v !== null ? `${v}` : '—'}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : <p className="text-xs text-slate-400 py-4 text-center">No observation data yet</p>}
                      </div>
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                        <h4 className="font-bold text-sm text-slate-700 mb-4 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-blue-500" /> Final Treatment Means</h4>
                        <InlineBarChart data={perfChartData} color="#3b82f6" height={120} />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Agronomist Narrative ── */}
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-bold text-indigo-900 flex items-center gap-2"><FileText className="w-4 h-4" /> Agronomist Narrative</h3>
                      <p className="text-xs text-indigo-600 mt-0.5">AI-generated summary. Edit and save.</p>
                    </div>
                    <button onClick={handleGenerateNarrative} disabled={isGeneratingNarrative}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold transition">
                      {isGeneratingNarrative ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {isGeneratingNarrative ? 'Generating…' : 'Generate AI Narrative'}
                    </button>
                  </div>
                  <textarea
                    value={narrative}
                    onChange={e => setNarrative(e.target.value)}
                    rows={8}
                    className="w-full p-3 rounded-lg border-0 shadow-inner bg-white/80 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
                    placeholder="Click 'Generate AI Narrative' or type your narrative here…"
                  />
                  <button onClick={handleSaveNarrative} disabled={isSavingNarrative}
                    className={`mt-3 flex items-center gap-2 ${theme.bg} disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-bold transition`}>
                    {isSavingNarrative ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSavingNarrative ? 'Saving…' : 'Save Narrative'}
                  </button>
                </div>

              </div>

              {/* ── RIGHT: sidebar ── */}
              <div className="xl:col-span-1 space-y-4">

                {/* Project Scope */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <h3 className="font-bold text-slate-800 mb-4 text-sm">Project Scope</h3>
                  <ul className="space-y-2.5 text-sm">
                    {[
                      ['Blocks', projectBlocks.length],
                      ['Treatments', treatments.length],
                      ['Total Plots', projectTrials.length],
                      ['Crop', activeProject.Crop || 'N/A'],
                      ['Location', activeProject.Location || 'N/A'],
                      activeProject.WeatherTemp ? ['Weather Temp', `${activeProject.WeatherTemp}°C`] : null,
                      activeProject.WeatherHumidity ? ['Humidity', `${activeProject.WeatherHumidity}%`] : null,
                      activeProject.WeatherWind ? ['Wind Speed', `${activeProject.WeatherWind} km/h`] : null,
                      activeProject.WeatherRain ? ['Rain', `${activeProject.WeatherRain} mm`] : null,
                      ['Investigator', activeProject.Investigator || 'N/A'],
                      ['Metric', activeProject.Metric],
                    ].filter(Boolean).map(([label, val]) => (
                      <li key={label} className="flex justify-between border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                        <span className="text-slate-500">{label}</span>
                        <span className="font-bold text-slate-800 truncate max-w-[120px] text-right" title={String(val)}>{val}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Actions */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <h3 className="font-bold text-slate-800 mb-3 text-sm">Actions</h3>
                  <div className="space-y-1">
                    <button onClick={() => { console.log('Run Analysis clicked, postHocMethod:', postHocMethod); runAnalysis(postHocMethod); }}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition ${theme.textDark} hover:${theme.bgLight}`}>
                      <BarChart2 className="w-4 h-4 shrink-0" /> {isLocked ? 'Refresh Report' : 'Run Analysis'}
                    </button>
                    <button onClick={(e) => { console.log('Recalc DAA clicked'); handleRecalcDAA(e); }}
                      className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition text-amber-700 hover:bg-amber-50">
                      <RefreshCw className="w-4 h-4 shrink-0" /> Recalculate DAA
                    </button>
                    <button onClick={(e) => { console.log('Randomize Layout clicked, isLocked:', isLocked); handleRandomizeLayout(e); }} disabled={isEffectiveLocked}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition ${theme.textDark} hover:${theme.bgLight} ${isEffectiveLocked ? 'opacity-40 cursor-not-allowed' : ''}`}>
                      <Shuffle className="w-4 h-4 shrink-0" /> Randomize Layout
                    </button>
                    <button onClick={(e) => { console.log('Protocol Settings clicked, isLocked:', isLocked); openProtocolSettings(e); }} disabled={isEffectiveLocked}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition text-blue-700 hover:bg-blue-50 ${isEffectiveLocked ? 'opacity-40 cursor-not-allowed' : ''}`}>
                      <ClipboardList className="w-4 h-4 shrink-0" /> Protocol Settings
                    </button>
                    {!isViewer && (
                      <>
                        <hr className="my-2 border-slate-100" />
                        <button onClick={() => { console.log('Export to R clicked'); triggerExportWithCustomisation(handleExportR); }} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-blue-700 hover:bg-blue-50 transition">
                          <Download className="w-4 h-4" /> Export to R (CSV)
                        </button>
                        <button onClick={() => { console.log('Export to SAS clicked'); triggerExportWithCustomisation(handleExportSAS); }} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-green-700 hover:bg-green-50 transition">
                          <Download className="w-4 h-4" /> Export to SAS
                        </button>
                        <button onClick={() => { console.log('Export Analysis Bundle clicked'); triggerExportWithCustomisation(handleExportBundle); }} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition">
                          <Package className="w-4 h-4" /> Export Analysis Bundle
                        </button>
                        <button onClick={() => { console.log('Scientific Report clicked'); triggerExportWithCustomisation(handleScientificReport); }} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-cyan-700 hover:bg-cyan-50 transition">
                          <FileText className="w-4 h-4" /> Scientific Report
                        </button>
                        <button onClick={() => { console.log('Split-viewer clicked'); setViewMode('split-viewer'); }} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-amber-700 hover:bg-amber-50 transition">
                          <LayoutGrid className="w-4 h-4" /> Side-by-Side Plot Viewer
                        </button>
                        <button onClick={() => { console.log('Regulatory Report PDF clicked'); triggerExportWithCustomisation(handleRegulatoryPDF); }} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-purple-700 hover:bg-purple-50 transition">
                          <Printer className="w-4 h-4" /> Regulatory Report (PDF)
                        </button>
                        <button onClick={() => { console.log('Export Advanced Excel clicked'); triggerExportWithCustomisation(handleExportAdvancedExcel); }} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-teal-700 hover:bg-teal-50 transition">
                          <FileText className="w-4 h-4" /> Export Advanced Excel (11-Sheet)
                        </button>
                        <button onClick={() => { console.log('Export DOCX clicked'); triggerExportWithCustomisation(handleRegulatoryDOCX); }} className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium text-fuchsia-700 hover:bg-fuchsia-50 transition">
                          <FileText className="w-4 h-4" /> Export DOCX
                        </button>
                        <hr className="my-2 border-slate-100" />
                        <button onClick={() => { console.log('Lock toggle clicked'); handleLockToggle(); }}
                          className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition ${isLocked ? 'text-amber-700 hover:bg-amber-50' : 'text-red-700 hover:bg-red-50'}`}>
                          {isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          {isLocked ? 'Unlock Project' : 'Lock Project'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Weather conditions from trials */}
                {(() => {
                  const temps = projectTrials.map(t => parseFloat(t.Temperature)).filter(n => isFinite(n));
                  const hums = projectTrials.map(t => parseFloat(t.Humidity)).filter(n => isFinite(n));
                  const rains = projectTrials.map(t => parseFloat(t.Rain)).filter(n => isFinite(n));
                  return (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                      <h3 className="font-bold text-slate-800 mb-3 text-sm">Avg Weather Conditions</h3>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-orange-50 rounded-lg p-2 border border-orange-100"><div className="font-bold text-orange-700">{avg(temps)}°C</div><div className="text-slate-400">Temp</div></div>
                        <div className="bg-blue-50 rounded-lg p-2 border border-blue-100"><div className="font-bold text-blue-700">{avg(hums)}%</div><div className="text-slate-400">Humidity</div></div>
                        <div className="bg-slate-50 rounded-lg p-2 border border-slate-200"><div className="font-bold text-slate-700">{avg(rains)}mm</div><div className="text-slate-400">Rain</div></div>
                      </div>
                    </div>
                  );
                })()}

              </div>
            </div>
          </div>
        </div>
        {renderModals()}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIST VIEW
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Projects (Grouped)" onMenuClick={onMenuClick} />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <h2 className="text-xl font-bold text-slate-800">All Grouped Projects</h2>
          <button onClick={() => { setFormData({ Name: '', Metric: config.primaryMetric.label, TargetWeed: '', Crop: '', Location: '', Investigator: '', StartDate: '', Lat: '', Lon: '', WeatherTemp: '', WeatherHumidity: '', WeatherWind: '', WeatherRain: '', WeatherDetails: '' }); setEditingProject(null); setIsModalOpen(true); }}
            style={{ backgroundColor: config.color.hex }}
            className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition hover:opacity-90">
            <Plus className="w-4 h-4" /> New Project
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.length > 0 ? projects.map(p => {
            const pb = (state.blocks || []).filter(b => String(b.ProjectID) === String(p.ID));
            const pt = (state.trials || []).filter(t => String(t.ProjectID) === String(p.ID));
            const treats = [...new Set(pt.map(t => t.FormulationName).filter(Boolean))];
            const statusClass = p.Status === 'Locked' ? 'bg-slate-800 text-white' : p.Status === 'Finalized' ? '${theme.badge}' : 'bg-amber-100 text-amber-700';

            const isShared = !!(p.CreatedBy && p.CreatedBy !== (user?.uid || user?.ID || user?.id));
            return (
              <div key={p.ID} onClick={() => openProject(p.ID)}
                className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition cursor-pointer active:scale-[0.99]">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 truncate">{p.Name}</h3>
                    <div className="flex gap-1.5 items-center mt-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusClass}`}>{p.Status || 'Draft'}</span>
                      {isShared && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-0.5">
                          <Share2 className="w-2.5 h-2.5 animate-pulse" /> Shared
                        </span>
                      )}
                      {!isShared && Array.isArray(p.SharedWith) && p.SharedWith.length > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-0.5" title={`Shared with ${p.SharedWith.length} user(s)`}>
                          <Share2 className="w-2.5 h-2.5" /> Shared ({p.SharedWith.length})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                    {isAdmin && (
                      <button onClick={(e) => handleOpenShareModal(e, p)} className="text-slate-300 hover:text-indigo-600 transition p-1" title="Share Project">
                        <Share2 className="h-4 w-4" />
                      </button>
                    )}
                    {isOwnData(p) && (
                      <>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          setEditingProject(p);
                          setFormData({
                            Name: p.Name || '',
                            Metric: p.Metric || config.primaryMetric.label,
                            TargetWeed: p.TargetWeed || '',
                            Crop: p.Crop || '',
                            Location: p.Location || '',
                            Investigator: p.Investigator || '',
                            StartDate: p.StartDate || '',
                            Lat: p.Lat || '',
                            Lon: p.Lon || '',
                            WeatherTemp: p.WeatherTemp || '',
                            WeatherHumidity: p.WeatherHumidity || '',
                            WeatherWind: p.WeatherWind || '',
                            WeatherRain: p.WeatherRain || '',
                            WeatherDetails: p.WeatherDetails || ''
                          });
                          setIsModalOpen(true);
                        }} className="text-slate-300 hover:text-emerald-600 transition p-1" title="Edit Project">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={(e) => handleDelete(e, p.ID)} className="text-slate-300 hover:text-red-500 transition p-1" title="Delete Project">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-4 text-sm text-slate-500">
                  <div className="flex items-center gap-2"><Layers className="h-3.5 w-3.5" /><span>{pb.length} Block{pb.length !== 1 ? 's' : ''}</span></div>
                  <div className="flex items-center gap-2"><Beaker className="h-3.5 w-3.5" /><span>{pt.length} Plot{pt.length !== 1 ? 's' : ''} · {treats.length} Treatment{treats.length !== 1 ? 's' : ''}</span></div>
                  <div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5" /><span className="truncate">Metric: {p.Metric || 'WCE'}</span></div>
                  {p.Crop && <div className="flex items-center gap-2 text-xs"><span className="text-slate-400">Crop:</span><span>{p.Crop}</span></div>}
                  {p.Location && <div className="flex items-center gap-2 text-xs"><span className="text-slate-400">Location:</span><span className="truncate">{p.Location}</span></div>}
                </div>

                <div className="pt-3 border-t border-slate-50 flex justify-between items-center">
                  <span className="text-[10px] text-slate-400">{formatDateTime(p.CreatedAt) || '—'}</span>
                  <span className={`${theme.text} font-bold text-xs flex items-center gap-1`}>View Dashboard <ChevronRight className={`h-3.5 w-3.5`} /></span>
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full text-center py-14 bg-white rounded-xl border-2 border-dashed border-slate-200">
              <Layers className="w-10 h-10 mx-auto text-slate-200 mb-3" />
              <p className="text-slate-500 mb-3">No RCBD Projects yet.</p>
              <button onClick={() => setIsModalOpen(true)} className={`${theme.text} font-bold hover:underline text-sm`}>Create your first project →</button>
            </div>
          )}
        </div>
        {renderModals()}
      </div>
    </div>
  );

    function renderModals() {
      const config = activeProject ? projectConfig : getCategoryConfig(activeCategory);
      const theme = getThemeClasses(config.color?.accent || 'emerald');
      const potRows = parseInt(randomizeForm.potRows) || 9;
      const potCols = parseInt(randomizeForm.potCols) || 4;
      const blocksCount = parseInt(randomizeForm.potBlocks) || 3;
      const rowsPerBlock = Math.floor(potRows / blocksCount) || 1;
      return (
        <>
        {/* ── Create Project Modal ── */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingProject ? "Edit RCBD Project" : "New RCBD Project"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Project Name *</label>
            <input required value={formData.Name} onChange={e => setFormData(v => ({ ...v, Name: e.target.value }))} className={INPUT} placeholder="e.g., 2024 Pre-Emergent Corn Study" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-semibold text-slate-700">Location</label>
                <button
                  type="button"
                  onClick={handleAutofetchLocationAndWeather}
                  disabled={isFetchingGeo}
                  className={`text-xs ${theme.text} hover:${theme.textDark} font-medium flex items-center gap-1 disabled:opacity-50`}
                >
                  {isFetchingGeo ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Fetching...
                    </>
                  ) : (
                    <>
                      <MapPin className="w-3 h-3" /> Auto-fetch
                    </>
                  )}
                </button>
              </div>
              <input value={formData.Location} onChange={e => setFormData(v => ({ ...v, Location: e.target.value }))} className={INPUT} placeholder="e.g., North Field" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Crop</label>
              <input value={formData.Crop} onChange={e => setFormData(v => ({ ...v, Crop: e.target.value }))} className={INPUT} placeholder="e.g., Corn" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Investigator</label>
              <input value={formData.Investigator} onChange={e => setFormData(v => ({ ...v, Investigator: e.target.value }))} className={INPUT} placeholder="Lead researcher name" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Start Date</label>
              <input type="datetime-local" value={toDatetimeLocal(formData.StartDate)} onChange={e => setFormData(v => ({ ...v, StartDate: e.target.value }))} className={INPUT} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Target {config.targetLabel}</label>
            <input value={formData.TargetWeed} onChange={e => setFormData(v => ({ ...v, TargetWeed: e.target.value }))} className={INPUT} placeholder={`e.g. Target ${config.targetLabel}`} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Primary Metric</label>
            <select value={formData.Metric} onChange={e => setFormData(v => ({ ...v, Metric: e.target.value }))} className={INPUT}>
              {activeCategory === 'herbicide' && (
                <>
                  <option value="Weed Control Efficiency">Weed Control Efficiency (%)</option>
                  <option value="Crop Injury">Crop Injury / Phytotoxicity (%)</option>
                  <option value="Yield">Yield (kg/ha)</option>
                  <option value="Biomass Reduction">Biomass Reduction (%)</option>
                </>
              )}
              {activeCategory === 'fungicide' && (
                <>
                  <option value="Disease Control Efficiency">Disease Control Efficiency (%)</option>
                  <option value="Crop Injury">Crop Injury / Phytotoxicity (%)</option>
                  <option value="Yield">Yield (kg/ha)</option>
                  <option value="Green Leaf Area">Green Leaf Area (%)</option>
                </>
              )}
              {activeCategory === 'pesticide' && (
                <>
                  <option value="Pest Reduction Efficiency">Pest Reduction Efficiency (%)</option>
                  <option value="Crop Injury">Crop Injury / Phytotoxicity (%)</option>
                  <option value="Yield">Yield (kg/ha)</option>
                  <option value="Damage Rating">Damage Rating (0-9)</option>
                </>
              )}
              {activeCategory === 'nutrition' && (
                <>
                  <option value="Yield Improvement">Yield Improvement (%)</option>
                  <option value="Chlorophyll Index">Chlorophyll Index (SPAD)</option>
                  <option value="Biomass Weight">Biomass Weight (g/m²)</option>
                  <option value="Plant Height">Plant Height (cm)</option>
                </>
              )}
              {activeCategory === 'biostimulant' && (
                <>
                  <option value="Growth Enhancement Index">Growth Enhancement Index</option>
                  <option value="Root Biomass">Root Biomass (g)</option>
                  <option value="Shoot Biomass">Shoot Biomass (g)</option>
                  <option value="Chlorophyll Index">Chlorophyll Index (SPAD)</option>
                </>
              )}
            </select>
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancel</button>
            <button type="submit" style={{ backgroundColor: config.color.hex }} className="text-white px-5 py-2 rounded-lg text-sm font-bold hover:opacity-90">
              {editingProject ? "Save Changes" : "Create Project"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Randomize Layout Modal ── */}
      <TrialDesignGuideModal isOpen={isDesignGuideOpen} onClose={() => setIsDesignGuideOpen(false)} />
      <Modal isOpen={isRandomizeModalOpen} onClose={() => setIsRandomizeModalOpen(false)} title="Randomize & Generate Layout" maxWidth="max-w-4xl">
        <form onSubmit={applyRandomization} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <div className={`${theme.bgLight} border ${theme.borderLight} rounded-lg p-3`}>
            <p className={`text-xs font-bold ${theme.text} uppercase`}>Target Project</p>
            <p className={`text-base font-bold text-${config.color.primary.split('-')[0]}-900`}>{activeProject?.Name}</p>
          </div>
          <p className="text-xs text-slate-500">Configure treatment rows to distribute across all blocks. You can map multiple rows to the same active formulation (e.g. testing different rates) and leave the formulation blank for untreated control treatments.</p>
          
        {/* Default Plot Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 bg-slate-50 p-4 rounded-xl border">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Trial Design Type</label>
              <button
                type="button"
                onClick={() => setIsDesignGuideOpen(true)}
                className="text-slate-400 hover:text-emerald-600 transition-colors flex items-center gap-0.5 text-[8px] font-bold"
                title="View Design Guide"
              >
                <Info className="w-2.5 h-2.5" /> Guide
              </button>
            </div>
            <select 
              value={randomizeForm.trialDesign} 
              onChange={e => setRandomizeForm(p => ({ ...p, trialDesign: e.target.value }))} 
              className={INPUT}
            >
              <option value="RCBD">RCBD (Block)</option>
              <option value="CRD">CRD (Completely Random)</option>
              <option value="Split-Plot">Split-Plot</option>
              <option value="Lattice">Alpha-Lattice</option>
              <option value="Factorial">Factorial</option>
              <option value="Strip-Plot">Strip-Plot</option>
              <option value="PotTrial">Pot Trial (Row-Based)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Replications (Blocks)</label>
              <select 
                value={randomizeForm.replications} 
                onChange={e => {
                  const val = e.target.value;
                  setRandomizeForm(p => ({ ...p, replications: val, potBlocks: val }));
                }}
                className={INPUT}
              >
                {[2, 3, 4, 5, 6, 7, 8].map(n => (
                  <option key={n} value={String(n)}>{n} Replications</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Investigator</label>
              <input 
                type="text" 
                placeholder="Investigator" 
                value={randomizeForm.investigatorName} 
                onChange={e => setRandomizeForm(p => ({ ...p, investigatorName: e.target.value }))} 
                className={INPUT} 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Default Dosage</label>
              <input 
                type="text" 
                placeholder="e.g. 100 mL/ha" 
                value={randomizeForm.dosage} 
                onChange={e => setRandomizeForm(p => ({ ...p, dosage: e.target.value }))} 
                className={INPUT} 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Target {config.targetLabel}</label>
              <input 
                type="text" 
                placeholder={`Target ${config.targetLabel}`} 
                value={randomizeForm.weedSpecies} 
                onChange={e => setRandomizeForm(p => ({ ...p, weedSpecies: e.target.value }))} 
                className={INPUT} 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
              <input 
                type="date" 
                value={randomizeForm.date} 
                onChange={e => setRandomizeForm(p => ({ ...p, date: e.target.value }))} 
                className={INPUT} 
              />
            </div>
          </div>

        {/* Pot Trial Layout Config */}
        {randomizeForm.trialDesign === 'PotTrial' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-emerald-50 p-4 rounded-xl border border-emerald-200">
            <div>
              <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Greenhouse Rows</label>
              <input 
                type="number"
                min="1"
                max="100"
                value={randomizeForm.potRows}
                onChange={e => setRandomizeForm(p => ({ ...p, potRows: e.target.value }))}
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Greenhouse Columns</label>
              <input 
                type="number"
                min="1"
                max="100"
                value={randomizeForm.potCols}
                onChange={e => setRandomizeForm(p => ({ ...p, potCols: e.target.value }))}
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Layout Option</label>
              <select
                value={randomizeForm.potLayout}
                onChange={e => {
                  const layout = e.target.value;
                  setRandomizeForm(p => ({
                    ...p,
                    potLayout: layout,
                    ...(layout === 'rcbd-pot' ? {
                      potObsMode: 'column-wise',
                      replications: 'column',
                      potStripeDirection: 'Vertical Columns',
                      potBlocks: p.potBlocks || '3'
                    } : {})
                  }));
                }}
                className={INPUT}
              >
                <option value="stripe">Stripe Layout (Sequential)</option>
                <option value="randomized-row">Randomized Row Layout</option>
                <option value="balanced-pot">Balanced Pot Randomization</option>
                <option value="rcbd-pot">RCBD Pot Trial (Stripe Columns by Block)</option>
              </select>
            </div>
            {(randomizeForm.potLayout === 'stripe' || randomizeForm.potLayout === 'randomized-row' || randomizeForm.potLayout === 'rcbd-pot') && (
              <div>
                <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Stripe Direction</label>
                <select
                  value={randomizeForm.potStripeDirection}
                  onChange={e => {
                    const dir = e.target.value;
                    const isHoriz = dir.toLowerCase().includes('horizontal');
                    setRandomizeForm(p => ({
                      ...p,
                      potStripeDirection: dir,
                      ...(p.potLayout === 'rcbd-pot' ? {
                        potObsMode: isHoriz ? 'row-wise' : 'column-wise',
                        replications: isHoriz ? 'row' : 'column'
                      } : {})
                    }));
                  }}
                  className={INPUT}
                >
                  <option value="Horizontal Rows">Horizontal Rows</option>
                  <option value="Vertical Columns">Vertical Columns</option>
                </select>
              </div>
            )}
            {randomizeForm.potLayout === 'rcbd-pot' && (
              <div>
                <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Number of Blocks (Replications)</label>
                <input
                  type="number"
                  min="1"
                  max={randomizeForm.potRows}
                  value={randomizeForm.potBlocks || '3'}
                  onChange={e => setRandomizeForm(p => ({ ...p, potBlocks: e.target.value }))}
                  className={INPUT}
                />
                {parseInt(randomizeForm.potRows) % (parseInt(randomizeForm.potBlocks) || 1) !== 0 && (
                  <p className="text-[10px] text-red-600 mt-1 font-semibold">
                    ⚠️ Rows ({randomizeForm.potRows}) must be a multiple of Blocks ({randomizeForm.potBlocks || 1})!
                  </p>
                )}
              </div>
            )}
            <div className="md:col-span-3">
              {renderLayoutPreview()}
            </div>
             <div>
              <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Observation Mode</label>
              <select
                value={randomizeForm.potObsMode}
                onChange={e => {
                  const mode = e.target.value;
                  setRandomizeForm(p => ({ 
                    ...p, 
                    potObsMode: mode,
                    replications: mode === 'row-wise' ? 'row' : (mode === 'column-wise' ? 'column' : 'pot')
                  }));
                }}
                className={INPUT}
              >
                {randomizeForm.potLayout === 'rcbd-pot' ? (
                  <>
                    {String(randomizeForm.potStripeDirection).toLowerCase().includes('horizontal') ? (
                      <option value="row-wise">Treatment Row-Wise ({blocksCount * rowsPerBlock} Units - Recommended)</option>
                    ) : (
                      <option value="column-wise">Treatment Column-Wise ({blocksCount * potCols} Units - Recommended)</option>
                    )}
                    <option value="plant-wise">Plant-Wise ({potRows * potCols} Pots - Research Grade)</option>
                  </>
                ) : (
                  <>
                    <option value="row-wise">Row-Wise Data Entry</option>
                    <option value="plant-wise">Plant-Wise Data Entry</option>
                  </>
                )}
              </select>
              {randomizeForm.potLayout === 'rcbd-pot' && randomizeForm.potObsMode === 'column-wise' && (
                <p className="text-[9px] text-emerald-600 mt-1 font-semibold">ℹ️ Recommended: Simplifies observations into 12 units (Block × Treatment).</p>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Experimental Unit (Locked)</label>
              <input 
                type="text"
                readOnly
                value={randomizeForm.potObsMode === 'row-wise' ? 'Row' : (randomizeForm.potObsMode === 'column-wise' ? 'Treatment Column' : 'Pot')}
                className={`${INPUT} bg-slate-100 cursor-not-allowed font-semibold text-slate-700`}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Pot Identifier Format</label>
              <select
                value={randomizeForm.potIdentifierFormat || 'row-col'}
                onChange={e => setRandomizeForm(p => ({ ...p, potIdentifierFormat: e.target.value }))}
                className={INPUT}
              >
                <option value="row-col">Row-Column Style (R1C1, R1C2...)</option>
                <option value="sequential">Sequential Style (P001, P002...)</option>
              </select>
            </div>
            {randomizeForm.potObsMode === 'row-wise' && (
              <div>
                <label className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">Row Aggregation Method</label>
                <select
                  value={randomizeForm.potDataMethod}
                  onChange={e => setRandomizeForm(p => ({ ...p, potDataMethod: e.target.value }))}
                  className={INPUT}
                >
                  <option value="total">Sum (Total) of Row Pots</option>
                  <option value="average">Mean (Average) of Row Pots</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* Factorial / Split-Plot combinations generator */}
        {(randomizeForm.trialDesign === 'Split-Plot' || randomizeForm.trialDesign === 'Factorial' || randomizeForm.trialDesign === 'Strip-Plot') && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-amber-50 p-4 rounded-xl border border-amber-200">
            <div>
              <label className="block text-[10px] font-bold text-amber-700 uppercase mb-1">Factor A Levels (comma-separated)</label>
              <input 
                type="text" 
                placeholder="e.g. Irrigated, Dry" 
                value={randomizeForm.mainFactorLevels} 
                onChange={e => setRandomizeForm(p => ({ ...p, mainFactorLevels: e.target.value }))} 
                className={INPUT} 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-amber-700 uppercase mb-1">Factor B Levels (comma-separated)</label>
              <input 
                type="text" 
                placeholder="e.g. 0 N, 50 N, 100 N" 
                value={randomizeForm.subFactorLevels} 
                onChange={e => setRandomizeForm(p => ({ ...p, subFactorLevels: e.target.value }))} 
                className={INPUT} 
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={generateFactorialCombinations}
                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition"
              >
                Generate Combinations
              </button>
            </div>
          </div>
        )}

        {/* Replication Warning Alert */}
        {randomizeForm.trialDesign === 'PotTrial' && randomizeForm.potObsMode === 'row-wise' && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs flex items-start gap-2">
            <span className="font-bold text-base mt-0.5">⚠️</span>
            <div>
              <p className="font-bold">Row-Wise Mode Reduces Replications</p>
              <p>You have selected Row-Wise observation. This treats each entire Row as the experimental unit. The replication count is reduced to the number of rows ({randomizeForm.potRows || 9}) instead of the total number of pots ({parseInt(randomizeForm.potRows || 9) * parseInt(randomizeForm.potCols || 4)}). This reduces statistical resolution but simplifies field workload.</p>
            </div>
          </div>
        )}

        {/* Custom Pot Observation Fields Setup */}
        {randomizeForm.trialDesign === 'PotTrial' && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Pot Observation Fields Setup</h4>
            <p className="text-[11px] text-slate-500">Configure the variables recorded for each experimental unit (e.g. height, flowers, yield). These will appear as observation columns in the data entry sheets.</p>
            
            <div className="flex flex-wrap gap-2 items-center bg-white p-2.5 rounded-lg border">
              {(randomizeForm.potFields || []).map((field, idx) => (
                <span key={field} className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded text-xs font-medium">
                  {field}
                  <div className="flex items-center gap-0.5 border-l border-emerald-200 pl-1.5 ml-1">
                    <button type="button" onClick={() => handleMovePotField(idx, 'up')} disabled={idx === 0} className="hover:text-emerald-900 disabled:opacity-30">▲</button>
                    <button type="button" onClick={() => handleMovePotField(idx, 'down')} disabled={idx === (randomizeForm.potFields || []).length - 1} className="hover:text-emerald-900 disabled:opacity-30">▼</button>
                    <button type="button" onClick={() => handleRemovePotField(field)} className="text-red-600 hover:text-red-900 ml-1">×</button>
                  </div>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input 
                type="text" 
                id="new_pot_field_input_2" 
                placeholder="Add Custom Field (e.g., Shoot weight)" 
                className={`${INPUT} max-w-xs`} 
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPotField(e.target.value);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('new_pot_field_input_2');
                  if (input) {
                    handleAddPotField(input.value);
                    input.value = '';
                  }
                }}
                className="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
              >
                Add Field
              </button>
            </div>
          </div>
        )}

        {/* Treatment Allocation Preview */}
        {allocationPreview && (
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 space-y-2">
            <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Treatment Allocation Preview</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-emerald-200 text-emerald-800 font-bold">
                      <th className="py-1.5 pr-4">Treatment</th>
                      {allocationPreview.potLayout === 'stripe' && allocationPreview.potStripeDirection === 'Horizontal Rows' ? (
                        <>
                          <th className="py-1.5 text-right pr-4">Rows</th>
                          <th className="py-1.5 text-right">Pots</th>
                        </>
                      ) : (
                        <th className="py-1.5 text-right">Pots</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100">
                    {allocationPreview.allocations.map(item => (
                      <tr key={item.name} className="text-slate-700">
                        <td className="py-1.5 pr-4 font-medium">{item.name}</td>
                        {allocationPreview.potLayout === 'stripe' && allocationPreview.potStripeDirection === 'Horizontal Rows' ? (
                          <>
                            <td className="py-1.5 text-right pr-4 font-semibold">{item.rows}</td>
                            <td className="py-1.5 text-right font-semibold">{item.pots}</td>
                          </>
                        ) : (
                          <td className="py-1.5 text-right font-semibold">{item.pots}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2 flex flex-col justify-center">
                {allocationPreview.potLayout === 'rcbd-pot' ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs space-y-1 text-slate-700">
                    <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Expected Design Summary</h5>
                    <div className="grid grid-cols-1 gap-y-0.5 font-medium">
                      <div>Design: <span className="font-bold text-emerald-700">RCBD Pot Trial</span></div>
                      <div>Replications: <span className="font-bold text-emerald-700">{allocationPreview.potBlocks} Blocks</span></div>
                      <div>Experimental Unit: <span className="font-bold text-emerald-700">{allocationPreview.potObsMode === 'column-wise' ? 'Treatment Column' : 'Pot'}</span></div>
                      <div>Total Pots: <span className="font-bold text-emerald-700">{allocationPreview.potRows * allocationPreview.potCols}</span></div>
                      {allocationPreview.potObsMode === 'column-wise' && (
                        <div>Observation Units: <span className="font-bold text-emerald-700">{allocationPreview.potBlocks * allocationPreview.potCols}</span></div>
                      )}
                      <div>Pots per Treatment: <span className="font-bold text-emerald-700">{allocationPreview.potRows}</span></div>
                      <div>Pots per Block: <span className="font-bold text-emerald-700">{Math.floor(allocationPreview.potRows / allocationPreview.potBlocks) * allocationPreview.potCols}</span></div>
                      <div>Analysis Method: <span className="font-bold text-slate-700">RCBD ANOVA</span></div>
                    </div>
                  </div>
                ) : allocationPreview.isBalanced ? (
                  <div className="bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-lg p-2.5 text-xs font-medium">
                    ✓ <strong>Perfectly Balanced Layout</strong> {allocationPreview.potLayout === 'stripe' && allocationPreview.potStripeDirection === 'Vertical Columns' ? `(each treatment receives exactly ${allocationPreview.allocations[0]?.pots || 0} pots)` : '(each treatment has equal replicates)'}
                  </div>
                ) : (
                  <div className="bg-amber-100 border border-amber-200 text-amber-800 rounded-lg p-2.5 text-xs font-medium">
                    ⚠️ <strong>Near Balanced Layout:</strong> Treatment replication is unequal.
                  </div>
                )}
              </div>
              {allocationPreview.potLayout === 'stripe' && (
                <div className="mt-3 md:col-span-2 p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2 text-xs text-blue-900">
                  <h5 className="font-bold uppercase tracking-wider text-[10px] text-blue-800">Layout Recommendations</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <span className="inline-block bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold text-[9px] uppercase mb-1">Scientific Recommendation</span>
                      <p className="font-bold text-slate-800">Vertical Columns</p>
                      <p className="text-slate-600 text-[11px] mt-0.5">
                        Each treatment receives exactly {allocationPreview.potRows} independent pots. Perfect treatment balance. Stronger statistical comparison.
                      </p>
                    </div>
                    <div>
                      <span className="inline-block bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold text-[9px] uppercase mb-1">Operational Recommendation</span>
                      <p className="font-bold text-slate-800">Horizontal Rows</p>
                      <p className="text-slate-600 text-[11px] mt-0.5">
                        Easier spraying and treatment application. Suitable for farmer demonstrations and routine product evaluation.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

          {/* Tabular Treatments Setup */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-semibold text-slate-700">Treatments Setup</label>
              <button
                type="button"
                onClick={addTreatmentRow}
                className={`flex items-center gap-1.5 text-xs ${theme.bg} text-white px-3 py-1.5 rounded-lg font-bold transition`}
              >
                <Plus className="w-3.5 h-3.5" /> Add Treatment Row
              </button>
            </div>
            
            <div className="overflow-x-auto border rounded-xl bg-slate-50">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-3">Treatment Name *</th>
                    <th className="p-3">Active Formulation</th>
                    <th className="p-3">Dosage / Rate</th>
                    <th className="p-3">Role</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {randomizeTreatments.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2">
                        <input
                          required
                          type="text"
                          placeholder="Treatment Name (e.g. UTC, T1, T2)"
                          value={t.name}
                          onChange={e => updateTreatmentRow(t.id, 'name', e.target.value)}
                          className={`w-full px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-1 ${theme.ringFocus} bg-white`}
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={t.formulationId}
                          onChange={e => updateTreatmentRow(t.id, 'formulationId', e.target.value)}
                          className={`w-full px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-1 ${theme.ringFocus} bg-white`}
                        >
                          <option value="">None (Untreated Control)</option>
                          {activeFormulations.map(f => (
                            <option key={f.ID} value={f.ID}>{f.Name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          placeholder="e.g. 100 mL/ha"
                          value={t.dosage}
                          onChange={e => updateTreatmentRow(t.id, 'dosage', e.target.value)}
                          className={`w-full px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-1 ${theme.ringFocus} bg-white`}
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={t.role}
                          onChange={e => updateTreatmentRow(t.id, 'role', e.target.value)}
                          className={`w-full px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-1 ${theme.ringFocus} bg-white`}
                        >
                          <option value="experimental">Experimental</option>
                          <option value="standard">Standard Check</option>
                          <option value="control">Untreated Control</option>
                        </select>
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => deleteTreatmentRow(t.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Delete row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {randomizeTreatments.length === 0 && (
                    <tr>
                      <td colSpan="5" className="text-center py-6 text-slate-400 italic bg-white animate-pulse">
                        No treatments added yet. Click "+ Add Treatment Row" to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-800">
            <strong>Warning:</strong> Generating a new randomized layout will replace any existing plots/trials for this project.
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setIsRandomizeModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancel</button>
            <button type="submit" className={`${theme.bg} text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2`}>
              <Shuffle className="w-4 h-4" /> Generate & Randomize
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Protocol Settings Modal ── */}
      <Modal isOpen={isProtocolModalOpen} onClose={() => setIsProtocolModalOpen(false)} title="Protocol Settings">
        <form onSubmit={(e) => { e.preventDefault(); saveProtocolSettings(); }} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Project Name *</label>
              <input required value={protocolForm.Name} onChange={e => setProtocolForm(v => ({ ...v, Name: e.target.value }))} className={INPUT} placeholder="e.g., Study Name" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Investigator</label>
              <input value={protocolForm.Investigator} onChange={e => setProtocolForm(v => ({ ...v, Investigator: e.target.value }))} className={INPUT} placeholder="Lead researcher" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-semibold text-slate-700">Location</label>
                <button
                  type="button"
                  onClick={handleAutofetchLocationAndWeatherForProtocol}
                  disabled={isFetchingGeoProtocol}
                  className={`text-xs ${theme.text} hover:${theme.textDark} font-medium flex items-center gap-1 disabled:opacity-50`}
                >
                  {isFetchingGeoProtocol ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Fetching...
                    </>
                  ) : (
                    <>
                      <MapPin className="w-3 h-3" /> Auto-fetch
                    </>
                  )}
                </button>
              </div>
              <input value={protocolForm.Location} onChange={e => setProtocolForm(v => ({ ...v, Location: e.target.value }))} className={INPUT} placeholder="e.g., North Field" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Target {config.targetLabel}</label>
              <input value={protocolForm.TargetWeed} onChange={e => setProtocolForm(v => ({ ...v, TargetWeed: e.target.value }))} className={INPUT} placeholder={`e.g., Target ${config.targetLabel}`} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Crop</label>
              <input value={protocolForm.Crop} onChange={e => setProtocolForm(v => ({ ...v, Crop: e.target.value }))} className={INPUT} placeholder="e.g., Rice (Oryza sativa)" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Primary Metric</label>
            <select value={protocolForm.Metric} onChange={e => setProtocolForm(v => ({ ...v, Metric: e.target.value }))} className={INPUT}>
              {activeCategory === 'herbicide' && (
                <>
                  <option value="Weed Control Efficiency">Weed Control Efficiency (%)</option>
                  <option value="Crop Injury">Crop Injury / Phytotoxicity (%)</option>
                  <option value="Yield">Yield (kg/ha)</option>
                  <option value="Biomass Reduction">Biomass Reduction (%)</option>
                </>
              )}
              {activeCategory === 'fungicide' && (
                <>
                  <option value="Disease Control Efficiency">Disease Control Efficiency (%)</option>
                  <option value="Crop Injury">Crop Injury / Phytotoxicity (%)</option>
                  <option value="Yield">Yield (kg/ha)</option>
                  <option value="Green Leaf Area">Green Leaf Area (%)</option>
                </>
              )}
              {activeCategory === 'pesticide' && (
                <>
                  <option value="Pest Reduction Efficiency">Pest Reduction Efficiency (%)</option>
                  <option value="Crop Injury">Crop Injury / Phytotoxicity (%)</option>
                  <option value="Yield">Yield (kg/ha)</option>
                  <option value="Damage Rating">Damage Rating (0-9)</option>
                </>
              )}
              {activeCategory === 'nutrition' && (
                <>
                  <option value="Yield Improvement">Yield Improvement (%)</option>
                  <option value="Chlorophyll Index">Chlorophyll Index (SPAD)</option>
                  <option value="Biomass Weight">Biomass Weight (g/m²)</option>
                  <option value="Plant Height">Plant Height (cm)</option>
                </>
              )}
              {activeCategory === 'biostimulant' && (
                <>
                  <option value="Growth Enhancement Index">Growth Enhancement Index</option>
                  <option value="Root Biomass">Root Biomass (g)</option>
                  <option value="Shoot Biomass">Shoot Biomass (g)</option>
                  <option value="Chlorophyll Index">Chlorophyll Index (SPAD)</option>
                </>
              )}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Application Timing</label>
              <select value={protocolForm.ApplicationTiming} onChange={e => setProtocolForm(v => ({ ...v, ApplicationTiming: e.target.value }))} className={INPUT}>
                <option value="">Select timing...</option>
                {config.applicationTimings?.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Spray Volume (L/ha)</label>
              <input type="number" min="0" step="10" value={protocolForm.SprayVolume} onChange={e => setProtocolForm(v => ({ ...v, SprayVolume: e.target.value }))} className={INPUT} placeholder="e.g., 200" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Protocol Notes</label>
            <textarea rows={4} value={protocolForm.Notes} onChange={e => setProtocolForm(v => ({ ...v, Notes: e.target.value }))} className={`${INPUT} resize-y`} placeholder="Additional protocol details, application methods, timing constraints..." />
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t">
            <button type="button" onClick={() => setIsProtocolModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancel</button>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
              <Save className="w-4 h-4" /> Save Protocol Settings
            </button>
          </div>
        </form>
      </Modal>

      {/* Plot Map Modal */}
      {showMap && activeProject && (
        <PlotMap 
          projectId={activeProject.ID}
          onClose={() => setShowMap(false)}
        />
      )}
      {/* ── Customise Report Columns Modal ── */}
      <Modal isOpen={customiseReportModalOpen} onClose={() => setCustomiseReportModalOpen(false)} title="Customise Report Columns">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Select the observation variables/columns you want to include in the generated report:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
            {(() => {
              const isPotTrial = activeProject?.Design === 'PotTrial';
              const fields = isPotTrial
                ? (activeProject.PotFields || ['Plant Height', 'Branches', 'Flowers', 'Fruit Count', 'Yield']).map(f => ({ key: f, label: f }))
                : (getCategoryConfig(activeProject?.Category || activeCategory).observationFields || []);
              return fields.map(f => (
                <label key={f.key} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={reportFieldSelection[f.key] !== false}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setReportFieldSelection(prev => ({ ...prev, [f.key]: checked }));
                    }}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm font-medium text-slate-700">{f.label}</span>
                </label>
              ));
            })()}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              onClick={() => setCustomiseReportModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (pendingReportExport) {
                  const projectCategory = activeProject?.Category || activeCategory;
                  if (!window.activeReportFields) window.activeReportFields = {};
                  window.activeReportFields[projectCategory] = reportFieldSelection;
                  pendingReportExport();
                }
                setCustomiseReportModalOpen(false);
              }}
              className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition"
            >
              Generate Report
            </button>
          </div>
        </div>
      </Modal>

      <AppSharingModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        initialSharedWith={sharingProject?.SharedWith || []}
        initialSharedWithEdit={sharingProject?.SharedWithEdit || []}
        onSave={handleSaveSharing}
      />
      </>
    );
  }
}