import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import TopBar from '../components/TopBar.jsx';
import { useNavigate } from 'react-router-dom';
import { safeJsonParse } from '../utils/helpers.js';
import SprayAdvisor from '../components/SprayAdvisor.jsx';
import SmartAlerts from '../components/SmartAlerts.jsx';
import WeatherDashboard from '../components/WeatherDashboard.jsx';
import {
  Activity, FolderOpen, FlaskConical, CheckCircle, Plus,
  TrendingUp, AlertCircle, Leaf, BarChart3, Search, ChevronRight,
  Thermometer, Droplets, Wind, CloudRain, Sprout, Filter, Grid3x3,
  Clock, Camera, CalendarDays, CloudOff, Eye, MapPin, Zap, ShieldAlert
} from 'lucide-react';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { getTrialCalculatedEfficacy } from '../utils/formulationTrialUtils.js';

function StatCard({ icon: Icon, label, value, sub, color = 'emerald', onClick }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <button onClick={onClick} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition text-left w-full">
      <div className={`p-3 rounded-xl ${colors[color]}`}><Icon className="w-5 h-5" /></div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </button>
  );
}

function MiniBar({ value, max, color = 'bg-emerald-500' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
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

  // ── Location for Spray Advisor (from most recent trial with coordinates)
  const trialLocation = useMemo(() => {
    const trialsWithCoords = trials.filter(t => t.Lat && t.Lon && !isNaN(parseFloat(t.Lat)) && !isNaN(parseFloat(t.Lon)));
    if (trialsWithCoords.length === 0) return null;
    // Get most recent trial with coordinates
    const sorted = [...trialsWithCoords].sort((a, b) => new Date(b.Date || 0) - new Date(a.Date || 0));
    return {
      lat: parseFloat(sorted[0].Lat),
      lon: parseFloat(sorted[0].Lon),
      name: sorted[0].Location || 'Trial Location'
    };
  }, [trials]);

  // ── Top-Formulations season filter state
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

    // Lifecycle breakdown
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

  // ── Average Weather Conditions from trial data
  const weatherStats = useMemo(() => {
    const temps = [], hums = [], winds = [], rains = [];
    trials.forEach(t => {
      if (t.Temperature && isFinite(parseFloat(t.Temperature))) temps.push(parseFloat(t.Temperature));
      if (t.Humidity && isFinite(parseFloat(t.Humidity))) hums.push(parseFloat(t.Humidity));
      if (t.Windspeed && isFinite(parseFloat(t.Windspeed))) winds.push(parseFloat(t.Windspeed));
      if (t.Rain && isFinite(parseFloat(t.Rain))) rains.push(parseFloat(t.Rain));
    });
    const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    return {
      temp: avg(temps), hum: avg(hums), wind: avg(winds), rain: avg(rains),
      hasData: temps.length > 0 || hums.length > 0
    };
  }, [trials]);

  // ── Weather Alerts
  const weatherAlerts = useMemo(() => {
    const alerts = [];
    if (weatherStats.temp !== null && weatherStats.temp > 35) alerts.push({ type: 'warning', msg: `High avg temperature (${weatherStats.temp.toFixed(1)}°C) — may reduce ${catConfig.name.toLowerCase()} efficacy` });
    if (weatherStats.hum !== null && weatherStats.hum < 30) alerts.push({ type: 'warning', msg: `Low avg humidity (${weatherStats.hum.toFixed(1)}%) — increased evaporation risk` });
    if (weatherStats.wind !== null && weatherStats.wind > 20) alerts.push({ type: 'warning', msg: `High avg wind speed (${weatherStats.wind.toFixed(1)} km/h) — drift risk` });
    if (weatherStats.rain !== null && weatherStats.rain === 0) alerts.push({ type: 'info', msg: 'No rainfall recorded — consider irrigation impact on results' });
    return alerts;
  }, [weatherStats]);

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

  // ── Recent Trials
  const recentTrials = useMemo(() =>
    [...trials].sort((a, b) => new Date(b.CreatedAt || b.Date || 0) - new Date(a.CreatedAt || a.Date || 0)).slice(0, 6)
  , [trials]);

  // ── Recent Projects
  const recentProjects = useMemo(() =>
    [...projects].sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0)).slice(0, 3)
  , [projects]);

  // ══════════════════════════════════════════════════════════════════
  // 1.1 — ACTIVITY FEED: Reconstruct last 15 actions from data timestamps
  // ══════════════════════════════════════════════════════════════════
  const activityFeed = useMemo(() => {
    const events = [];
    const allTrials = state.trials || [];
    const allProjects = state.projects || [];
    const allFormulations = state.formulations || [];

    allTrials.forEach(t => {
      const cat = t.Category || 'herbicide';
      // Trial created
      if (t.CreatedAt) {
        events.push({ type: 'trial_created', icon: 'plus', color: 'emerald', label: `Trial created: ${t.FormulationName || 'Untitled'}`, detail: t.Location ? `at ${t.Location}` : (t.WeedSpecies ? `on ${t.WeedSpecies}` : ''), time: new Date(t.CreatedAt), trialId: t.ID, category: cat });
      }
      // Trial finalized
      if ((t.IsCompleted === true || t.IsCompleted === 'true') && t.FinalizationDate) {
        events.push({ type: 'trial_finalized', icon: 'check', color: 'blue', label: `Trial finalized: ${t.FormulationName || 'Untitled'}`, detail: t.Result ? `Result: ${t.Result}` : '', time: new Date(t.FinalizationDate), trialId: t.ID, category: cat });
      }
      // Observations added
      const obs = safeJsonParse(t.EfficacyDataJSON, []);
      if (Array.isArray(obs)) {
        obs.forEach(o => {
          const rawD = o.date || o.ObservationDate || o.timestamp;
          if (rawD) {
            const d = new Date(rawD);
            if (!isNaN(d.getTime())) {
              events.push({ type: 'observation', icon: 'eye', color: 'purple', label: `Observation recorded (DAA ${o.daa || '?'})`, detail: t.FormulationName || '', time: d, trialId: t.ID, category: cat });
            }
          }
        });
      }
      // Photos added
      const photos = safeJsonParse(t.PhotoURLs, []);
      if (Array.isArray(photos) && photos.length > 0) {
        // Use the trial's last modified or creation date for photos
        const photoTime = t.LastModified ? new Date(t.LastModified) : (t.CreatedAt ? new Date(t.CreatedAt) : null);
        if (photoTime && !isNaN(photoTime.getTime())) {
          events.push({ type: 'photo', icon: 'camera', color: 'amber', label: `${photos.length} photo${photos.length > 1 ? 's' : ''} added`, detail: t.FormulationName || '', time: photoTime, trialId: t.ID, category: cat });
        }
      }
    });

    allProjects.forEach(p => {
      if (p.CreatedAt) {
        events.push({ type: 'project_created', icon: 'folder', color: 'indigo', label: `Project created: ${p.Name || 'Untitled'}`, detail: p.Description ? p.Description.slice(0, 40) : '', time: new Date(p.CreatedAt), category: p.Category || 'herbicide' });
      }
    });

    allFormulations.forEach(f => {
      if (f.CreatedAt) {
        events.push({ type: 'formulation_created', icon: 'flask', color: 'teal', label: `Formulation added: ${f.Name || 'Untitled'}`, detail: f.Code || '', time: new Date(f.CreatedAt), category: f.Category || 'herbicide' });
      }
    });

    return events
      .filter(e => !isNaN(e.time.getTime()))
      .sort((a, b) => b.time - a.time)
      .slice(0, 15);
  }, [state.trials, state.projects, state.formulations]);

  // ══════════════════════════════════════════════════════════════════
  // 1.3 — TRIAL HEALTH HEATMAP: Compute health status per active trial
  // ══════════════════════════════════════════════════════════════════
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

      // Efficacy trend: compare last two observations
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

      // Calculate health score 0-100
      let healthScore = 100;
      if (daysSinceObs > 14) healthScore -= 40;
      else if (daysSinceObs > 7) healthScore -= 20;
      else if (daysSinceObs > 3) healthScore -= 5;

      if (obsCount === 0) healthScore -= 30;
      if (efficacyTrend === 'declining') healthScore -= 20;

      // Weather risk
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

  // ══════════════════════════════════════════════════════════════════
  // 1.4 — DUE OBSERVATIONS CALENDAR: Calculate upcoming observation dates
  // ══════════════════════════════════════════════════════════════════
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

      // Find next unrecorded DAA
      for (const daa of STANDARD_DAA_INTERVALS) {
        if (recordedDAAs.has(daa)) continue;
        const dueDate = new Date(trialDate.getTime() + daa * 86400000);
        dueDate.setHours(0, 0, 0, 0);
        // Show observations due from today to 14 days in the future
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
        break; // only next due per trial
      }
    });

    return results.sort((a, b) => a.dueDate - b.dueDate);
  }, [trials]);

  // ══════════════════════════════════════════════════════════════════
  // 1.6 — WEATHER ALERT BANNER: Check 48h forecast for trial locations
  // ══════════════════════════════════════════════════════════════════
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
      locationsToCheck.push({ lat, lon, name: t.Location || 'Trial Site', trialName: t.FormulationName || 'Untitled' });
    });

    if (locationsToCheck.length === 0) return;
    forecastCheckedRef.current = true;
    setForecastLoading(true);

    // Check up to 3 unique locations to avoid excessive API calls
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

        // Check for heavy rain (>60% probability in any 6h window)
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
          alerts.push({ type: 'temp', severity: 'medium', location: loc.name, msg: `Extreme temperatures forecast at ${loc.name} — may affect product efficacy` });
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

  const RESULT_COLORS = {
    Excellent: 'text-emerald-600 bg-emerald-50',
    Good: 'text-blue-600 bg-blue-50',
    Fair: 'text-amber-600 bg-amber-50',
    Poor: 'text-red-600 bg-red-50',
  };

  const maxFormulationCount = topFormulationsFiltered[0]?.count || 1;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Dashboard" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto">
        {/* Hero */}
        <div className={`bg-gradient-to-r ${catConfig.color.gradient.replace('from-', 'from-').replace('to-', 'to-')} px-6 py-5 text-white`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">{greeting},</p>
              <h1 className="text-2xl font-bold mt-0.5">{displayName}</h1>
              <p className="text-white/70 text-sm mt-1">
                {stats.active} active trial{stats.active !== 1 ? 's' : ''} · {stats.totalObs} total observations
                {stats.successRate !== null && ` · ${stats.successRate}% success rate`}
              </p>
            </div>
            <button
              onClick={() => navigate('/categories')}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm px-3 py-2 rounded-xl text-xs font-bold text-white transition"
            >
              <Grid3x3 className="w-4 h-4" />
              {catConfig.name}
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5">

          {/* ── Stat cards ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <StatCard icon={Activity}    label="Total Trials"   value={trials.length}        sub={`${stats.active} active`}   color="emerald" onClick={() => navigate('/trials')} />
            <StatCard icon={CheckCircle} label="Finalized"      value={stats.finalized}      sub={`${stats.autoFinalizedCount} auto-closed`} color="blue" onClick={() => navigate('/trials')} />
            <StatCard icon={AlertCircle} label="Photo Reminders" value={stats.reminderCount}  sub="Due today" color="amber" onClick={() => navigate('/alerts')} />
            <StatCard icon={FolderOpen}  label="Projects"       value={projects.length}                                        color="purple"  onClick={() => navigate('/projects')} />
            <StatCard icon={FlaskConical}label="Formulations"   value={formulations.length}                                    color="amber"   onClick={() => navigate('/formulations')} />
            <StatCard icon={Leaf}        label="Ingredients"    value={ingredients.length}                                     color="emerald" onClick={() => navigate('/ingredients')} />
            <StatCard icon={BarChart3}   label="Observations"   value={stats.totalObs}                                         color="blue"    onClick={() => navigate('/analytics')} />
            <StatCard icon={Sprout}      label="Auto-Closed"    value={stats.autoFinalizedCount} sub="Due to inactivity" color="emerald" onClick={() => navigate('/alerts')} />
          </div>

          {/* ══ 1.6 — WEATHER ALERT BANNER ════════════════════════════ */}
          {(forecastAlerts.length > 0 || forecastLoading) && (
            <div className="space-y-2">
              {forecastLoading ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 animate-pulse">
                  <CloudRain className="w-5 h-5 text-blue-500" />
                  <span className="text-sm text-blue-700">Checking 48h weather forecast for your trial locations...</span>
                </div>
              ) : (
                forecastAlerts.map((alert, i) => (
                  <div key={i} className={`rounded-xl px-4 py-3 flex items-center gap-3 border ${
                    alert.severity === 'high' 
                      ? 'bg-red-50 border-red-200' 
                      : 'bg-amber-50 border-amber-200'
                  }`}>
                    {alert.type === 'rain' && <CloudRain className={`w-5 h-5 shrink-0 ${alert.severity === 'high' ? 'text-red-500' : 'text-amber-500'}`} />}
                    {alert.type === 'wind' && <Wind className={`w-5 h-5 shrink-0 ${alert.severity === 'high' ? 'text-red-500' : 'text-amber-500'}`} />}
                    {alert.type === 'temp' && <Thermometer className={`w-5 h-5 shrink-0 ${alert.severity === 'high' ? 'text-red-500' : 'text-amber-500'}`} />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${alert.severity === 'high' ? 'text-red-800' : 'text-amber-800'}`}>
                        ⚠️ {alert.msg}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <MapPin className="w-3 h-3 inline mr-1" />{alert.location} · Next 48 hours
                      </p>
                    </div>
                    <ShieldAlert className={`w-4 h-4 shrink-0 ${alert.severity === 'high' ? 'text-red-400' : 'text-amber-400'}`} />
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Smart Alerts ──────────────────────────────────────── */}
          <div className="max-w-2xl">
            <SmartAlerts compact={true} />
          </div>

          {/* ── Trials Over Time + Results Breakdown ───────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Trials Over Time – inline bar chart */}
            <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-bold text-slate-800 mb-4">Trials Over Time <span className="text-xs text-slate-400 font-normal">(last 12 months)</span></h3>
              {trialsOverTime.some(x => x.count > 0) ? (
                <div className="flex items-end gap-1 h-40">
                  {trialsOverTime.map(({ month, count }) => (
                    <div key={month} className="flex-1 flex flex-col items-center gap-1 group">
                      <span className="text-[9px] text-slate-400 hidden group-hover:block">{count}</span>
                      <div
                        className="w-full bg-emerald-400 rounded-t hover:bg-emerald-500 transition-all"
                        style={{ height: `${Math.max(4, (count / maxMonthCount) * 128)}px` }}
                        title={`${month}: ${count} trials`}
                      />
                      <span className="text-[9px] text-slate-400 rotate-0">{month}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-slate-400 text-sm">No trial date data available</div>
              )}
            </div>

            {/* Results Breakdown */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-bold text-slate-800 mb-4">Results Breakdown</h3>
              {(stats.resultCounts.Excellent + stats.resultCounts.Good + stats.resultCounts.Fair + stats.resultCounts.Poor) > 0 ? (
                <div className="space-y-3">
                  {[
                    ['Excellent', stats.resultCounts.Excellent, 'bg-emerald-500'],
                    ['Good',      stats.resultCounts.Good,      'bg-blue-500'],
                    ['Fair',      stats.resultCounts.Fair,      'bg-amber-500'],
                    ['Poor',      stats.resultCounts.Poor,      'bg-red-500'],
                  ].map(([label, count, barColor]) => {
                    const total = trials.length || 1;
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-600">{label}</span>
                          <span className="font-bold text-slate-700">{count} <span className="text-slate-400 font-normal">({Math.round((count/total)*100)}%)</span></span>
                        </div>
                        <MiniBar value={count} max={total} color={barColor} />
                      </div>
                    );
                  })}
                  {stats.successRate !== null && (
                    <div className="pt-2 border-t mt-3">
                      <p className="text-xs text-slate-500">Success rate (Good + Excellent): <span className="font-bold text-emerald-600">{stats.successRate}%</span></p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No rated trials yet</div>
              )}
            </div>
          </div>

          {/* ══ 1.3 — TRIAL HEALTH HEATMAP ════════════════════════════ */}
          {trialHealthData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Activity className="w-4 h-4" style={{ color: catConfig.color.hex }} />
                    Trial Health Monitor
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Active trials colored by health: <span className="text-emerald-600 font-bold">●</span> Healthy <span className="text-amber-500 font-bold">●</span> Needs Attention <span className="text-red-500 font-bold">●</span> Critical
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                    {trialHealthData.filter(t => t.status === 'green').length}
                  </span>
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                    {trialHealthData.filter(t => t.status === 'amber').length}
                  </span>
                  <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                    {trialHealthData.filter(t => t.status === 'red').length}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {trialHealthData.map(t => {
                  const bgColor = t.status === 'green' 
                    ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' 
                    : t.status === 'amber' 
                    ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                    : 'bg-red-50 border-red-200 hover:bg-red-100';
                  const textColor = t.status === 'green' ? 'text-emerald-700' : t.status === 'amber' ? 'text-amber-700' : 'text-red-700';
                  const dotColor = t.status === 'green' ? 'bg-emerald-500' : t.status === 'amber' ? 'bg-amber-500' : 'bg-red-500';

                  return (
                    <button
                      key={t.id}
                      onClick={() => navigate('/trials')}
                      className={`relative rounded-lg border p-2.5 text-left transition-all duration-200 group ${bgColor}`}
                      title={`${t.name}\n${t.location}\nDays since obs: ${t.daysSinceObs === 999 ? 'Never' : t.daysSinceObs}\nObservations: ${t.obsCount}\nTrend: ${t.efficacyTrend}\nHealth: ${t.healthScore}%`}
                    >
                      <div className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${dotColor} ${t.status === 'red' ? 'animate-pulse' : ''}`} />
                      <p className={`text-[10px] font-bold ${textColor} truncate leading-tight`}>{t.name}</p>
                      <p className="text-[9px] text-slate-400 truncate mt-0.5">{t.location || '—'}</p>
                      <div className="flex items-center gap-1 mt-1.5">
                        <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${t.status === 'green' ? 'bg-emerald-500' : t.status === 'amber' ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${t.healthScore}%` }}
                          />
                        </div>
                        <span className={`text-[8px] font-bold ${textColor}`}>{t.healthScore}</span>
                      </div>
                      {t.efficacyTrend === 'declining' && (
                        <TrendingUp className="w-3 h-3 text-red-400 rotate-180 mt-1" />
                      )}
                      {t.hasWeatherRisk && (
                        <CloudRain className="w-3 h-3 text-amber-400 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ 1.4 — DUE OBSERVATIONS CALENDAR ═══════════════════════ */}
          {dueObservations.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" style={{ color: catConfig.color.hex }} />
                    Upcoming Observations
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Next 14 days — {dueObservations.length} observation{dueObservations.length !== 1 ? 's' : ''} due</p>
                </div>
                <button
                  onClick={() => navigate('/trials')}
                  className="text-xs font-semibold flex items-center gap-1 hover:underline"
                  style={{ color: catConfig.color.hex }}
                >
                  View Trials <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-1.5">
                {dueObservations.map((item, i) => {
                  const dateStr = item.dueDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                  let statusBg, statusText, badge;
                  if (item.isOverdue) {
                    statusBg = 'bg-red-50 border-red-200';
                    statusText = 'text-red-700';
                    badge = <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">OVERDUE</span>;
                  } else if (item.isToday) {
                    statusBg = 'bg-amber-50 border-amber-200';
                    statusText = 'text-amber-700';
                    badge = <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full animate-pulse">TODAY</span>;
                  } else if (item.diffDays <= 2) {
                    statusBg = 'bg-blue-50 border-blue-100';
                    statusText = 'text-blue-700';
                    badge = <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">IN {item.diffDays}d</span>;
                  } else {
                    statusBg = 'bg-slate-50 border-slate-100';
                    statusText = 'text-slate-600';
                    badge = <span className="text-[10px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">IN {item.diffDays}d</span>;
                  }

                  return (
                    <div key={`${item.trialId}-${item.daa}-${i}`} className={`flex items-center gap-3 rounded-lg border p-2.5 ${statusBg} transition-all hover:shadow-sm`}>
                      <div className="flex flex-col items-center w-12 shrink-0">
                        <span className={`text-xs font-bold ${statusText}`}>{dateStr.split(' ')[1]}</span>
                        <span className="text-[10px] text-slate-400">{dateStr.split(' ')[2]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${statusText} truncate`}>{item.trialName}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          DAA {item.daa} observation{item.location ? ` · ${item.location}` : ''}
                        </p>
                      </div>
                      {badge}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Top Formulations This Season (Ranked by Kill Rate & Control Longevity) ────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><BarChart3 className="w-4 h-4" style={{ color: catConfig.color.hex }} /> Top Formulations (Kill Rate & Control Days)</h3>
                <p className="text-xs text-slate-400 mt-0.5">Ranked by combined agronomic performance (Kill % and Sustained Control Days). Filter by year, {catConfig.targetLabel.toLowerCase()}, or location.</p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-1 text-xs text-slate-500"><Filter className="w-3 h-3" /></div>
                <select value={fYear} onChange={e => setFYear(e.target.value)}
                  className="text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">All Years</option>
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <input value={fTarget} onChange={e => setFTarget(e.target.value)}
                  placeholder={`Filter by ${catConfig.targetLabel}`} list="dash-ftarget-list"
                  className="text-xs border rounded-lg px-2 py-1.5 w-36 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <datalist id="dash-ftarget-list">{allTargets.map(w => <option key={w} value={w} />)}</datalist>
                <input value={fLocation} onChange={e => setFLocation(e.target.value)}
                  placeholder="Filter by Location"
                  className="text-xs border rounded-lg px-2 py-1.5 w-36 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                {(fYear || fTarget || fLocation) && (
                  <button onClick={() => { setFYear(''); setFTarget(''); setFLocation(''); }}
                    className="text-xs text-red-500 hover:underline">Clear</button>
                )}
              </div>
            </div>
            {topFormulationsFiltered.length > 0 ? (
              <div className="space-y-2">
                {topFormulationsFiltered.map(({ name, count, avgEff, avgDays, compositeScore }) => (
                  <div key={name} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700 truncate">{name}</span>
                        <span className="text-slate-500 shrink-0 ml-2 flex items-center gap-1.5">
                          <span>{count} trial{count !== 1 ? 's' : ''}</span>
                          {avgEff !== null && <span className="font-bold text-emerald-600">· {avgEff}% Kill</span>}
                          {avgDays !== null && <span className="font-bold text-amber-600">· ⏳ {avgDays}d Control</span>}
                        </span>
                      </div>
                      <MiniBar value={compositeScore} max={100} color="bg-emerald-500" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-sm">No formulation data{fYear || fTarget || fLocation ? ' for these filters' : ''}</div>
            )}
          </div>


          {/* ── Spray Advisor ──────────────────────────────────────── */}
          {catConfig.showSprayAdvisor && (
          <div className="mb-6">
              {trialLocation && (
                <SprayAdvisor 
                  lat={trialLocation.lat} 
                  lon={trialLocation.lon} 
                  locationName={trialLocation.name}
                />
              )}
          </div>
          )}

          {/* ── Weather Dashboard ──────────────────────────────────────── */}
          <div className="mb-6">
            <WeatherDashboard 
              trials={trials} 
              activeCategory={activeCategory}
              getAppState={getAppState}
            />
          </div>

          {/* ── Top Performing Formulations by Target ───────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Sprout className="w-4 h-4" style={{ color: catConfig.color.hex }} /> Top Performing Formulations by {catConfig.targetLabel}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Find which formulations perform best against a specific {catConfig.targetLabel.toLowerCase()}.</p>
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{catConfig.targetLabel}</label>
                  <input value={targetQuery} onChange={e => setTargetQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleFindByTarget()}
                    list="dash-target-datalist"
                    placeholder={`Select ${catConfig.targetLabel.toLowerCase()}...`}
                    className="border rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  <datalist id="dash-target-datalist">{allTargets.map(w => <option key={w} value={w} />)}</datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Min efficacy (%)</label>
                  <input type="number" value={minEfficacy} onChange={e => setMinEfficacy(Number(e.target.value))}
                    min="0" max="100"
                    className="border rounded-lg px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <button onClick={handleFindByTarget}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                  <Search className="w-4 h-4" /> Find
                </button>
              </div>
            </div>

            {targetResults === null ? (
              <p className="text-sm text-slate-400 text-center py-4">Enter a {catConfig.targetLabel.toLowerCase()} name and click Find to see results.</p>
            ) : targetResults.results.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No trials found for "{targetResults.query}" with ≥{minEfficacy}% efficacy.</p>
            ) : (
              <div>
                <p className="text-xs text-slate-400 mb-3">{targetResults.total} trial{targetResults.total !== 1 ? 's' : ''} matched "{targetResults.query}" — top {targetResults.results.length} formulation{targetResults.results.length !== 1 ? 's' : ''}</p>
                <div className="space-y-2">
                  {targetResults.results.map((g, i) => (
                    <div key={g.name} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition">
                      <span className="text-xs font-bold text-slate-400 w-5 text-center">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{g.name}</p>
                        <p className="text-xs text-slate-400">{g.trials.length} trial{g.trials.length !== 1 ? 's' : ''}</p>
                      </div>
                      {g.avgEfficacy > 0 ? (
                        <div className="text-right shrink-0">
                          <span className={`text-sm font-bold ${g.avgEfficacy >= 90 ? 'text-emerald-600' : g.avgEfficacy >= 70 ? 'text-blue-600' : 'text-amber-600'}`}>
                            {g.avgEfficacy.toFixed(1)}%
                          </span>
                          <p className="text-xs text-slate-400">avg {catConfig.primaryMetric.key}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No {catConfig.primaryMetric.key} data</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ══ 1.1 — ACTIVITY FEED / TIMELINE ════════════════════════ */}
          {activityFeed.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4" style={{ color: catConfig.color.hex }} />
                Recent Activity
                <span className="text-xs text-slate-400 font-normal">— last {activityFeed.length} events across all categories</span>
              </h3>

              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-100 rounded-full" />

                <div className="space-y-0.5">
                  {activityFeed.map((event, i) => {
                    const colorMap = {
                      emerald: 'bg-emerald-500', blue: 'bg-blue-500', purple: 'bg-purple-500',
                      amber: 'bg-amber-500', indigo: 'bg-indigo-500', teal: 'bg-teal-500',
                    };
                    const iconMap = {
                      plus: <Plus className="w-2.5 h-2.5 text-white" />,
                      check: <CheckCircle className="w-2.5 h-2.5 text-white" />,
                      eye: <Eye className="w-2.5 h-2.5 text-white" />,
                      camera: <Camera className="w-2.5 h-2.5 text-white" />,
                      folder: <FolderOpen className="w-2.5 h-2.5 text-white" />,
                      flask: <FlaskConical className="w-2.5 h-2.5 text-white" />,
                    };

                    const timeAgo = (() => {
                      const diff = Date.now() - event.time.getTime();
                      const mins = Math.floor(diff / 60000);
                      if (mins < 1) return 'just now';
                      if (mins < 60) return `${mins}m ago`;
                      const hrs = Math.floor(mins / 60);
                      if (hrs < 24) return `${hrs}h ago`;
                      const days = Math.floor(hrs / 24);
                      if (days < 7) return `${days}d ago`;
                      if (days < 30) return `${Math.floor(days / 7)}w ago`;
                      return event.time.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                    })();

                    return (
                      <div key={`${event.type}-${i}`} className="flex items-start gap-3 py-1.5 pl-0 group">
                        {/* Timeline dot */}
                        <div className={`w-[30px] h-[30px] rounded-full ${colorMap[event.color] || 'bg-slate-400'} flex items-center justify-center shrink-0 z-10 ring-2 ring-white`}>
                          {iconMap[event.icon] || <Activity className="w-2.5 h-2.5 text-white" />}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-xs font-semibold text-slate-700 truncate group-hover:text-slate-900 transition">{event.label}</p>
                          {event.detail && <p className="text-[10px] text-slate-400 truncate">{event.detail}</p>}
                        </div>
                        {/* Time */}
                        <span className="text-[10px] text-slate-400 shrink-0 pt-1">{timeAgo}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
