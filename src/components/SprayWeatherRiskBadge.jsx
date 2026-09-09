import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, ShieldAlert, Wind, Droplets, Thermometer, Clock, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { evaluateSprayWeatherRisk } from '../services/weather.js';

export default function SprayWeatherRiskBadge({
  weather,
  formulation = '',
  activeCategory = 'herbicide',
  compact = false
}) {
  const [isExpanded, setIsExpanded] = useState(!compact);

  if (!weather) return null;

  const temp = weather.temp ?? weather.Temperature;
  const wind = weather.wind ?? weather.windspeed ?? weather.Windspeed;
  const rain = weather.rain ?? weather.Rain;
  const humidity = weather.humidity ?? weather.Humidity;

  // If no weather numbers or conditions have been entered at all, hide
  const hasData = [temp, wind, rain, humidity].some(v => v !== undefined && v !== null && String(v).trim() !== '');
  if (!hasData) return null;

  const result = evaluateSprayWeatherRisk({
    weather,
    formulation,
    activeCategory
  });

  const isOptimal = result.severity === 'optimal';
  const isModerate = result.severity === 'moderate';
  const isHigh = result.severity === 'high';

  const badgeStyles = isOptimal
    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : isModerate
    ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-rose-50 border-rose-200 text-rose-800';

  const iconBg = isOptimal
    ? 'bg-emerald-100 text-emerald-600'
    : isModerate
    ? 'bg-amber-100 text-amber-600'
    : 'bg-rose-100 text-rose-600';

  return (
    <div className={`rounded-xl border transition-all shadow-sm ${badgeStyles} overflow-hidden`}>
      {/* Header Bar */}
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-1.5 rounded-lg shrink-0 ${iconBg}`}>
            {isOptimal ? (
              <CheckCircle className="w-4 h-4" />
            ) : isModerate ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <ShieldAlert className="w-4 h-4" />
            )}
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs tracking-tight">{result.status}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/80 border border-current/20 shadow-2xs">
                <Clock className="w-2.5 h-2.5" />
                {result.rainfastHours}h Rainfast ({result.chemistryType})
              </span>
            </div>
            <p className="text-[11px] opacity-80 truncate mt-0.5">
              {result.temp}°C • Wind {result.wind} km/h • Humidity {result.humidity}%
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="p-1 rounded-md hover:bg-black/5 text-current opacity-70 hover:opacity-100 transition shrink-0"
          title={isExpanded ? 'Collapse details' : 'Expand details'}
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded Risk Audit & Field Recommendations */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-current/10 space-y-2.5 text-xs">
          {/* Risk Factors */}
          {result.risks && result.risks.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Identified Hazards</span>
              <div className="grid gap-1.5">
                {result.risks.map((r, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded-lg text-[11px] leading-snug border ${
                      r.severity === 'high'
                        ? 'bg-rose-100/70 border-rose-300 text-rose-900 font-medium'
                        : 'bg-amber-100/60 border-amber-300 text-amber-900'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1">
                      {r.severity === 'high' ? '⚠️' : '⚡'} {r.title}
                    </div>
                    <div className="opacity-90 mt-0.5">{r.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-70 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-500" /> Agronomic Field Protocol
              </span>
              <ul className="space-y-1">
                {result.recommendations.map((rec, i) => (
                  <li key={i} className="text-[11px] flex items-start gap-1.5 opacity-90">
                    <span className="font-bold mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
