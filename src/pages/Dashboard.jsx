import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import TopBar from '../components/TopBar.jsx';
import { useNavigate } from 'react-router-dom';
import { safeJsonParse } from '../utils/helpers.js';
import SprayAdvisor from '../components/SprayAdvisor.jsx';
import SmartAlerts from '../components/SmartAlerts.jsx';
import {
  Activity, FolderOpen, FlaskConical, CheckCircle, Plus,
  TrendingUp, TrendingDown, AlertCircle, Leaf, BarChart3, Search, ChevronRight,
  Thermometer, Droplets, Wind, CloudRain, Sprout, Filter, Grid3x3,
  Clock, Camera, CalendarDays, CloudOff, Eye, MapPin, Zap, ShieldAlert,
  Sparkles, ArrowRight, RefreshCw, Sun, Compass, Sliders, ChevronDown,
  Award, Target, AlertTriangle, Layers, ArrowUpRight, Check, PlayCircle,
  Bot, ShieldCheck, Microscope
} from 'lucide-react';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { getTrialCalculatedEfficacy } from '../utils/formulationTrialUtils.js';

/**
 * Circular Progress Meter
 */
function CircularProgress({ value = 0, size = 46, strokeWidth = 4.5, color = '#059669', trackColor = '#f1f5f9' }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90 drop-shadow-2xs" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span className="absolute text-[11px] font-black text-slate-800">{value}%</span>
    </div>
  );
}

/**
 * Mini Velocity Sparkline
 */
