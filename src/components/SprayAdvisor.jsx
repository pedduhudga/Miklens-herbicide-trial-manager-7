/**
 * AI Spray Advisor & Microclimate Decision Engine
 * High-precision weather-based herbicide application intelligence
 * Featuring GRDC/APVMA Delta-T psychrometrics, 4h rainfastness watchdog,
 * 24-hour visual hourly suitability heatmap, and clear "When to Spray vs Avoid" directives.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { analyzeSprayWindow, getExtendedSprayForecast, clearWeatherCache, formatHour } from '../services/sprayAdvisor.js';
import { 
  CloudRain, Wind, Thermometer, Droplets, 
  CheckCircle, AlertTriangle, XCircle, Clock,
  MapPin, RefreshCw, ChevronRight, Calendar,
  ShieldCheck, ShieldAlert, Sparkles, Sun, ArrowRight,
  Info, Check, Compass, Gauge, AlertCircle, Ban, Moon
} from 'lucide-react';

/**
 * High-precision Delta-T Psychrometric Arc Gauge
 * Visualizes 0 - 14°C Delta-T according to GRDC/APVMA agronomic standards
 */
function DeltaTGauge({ value = 4.0 }) {
  const dt = typeof value === 'number' && !isNaN(value) ? Math.min(14, Math.max(0, value)) : 4.0;
  
  // Angle from -110° to +110° (220° arc)
  const minAngle = -110;
  const maxAngle = 110;
  const angle = minAngle + (dt / 14) * (maxAngle - minAngle);
  const rad = ((angle - 90) * Math.PI) / 180;
  
  const cx = 100;
  const cy = 85;
  const r = 58;
  const needleX = cx + r * Math.cos(rad);
  const needleY = cy + r * Math.sin(rad);

  // Interpretation text
  let statusText = 'Optimal Range (2–8°C)';
  let statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
  let advice = 'Ideal droplet survival & foliar absorption.';

  if (dt < 2) {
    statusText = 'Low Delta-T (<2°C)';
    statusColor = 'text-amber-700 bg-amber-50 border-amber-200';
    advice = 'Slow drying. Inversion & drift hazard if wind is still.';
  } else if (dt > 10) {
    statusText = 'Extreme Delta-T (>10°C)';
    statusColor = 'text-rose-700 bg-rose-50 border-rose-200';
    advice = 'Rapid evaporation in seconds. Do not spray.';
  } else if (dt > 8) {
    statusText = 'Marginal High (8–10°C)';
    statusColor = 'text-orange-700 bg-orange-50 border-orange-200';
    advice = 'Fast evaporation. Use coarse air-induction nozzles.';
  }

  return (
    <div className="flex flex-col items-center justify-center p-3.5 bg-gradient-to-b from-white to-slate-50 rounded-2xl border border-slate-200/90 shadow-2xs">
      <div className="relative w-48 h-26 flex items-center justify-center">
        <svg viewBox="0 0 200 120" className="w-full h-full overflow-visible">
          {/* Background Arc Sectors */}
          {/* 0 to 2°C: Inversion / Slow Drying (Blue-Amber) */}
          <path
            d="M 45 105 A 62 62 0 0 1 64 52"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* 2 to 8°C: Optimal (Vivid Emerald) */}
          <path
            d="M 68 47 A 62 62 0 0 1 132 47"
            fill="none"
            stroke="#10b981"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* 8 to 10°C: Marginal High (Amber) */}
          <path
            d="M 136 52 A 62 62 0 0 1 155 77"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="10"
          />
          {/* 10 to 14°C: Extreme Evaporation (Rose) */}
          <path
            d="M 157 82 A 62 62 0 0 1 155 105"
            fill="none"
            stroke="#ef4444"
            strokeWidth="10"
            strokeLinecap="round"
          />

          {/* Needle */}
          <line
            x1={cx}
            y1={cy}
            x2={needleX}
            y2={needleY}
            stroke="#1e293b"
            strokeWidth="3.5"
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
          <circle cx={cx} cy={cy} r="6" fill="#0f172a" />
          <circle cx={cx} cy={cy} r="2.5" fill="#ffffff" />
        </svg>

        {/* Live Value in center bottom */}
        <div className="absolute bottom-0 text-center">
          <div className="text-xl font-black text-slate-900 tracking-tight">
            ΔT {dt.toFixed(1)}°C
          </div>
        </div>
      </div>

      <div className="mt-1 text-center">
        <span className={`inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${statusColor}`}>
          {statusText}
        </span>
        <p className="text-[11px] text-slate-500 font-medium mt-1 max-w-[200px] leading-tight">
          {advice}
        </p>
      </div>
    </div>
  );
}

