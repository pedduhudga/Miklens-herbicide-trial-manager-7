import React, { useState, useEffect, useMemo } from 'react';
import { Cloud, Droplets, Wind, Thermometer, Calendar, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, MapPin, CloudRain, Sun, CloudSun, CloudLightning, Loader } from 'lucide-react';
import { fetchWeather } from '../services/weather.js';

// Weather icon helper
const getWeatherIcon = (condition) => {
  const c = (condition || '').toLowerCase();
  if (c.includes('rain') || c.includes('drizzle')) return <CloudRain className="w-6 h-6" />;
  if (c.includes('thunder') || c.includes('lightning')) return <CloudLightning className="w-6 h-6" />;
  if (c.includes('cloud') || c.includes('overcast')) return <Cloud className="w-6 h-6" />;
  if (c.includes('partly') || c.includes('scattered')) return <CloudSun className="w-6 h-6" />;
  return <Sun className="w-6 h-6" />;
};

export default function WeatherDashboard({ trials = [], activeCategory, getAppState }) {
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDateRange, setSelectedDateRange] = useState('30'); // days

  // Get unique locations from trials
  const locations = useMemo(() => {
    const locs = new Map();
    trials.forEach(t => {
      if (t.Lat && t.Lon && t.Location) {
        const key = `${t.Lat},${t.Lon}`;
        if (!locs.has(key)) {
          locs.set(key, { 
            name: t.Location, 
            lat: parseFloat(t.Lat), 
            lon: parseFloat(t.Lon),
            trialCount: 0 
          });
        }
        locs.get(key).trialCount++;
      }
    });
    return Array.from(locs.values()).sort((a, b) => b.trialCount - a.trialCount);
  }, [trials]);

  // Get date range
  const dateRange = useMemo(() => {
    const days = parseInt(selectedDateRange) || 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    return { startDate, endDate, days };
  }, [selectedDateRange]);

  // Filter trials in date range with weather data
  const trialsWithWeather = useMemo(() => {
    return trials.filter(t => {
      if (!t.Temperature && !t.Humidity && !t.Windspeed) return false;
      const trialDate = new Date(t.Date || t.CreatedAt);
      return trialDate >= dateRange.startDate && trialDate <= dateRange.endDate;
    });
  }, [trials, dateRange]);

  // Calculate aggregated weather stats
  const weatherStats = useMemo(() => {
    if (trialsWithWeather.length === 0) return null;

    const temps = [], hums = [], winds = [], rains = [];
    
    trialsWithWeather.forEach(t => {
      if (t.Temperature) temps.push(parseFloat(t.Temperature));
      if (t.Humidity) hums.push(parseFloat(t.Humidity));
      if (t.Windspeed) winds.push(parseFloat(t.Windspeed));
      if (t.Rain) rains.push(parseFloat(t.Rain));
    });

    const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
    const min = arr => arr.length ? Math.min(...arr).toFixed(1) : null;
    const max = arr => arr.length ? Math.max(...arr).toFixed(1) : null;

    return {
      count: trialsWithWeather.length,
      temp: { avg: avg(temps), min: min(temps), max: max(temps), values: temps },
      humidity: { avg: avg(hums), min: min(hums), max: max(hums), values: hums },
      wind: { avg: avg(winds), min: min(winds), max: max(winds), values: winds },
      rain: { avg: avg(rains), total: rains.reduce((a, b) => a + b, 0).toFixed(1), values: rains },
    };
  }, [trialsWithWeather]);

  // Fetch historical weather for main location
  const fetchHistoricalWeather = async () => {
    if (locations.length === 0) {
      setError('No trial locations with coordinates found');
      return;
    }

    setLoading(true);
    setError(null);

    const mainLoc = locations[0];
    const dates = [];
    
    // Get weather for sample dates in the range
    for (let i = 0; i < Math.min(10, dateRange.days); i += Math.max(1, Math.floor(dateRange.days / 10))) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const weatherPromises = dates.map(date => 
      fetchWeather(mainLoc.lat, mainLoc.lon, date, getAppState)
    );

    try {
      const results = await Promise.all(weatherPromises);
      const validResults = results.filter(r => r !== null);
      
      if (validResults.length > 0) {
        const historicalData = dates.map((date, i) => ({
          date,
          weather: results[i],
        })).filter(d => d.weather !== null);
        
        setWeatherData({
          location: mainLoc,
          historical: historicalData,
          stats: weatherStats,
        });
      } else if (weatherStats) {
        // Use trial-collected weather data as fallback
        setWeatherData({
          location: mainLoc,
          historical: [],
          stats: weatherStats,
          source: 'trial_data',
        });
      }
    } catch (err) {
      console.error('Weather fetch error:', err);
      if (weatherStats) {
        setWeatherData({
          location: locations[0],
          historical: [],
          stats: weatherStats,
          source: 'trial_data',
        });
      } else {
        setError('Unable to fetch weather data');
      }
    } finally {
      setLoading(false);
    }
  };

  // Weather alerts based on trial conditions
  const weatherAlerts = useMemo(() => {
    if (!weatherStats?.stats) return [];
    
    const alerts = [];
    const { temp, humidity, wind } = weatherStats.stats;
    
    if (temp && parseFloat(temp.avg) > 32) {
      alerts.push({ 
        type: 'warning', 
        msg: `High avg temperature (${temp.avg}°C) may reduce ${activeCategory} efficacy`,
        icon: <Thermometer className="w-4 h-4" />
      });
    }
    
    if (humidity && parseFloat(humidity.avg) < 30) {
      alerts.push({ 
        type: 'warning', 
        msg: `Low avg humidity (${humidity.avg}%) - increased evaporation risk`,
        icon: <Droplets className="w-4 h-4" />
      });
    }
    
    if (wind && parseFloat(wind.avg) > 20) {
      alerts.push({ 
        type: 'warning', 
        msg: `High avg wind (${wind.avg} km/h) - potential drift risk`,
        icon: <Wind className="w-4 h-4" />
      });
    }
    
    return alerts;
  }, [weatherStats, activeCategory]);

  useEffect(() => {
    if (trialsWithWeather.length > 0) {
      fetchHistoricalWeather();
    }
  }, [selectedDateRange, trials.length]);

  if (trials.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 text-slate-400">
          <Cloud className="w-5 h-5" />
          <span className="text-sm">No trials to analyze for weather</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Cloud className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Weather Dashboard</h3>
              {locations.length > 0 && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {locations[0].name} ({locations[0].trialCount} trials)
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <select 
              value={selectedDateRange}
              onChange={(e) => setSelectedDateRange(e.target.value)}
              className="text-xs px-2 py-1.5 border rounded-lg bg-white"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
            <button 
              onClick={fetchHistoricalWeather}
              disabled={loading}
              className="p-1.5 hover:bg-blue-100 rounded-lg transition"
            >
              <RefreshCw className={`w-4 h-4 text-blue-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Weather Alerts */}
      {weatherAlerts.length > 0 && (
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
          <div className="flex flex-wrap gap-2">
            {weatherAlerts.map((alert, idx) => (
              <div key={idx} className="flex items-center gap-1.5 px-2 py-1 bg-amber-100 rounded-lg text-xs text-amber-700">
                {alert.icon}
                <span>{alert.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-6 h-6 animate-spin text-blue-500" />
            <span className="ml-2 text-sm text-slate-500">Loading weather data...</span>
          </div>
        ) : error && !weatherStats ? (
          <div className="flex items-center gap-2 py-4 text-slate-400 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        ) : weatherStats?.stats ? (
          <>
            {/* Main Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {/* Temperature */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Thermometer className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-semibold text-slate-500">Temperature</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">{weatherStats.stats.temp.avg}°C</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                  <TrendingDown className="w-3 h-3" />
                  <span>Min: {weatherStats.stats.temp.min}°C</span>
                  <TrendingUp className="w-3 h-3 ml-2" />
                  <span>Max: {weatherStats.stats.temp.max}°C</span>
                </div>
              </div>

              {/* Humidity */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Droplets className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-semibold text-slate-500">Humidity</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">{weatherStats.stats.humidity.avg}%</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                  <span>Min: {weatherStats.stats.humidity.min}%</span>
                  <span className="mx-1">•</span>
                  <span>Max: {weatherStats.stats.humidity.max}%</span>
                </div>
              </div>

              {/* Wind */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wind className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-500">Wind Speed</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">{weatherStats.stats.wind.avg} km/h</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                  <span>Min: {weatherStats.stats.wind.min}</span>
                  <span className="mx-1">•</span>
                  <span>Max: {weatherStats.stats.wind.max}</span>
                </div>
              </div>

              {/* Rain */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CloudRain className="w-4 h-4 text-cyan-500" />
                  <span className="text-xs font-semibold text-slate-500">Rain (Total)</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">{weatherStats.stats.rain.total} mm</p>
                <p className="text-xs text-slate-400 mt-1">
                  Across {weatherStats.stats.rain.values.length} trials
                </p>
              </div>
            </div>

            {/* Data Source */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Based on {weatherStats.stats.count} trials with weather data
                {weatherData?.source === 'trial_data' && ' (from trial records)'}
              </p>
              {locations.length > 1 && (
                <p className="text-xs text-slate-400">
                  +{locations.length - 1} more locations
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-6 text-slate-400 text-sm">
            No weather data available for selected period
          </div>
        )}
      </div>
    </div>
  );
}