function MiniSparkline({ data = [12, 18, 22, 19, 28, 35, 42, 48], color = '#0284c7' }) {
  const width = 80;
  const height = 30;
  const min = Math.min(...data);
  const max = Math.max(...data) || 1;
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * (width - 6) + 3;
    const y = height - ((val - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="shrink-0 flex items-center">
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
}

/**
 * Premium Executive Metric Card
 */
function ExecutiveMetricCard({
  icon: Icon,
  label,
  value,
  subLabel,
  badgeText,
  badgeColor = 'emerald',
  gradient = 'from-emerald-500/10 via-white to-teal-500/5',
  iconGradient = 'from-emerald-500 to-teal-600',
  iconShadow = 'shadow-emerald-500/25',
  ringColor = 'ring-emerald-400/20',
  borderColor = 'border-slate-200/90 hover:border-emerald-300',
  accessory = null,
  progressPct = null,
  progressSub = null,
  progressBarColor = 'from-emerald-500 to-teal-400',
  onClick
}) {
  const badgeStyles = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    blue: 'bg-sky-50 text-sky-800 border-sky-200/80',
    purple: 'bg-purple-50 text-purple-800 border-purple-200/80',
    amber: 'bg-amber-50 text-amber-800 border-amber-200/80',
    rose: 'bg-rose-50 text-rose-800 border-rose-200/80',
  };

  return (
    <button
      onClick={onClick}
      className={`group relative text-left w-full p-5 rounded-3xl bg-white border ${borderColor} shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden touch-manipulation focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer`}
    >
      {/* Background ambient gradient glow */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-50 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />

      <div className="relative z-10 flex flex-col justify-between h-full">
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${iconGradient} text-white flex items-center justify-center shrink-0 shadow-md ${iconShadow} ring-2 ${ringColor} group-hover:scale-110 group-hover:rotate-1 transition-all duration-300`}>
            <Icon className="w-5 h-5 stroke-[2.2]" />
          </div>
          {badgeText && (
            <span className={`text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-0.5 rounded-full border ${badgeStyles[badgeColor] || badgeStyles.emerald} shrink-0`}>
              {badgeText}
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">{value}</span>
            </div>
            <p className="text-xs font-bold text-slate-700 mt-1">{label}</p>
            {subLabel && <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">{subLabel}</p>}
          </div>
          {accessory && <div className="shrink-0 pb-1">{accessory}</div>}
        </div>

        {progressPct !== null && (
          <div className="mt-3.5 pt-2.5 border-t border-slate-100">
            <div className="flex justify-between text-[10px] text-slate-400 font-semibold mb-1.5">
              <span>{progressSub || 'Status'}</span>
              <span className="font-extrabold text-slate-700">{progressPct}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${progressBarColor} rounded-full transition-all duration-700`}
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Modern Progress Bar
 */
function ModernBar({ value, max, color = 'from-emerald-500 to-teal-400' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 bg-slate-100/90 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500 shadow-xs`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function Dashboard({ onMenuClick }) {
  const { state, getAppState } = useAppState();
  const { user } = useAuth();
  const navigate = useNavigate();
  const activeCategory = state.activeCategory || 'herbicide';
  const catConfig = getCategoryConfig(activeCategory);

  const trials = useMemo(() => (state.trials || []).filter(t => t.Category === activeCategory || (!t.Category && activeCategory === 'herbicide')), [state.trials, activeCategory]);
  const projects = useMemo(() => (state.projects || []).filter(p => p.Category === activeCategory || (!p.Category && activeCategory === 'herbicide')), [state.projects, activeCategory]);
  const formulations = useMemo(() => (state.formulations || []).filter(f => f.Category === activeCategory || (!f.Category && activeCategory === 'herbicide')), [state.formulations, activeCategory]);
  const ingredients = useMemo(() => (state.ingredients || []).filter(i => i.Category === activeCategory || (!i.Category && activeCategory === 'herbicide')), [state.ingredients, activeCategory]);

  // ── Target-finder state
  const [targetQuery, setTargetQuery] = useState('');
  const [minEfficacy, setMinEfficacy] = useState(70);
  const [targetResults, setTargetResults] = useState(null);

  // ── Unique locations with coordinates for Spray Advisor
  const availableLocations = useMemo(() => {
    const locs = [];
    const seen = new Set();
    trials.forEach(t => {
      if (t.Lat && t.Lon && !isNaN(parseFloat(t.Lat)) && !isNaN(parseFloat(t.Lon))) {
        const lat = parseFloat(t.Lat);
        const lon = parseFloat(t.Lon);
        const name = t.Location || 'Trial Site';
        const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
        if (!seen.has(key)) {
          seen.add(key);
          const count = trials.filter(tr => tr.Lat && tr.Lon && Math.abs(parseFloat(tr.Lat) - lat) < 0.05 && Math.abs(parseFloat(tr.Lon) - lon) < 0.05).length;
          locs.push({
            lat,
            lon,
            name,
            displayName: `${name} (${count} plot${count > 1 ? 's' : ''})`,
            trialCount: count
          });
        }
      }
    });
    return locs;
  }, [trials]);

  const [selectedLocationIdx, setSelectedLocationIdx] = useState(0);

  const activeTrialLocation = useMemo(() => {
    if (availableLocations.length === 0) return null;
    return availableLocations[selectedLocationIdx] || availableLocations[0];
  }, [availableLocations, selectedLocationIdx]);

  // ── Top-Formulations filter state
  const [fYear, setFYear] = useState('');
  const [fTarget, setFTarget] = useState('');
  const [fLocation, setFLocation] = useState('');

  // ── Core stats & Lifecycle partitioning
  const stats = useMemo(() => {
    const active = trials.filter(t => t.IsCompleted !== true && t.IsCompleted !== 'true');
    const finalized = trials.filter(t => t.IsCompleted === true || t.IsCompleted === 'true');
    const totalObs = trials.reduce((acc, t) => acc + safeJsonParse(t.EfficacyDataJSON, []).length, 0);
    const resultCounts = { Excellent: 0, Good: 0, Fair: 0, Poor: 0 };
    trials.forEach(t => { if (t.Result && resultCounts[t.Result] !== undefined) resultCounts[t.Result]++; });
    const positiveResults = resultCounts.Excellent + resultCounts.Good;
    const ratedTrials = Object.values(resultCounts).reduce((a, b) => a + b, 0);
    const successRate = ratedTrials > 0 ? Math.round((positiveResults / ratedTrials) * 100) : null;

    let reminderCount = 0;
    let autoFinalizedCount = 0;
    const now = Date.now();

    trials.forEach(t => {
      if (t.AutoFinalized) autoFinalizedCount++;
      const isCompleted = t.IsCompleted === true || t.IsCompleted === 'true';
      if (!isCompleted && t.Date) {
        const obs = safeJsonParse(t.EfficacyDataJSON || t.observations, []);
        let lastDate = new Date(t.Date);
        if (Array.isArray(obs)) {
          obs.forEach(o => {
            const rawD = o.date || o.ObservationDate || o.timestamp;
            if (rawD) {
              const d = new Date(rawD);
              if (!isNaN(d.getTime()) && d > lastDate) lastDate = d;
            }
          });
        }
        const daysSince = Math.max(0, Math.floor((now - lastDate.getTime()) / (1000 * 60 * 60 * 24)));
        if (daysSince === 2) reminderCount++;
      }
    });

    return { active: active.length, finalized: finalized.length, totalObs, successRate, resultCounts, reminderCount, autoFinalizedCount };
  }, [trials]);

  // ── Trials Over Time (last 12 months)
  const trialsOverTime = useMemo(() => {
    const months = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = 0;
    }
    trials.forEach(t => {
      const raw = t.Date || t.CreatedAt;
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (months[key] !== undefined) months[key]++;
    });
    return Object.entries(months).map(([month, count]) => ({ month: month.slice(5), count }));
  }, [trials]);

  const maxMonthCount = useMemo(() => Math.max(...trialsOverTime.map(x => x.count), 1), [trialsOverTime]);

  // ── Available years for filter
  const availableYears = useMemo(() => {
    const years = new Set();
    trials.forEach(t => {
      const raw = t.Date || t.CreatedAt;
      if (!raw) return;
      const d = new Date(raw);
      if (!isNaN(d)) years.add(String(d.getFullYear()));
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [trials]);

  // ── All targets for datalist
  const allTargets = useMemo(() => {
    const s = new Set();
    const tField = catConfig.targetField || 'WeedSpecies';
    trials.forEach(t => {
      String(t[tField] || '').split(',').map(w => w.trim()).filter(Boolean).forEach(w => s.add(w));
    });
    return Array.from(s).sort();
  }, [trials, catConfig.targetField]);

  // ── Top Formulations (Ranked by Best Kill Rate & Control Days)
  const topFormulationsFiltered = useMemo(() => {
    let filtered = trials;
    const tField = catConfig.targetField || 'WeedSpecies';
    if (fYear) filtered = filtered.filter(t => {
      const d = new Date(t.Date || t.CreatedAt || '');
      return !isNaN(d) && String(d.getFullYear()) === fYear;
    });
    if (fTarget) filtered = filtered.filter(t => String(t[tField] || '').toLowerCase().includes(fTarget.toLowerCase()));
    if (fLocation) filtered = filtered.filter(t => String(t.Location || '').toLowerCase().includes(fLocation.toLowerCase()));

    const formulaMap = {};
    filtered.forEach(t => {
      const name = t.FormulationName;
      if (!name) return;
      if (!formulaMap[name]) {
        formulaMap[name] = { name, count: 0, efficacies: [], ctrlDays: [] };
      }
      formulaMap[name].count++;

      const eff = getTrialCalculatedEfficacy(t, activeCategory);
      if (eff !== null && eff > 0) {
        formulaMap[name].efficacies.push(eff);
      }

      const isFinalized = t.IsCompleted === true || t.IsCompleted === 'true' || t.ControlFinalized === true;
      if (isFinalized) {
        if (t.FinalControlDuration && !isNaN(parseInt(t.FinalControlDuration, 10))) {
          formulaMap[name].ctrlDays.push(parseInt(t.FinalControlDuration, 10));
        } else if (t.Date && t.FinalizationDate) {
          const diff = Math.max(0, Math.round((new Date(t.FinalizationDate) - new Date(t.Date)) / 86400000));
          if (diff > 0) formulaMap[name].ctrlDays.push(diff);
        }
      }
    });

    return Object.values(formulaMap)
      .map(item => {
        const avgEff = item.efficacies.length ? Math.round(item.efficacies.reduce((a, b) => a + b, 0) / item.efficacies.length) : null;
        const avgDays = item.ctrlDays.length ? Math.round(item.ctrlDays.reduce((a, b) => a + b, 0) / item.ctrlDays.length) : null;
        const effScore = avgEff !== null ? avgEff : 0;
        const daysScore = avgDays !== null ? Math.min(100, (avgDays / 30) * 100) : 10;
        const compositeScore = Math.round(effScore * 0.5 + daysScore * 0.5);
        return { name: item.name, count: item.count, avgEff, avgDays, compositeScore };
      })
      .sort((a, b) => b.compositeScore - a.compositeScore || b.count - a.count)
      .slice(0, 8);
  }, [trials, fYear, fTarget, fLocation, catConfig.targetField, activeCategory]);

  // ── Trial Health Data & Executive Status
  const trialHealthData = useMemo(() => {
    const now = Date.now();
    const activeTrials = trials.filter(t => t.IsCompleted !== true && t.IsCompleted !== 'true');

    return activeTrials.map(t => {
      const obs = safeJsonParse(t.EfficacyDataJSON, []);
      let lastObsDate = t.Date ? new Date(t.Date) : null;
      if (Array.isArray(obs)) {
        obs.forEach(o => {
          const rawD = o.date || o.ObservationDate || o.timestamp;
          if (rawD) {
            const d = new Date(rawD);
            if (!isNaN(d.getTime()) && (!lastObsDate || d > lastObsDate)) lastObsDate = d;
          }
        });
      }

      const daysSinceObs = lastObsDate ? Math.max(0, Math.floor((now - lastObsDate.getTime()) / 86400000)) : 999;
      const obsCount = obs.length;

      let efficacyTrend = 'stable';
      if (obs.length >= 2) {
        const sorted = [...obs].sort((a, b) => (a.daa || 0) - (b.daa || 0));
        const prev = sorted[sorted.length - 2];
        const last = sorted[sorted.length - 1];
        const prevVal = prev.controlPct ?? prev.wce ?? null;
        const lastVal = last.controlPct ?? last.wce ?? null;
        if (prevVal !== null && lastVal !== null) {
          if (lastVal < prevVal - 10) efficacyTrend = 'declining';
          else if (lastVal > prevVal + 5) efficacyTrend = 'improving';
        }
      }

      let healthScore = 100;
      if (daysSinceObs > 14) healthScore -= 40;
      else if (daysSinceObs > 7) healthScore -= 20;
      else if (daysSinceObs > 3) healthScore -= 5;

      if (obsCount === 0) healthScore -= 30;
      if (efficacyTrend === 'declining') healthScore -= 20;

      const hasWeatherRisk = (t.Temperature && parseFloat(t.Temperature) > 35) || (t.Windspeed && parseFloat(t.Windspeed) > 20);
      if (hasWeatherRisk) healthScore -= 10;

      healthScore = Math.max(0, Math.min(100, healthScore));

      let status = 'green';
      if (healthScore < 40) status = 'red';
      else if (healthScore < 70) status = 'amber';

      return {
        id: t.ID,
        name: t.FormulationName || 'Untitled',
        location: t.Location || '',
        daysSinceObs,
        obsCount,
        efficacyTrend,
        healthScore,
        status,
        hasWeatherRisk,
      };
    }).sort((a, b) => a.healthScore - b.healthScore);
  }, [trials]);

  // ── Executive Fleet Health Metrics
  const healthMetrics = useMemo(() => {
    const total = trialHealthData.length;
    const healthy = trialHealthData.filter(t => t.status === 'green').length;
    const needsCare = trialHealthData.filter(t => t.status === 'amber').length;
    const critical = trialHealthData.filter(t => t.status === 'red').length;
    const healthyPct = total > 0 ? Math.round((healthy / total) * 100) : 0;
    const needsCarePct = total > 0 ? Math.round((needsCare / total) * 100) : 0;
    const criticalPct = total > 0 ? Math.max(0, 100 - healthyPct - needsCarePct) : 0;
    const priorityPlots = trialHealthData.filter(t => t.status !== 'green').slice(0, 3);
    return { total, healthy, needsCare, critical, healthyPct, needsCarePct, criticalPct, priorityPlots };
  }, [trialHealthData]);

  // ── Due Observations
  const dueObservations = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const results = [];
    const STANDARD_DAA_INTERVALS = [0, 3, 7, 14, 21, 28, 42, 56, 70, 84, 90];

    trials.forEach(t => {
      if (t.IsCompleted === true || t.IsCompleted === 'true') return;
      if (!t.Date) return;

      const trialDate = new Date(t.Date);
      if (isNaN(trialDate.getTime())) return;
      trialDate.setHours(0, 0, 0, 0);

      const obs = safeJsonParse(t.EfficacyDataJSON, []);
      const recordedDAAs = new Set();
      if (Array.isArray(obs)) {
        obs.forEach(o => {
          if (o.daa !== undefined && o.daa !== null) recordedDAAs.add(Number(o.daa));
        });
      }

      for (const daa of STANDARD_DAA_INTERVALS) {
        if (recordedDAAs.has(daa)) continue;
        const dueDate = new Date(trialDate.getTime() + daa * 86400000);
        dueDate.setHours(0, 0, 0, 0);
        const diffDays = Math.round((dueDate - now) / 86400000);
        if (diffDays >= -1 && diffDays <= 14) {
          results.push({
            trialId: t.ID,
            trialName: t.FormulationName || 'Untitled',
            location: t.Location || '',
            daa,
            dueDate,
            diffDays,
            isOverdue: diffDays < 0,
            isToday: diffDays === 0,
          });
        }
        break;
      }
    });

    return results.sort((a, b) => a.dueDate - b.dueDate);
  }, [trials]);

  // ── 48h Weather Forecast Alerts
  const [forecastAlerts, setForecastAlerts] = useState([]);
  const [forecastLoading, setForecastLoading] = useState(false);
  const forecastCheckedRef = useRef(false);

  useEffect(() => {
    if (forecastCheckedRef.current) return;
    const locationsToCheck = [];
    const seen = new Set();
    trials.forEach(t => {
      if (t.IsCompleted === true || t.IsCompleted === 'true') return;
      if (!t.Lat || !t.Lon) return;
      const lat = parseFloat(t.Lat);
      const lon = parseFloat(t.Lon);
      if (isNaN(lat) || isNaN(lon)) return;
      const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
      if (seen.has(key)) return;
      seen.add(key);
      locationsToCheck.push({ lat, lon, name: t.Location || 'Field Site', trialName: t.FormulationName || 'Untitled' });
    });

    if (locationsToCheck.length === 0) return;
    forecastCheckedRef.current = true;
    setForecastLoading(true);

    const toCheck = locationsToCheck.slice(0, 3);
    Promise.all(toCheck.map(async (loc) => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=precipitation_probability,wind_speed_10m,temperature_2m&forecast_days=2&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.hourly) return null;

        const alerts = [];
        const hours = data.hourly.time || [];
        const precip = data.hourly.precipitation_probability || [];
        const wind = data.hourly.wind_speed_10m || [];
        const temp = data.hourly.temperature_2m || [];

        let highRainHours = 0;
        let maxWind = 0;
        let extremeTemp = false;

        for (let i = 0; i < hours.length; i++) {
          if (precip[i] > 60) highRainHours++;
          if (wind[i] > maxWind) maxWind = wind[i];
          if (temp[i] > 38 || temp[i] < 5) extremeTemp = true;
        }

        if (highRainHours >= 4) {
          alerts.push({ type: 'rain', severity: 'high', location: loc.name, msg: `Heavy rain expected (${highRainHours}h with >60% probability) — avoid spraying` });
        }
        if (maxWind > 25) {
          alerts.push({ type: 'wind', severity: 'high', location: loc.name, msg: `High wind forecast (up to ${Math.round(maxWind)} km/h) — spray drift risk` });
        }
        if (extremeTemp) {
          alerts.push({ type: 'temp', severity: 'medium', location: loc.name, msg: `Extreme temperatures forecast at ${loc.name} — potential evaporation hazard` });
        }
        return alerts;
      } catch {
        return null;
      }
    })).then(results => {
      const allAlerts = results.filter(Boolean).flat();
      setForecastAlerts(allAlerts);
      setForecastLoading(false);
    });
  }, [trials]);

  // ── Consolidated / Deduplicated Weather Alerts
  const consolidatedAlerts = useMemo(() => {
    if (!forecastAlerts || forecastAlerts.length === 0) return [];
    const groups = {};
    forecastAlerts.forEach(alert => {
      // Normalize location specific phrasing to group canonical hazards
      const cleanMsg = (alert.msg || '').replace(/\s+at\s+[^—]+—/i, ' —').trim();
      const key = `${alert.type}_${alert.severity}_${cleanMsg}`;
      if (!groups[key]) {
        groups[key] = {
          ...alert,
          msg: cleanMsg,
          locations: [alert.location].filter(Boolean)
        };
      } else {
        if (alert.location && !groups[key].locations.includes(alert.location)) {
          groups[key].locations.push(alert.location);
        }
      }
    });
    return Object.values(groups);
  }, [forecastAlerts]);

  // ── Find top formulations by target
  const handleFindByTarget = () => {
    const q = targetQuery.trim().toLowerCase();
    if (!q) return;
    const tField = catConfig.targetField || 'WeedSpecies';
    const mKey = catConfig.primaryMetric.key;
    const matched = trials.filter(t =>
      String(t[tField] || '').toLowerCase().includes(q)
    );
    const byFormulation = {};
    matched.forEach(t => {
      const name = t.FormulationName || 'Unknown';
      if (!byFormulation[name]) byFormulation[name] = { name, trials: [], efficacies: [] };
      byFormulation[name].trials.push(t);
      const wce = parseFloat(t[mKey] || t.FinalWCE || t.WCE || 0);
      if (isFinite(wce) && wce > 0) byFormulation[name].efficacies.push(wce);
    });
    const ranked = Object.values(byFormulation)
      .map(g => {
        const avg = g.efficacies.length ? g.efficacies.reduce((a, b) => a + b, 0) / g.efficacies.length : 0;
        return { ...g, avgEfficacy: avg };
      })
      .filter(g => g.avgEfficacy >= minEfficacy || g.efficacies.length === 0)
      .sort((a, b) => b.avgEfficacy - a.avgEfficacy)
      .slice(0, 10);
    setTargetResults({ query: q, results: ranked, total: matched.length });
  };

  const rawName = user?.Name || user?.Username || user?.username || 'Researcher';
  const cleanName = rawName.includes('@') ? rawName.split('@')[0] : rawName;
  const displayName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const todayFormatted = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/80">
      <TopBar title="Agronomic Command Center" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto pb-12">
        {/* ══════════════════════════════════════════════════════════════════
            HERO COMMAND HEADER (LUMINOUS EXECUTIVE HORIZON)
            ══════════════════════════════════════════════════════════════════ */}
        <div className="relative bg-gradient-to-r from-white via-slate-50/95 to-emerald-50/40 backdrop-blur-xl px-5 sm:px-6 py-5 border-b border-slate-200/80 shadow-2xs overflow-hidden">
          {/* Subtle Ambient Radial Lighting Glows */}
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 left-10 w-72 h-72 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
            {/* Left: User Identity & Field Context */}
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-teal-700 text-white font-black text-lg flex items-center justify-center shadow-md shadow-emerald-700/20 ring-2 ring-emerald-400/20">
                  {displayName.charAt(0)}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" title="System Live" />
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    Live Telemetry
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">· {todayFormatted}</span>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/70">
                    {catConfig.name}
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                  {greeting},{' '}
                  <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-teal-700 bg-clip-text text-transparent">
                    {displayName}
                  </span>
                </h1>
              </div>
            </div>

            {/* Center: Live Environmental Status Capsule */}
            <div className="hidden lg:flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/90 border border-slate-200/80 shadow-xs backdrop-blur-md">
              <div className="flex items-center gap-2 border-r border-slate-200/80 pr-3">
                <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Plots</p>
                  <p className="text-xs font-black text-slate-800">{stats.active} Running</p>
                </div>
              </div>

              <div className="flex items-center gap-2 border-r border-slate-200/80 pr-3">
                <div className="w-7 h-7 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                  <Award className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Success Rate</p>
                  <p className="text-xs font-black text-slate-800">{stats.successRate !== null ? `${stats.successRate}%` : 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <CloudRain className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Atmosphere</p>
                  <p className="text-xs font-black text-emerald-700">
                    {consolidatedAlerts.length > 0 ? 'Advisory Active' : 'Optimal Window'}
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Quick Action Command Buttons */}
            <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
              <button
                onClick={() => navigate('/trials')}
                className="group flex items-center gap-2 bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-md shadow-emerald-700/25 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3] group-hover:rotate-90 transition-transform duration-300" />
                New Trial
              </button>

              <button
                onClick={() => navigate('/compare')}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 hover:border-slate-300 px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <Microscope className="w-4 h-4 text-emerald-600" />
                Compare Trials
              </button>

              <button
                onClick={() => navigate('/assistant')}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-50 to-violet-50 hover:from-indigo-100 hover:to-violet-100 text-indigo-700 border border-indigo-200/80 px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <Bot className="w-4 h-4 text-indigo-600" />
                AI Copilot
              </button>

              <button
                onClick={() => navigate('/categories')}
                className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 px-3 py-2.5 rounded-xl text-xs font-bold shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                title="Switch Category"
              >
                <Grid3x3 className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">{catConfig.name}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

          {/* ══════════════════════════════════════════════════════════════════
              EXECUTIVE KPI SUMMARY METRIC CARDS
              ══════════════════════════════════════════════════════════════════ */}
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ExecutiveMetricCard
                icon={Activity}
                label="Total Field Trials"
                value={trials.length}
                subLabel={`${stats.active} Active Running · ${stats.finalized} Finalized`}
                badgeText={stats.active > 0 ? `${stats.active} ACTIVE` : 'IDLE'}
                badgeColor="emerald"
                gradient="from-emerald-500/10 via-white to-teal-500/5"
                iconGradient="from-emerald-500 to-teal-600"
                iconShadow="shadow-emerald-500/25"
                ringColor="ring-emerald-400/20"
                borderColor="border-slate-200/80 hover:border-emerald-300"
                accessory={
                  <div className="flex flex-col items-end">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[11px] font-black">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {stats.active} Active
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold mt-1">
                      {trials.length > 0 ? Math.round((stats.finalized / trials.length) * 100) : 0}% Complete
                    </span>
                  </div>
                }
                progressPct={trials.length > 0 ? Math.round((stats.finalized / trials.length) * 100) : 0}
                progressSub="Lifecycle Progression"
                progressBarColor="from-emerald-500 to-teal-400"
                onClick={() => navigate('/trials')}
              />

              <ExecutiveMetricCard
                icon={Award}
                label="Bio-Efficacy Success Rate"
                value={stats.successRate !== null ? `${stats.successRate}%` : 'N/A'}
                subLabel={`${stats.resultCounts.Excellent + stats.resultCounts.Good} positive out of ${stats.resultCounts.Excellent + stats.resultCounts.Good + stats.resultCounts.Fair + stats.resultCounts.Poor} rated`}
                badgeText="EXCELLENT & GOOD"
                badgeColor="blue"
                gradient="from-sky-500/10 via-white to-blue-500/5"
                iconGradient="from-sky-500 to-blue-600"
                iconShadow="shadow-sky-500/25"
                ringColor="ring-sky-400/20"
                borderColor="border-slate-200/80 hover:border-sky-300"
                accessory={
                  <CircularProgress
                    value={stats.successRate || 0}
                    size={48}
                    strokeWidth={4.5}
                    color="#0284c7"
                    trackColor="#e0f2fe"
                  />
                }
                progressPct={stats.successRate}
                progressSub="Suppression Efficacy"
                progressBarColor="from-sky-500 to-blue-500"
                onClick={() => navigate('/analytics')}
              />

              <ExecutiveMetricCard
                icon={BarChart3}
                label="Observations Scored"
                value={stats.totalObs}
                subLabel="DAA efficacy & canopy phenotyping logs"
                badgeText="GROUND TRUTH"
                badgeColor="purple"
                gradient="from-purple-500/10 via-white to-indigo-500/5"
                iconGradient="from-purple-500 to-indigo-600"
                iconShadow="shadow-purple-500/25"
                ringColor="ring-purple-400/20"
                borderColor="border-slate-200/80 hover:border-purple-300"
                accessory={
                  <div className="flex flex-col items-end">
                    <MiniSparkline data={[14, 20, 24, 21, 32, 38, 45, 52]} color="#7c3aed" />
                    <span className="text-[10px] font-extrabold text-purple-700 flex items-center gap-0.5 mt-0.5">
                      <TrendingUp className="w-3 h-3" /> Velocity +18%
                    </span>
                  </div>
                }
                onClick={() => navigate('/analytics')}
              />

              <ExecutiveMetricCard
                icon={FlaskConical}
                label="Formulations Portfolio"
                value={formulations.length}
                subLabel="Active proprietary recipes & field blends"
                badgeText={`${topFormulationsFiltered.length} BENCHMARKS`}
                badgeColor="amber"
                gradient="from-amber-500/10 via-white to-orange-500/5"
                iconGradient="from-amber-500 to-orange-600"
                iconShadow="shadow-amber-500/25"
                ringColor="ring-amber-400/20"
                borderColor="border-slate-200/80 hover:border-amber-300"
                accessory={
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200/80 text-amber-800 text-[10px] font-extrabold">
                      <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                      Top Benchmark
                    </div>
                    <span className="text-[10px] text-slate-400 font-semibold mt-1">
                      {formulations.length} Blends
                    </span>
                  </div>
                }
                onClick={() => navigate('/formulations')}
              />
            </div>

            {/* Secondary Operational Quick-Stats Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-3.5">
              <button
                onClick={() => navigate('/alerts')}
                className="group flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5 transition-all duration-200 text-left cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200/60 group-hover:scale-105 transition-transform">
                  <Camera className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-slate-900 tracking-tight">{stats.reminderCount} Photo Reminders</p>
                  <p className="text-[11px] text-slate-400 font-medium truncate">Plots due for scheduled imagery capture</p>
                </div>
              </button>

              <button
                onClick={() => navigate('/alerts')}
                className="group flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 transition-all duration-200 text-left cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200/60 group-hover:scale-105 transition-transform">
                  <Sprout className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-slate-900 tracking-tight">{stats.autoFinalizedCount} Auto-Closed</p>
                  <p className="text-[11px] text-slate-400 font-medium truncate">Archived due to protocol conclusion / inactivity</p>
                </div>
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              AI SPRAY ADVISOR & FIELD INTEL SECTION (PROMINENTLY BROUGHT TO TOP!)
              ══════════════════════════════════════════════════════════════════ */}
          {catConfig.showSprayAdvisor && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-teal-700 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 ring-2 ring-emerald-400/20 shrink-0">
                    <CloudRain className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                      Microclimate & AI Spray Intelligence
                      <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100/90 text-emerald-800 border border-emerald-300/70 tracking-wide">
                        HIGH PRIORITY
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">Real-time droplet evaporation, delta-T psychrometric drift tracking, and optimal spray timing</p>
                  </div>
                </div>

                {/* Location Selector for Spray Advisor */}
                {availableLocations.length > 1 && (
                  <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-2xl px-3.5 py-2 shadow-2xs hover:border-slate-300 transition">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-600">Location:</span>
                    <select
                      value={selectedLocationIdx}
                      onChange={e => setSelectedLocationIdx(Number(e.target.value))}
                      className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                    >
                      {availableLocations.map((loc, idx) => (
                        <option key={`${loc.lat}-${loc.lon}-${idx}`} value={idx}>
                          {loc.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Weather Alert Banners (Consolidated across plots) */}
              {(consolidatedAlerts.length > 0 || forecastLoading) && (
                <div className="space-y-2.5">
                  {forecastLoading ? (
                    <div className="bg-sky-50/90 border border-sky-200/80 rounded-2xl px-4 py-3 flex items-center gap-3 animate-pulse shadow-2xs">
                      <CloudRain className="w-4 h-4 text-sky-500 animate-spin" />
                      <span className="text-xs font-semibold text-sky-800">Verifying 48h Open-Meteo satellite forecast across plot coordinates...</span>
                    </div>
                  ) : (
                    consolidatedAlerts.map((alert, i) => (
                      <div
                        key={i}
                        className={`rounded-2xl p-3.5 sm:p-4 border shadow-xs transition-all relative overflow-hidden ${
                          alert.severity === 'high'
                            ? 'bg-gradient-to-r from-rose-50/90 via-white to-red-50/60 border-rose-200/90'
                            : 'bg-gradient-to-r from-amber-50/90 via-white to-orange-50/60 border-amber-200/90'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 relative z-10">
                          <div className={`p-2.5 rounded-xl shrink-0 shadow-sm ${
                            alert.severity === 'high' 
                              ? 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-rose-500/25 ring-2 ring-rose-400/20' 
                              : 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-amber-500/25 ring-2 ring-amber-400/20'
                          }`}>
                            {alert.type === 'rain' && <CloudRain className="w-4 h-4 stroke-[2.2]" />}
                            {alert.type === 'wind' && <Wind className="w-4 h-4 stroke-[2.2]" />}
                            {alert.type === 'temp' && <Thermometer className="w-4 h-4 stroke-[2.2]" />}
                          </div>
                          <div className="flex-1 min-w-0 sm:flex sm:items-center sm:justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                                  alert.severity === 'high' 
                                    ? 'bg-rose-100 text-rose-800 border-rose-300/70' 
                                    : 'bg-amber-100 text-amber-800 border-amber-300/70'
                                }`}>
                                  {alert.severity === 'high' ? 'High Risk Alert' : 'Advisory'}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  Next 48 Hours
                                </span>
                              </div>
                              <p className={`text-xs font-black leading-snug ${alert.severity === 'high' ? 'text-rose-950' : 'text-amber-950'}`}>
                                {alert.msg}
                              </p>
                            </div>

                            {alert.locations && alert.locations.length > 0 && (
                              <div className="mt-1.5 sm:mt-0 flex items-center gap-1.5 flex-wrap shrink-0">
                                <span className="text-[10px] font-bold text-slate-500">
                                  {alert.locations.length > 1 ? `Affecting ${alert.locations.length} plots:` : 'Plot:'}
                                </span>
                                {alert.locations.slice(0, 3).map((loc, idx) => (
                                  <span key={idx} className="inline-flex items-center gap-1 text-[10px] font-bold bg-white text-slate-700 px-2 py-0.5 rounded-md border border-slate-200/80 shadow-2xs">
                                    <MapPin className="w-2.5 h-2.5 text-rose-500" />
                                    {loc}
                                  </span>
                                ))}
                                {alert.locations.length > 3 && (
                                  <span className="text-[10px] font-bold text-slate-400">+{alert.locations.length - 3} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Full Width Spray Advisor */}
              <div className="w-full">
                {activeTrialLocation ? (
                  <SprayAdvisor
                    lat={activeTrialLocation.lat}
                    lon={activeTrialLocation.lon}
                    locationName={activeTrialLocation.name}
                  />
                ) : (
                  <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs text-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-700">GPS Coordinates Needed for Spray Advisor</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Add latitude and longitude coordinates to your active field trials to unlock real-time Open-Meteo weather forecasts, Delta-T psychrometric drift tracking, and optimal spray window recommendations.
                    </p>
                    <button
                      onClick={() => navigate('/trials')}
                      className="mt-4 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Update Trial Locations
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              VISUAL PERFORMANCE ANALYTICS (TRIALS OVER TIME & RESULTS BREAKDOWN)
              ══════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Trials Progression Over Time */}
            <div className="lg:col-span-7 bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-600" />
                    Trials Progression Velocity
                    <span className="text-xs text-slate-400 font-normal">(Last 12 Months)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Seasonal trial initiation and plot deployment rates</p>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/60">
                  Peak: {maxMonthCount} Trials
                </span>
              </div>

              {trialsOverTime.some(x => x.count > 0) ? (
                <div className="flex items-end gap-1.5 sm:gap-2 h-44 pt-6 pb-2 border-b border-slate-100">
                  {trialsOverTime.map(({ month, count }) => {
                    const isPeak = count === maxMonthCount && count > 0;
                    return (
                      <div key={month} className="flex-1 flex flex-col items-center gap-1.5 group relative h-full justify-end">
                        <div className="absolute -top-6 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-xs opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none whitespace-nowrap">
                          {month}: {count} trials
                        </div>
                        <div
                          className={`w-full rounded-t-lg transition-all duration-300 ${
                            isPeak
                              ? 'bg-gradient-to-t from-emerald-600 to-teal-400 shadow-xs'
                              : count > 0
                              ? 'bg-gradient-to-t from-emerald-500/80 to-teal-400/70 hover:from-emerald-600 hover:to-teal-500'
                              : 'bg-slate-100'
                          }`}
                          style={{ height: `${Math.max(6, (count / maxMonthCount) * 120)}px` }}
                        />
                        <span className={`text-[10px] font-medium transition-colors ${isPeak ? 'text-emerald-700 font-bold' : 'text-slate-400 group-hover:text-slate-700'}`}>
                          {month}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-44 flex items-center justify-center text-slate-400 text-sm">No historical trial timeline recorded</div>
              )}
            </div>

            {/* Results & Bio-Suppression Breakdown */}
            <div className="lg:col-span-5 bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Award className="w-4 h-4 text-emerald-600" />
                      Results Distribution
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Finalized agronomic bio-efficacy ratings</p>
                  </div>
                  {stats.successRate !== null && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/60">
                      {stats.successRate}% Win Rate
                    </span>
                  )}
                </div>

                {(stats.resultCounts.Excellent + stats.resultCounts.Good + stats.resultCounts.Fair + stats.resultCounts.Poor) > 0 ? (
                  <div className="space-y-3 pt-1">
                    {[
                      ['Excellent (≥90% Kill)', stats.resultCounts.Excellent, 'from-emerald-600 to-emerald-400', 'text-emerald-700'],
                      ['Good (70–89% Kill)', stats.resultCounts.Good, 'from-sky-600 to-sky-400', 'text-sky-700'],
                      ['Fair (50–69% Kill)', stats.resultCounts.Fair, 'from-amber-500 to-amber-300', 'text-amber-700'],
                      ['Poor (<50% Kill)', stats.resultCounts.Poor, 'from-rose-500 to-rose-300', 'text-rose-700'],
                    ].map(([label, count, barGradient, textCol]) => {
                      const total = trials.length || 1;
                      const pct = Math.round((count / total) * 100);
                      return (
                        <div key={label} className="group">
                          <div className="flex justify-between items-center text-xs mb-1">
                            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${barGradient}`} />
                              {label}
                            </span>
                            <span className="font-bold text-slate-700">
                              {count} <span className="text-slate-400 font-normal">({pct}%)</span>
                            </span>
                          </div>
                          <ModernBar value={count} max={total} color={barGradient} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-36 flex items-center justify-center text-slate-400 text-sm">No rated trial records available</div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Standard GEP Performance Metric</span>
                <button onClick={() => navigate('/analytics')} className="text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1">
                  Full Analytics <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              FIELD OPERATIONS HUB: UPCOMING SCHEDULE & TRIAL HEALTH STATUS (2 COLUMNS)
              ══════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Upcoming Observations Schedule */}
            <div className="lg:col-span-6 bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-emerald-600" />
                    Upcoming Observation Schedule
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Next 14 days · {dueObservations.length} observation{dueObservations.length !== 1 ? 's' : ''} scheduled</p>
                </div>
                <button
                  onClick={() => navigate('/trials')}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                >
                  All Trials <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {dueObservations.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {dueObservations.map((item, i) => {
                    const dateStr = item.dueDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                    let statusBg, statusText, badge;

                    if (item.isOverdue) {
                      statusBg = 'bg-rose-50/70 border-rose-200';
                      statusText = 'text-rose-800';
                      badge = <span className="text-[10px] font-extrabold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200 animate-pulse">OVERDUE</span>;
                    } else if (item.isToday) {
                      statusBg = 'bg-amber-50/70 border-amber-200';
                      statusText = 'text-amber-800';
                      badge = <span className="text-[10px] font-extrabold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300">TODAY</span>;
                    } else if (item.diffDays <= 2) {
                      statusBg = 'bg-sky-50/70 border-sky-200';
                      statusText = 'text-sky-800';
                      badge = <span className="text-[10px] font-bold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full border border-sky-200">IN {item.diffDays}d</span>;
                    } else {
                      statusBg = 'bg-slate-50/80 border-slate-200/70';
                      statusText = 'text-slate-700';
                      badge = <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">IN {item.diffDays}d</span>;
                    }

                    return (
                      <div
                        key={`${item.trialId}-${item.daa}-${i}`}
                        onClick={() => navigate('/trials')}
                        className={`flex items-center gap-3 rounded-xl border p-3 ${statusBg} transition-all hover:shadow-xs cursor-pointer group`}
                      >
                        <div className="flex flex-col items-center justify-center w-12 h-11 bg-white rounded-lg shadow-xs border border-black/5 shrink-0">
                          <span className={`text-xs font-black ${statusText}`}>{dateStr.split(' ')[1]}</span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase">{dateStr.split(' ')[2]}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold ${statusText} truncate group-hover:underline`}>{item.trialName}</p>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            DAA {item.daa} observation milestone{item.location ? ` · ${item.location}` : ''}
                          </p>
                        </div>
                        {badge}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 text-center text-slate-400 text-xs">
                  <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                  No observations due within the next 14 days.
                </div>
              )}
            </div>

            {/* Trial Health & Risk Status (Compact Executive Overview) */}
            <div className="lg:col-span-6 bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-600" />
                      Trial Health & Plot Status
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Interval freshness, efficacy trajectories & microclimate stress
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/trials')}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                  >
                    View All ({healthMetrics.total}) <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Multi-Segmented Health Status Bar */}
                <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/60 mb-4">
                  <div className="flex items-center justify-between text-xs font-bold mb-2">
                    <span className="text-slate-700">Fleet Health Distribution</span>
                    <span className="text-emerald-700 font-extrabold">{healthMetrics.healthyPct}% Optimal</span>
                  </div>
                  
                  {/* Visual Bar */}
                  <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
                    {healthMetrics.healthy > 0 && (
                      <div
                        style={{ width: `${healthMetrics.healthyPct}%` }}
                        className="bg-emerald-500 h-full transition-all duration-500"
                        title={`Healthy: ${healthMetrics.healthy} plots (${healthMetrics.healthyPct}%)`}
                      />
                    )}
                    {healthMetrics.needsCare > 0 && (
                      <div
                        style={{ width: `${healthMetrics.needsCarePct}%` }}
                        className="bg-amber-500 h-full transition-all duration-500"
                        title={`Needs Care: ${healthMetrics.needsCare} plots (${healthMetrics.needsCarePct}%)`}
                      />
                    )}
                    {healthMetrics.critical > 0 && (
                      <div
                        style={{ width: `${healthMetrics.criticalPct}%` }}
                        className="bg-rose-500 h-full transition-all duration-500"
                        title={`Critical: ${healthMetrics.critical} plots (${healthMetrics.criticalPct}%)`}
                      />
                    )}
                  </div>

                  {/* Badges / Legend */}
                  <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-200/50 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-slate-600 font-bold">Healthy:</span>
                      <span className="font-extrabold text-emerald-700">{healthMetrics.healthy}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="text-slate-600 font-bold">Needs Care:</span>
                      <span className="font-extrabold text-amber-700">{healthMetrics.needsCare}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      <span className="text-slate-600 font-bold">Critical:</span>
                      <span className="font-extrabold text-rose-700">{healthMetrics.critical}</span>
                    </div>
                  </div>
                </div>

                {/* Priority Attention Plots (Max 3) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    <span>Priority Focus Plots</span>
                    <span>Status / Risk</span>
                  </div>

                  {healthMetrics.priorityPlots.length > 0 ? (
                    healthMetrics.priorityPlots.map((t) => {
                      const isCritical = t.status === 'red';
                      const isWarning = t.status === 'amber';
                      return (
                        <div
                          key={t.id}
                          onClick={() => navigate('/trials')}
                          className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition hover:shadow-2xs cursor-pointer group ${
                            isCritical 
                              ? 'bg-rose-50/50 border-rose-200/80 hover:bg-rose-50' 
                              : isWarning 
                              ? 'bg-amber-50/50 border-amber-200/80 hover:bg-amber-50'
                              : 'bg-slate-50 border-slate-200/70 hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${isCritical ? 'bg-rose-500 animate-pulse' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                              <p className="text-xs font-bold text-slate-800 truncate group-hover:text-emerald-700 transition">
                                {t.name}
                              </p>
                            </div>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5 ml-4 flex items-center gap-1">
                              {t.location && <span>{t.location} · </span>}
                              <span>{t.daysSinceObs === 999 ? 'No observation' : `Scored ${t.daysSinceObs}d ago`}</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {t.hasWeatherRisk && (
                              <span className="p-1 rounded-md bg-amber-100 text-amber-700" title="Weather risk detected">
                                <CloudRain className="w-3 h-3" />
                              </span>
                            )}
                            {t.efficacyTrend === 'declining' && (
                              <span className="p-1 rounded-md bg-rose-100 text-rose-700" title="Declining efficacy">
                                <TrendingDown className="w-3 h-3" />
                              </span>
                            )}
                            <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg border ${
                              isCritical 
                                ? 'bg-rose-100 text-rose-800 border-rose-300' 
                                : isWarning 
                                ? 'bg-amber-100 text-amber-800 border-amber-300' 
                                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            }`}>
                              {t.healthScore}%
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-xs flex flex-col items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-emerald-500 mb-1" />
                      All active trials scored and within expected ranges.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-medium text-slate-400">Continuous plot risk modeling</span>
                <button
                  onClick={() => navigate('/trials')}
                  className="font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5 cursor-pointer"
                >
                  Inspect plot treatments <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              TOP FORMULATIONS LEADERBOARD & TARGET WEED FINDER (2 COLUMNS)
              ══════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Top Formulations Leaderboard */}
            <div className="lg:col-span-7 bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-600" />
                    Top Formulation Leaderboard
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Ranked by combined Kill % and Sustained Control Days</p>
                </div>

                <div className="flex flex-wrap gap-1.5 items-center">
                  <select
                    value={fYear}
                    onChange={e => setFYear(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <option value="">All Years</option>
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>

                  <input
                    value={fTarget}
                    onChange={e => setFTarget(e.target.value)}
                    placeholder={`Filter ${catConfig.targetLabel}`}
                    list="dash-ftarget-list"
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 w-28 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <datalist id="dash-ftarget-list">{allTargets.map(w => <option key={w} value={w} />)}</datalist>

                  {(fYear || fTarget || fLocation) && (
                    <button
                      onClick={() => { setFYear(''); setFTarget(''); setFLocation(''); }}
                      className="text-xs text-rose-600 font-bold hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {topFormulationsFiltered.length > 0 ? (
                <div className="space-y-2.5">
                  {topFormulationsFiltered.map(({ name, count, avgEff, avgDays, compositeScore }, idx) => {
                    const isTop1 = idx === 0;
                    const isTop2 = idx === 1;
                    const isTop3 = idx === 2;

                    return (
                      <div
                        key={name}
                        onClick={() => navigate('/formulations')}
                        className={`p-3 rounded-xl border transition-all hover:shadow-xs cursor-pointer ${
                          isTop1
                            ? 'bg-gradient-to-r from-amber-50/60 to-white border-amber-200/80'
                            : 'bg-white border-slate-100 hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 ${
                              isTop1 ? 'bg-amber-400 text-amber-950 shadow-xs' : isTop2 ? 'bg-slate-300 text-slate-800' : isTop3 ? 'bg-amber-700/20 text-amber-800' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-800 truncate">{name}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 text-xs">
                            <span className="text-[11px] text-slate-500 font-medium">{count} trial{count !== 1 ? 's' : ''}</span>
                            {avgEff !== null && (
                              <span className="font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                                {avgEff}% Kill
                              </span>
                            )}
                            {avgDays !== null && (
                              <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                                ⏳ {avgDays}d
                              </span>
                            )}
                          </div>
                        </div>
                        <ModernBar value={compositeScore} max={100} color={isTop1 ? 'from-amber-500 to-emerald-500' : 'from-emerald-500 to-teal-400'} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">No formulation benchmarks found for selected filters.</div>
              )}
            </div>

            {/* Target Weed / Pest Finder */}
            <div className="lg:col-span-5 bg-white rounded-2xl shadow-xs border border-slate-200/80 p-5 hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="mb-4">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-600" />
                    Target {catConfig.targetLabel} Match Finder
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Lookup top treatments validated against a target pest or weed</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Target Species</label>
                    <input
                      value={targetQuery}
                      onChange={e => setTargetQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleFindByTarget()}
                      list="dash-target-datalist"
                      placeholder={`Enter ${catConfig.targetLabel.toLowerCase()}...`}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-xs w-full focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    <datalist id="dash-target-datalist">{allTargets.map(w => <option key={w} value={w} />)}</datalist>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Min Kill Threshold: {minEfficacy}%</label>
                      <input
                        type="range"
                        min="50"
                        max="95"
                        step="5"
                        value={minEfficacy}
                        onChange={e => setMinEfficacy(Number(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                    <button
                      onClick={handleFindByTarget}
                      className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
                    >
                      <Search className="w-3.5 h-3.5" /> Search
                    </button>
                  </div>
                </div>

                {/* Target Search Results */}
                <div className="mt-4">
                  {targetResults === null ? (
                    <div className="py-6 text-center text-slate-400 text-xs">
                      Type a {catConfig.targetLabel.toLowerCase()} above and search to view efficacy ranking.
                    </div>
                  ) : targetResults.results.length === 0 ? (
                    <div className="py-6 text-center text-slate-500 text-xs">
                      No treatments found for "{targetResults.query}" meeting ≥{minEfficacy}% efficacy.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      <p className="text-[11px] font-semibold text-slate-400 mb-2">
                        {targetResults.total} trials matched "{targetResults.query}"
                      </p>
                      {targetResults.results.map((g, i) => (
                        <div key={g.name} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition">
                          <span className="text-[10px] font-black text-slate-400 w-4 text-center">#{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{g.name}</p>
                            <p className="text-[10px] text-slate-400">{g.trials.length} plot trials</p>
                          </div>
                          <span className={`text-xs font-extrabold px-2 py-0.5 rounded-md ${
                            g.avgEfficacy >= 90 ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
                          }`}>
                            {g.avgEfficacy.toFixed(0)}% Kill
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 text-right">
                <button onClick={() => navigate('/formulations')} className="text-xs font-bold text-emerald-600 hover:text-emerald-700">
                  Formulation Explorer →
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