export default function SprayAdvisor({ lat, lon, locationName = 'Current Location' }) {
  const [analysis, setAnalysis] = useState(null);
  const [extendedForecast, setExtendedForecast] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('decision'); // 'decision' | 'timeline' | 'forecast'
  const [selectedHourIdx, setSelectedHourIdx] = useState(null);

  const loadAnalysis = useCallback(async () => {
    clearWeatherCache();
    if (!lat || !lon) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [sprayAnalysis, extended] = await Promise.all([
        analyzeSprayWindow(lat, lon, selectedDate),
        getExtendedSprayForecast(lat, lon, selectedDate)
      ]);
      
      if (sprayAnalysis.error) {
        setError(sprayAnalysis.error);
      } else {
        setAnalysis(sprayAnalysis);
      }
      
      if (!extended.error) {
        setExtendedForecast(extended);
      }
    } catch (err) {
      setError(err.message || 'Failed to load spray analysis');
    } finally {
      setLoading(false);
    }
  }, [lat, lon, selectedDate]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  const currentVerdict = analysis?.current?.verdict || 'SAFE_TO_SPRAY';
  const currentScore = analysis?.current?.score ?? 80;

  // Selected hour in timeline or fallback to current conditions
  const inspectedHour = useMemo(() => {
    if (!analysis?.hourlyTimeline || analysis.hourlyTimeline.length === 0) return null;
    if (selectedHourIdx !== null && analysis.hourlyTimeline[selectedHourIdx]) {
      return analysis.hourlyTimeline[selectedHourIdx];
    }
    const currentH = new Date().getHours();
    return analysis.hourlyTimeline.find(h => h.hour === currentH) || analysis.hourlyTimeline[0];
  }, [analysis, selectedHourIdx]);

  if (!lat || !lon) {
    return (
      <div className="bg-white rounded-3xl p-8 text-center border border-slate-200/90 shadow-xs">
        <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="font-extrabold text-slate-800 text-sm">GPS Coordinates Required</h3>
        <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
          Add field plot latitude and longitude coordinates to enable microclimate satellite tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden transition-all duration-300">
      {/* ══════════════════════════════════════════════════════════════════
          CARD HEADER & LOCATION SELECTOR
          ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 px-5 py-4 text-white relative overflow-hidden">
        {/* Ambient Top Light Beam */}
        <div className="absolute top-0 right-10 w-64 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md text-white flex items-center justify-center shadow-inner border border-white/20">
              <CloudRain className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base tracking-tight text-white flex items-center gap-1.5">
                  AI Spray Window Advisor
                </h3>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/40 text-emerald-100 border border-emerald-400/30 uppercase tracking-wider">
                  Live Sat-Sync
                </span>
              </div>
              <p className="text-xs text-emerald-100/90 flex items-center gap-1 mt-0.5 font-medium">
                <MapPin className="w-3 h-3 text-emerald-300" />
                {locationName} <span className="text-emerald-300/80">({Number(lat).toFixed(3)}, {Number(lon).toFixed(3)})</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1.5 bg-black/20 backdrop-blur-md border border-white/20 rounded-xl px-2.5 py-1 text-xs text-white">
              <Calendar className="w-3.5 h-3.5 text-emerald-200" />
              <span className="text-[11px] font-semibold text-emerald-100">Date:</span>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer focus:ring-0"
              />
            </div>

            <button 
              onClick={loadAnalysis}
              disabled={loading}
              title="Refresh weather data from Open-Meteo"
              className="p-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl transition disabled:opacity-50 text-white cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TOP NAVIGATION TABS
          ══════════════════════════════════════════════════════════════════ */}
      <div className="flex border-b border-slate-200/80 bg-slate-50/60 p-1.5 gap-1.5">
        {[
          { id: 'decision', label: 'Decision Verdict & Windows', icon: CheckCircle },
          { id: 'timeline', label: '24h Hourly Heatmap', icon: Clock },
          { id: 'forecast', label: '7-Day Strategic Outlook', icon: Calendar }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl text-xs font-black transition-all cursor-pointer ${
                isActive
                  ? 'bg-white text-emerald-800 shadow-sm border border-slate-200/90' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MAIN CONTENT AREA
          ══════════════════════════════════════════════════════════════════ */}
      <div className="p-4 md:p-5 space-y-5">
        {loading && (
          <div className="py-12 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto" />
            <p className="text-slate-700 font-extrabold text-sm">Synthesizing Open-Meteo High-Resolution Telemetry...</p>
            <p className="text-slate-400 text-xs">Computing Delta-T psychrometrics and rainfastness hazard windows</p>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center">
            <XCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-rose-900 font-extrabold text-sm">{error}</p>
            <p className="text-rose-600 text-xs mt-1">Please verify network connection and try again.</p>
          </div>
        )}

        {!loading && !error && analysis && (
          <>
            {/* ══════════════════════════════════════════════════════════════════
                HERO DECISION VERDICT: CAN I SPRAY RIGHT NOW? (INSTANT CLARITY)
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'decision' && (
              <div className="space-y-5">
                {/* Visual Verdict Hero Banner */}
                <div 
                  className={`relative rounded-3xl p-5 border-2 shadow-sm transition-all overflow-hidden ${
                    currentVerdict === 'SAFE_TO_SPRAY'
                      ? 'bg-gradient-to-br from-emerald-500/10 via-white to-teal-500/5 border-emerald-300/90'
                      : currentVerdict === 'SPRAY_WITH_CAUTION'
                      ? 'bg-gradient-to-br from-amber-500/10 via-white to-orange-500/5 border-amber-300/90'
                      : 'bg-gradient-to-br from-rose-500/10 via-white to-red-500/5 border-rose-300/90'
                  }`}
                >
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      {/* Pulse Status Beacon */}
                      <div className="relative mt-1">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md ${
                          currentVerdict === 'SAFE_TO_SPRAY'
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/25 ring-2 ring-emerald-400/20'
                            : currentVerdict === 'SPRAY_WITH_CAUTION'
                            ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/25 ring-2 ring-amber-400/20'
                            : 'bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/25 ring-2 ring-rose-400/20'
                        }`}>
                          {currentVerdict === 'SAFE_TO_SPRAY' && <CheckCircle className="w-6 h-6 stroke-[2.5]" />}
                          {currentVerdict === 'SPRAY_WITH_CAUTION' && <AlertTriangle className="w-6 h-6 stroke-[2.5]" />}
                          {currentVerdict === 'DO_NOT_SPRAY' && <Ban className="w-6 h-6 stroke-[2.5]" />}
                        </div>
                        <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full ring-2 ring-white animate-pulse ${
                          currentVerdict === 'SAFE_TO_SPRAY' ? 'bg-emerald-500' : currentVerdict === 'SPRAY_WITH_CAUTION' ? 'bg-amber-500' : 'bg-rose-500'
                        }`} />
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                            currentVerdict === 'SAFE_TO_SPRAY' 
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300/80' 
                              : currentVerdict === 'SPRAY_WITH_CAUTION'
                              ? 'bg-amber-100 text-amber-800 border-amber-300/80'
                              : 'bg-rose-100 text-rose-800 border-rose-300/80'
                          }`}>
                            {currentVerdict === 'SAFE_TO_SPRAY' 
                              ? 'GO — Clear to Spray' 
                              : currentVerdict === 'SPRAY_WITH_CAUTION' 
                              ? 'CAUTION — Sub-optimal' 
                              : analysis.current?.isNight
                              ? 'STOP — Night Inversion Active'
                              : analysis.current?.rainfastHazard
                              ? 'STOP — Rain Wash-off Hazard'
                              : 'STOP — Avoid Spraying'}
                          </span>
                          <span className="text-xs text-slate-400 font-semibold">
                            Score: <strong className="text-slate-800 font-black">{currentScore}/100</strong>
                          </span>
                        </div>

                        <h2 className={`text-xl md:text-2xl font-black tracking-tight mt-1 ${
                          currentVerdict === 'SAFE_TO_SPRAY' ? 'text-emerald-950' : currentVerdict === 'SPRAY_WITH_CAUTION' ? 'text-amber-950' : 'text-rose-950'
                        }`}>
                          {analysis.current?.verdictHeadline || (currentVerdict === 'SAFE_TO_SPRAY' ? 'Safe to Spray Now' : 'Avoid Spraying')}
                        </h2>

                        <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed max-w-xl">
                          {analysis.current?.verdictSummary || 'Conditions analyzed against standard agronomic application protocols.'}
                        </p>

                        {/* Rainfast Horizon Notice */}
                        {analysis.current?.rainfastHazard && (
                          <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-100/90 text-rose-900 border border-rose-300 text-xs font-bold">
                            <CloudRain className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>Rain wash-off warning: Rain arrives in ~{analysis.current.rainArrivesInHours}h. Herbicide requires 4 hours dry canopy.</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Next Window Pill or Score Dial */}
                    <div className="shrink-0 bg-white/90 backdrop-blur-md rounded-2xl p-3 border border-slate-200/80 shadow-2xs text-right md:min-w-[180px]">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                        {currentVerdict === 'SAFE_TO_SPRAY' ? 'Current Window Status' : 'Next Recommended Window'}
                      </span>
                      <div className="text-sm font-black text-slate-900 mt-0.5">
                        {currentVerdict === 'SAFE_TO_SPRAY' ? (
                          <span className="text-emerald-700 flex items-center justify-end gap-1">
                            <Clock className="w-3.5 h-3.5" /> Optimal Window Active
                          </span>
                        ) : analysis.bestWindow ? (
                          <span className="text-emerald-800 flex items-center justify-end gap-1 font-black">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            {analysis.bestWindow.dayLabel}, {formatHour(analysis.bestWindow.hour)}
                          </span>
                        ) : (
                          <span className="text-slate-600">Check 7-Day Outlook</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        {analysis.bestWindow ? `Peak Score: ${analysis.bestWindow.score}/100` : 'Conditions improving soon'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ══════════════════════════════════════════════════════════════════
                    WHEN TO SPRAY VS WHEN TO AVOID (THE TWO EXPLICIT DIRECTIVES)
                    ══════════════════════════════════════════════════════════════════ */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* GREEN CARD: WHEN YOU CAN SPRAY */}
                  <div className="rounded-3xl p-5 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 border border-emerald-200/80 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-emerald-100">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                            <Check className="w-4 h-4 stroke-[3]" />
                          </div>
                          <div>
                            <h3 className="font-black text-sm text-slate-900">
                              When You CAN Spray
                            </h3>
                            <p className="text-[11px] text-emerald-700 font-semibold">Recommended Daylight Application Windows</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Recommended
                        </span>
                      </div>

                      {analysis.allWindows && analysis.allWindows.length > 0 ? (
                        <div className="space-y-2.5">
                          {analysis.allWindows.slice(0, 3).map((w, idx) => (
                            <div 
                              key={idx}
                              className="rounded-2xl p-3 bg-white border border-emerald-100/90 shadow-2xs hover:border-emerald-300 transition"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-emerald-900">
                                    {w.dayLabel}, {formatHour(w.hour)}
                                  </span>
                                </div>
                                <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  {w.score}/100
                                </span>
                              </div>

                              <div className="flex items-center gap-2.5 mt-2 text-[11px] text-slate-500 font-medium flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Thermometer className="w-3 h-3 text-slate-400" /> {Math.round(w.conditions.temperature)}°C
                                </span>
                                <span className="flex items-center gap-1">
                                  <Wind className="w-3 h-3 text-slate-400" /> {Math.round(w.conditions.windSpeed)} km/h
                                </span>
                                <span className="flex items-center gap-1">
                                  <Gauge className="w-3 h-3 text-emerald-600" /> ΔT {w.deltaT?.toFixed(1)}°C
                                </span>
                                <span className="text-emerald-700 font-bold">
                                  0mm Rain
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 py-4 text-center">
                          No optimal daylight windows detected today due to adverse weather. Check 7-day outlook.
                        </p>
                      )}
                    </div>

                    <div className="mt-3.5 pt-2.5 border-t border-emerald-100/80 text-[11px] text-emerald-800 font-semibold flex items-center justify-between">
                      <span>✓ High absorption & minimal off-target drift</span>
                      <button 
                        onClick={() => setActiveTab('timeline')}
                        className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        Inspect 24h <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* RED CARD: WHEN TO AVOID SPRAYING */}
                  <div className="rounded-3xl p-5 bg-gradient-to-br from-rose-50/70 via-white to-red-50/40 border border-rose-200/80 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-rose-100">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center font-bold">
                            <Ban className="w-4 h-4 stroke-[2.5]" />
                          </div>
                          <div>
                            <h3 className="font-black text-sm text-slate-900">
                              When You SHOULD AVOID
                            </h3>
                            <p className="text-[11px] text-rose-700 font-semibold">Active Hazards & Unsuitable Periods</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                          Hazard Risk
                        </span>
                      </div>

                      {analysis.avoidWindows && analysis.avoidWindows.length > 0 ? (
                        <div className="space-y-2.5">
                          {analysis.avoidWindows.slice(0, 3).map((aw, idx) => {
                            const isRain = aw.category === 'rain';
                            const isNight = aw.category === 'night';
                            const isWind = aw.category === 'wind';
                            return (
                              <div 
                                key={idx}
                                className="rounded-2xl p-3 bg-white border border-rose-100/90 shadow-2xs hover:border-rose-300 transition"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {isRain ? (
                                      <CloudRain className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                    ) : isNight ? (
                                      <Moon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                    ) : isWind ? (
                                      <Wind className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                    ) : (
                                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                    )}
                                    <span className="text-xs font-black text-rose-950 truncate">
                                      {aw.timeLabel}
                                    </span>
                                  </div>
                                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${
                                    isRain 
                                      ? 'bg-blue-50 text-blue-800 border-blue-200' 
                                      : isNight 
                                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200' 
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                                  }`}>
                                    {isRain ? 'Washoff Risk' : isNight ? 'Inversion Risk' : 'Hazard Risk'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-rose-900 font-semibold mt-1.5 leading-snug">
                                  {aw.reason}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl p-3 bg-white border border-slate-200 text-center py-4">
                          <p className="text-xs text-slate-600 font-semibold">
                            Midday hours (12:00 PM – 04:00 PM) typically carry high Delta-T evaporation risk.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-3.5 pt-2.5 border-t border-rose-100/80 text-[11px] text-rose-800 font-semibold flex items-center justify-between">
                      <span>✗ High washoff or rapid droplet evaporation risk</span>
                      <span className="text-rose-600 font-bold">Postpone Application</span>
                    </div>
                  </div>
                </div>

                {/* ══════════════════════════════════════════════════════════════════
                    ATMOSPHERIC PARAMETERS & PSYCHROMETRIC DELTA-T GAUGE
                    ══════════════════════════════════════════════════════════════════ */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Left: 4 Core Meteorological Badges */}
                  <div className="lg:col-span-7 grid grid-cols-2 gap-3">
                    <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Thermometer className="w-3.5 h-3.5 text-amber-500" /> Temperature
                        </span>
                        <span className="text-[10px] font-extrabold text-slate-500">15–25°C Ideal</span>
                      </div>
                      <div className="text-xl font-black text-slate-900 mt-1">
                        {analysis.current?.conditions.temperature}°C
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        {analysis.current?.conditions.temperature > 30 ? 'High heat / volatilization risk' : analysis.current?.conditions.temperature < 10 ? 'Too cold for uptake' : 'Optimal thermal range'}
                      </p>
                    </div>

                    <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Droplets className="w-3.5 h-3.5 text-sky-500" /> Humidity
                        </span>
                        <span className="text-[10px] font-extrabold text-slate-500">50–85% Ideal</span>
                      </div>
                      <div className="text-xl font-black text-slate-900 mt-1">
                        {analysis.current?.conditions.humidity}%
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        {analysis.current?.conditions.humidity < 40 ? 'Low RH / rapid drying' : 'Healthy foliage moisture'}
                      </p>
                    </div>

                    <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Wind className="w-3.5 h-3.5 text-teal-500" /> Wind Speed
                        </span>
                        <span className="text-[10px] font-extrabold text-slate-500">3–15 km/h Ideal</span>
                      </div>
                      <div className="text-xl font-black text-slate-900 mt-1">
                        {analysis.current?.conditions.windSpeed} km/h
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        {analysis.current?.conditions.windSpeed > 20 ? 'High drift danger' : analysis.current?.conditions.windSpeed < 3 ? 'Calm / Inversion danger' : 'Stable gentle breeze'}
                      </p>
                    </div>

                    <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <CloudRain className="w-3.5 h-3.5 text-blue-500" /> 4h Rainfastness
                        </span>
                        <span className="text-[10px] font-extrabold text-slate-500">0mm Needed</span>
                      </div>
                      <div className="text-xl font-black text-slate-900 mt-1">
                        {analysis.current?.rainfastHazard ? (
                          <span className="text-rose-600 text-sm flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" /> Rain in ~{analysis.current.rainArrivesInHours}h
                          </span>
                        ) : (
                          <span className="text-emerald-700 text-sm flex items-center gap-1">
                            <ShieldCheck className="w-4 h-4" /> 0mm Rain Forecast
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        {analysis.current?.rainfastHazard ? 'Foliar wash-off risk' : 'Chemical wash-off risk clear'}
                      </p>
                    </div>
                  </div>

                  {/* Right: Delta-T Psychrometric Gauge */}
                  <div className="lg:col-span-5">
                    <DeltaTGauge value={analysis.current?.deltaT ?? 4.0} />
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                24-HOUR VISUAL HOURLY TIMELINE (VISUAL DECISION HEATMAP)
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      24-Hour Spray Suitability Strip
                    </h4>
                    <p className="text-xs text-slate-400">Click any hour to preview exact psychrometric conditions</p>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-3 text-[10px] font-extrabold">
                    <span className="flex items-center gap-1 text-emerald-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Safe to Spray (≥75)
                    </span>
                    <span className="flex items-center gap-1 text-amber-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Caution (50–74)
                    </span>
                    <span className="flex items-center gap-1 text-rose-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Avoid (&lt;50 / Rain)
                    </span>
                  </div>
                </div>

                {/* Horizontal Scrollable Hourly Strip */}
                <div className="flex gap-2 overflow-x-auto pb-3 pt-1">
                  {analysis.hourlyTimeline && analysis.hourlyTimeline.map((h, i) => {
                    const isSelected = inspectedHour && inspectedHour.hour === h.hour;
                    const isOptimal = h.verdict === 'optimal';
                    const isCaution = h.verdict === 'caution';

                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedHourIdx(i)}
                        className={`min-w-[82px] p-2.5 rounded-2xl text-center border transition-all cursor-pointer flex flex-col justify-between shrink-0 ${
                          isSelected
                            ? 'ring-2 ring-emerald-500 shadow-md scale-105 bg-white'
                            : 'hover:bg-slate-50'
                        } ${
                          isOptimal 
                            ? 'bg-emerald-50/70 border-emerald-200/90 text-emerald-950' 
                            : isCaution 
                            ? 'bg-amber-50/70 border-amber-200/90 text-amber-950' 
                            : 'bg-rose-50/70 border-rose-200/90 text-rose-950'
                        }`}
                      >
                        <div>
                          <span className="text-[11px] font-black block">
                            {formatHour(h.hour).split(' ')[0]}
                            <span className="text-[9px] text-slate-400 ml-0.5">{formatHour(h.hour).split(' ')[1]}</span>
                          </span>

                          <div className="my-1.5 flex justify-center">
                            {h.rainSoon || h.conditions.precipitation > 0 ? (
                              <CloudRain className="w-4 h-4 text-blue-500" />
                            ) : h.conditions.windSpeed > 18 ? (
                              <Wind className="w-4 h-4 text-teal-600" />
                            ) : (
                              <Sun className="w-4 h-4 text-amber-500" />
                            )}
                          </div>

                          <div className="text-xs font-black">
                            {Math.round(h.conditions.temperature)}°C
                          </div>
                        </div>

                        <div className="mt-2 pt-1.5 border-t border-black/5">
                          <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                            isOptimal ? 'bg-emerald-200/80 text-emerald-900' : isCaution ? 'bg-amber-200/80 text-amber-900' : 'bg-rose-200/80 text-rose-900'
                          }`}>
                            {h.score}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Inspected Hour Card */}
                {inspectedHour && (
                  <div className="rounded-2xl p-4 bg-slate-50/90 border border-slate-200/90 shadow-2xs">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2 pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">
                          {formatHour(inspectedHour.hour)} Snapshot
                        </span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          inspectedHour.verdict === 'optimal' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : inspectedHour.verdict === 'caution' 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {inspectedHour.verdict === 'optimal' ? 'Optimal Application Time' : inspectedHour.verdict === 'caution' ? 'Caution Advised' : 'Unsuitable Hour — Avoid'}
                        </span>
                      </div>
                      <span className="text-xs font-black text-slate-700">
                        Spray Window Score: <strong>{inspectedHour.score}/100</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Temperature</span>
                        <strong className="text-slate-800 font-black">{inspectedHour.conditions.temperature}°C</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Humidity</span>
                        <strong className="text-slate-800 font-black">{inspectedHour.conditions.humidity}%</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Wind Speed</span>
                        <strong className="text-slate-800 font-black">{inspectedHour.conditions.windSpeed} km/h</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Psychrometric Delta-T</span>
                        <strong className="text-slate-800 font-black">ΔT {inspectedHour.deltaT?.toFixed(1)}°C</strong>
                      </div>
                    </div>

                    {inspectedHour.issues && inspectedHour.issues.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                        <span className="text-[10px] font-bold text-slate-400 block mb-1">Advisory Factors:</span>
                        <div className="flex gap-2 flex-wrap">
                          {inspectedHour.issues.map((iss, idx) => (
                            <span key={idx} className="text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-rose-500" />
                              {iss}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                7-DAY STRATEGIC OUTLOOK
                ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'forecast' && extendedForecast && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    7-Day Multi-Day Agronomic Outlook
                  </h4>
                  <span className="text-[11px] text-slate-400 font-medium">Seasonal application planning</span>
                </div>

                {extendedForecast.daily && (
                  <div className="space-y-2.5">
                    {extendedForecast.daily.map((day, i) => {
                      const isGood = day.score >= 70;
                      const isModerate = day.score >= 45;

                      return (
                        <div 
                          key={i}
                          className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                            isGood 
                              ? 'bg-gradient-to-r from-emerald-50/80 to-white border-emerald-200/90' 
                              : isModerate 
                              ? 'bg-gradient-to-r from-amber-50/80 to-white border-amber-200/90' 
                              : 'bg-gradient-to-r from-rose-50/80 to-white border-rose-200/90'
                          }`}
                        >
                          <div className="flex items-center gap-3.5">
                            <div className={`w-11 h-11 rounded-2xl font-black text-sm flex items-center justify-center shrink-0 shadow-2xs ${
                              isGood 
                                ? 'bg-emerald-500 text-white' 
                                : isModerate 
                                ? 'bg-amber-500 text-white' 
                                : 'bg-rose-500 text-white'
                            }`}>
                              {day.score}
                            </div>
                            <div>
                              <p className="font-black text-sm text-slate-900">{day.dayLabel}</p>
                              <p className="text-xs text-slate-500 font-medium">
                                {day.conditions.minTemp}°C – {day.conditions.maxTemp}°C · Wind up to {Math.round(day.conditions.maxWind)} km/h · {day.conditions.precipitation}mm rain
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                              isGood 
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                                : isModerate 
                                ? 'bg-amber-100 text-amber-800 border-amber-300' 
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}>
                              {isGood ? 'Optimal Spray Day' : isModerate ? 'Moderate Windows' : 'Avoid / Unsuitable'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          FOOTER REFERENCE & DISCLAIMER
          ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-slate-50/90 px-5 py-3 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5 font-medium">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          GRDC & APVMA Delta-T Psychrometric Protocol · Stull (2011) Thermodynamic Engine
        </span>
        <span className="font-semibold text-slate-400">Always verify local field winds before tank-mix priming</span>
      </div>
    </div>
  );
}
