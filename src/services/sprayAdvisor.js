/**
 * AI Spray Window Advisor
 * Analyzes weather conditions to recommend optimal herbicide application windows
 */

/**
 * Fetch hourly + daily forecast from Open-Meteo (free, no key required)
 * @param {number} lat
 * @param {number} lon
 * @param {number} days - number of forecast days (1–16)
 */
const weatherCache = new Map();

// Clear cache (used on manual refresh)
export function clearWeatherCache() {
  weatherCache.clear();
}

async function fetchWeatherForecast(lat, lon, days = 3, startDate = null, endDate = null) {
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (lat === undefined || lon === undefined || lat === null || lon === null || isNaN(latNum) || isNaN(lonNum)) {
    console.warn('[SprayAdvisor] fetchWeatherForecast: Invalid latitude/longitude:', lat, lon);
    return null;
  }

  const cacheKey = startDate && endDate ? `${latNum}|${lonNum}|${startDate}|${endDate}` : `${latNum}|${lonNum}|${days}`;
  const now = Date.now();
  const cacheEntry = weatherCache.get(cacheKey);
  // Use cached data if less than 10 minutes old
  if (cacheEntry && now - cacheEntry.timestamp < 10 * 60 * 1000) {
    return cacheEntry.data;
  }

  const hourlyVars = 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,precipitation_probability';
  const dailyVars = 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean';
  
  let url;
  if (startDate && endDate) {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    // Open-Meteo archive API only accepts date ranges that strictly end before today.
    // If endDate is today or in the future, we MUST use the forecast API (which also supports up to 92 days of past history).
    const isEntirelyPast = new Date(endDate) < todayMidnight;
    const baseUrl = isEntirelyPast ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
    const hourly = isEntirelyPast 
      ? 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation' 
      : hourlyVars;
    url = `${baseUrl}?latitude=${lat}&longitude=${lon}&hourly=${hourly}&daily=${dailyVars}&start_date=${startDate}&end_date=${endDate}&timezone=auto&wind_speed_unit=kmh`;
  } else {
    url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${hourlyVars}&daily=${dailyVars}&forecast_days=${days}&timezone=auto&wind_speed_unit=kmh`;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  const data = await res.json();

  const result = {
    hourly: data.hourly,
    daily: data.daily,
    location: { lat, lon, timezone: data.timezone }
  };

  // Store in cache
  weatherCache.set(cacheKey, { data: result, timestamp: now });
  return result;
}

// Optimal spray conditions
const OPTIMAL_CONDITIONS = {
  temperature: { min: 15, max: 25, ideal: 20 }, // °C
  humidity: { min: 50, max: 85, ideal: 70 }, // %
  windSpeed: { min: 3, max: 15, ideal: 8 }, // km/h
  precipitation: { max: 0.2 }, // mm/h
  deltaT: { min: 2, max: 8, ideal: 4 } // Delta T for droplet evaporation
};

// Risk thresholds
const RISK_LEVELS = {
  LOW: { score: 80, label: 'Excellent', color: 'emerald', icon: 'check' },
  MODERATE: { score: 60, label: 'Good', color: 'amber', icon: 'alert' },
  HIGH: { score: 40, label: 'Fair', color: 'orange', icon: 'warning' },
  UNSUITABLE: { score: 0, label: 'Do Not Spray', color: 'red', icon: 'ban' }
};

/**
 * Calculate thermodynamic Wet-Bulb Temperature using Stull's (2011) high-precision psychrometric equation.
 * Valid for -20°C to 50°C and 5% to 99% RH with mean absolute error < 0.3°C.
 *
 * @param {number} temp - Dry-bulb air temperature in °C
 * @param {number} humidity - Relative humidity % (1-100)
 * @returns {number} Wet-bulb temperature in °C
 */
export function calculateWetBulb(temp, humidity) {
  const T = parseFloat(temp);
  const RH = Math.max(1, Math.min(100, parseFloat(humidity)));

  if (isNaN(T) || isNaN(RH)) return 0;

  const Tw = T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) +
    Math.atan(T + RH) - Math.atan(RH - 1.676331) +
    0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;

  return parseFloat(Tw.toFixed(2));
}

/**
 * Calculate Delta-T (ΔT = Dry-Bulb Temperature - Wet-Bulb Temperature)
 * The global standard agronomic indicator for agricultural spray drift and droplet evaporation.
 *
 * @param {number} temp - Air temperature in °C
 * @param {number} humidity - Relative humidity in %
 * @returns {number} Delta-T value in °C
 */
export function calculateDeltaT(temp, humidity) {
  const T = parseFloat(temp);
  const RH = Math.max(1, Math.min(100, parseFloat(humidity)));
  if (isNaN(T) || isNaN(RH)) return 0;

  const Tw = calculateWetBulb(T, RH);
  const deltaT = T - Tw;
  return parseFloat(deltaT.toFixed(2));
}

/**
 * Evaluates Delta-T agronomic spray suitability according to GRDC and APVMA standards.
 *
 * @param {number} deltaT - Delta-T value in °C
 * @returns {Object} Suitability rating, status label, color token, and recommendation
 */
export function getDeltaTCondition(deltaT) {
  const dt = parseFloat(deltaT);
  if (isNaN(dt)) {
    return { status: 'Unknown', label: 'Data Unavailable', color: 'slate', recommendation: 'Weather data pending.' };
  }

  if (dt < 2) {
    return {
      status: 'Marginal Low',
      label: 'Low Delta-T (< 2°C)',
      color: 'amber',
      dropletSurvival: 'High survival / Poor drying',
      recommendation: 'Caution: Droplets survive extended periods, increasing potential drift distance in still or inversion-prone conditions.'
    };
  }

  if (dt <= 8) {
    return {
      status: 'Optimal',
      label: 'Optimal Delta-T (2–8°C)',
      color: 'emerald',
      dropletSurvival: 'Optimal',
      recommendation: 'Excellent conditions: Droplet survival and target foliage absorption are maximized.'
    };
  }

  if (dt <= 10) {
    return {
      status: 'Marginal High',
      label: 'High Delta-T (8–10°C)',
      color: 'orange',
      dropletSurvival: 'Accelerated evaporation',
      recommendation: 'Marginal: Fine droplets evaporate rapidly before contacting weeds. Use coarse or very coarse droplet spectrum.'
    };
  }

  return {
    status: 'Unsuitable',
    label: 'Extreme Delta-T (> 10°C)',
    color: 'red',
    dropletSurvival: 'Rapid desiccation',
    recommendation: 'Do Not Spray: Droplet evaporation occurs in seconds, resulting in spray failures and off-target vapor movement.'
  };
}


/**
 * Calculate spray window score (0-100)
 */
function calculateSprayScore(conditions) {
  const { temperature, humidity, windSpeed, precipitation } = conditions;
  
  let score = 100;
  const issues = [];
  
  // Temperature scoring
  if (temperature < 10 || temperature > 30) {
    score -= 30;
    issues.push(temperature < 10 ? 'Too cold - poor herbicide uptake' : 'Too hot - risk of volatilization');
  } else if (temperature < 15 || temperature > 25) {
    score -= 15;
    issues.push(temperature < 15 ? 'Cool conditions' : 'Warm conditions');
  }
  
  // Humidity scoring
  if (humidity < 40 || humidity > 90) {
    score -= 25;
    issues.push(humidity < 40 ? 'Low humidity - droplets evaporate quickly' : 'High humidity - slow drying');
  } else if (humidity < 50 || humidity > 85) {
    score -= 10;
  }
  
  // Wind scoring
  if (windSpeed < 2 || windSpeed > 20) {
    score -= 30;
    issues.push(windSpeed < 2 ? 'No wind - inversion risk' : 'Too windy - drift risk');
  } else if (windSpeed < 3 || windSpeed > 15) {
    score -= 15;
    issues.push(windSpeed < 3 ? 'Light wind - use caution' : 'Breezy - watch for drift');
  }
  
  // Precipitation scoring
  if (precipitation > 0.5) {
    score -= 40;
    issues.push('Rain expected - washoff risk');
  } else if (precipitation > 0.2) {
    score -= 20;
    issues.push('Light rain possible');
  }
  
  // Delta T check
  const deltaT = calculateDeltaT(temperature, humidity);
  if (deltaT > 10) {
    score -= 25;
    issues.push('High Delta T - droplet evaporation risk');
  } else if (deltaT < 2) {
    score -= 15;
    issues.push('Low Delta T - slow drying conditions');
  }
  
  return { score: Math.max(0, score), issues, deltaT };
}

/**
 * Get risk level from score
 */
function getRiskLevel(score) {
  if (score >= 80) return RISK_LEVELS.LOW;
  if (score >= 60) return RISK_LEVELS.MODERATE;
  if (score >= 40) return RISK_LEVELS.HIGH;
  return RISK_LEVELS.UNSUITABLE;
}

/**
 * Analyze spray conditions for a specific time
 */
export async function analyzeSprayWindow(lat, lon, targetDate = null) {
  try {
    // Ensure targetDate is in YYYY-MM-DD format; HTML date inputs always give YYYY-MM-DD.
    // Appending T00:00:00 prevents locale-dependent midnight-UTC ambiguity.
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const safeTargetDate = (targetDate && dateRegex.test(targetDate)) ? targetDate : null;
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = !safeTargetDate || safeTargetDate === todayStr;
    const isPast = safeTargetDate && new Date(safeTargetDate + 'T00:00:00') < new Date(todayStr + 'T00:00:00');
    
    // Always fetch multi-day horizon (4 days / 96 hours) for today and future dates
    // so rainstorms, rainfastness, nocturnal inversions, and next daylight windows are fully visible
    let forecast;
    if (isPast) {
      forecast = await fetchWeatherForecast(lat, lon, 1, safeTargetDate, safeTargetDate);
    } else {
      const startDate = safeTargetDate || todayStr;
      const startD = new Date(startDate + 'T00:00:00');
      const endD = new Date(startD);
      endD.setDate(endD.getDate() + 3);
      const endDate = endD.toISOString().split('T')[0];
      forecast = await fetchWeatherForecast(lat, lon, 4, startDate, endDate);
    }
    
    if (!forecast || !forecast.hourly) {
      return { error: 'Unable to fetch weather data' };
    }
    
    const { hourly } = forecast;
    // Default to current hour if today, or 8:00 AM (standard morning application check) if custom date
    const currentHour = isToday ? new Date().getHours() : 8;
    const targetDateStr = safeTargetDate || todayStr;
    
    // Find best windows across the forecast horizon
    const windows = [];
    const nowTime = new Date();
    
    for (let i = 0; i < hourly.time.length; i++) {
      const hourTime = new Date(hourly.time[i]);
      const hour = hourTime.getHours();
      
      // Skip past hours only if it is today
      if (!isPast && isToday && hourTime <= nowTime) continue;
      
      // Strictly agricultural daylight hours (06:00 to 18:00)
      // APVMA & GRDC strictly forbid nocturnal application due to surface temperature inversion drift
      if (hour < 6 || hour > 18) continue;

      const conditions = {
        temperature: hourly.temperature_2m[i],
        humidity: hourly.relative_humidity_2m[i],
        windSpeed: hourly.wind_speed_10m[i],
        precipitation: hourly.precipitation[i] || 0,
        precipitationProbability: hourly.precipitation_probability ? (hourly.precipitation_probability[i] || 0) : 0
      };
      
      const scoreObj = calculateSprayScore(conditions);
      let adjustedScore = scoreObj.score;
      const issues = [...scoreObj.issues];

      // Rainfast check for this hour (subsequent 4 hours must remain dry)
      let rainSoon = false;
      let rainInHours = null;
      let maxPrecipProb4h = 0;
      for (let offset = 1; offset <= 4 && i + offset < hourly.time.length; offset++) {
        const p = hourly.precipitation[i + offset] || 0;
        const prob = hourly.precipitation_probability ? (hourly.precipitation_probability[i + offset] || 0) : 0;
        if (prob > maxPrecipProb4h) maxPrecipProb4h = prob;
        if (p > 0.3 || prob >= 60) {
          rainSoon = true;
          rainInHours = offset;
          break;
        }
      }

      if (rainSoon) {
        adjustedScore = Math.min(35, adjustedScore - 45);
        issues.unshift(`Rain expected in ~${rainInHours}h (${maxPrecipProb4h}% prob) — Washoff risk`);
      }
      
      const riskLevel = getRiskLevel(adjustedScore);
      
      // Only recommend windows that have at least 60/100 score and NO rainwash hazard
      if (adjustedScore >= 60 && !rainSoon) {
        windows.push({
          time: hourTime,
          hour,
          score: adjustedScore,
          riskLevel,
          conditions,
          deltaT: scoreObj.deltaT,
          issues,
          dayLabel: getDayLabel(hourTime),
          formattedTime: `${getDayLabel(hourTime)}, ${formatHour(hour)}`
        });
      }
    }
    
    // Capture upcoming hourly forecasts for UI
    const futureHours = [];
    const nowMs = Date.now();
    for (let i = 0; i < hourly.time.length; i++) {
      const hourTime = new Date(hourly.time[i]);
      if (isToday && hourTime <= nowMs) continue;
      futureHours.push({
        time: hourTime,
        temperature: hourly.temperature_2m[i],
        humidity: hourly.relative_humidity_2m[i],
        windSpeed: hourly.wind_speed_10m[i],
        precipitation: hourly.precipitation[i] || 0,
        precipitationProbability: hourly.precipitation_probability ? hourly.precipitation_probability[i] : null
      });
    }

    // 24-Hour Timeline for target day (visual heatmap)
    const hourlyTimeline = [];
    for (let i = 0; i < hourly.time.length; i++) {
      const timeStr = hourly.time[i];
      if (!timeStr.startsWith(targetDateStr)) continue;
      
      const hourTime = new Date(timeStr);
      const h = hourTime.getHours();
      const cond = {
        temperature: hourly.temperature_2m[i],
        humidity: hourly.relative_humidity_2m[i],
        windSpeed: hourly.wind_speed_10m[i],
        precipitation: hourly.precipitation[i] || 0
      };
      const scoreObj = calculateSprayScore(cond);
      
      // Rainfast check for this hour (next 4h)
      let rainSoon = false;
      let rainInH = null;
      for (let offset = 1; offset <= 4 && i + offset < hourly.time.length; offset++) {
        const p = hourly.precipitation[i + offset] || 0;
        const prob = hourly.precipitation_probability ? (hourly.precipitation_probability[i + offset] || 0) : 0;
        if (p > 0.3 || prob >= 60) {
          rainSoon = true;
          rainInH = offset;
          break;
        }
      }
      
      let hScore = scoreObj.score;
      const hIssues = [...scoreObj.issues];
      
      const isNightH = h < 6 || h >= 19;
      if (isNightH) {
        hScore = Math.min(25, hScore);
        hIssues.unshift('Nighttime / Inversion risk & closed weed stomata');
      }

      if (rainSoon) {
        hScore = Math.min(30, hScore - 40);
        hIssues.unshift(`Rain forecast in ~${rainInH}h (Washoff hazard)`);
      }
      
      let hVerdict = 'optimal';
      if (hScore < 50 || isNightH) hVerdict = 'avoid';
      else if (hScore < 75) hVerdict = 'caution';
      
      hourlyTimeline.push({
        time: hourTime,
        hour: h,
        score: hScore,
        verdict: hVerdict,
        conditions: cond,
        deltaT: scoreObj.deltaT,
        issues: hIssues,
        rainSoon,
        isNight: isNightH,
        precipitationProbability: hourly.precipitation_probability ? (hourly.precipitation_probability[i] || 0) : 0
      });
    }

    // Real Multi-Day Windows to Avoid (detecting storms, nocturnal inversions, wind drift, delta-T)
    const avoidWindows = [];
    let currentAvoidBlock = null;
    
    // Find current index in forecast
    const startIndex = isToday 
      ? Math.max(0, hourly.time.findIndex(t => t.startsWith(targetDateStr) && new Date(t).getHours() === currentHour))
      : 0;
    
    for (let i = startIndex; i < Math.min(hourly.time.length, startIndex + 48); i++) {
      const hourTime = new Date(hourly.time[i]);
      const h = hourTime.getHours();
      const p = hourly.precipitation[i] || 0;
      const prob = hourly.precipitation_probability ? (hourly.precipitation_probability[i] || 0) : 0;
      const wind = hourly.wind_speed_10m[i];
      const temp = hourly.temperature_2m[i];
      const rh = hourly.relative_humidity_2m[i];
      const dt = calculateDeltaT(temp, rh);
      
      const isNight = h < 6 || h >= 19;
      const isRain = p >= 0.2 || prob >= 55;
      const isHighWind = wind >= 19;
      const isExtremeDt = dt > 9.5;
      
      let hazardCategory = null;
      let hazardTitle = '';
      let hazardDetail = '';
      
      if (isRain) {
        hazardCategory = 'rain';
        hazardTitle = 'Rain Wash-off Hazard';
        hazardDetail = `${prob}% rain prob, ${p > 0 ? p + 'mm/h' : 'showers'} · Washoff risk`;
      } else if (isHighWind) {
        hazardCategory = 'wind';
        hazardTitle = 'Wind Drift Danger';
        hazardDetail = `Wind up to ${Math.round(wind)} km/h · Severe off-target drift`;
      } else if (isExtremeDt) {
        hazardCategory = 'deltaT';
        hazardTitle = 'High Delta-T Evaporation';
        hazardDetail = `ΔT ${dt.toFixed(1)}°C · Rapid droplet evaporation`;
      } else if (isNight) {
        hazardCategory = 'night';
        hazardTitle = 'Night Inversion & Stomata Closure';
        hazardDetail = 'Nocturnal inversion drift hazard & heavy dew dilution';
      }
      
      if (hazardCategory) {
        if (!currentAvoidBlock || currentAvoidBlock.category !== hazardCategory || (currentAvoidBlock.dayLabel !== getDayLabel(hourTime) && hazardCategory !== 'night')) {
          if (currentAvoidBlock) {
            avoidWindows.push(finalizeAvoidBlock(currentAvoidBlock));
          }
          currentAvoidBlock = {
            category: hazardCategory,
            title: hazardTitle,
            startTime: hourTime,
            endTime: hourTime,
            startHour: h,
            endHour: h + 1,
            dayLabel: getDayLabel(hourTime),
            reasons: [hazardDetail],
            maxProb: prob,
            maxRain: p,
            maxWind: wind,
            hoursCount: 1
          };
        } else {
          currentAvoidBlock.endTime = hourTime;
          currentAvoidBlock.endHour = h + 1;
          currentAvoidBlock.hoursCount++;
          if (prob > currentAvoidBlock.maxProb) currentAvoidBlock.maxProb = prob;
          if (p > currentAvoidBlock.maxRain) currentAvoidBlock.maxRain = p;
          if (wind > currentAvoidBlock.maxWind) currentAvoidBlock.maxWind = wind;
          if (!currentAvoidBlock.reasons.includes(hazardDetail)) {
            currentAvoidBlock.reasons.push(hazardDetail);
          }
        }
      } else {
        if (currentAvoidBlock) {
          avoidWindows.push(finalizeAvoidBlock(currentAvoidBlock));
          currentAvoidBlock = null;
        }
      }
    }
    if (currentAvoidBlock) {
      avoidWindows.push(finalizeAvoidBlock(currentAvoidBlock));
    }

    // Sort avoid windows: severe storms first, followed by nocturnal inversion and other hazards
    avoidWindows.sort((a, b) => {
      const priority = { rain: 1, wind: 2, deltaT: 3, night: 4 };
      const pa = priority[a.category] || 5;
      const pb = priority[b.category] || 5;
      if (pa !== pb) return pa - pb;
      return b.hoursCount - a.hoursCount;
    });

    // Sort windows: prioritize high scores, then chronological order
    windows.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 10) return b.score - a.score;
      return a.time - b.time;
    });
    
    // Group by day
    const groupedByDay = groupWindowsByDay(windows);
    
    // Get best overall window
    const bestWindow = windows[0] || null;
    
    return {
      current: getCurrentConditions(hourly, currentHour, targetDateStr),
      bestWindow,
      windows, // for AI assistant tools compatibility
      allWindows: windows.slice(0, 20), // Top 20 windows
      groupedByDay,
      location: forecast.location,
      recommendation: generateRecommendation(bestWindow, windows),
      futureHours,
      hourlyTimeline,
      avoidWindows
    };
    
  } catch (error) {
    console.error('[SprayAdvisor] Analysis failed:', error);
    return { error: error.message || 'Failed to analyze spray conditions' };
  }
}

/**
 * Format avoid block into clean presentation object
 */
function finalizeAvoidBlock(block) {
  const startHStr = formatHour(block.startHour);
  const endH = block.endHour % 24;
  const endHStr = formatHour(endH);
  
  let timeLabel = `${block.dayLabel}, ${startHStr} – ${endHStr}`;
  if (block.category === 'night') {
    timeLabel = block.dayLabel === 'Today' 
      ? `Tonight (${startHStr} – 06:00 AM)` 
      : `${block.dayLabel} Night (${startHStr} – 06:00 AM)`;
  } else if (block.hoursCount >= 4 && block.category === 'rain') {
    timeLabel = `${block.dayLabel}, ${startHStr} – ${endHStr} (${block.hoursCount}h)`;
  }
  
  let reason = '';
  if (block.category === 'rain') {
    reason = `${block.hoursCount}h continuous rain expected (up to ${block.maxProb}% prob, ${block.maxRain.toFixed(1)}mm/h) — Severe washoff hazard.`;
  } else if (block.category === 'night') {
    reason = 'Nocturnal surface temperature inversion traps droplets; heavy dew causes foliar wash-off.';
  } else if (block.category === 'wind') {
    reason = `Sustained winds up to ${Math.round(block.maxWind)} km/h will cause severe off-target drift.`;
  } else if (block.category === 'deltaT') {
    reason = 'High evaporative demand (Delta-T > 10°C) causes droplet desiccation before foliar uptake.';
  } else {
    reason = block.reasons.slice(0, 2).join('; ');
  }
  
  return {
    category: block.category,
    title: block.title,
    timeLabel,
    reason,
    hoursCount: block.hoursCount,
    avgScore: block.category === 'rain' ? 20 : block.category === 'night' ? 25 : 35
  };
}

/**
 * Format 24-hour integer into 12-hour AM/PM label
 */
export function formatHour(hour) {
  const h = parseInt(hour, 10);
  if (isNaN(h)) return '12:00 PM';
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayHour).padStart(2, '0')}:00 ${period}`;
}

/**
 * Get current weather conditions with Inversion and Rainfastness Lookahead
 */
function getCurrentConditions(hourly, currentHour, targetDateStr = null) {
  let idx = -1;
  if (targetDateStr) {
    idx = hourly.time.findIndex(t => t.startsWith(targetDateStr) && new Date(t).getHours() === currentHour);
  }
  if (idx === -1) {
    idx = hourly.time.findIndex(t => new Date(t).getHours() === currentHour);
  }
  
  if (idx === -1) return null;
  
  const conditions = {
    temperature: hourly.temperature_2m[idx],
    humidity: hourly.relative_humidity_2m[idx],
    windSpeed: hourly.wind_speed_10m[idx],
    precipitation: hourly.precipitation[idx] || 0
  };
  
  const analysis = calculateSprayScore(conditions);

  // Nighttime Check: sunset to sunrise (approx. 19:00 to 06:00)
  // Strictly avoid spraying due to nocturnal surface temperature inversions, dew dilution, and stomata closure
  const isNight = currentHour < 6 || currentHour >= 19;

  // Lookahead: Rainfastness Horizon (next 4-5 hours)
  let rainfastHazard = false;
  let rainArrivesInHours = null;
  let maxPrecipProb4h = 0;
  for (let offset = 1; offset <= 5 && idx + offset < hourly.time.length; offset++) {
    const p = hourly.precipitation[idx + offset] || 0;
    const prob = hourly.precipitation_probability ? (hourly.precipitation_probability[idx + offset] || 0) : 0;
    if (prob > maxPrecipProb4h) maxPrecipProb4h = prob;
    if (p > 0.3 || prob >= 60) {
      if (!rainfastHazard) {
        rainfastHazard = true;
        rainArrivesInHours = offset;
      }
    }
  }

  let finalScore = analysis.score;
  const issues = [...analysis.issues];

  if (isNight) {
    finalScore = Math.min(25, finalScore);
    issues.unshift('Nighttime condition: Inversion drift hazard & closed weed stomata');
  }

  if (rainfastHazard) {
    // If rain arrives within 4 hours, herbicide will be washed off!
    finalScore = Math.min(30, finalScore - 40);
    issues.unshift(`Imminent Rain (~${rainArrivesInHours}h): Rainwash hazard. Herbicide requires 4h dry canopy.`);
  }

  finalScore = Math.max(0, Math.min(100, finalScore));

  let verdict = 'SAFE_TO_SPRAY';
  let verdictHeadline = 'Safe to Spray Now';
  let verdictSummary = 'All weather conditions (Delta-T, wind, and rainfast horizon) are optimal for effective chemical absorption.';
  let verdictColor = 'emerald';

  if (isNight) {
    verdict = 'DO_NOT_SPRAY';
    verdictHeadline = 'Avoid Spraying — Nighttime Inversion';
    verdictSummary = 'Night application carries severe nocturnal surface inversion drift risk, dew dilution, and dormant weed stomata. Postpone until tomorrow morning.';
    verdictColor = 'rose';
  } else if (rainfastHazard) {
    verdict = 'DO_NOT_SPRAY';
    verdictHeadline = 'Avoid Spraying — Imminent Rain Wash-off';
    verdictSummary = `Rain expected in ~${rainArrivesInHours}h (${maxPrecipProb4h}% probability). Chemical wash-off will strip foliar spray before absorption.`;
    verdictColor = 'rose';
  } else if (finalScore < 50 || analysis.deltaT > 10 || conditions.windSpeed > 20 || conditions.precipitation > 0.2) {
    verdict = 'DO_NOT_SPRAY';
    verdictHeadline = 'Avoid Spraying — Hazard Active';
    verdictSummary = analysis.deltaT > 10 
      ? 'Extreme Delta-T (>10°C): Rapid droplet evaporation causes herbicide failure.'
      : conditions.windSpeed > 20
      ? `Excessive wind (${Math.round(conditions.windSpeed)} km/h): Off-target spray drift danger.`
      : 'Unfavorable atmospheric conditions present high chemical risk.';
    verdictColor = 'rose';
  } else if (finalScore >= 75) {
    verdict = 'SAFE_TO_SPRAY';
    verdictHeadline = 'Safe to Spray Now';
    verdictSummary = 'All atmospheric thresholds are met. Foliar uptake is maximized with low drift risk.';
    verdictColor = 'emerald';
  } else {
    verdict = 'SPRAY_WITH_CAUTION';
    verdictHeadline = 'Spray With Caution';
    verdictSummary = 'Sub-optimal window. Use coarse droplet nozzles to avoid drift, and monitor local wind shifts.';
    verdictColor = 'amber';
  }

  return {
    conditions,
    score: finalScore,
    rawScore: analysis.score,
    riskLevel: getRiskLevel(finalScore),
    issues,
    deltaT: analysis.deltaT,
    rainfastHazard,
    rainArrivesInHours,
    maxPrecipProb4h,
    isNight,
    verdict,
    verdictHeadline,
    verdictSummary,
    verdictColor
  };
}

/**
 * Get day label for window
 */
function getDayLabel(date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const dateStr = date.toDateString();
  
  if (dateStr === today.toDateString()) return 'Today';
  if (dateStr === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Group windows by day
 */
function groupWindowsByDay(windows) {
  const grouped = {};
  
  windows.forEach(w => {
    const day = w.dayLabel;
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(w);
  });
  
  return grouped;
}

/**
 * Generate human-readable recommendation
 */
function generateRecommendation(bestWindow, allWindows) {
  if (!bestWindow) {
    return {
      summary: 'No suitable spray windows found.',
      advice: 'Weather conditions are unfavorable. Consider postponing application or consult local weather forecasts.',
      urgency: 'low'
    };
  }
  
  const { score, riskLevel, time, issues } = bestWindow;
  const timeStr = time.toLocaleString('en-US', { 
    weekday: 'short', 
    hour: 'numeric',
    hour12: true 
  });
  
  let summary, advice, urgency;
  
  if (score >= 80) {
    summary = `Excellent spray conditions expected ${timeStr === 'Today' ? 'today' : timeStr}.`;
    advice = 'Ideal conditions for herbicide application. Proceed with confidence.';
    urgency = 'high';
  } else if (score >= 60) {
    summary = `Good spray window available ${timeStr === 'Today' ? 'this afternoon' : timeStr}.`;
    advice = 'Favorable conditions. Monitor wind direction and adjust nozzle selection if needed.';
    urgency = 'medium';
  } else if (score >= 40) {
    summary = `Marginal spray window ${timeStr === 'Today' ? 'later today' : timeStr}.`;
    advice = 'Conditions are acceptable but not ideal. Consider lower application rates or drift-reduction nozzles.';
    urgency = 'low';
  } else {
    summary = 'No optimal spray windows identified.';
    advice = 'Consider waiting for better conditions or consult with your agronomist.';
    urgency = 'low';
  }
  
  // Add specific issue warnings
  if (issues.length > 0 && score < 70) {
    advice += ` Note: ${issues.slice(0, 2).join('; ')}.`;
  }
  
  return { summary, advice, urgency, bestTime: timeStr };
}

/**
 * Get extended spray forecast (7 days)
 */
export async function getExtendedSprayForecast(lat, lon, targetDate = null) {
  try {
    let forecast;
    if (targetDate) {
      // Ensure targetDate is in YYYY-MM-DD format before passing to Date constructor.
      // The HTML date input always yields YYYY-MM-DD so this is just a safety guard.
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const safeDateStr = dateRegex.test(targetDate) ? targetDate : new Date().toISOString().split('T')[0];
      const start = new Date(safeDateStr + 'T00:00:00');
      if (isNaN(start.getTime())) {
        console.warn('[SprayAdvisor] getExtendedSprayForecast: invalid targetDate, using today');
        forecast = await fetchWeatherForecast(lat, lon, 7);
      } else {
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        forecast = await fetchWeatherForecast(lat, lon, 7, startStr, endStr);
      }
    } else {
      forecast = await fetchWeatherForecast(lat, lon, 7);
    }
    
    if (!forecast || !forecast.daily) {
      return { error: 'Unable to fetch extended forecast' };
    }
    
    const dailyAnalysis = [];
    
    for (let i = 0; i < forecast.daily.time.length; i++) {
      const date = new Date(forecast.daily.time[i]);
      
      // Calculate average conditions for the day
      const conditions = {
        maxTemp: forecast.daily.temperature_2m_max[i],
        minTemp: forecast.daily.temperature_2m_min[i],
        avgHumidity: forecast.daily.relative_humidity_2m_mean?.[i] || 65,
        maxWind: forecast.daily.wind_speed_10m_max[i],
        precipitation: forecast.daily.precipitation_sum[i] || 0
      };
      
      // Simple daily score based on extremes
      let dayScore = 100;
      const dayIssues = [];
      
      if (conditions.maxTemp > 28) {
        dayScore -= 20;
        dayIssues.push('Hot conditions expected');
      }
      if (conditions.minTemp < 8) {
        dayScore -= 15;
        dayIssues.push('Cool morning temperatures');
      }
      if (conditions.maxWind > 20) {
        dayScore -= 25;
        dayIssues.push('Windy conditions');
      }
      if (conditions.precipitation > 5) {
        dayScore -= 30;
        dayIssues.push('Rain expected');
      }
      
      dailyAnalysis.push({
        date,
        dayLabel: getDayLabel(date),
        conditions,
        score: Math.max(0, dayScore),
        riskLevel: getRiskLevel(dayScore),
        issues: dayIssues
      });
    }
    
    return {
      daily: dailyAnalysis,
      bestDays: dailyAnalysis.filter(d => d.score >= 70).slice(0, 3),
      avoidDays: dailyAnalysis.filter(d => d.score < 40)
    };
    
  } catch (error) {
    console.error('[SprayAdvisor] Extended forecast failed:', error);
    return { error: error.message };
  }
}

// Window exports
if (typeof window !== 'undefined') {
  window.analyzeSprayWindow = analyzeSprayWindow;
  window.getExtendedSprayForecast = getExtendedSprayForecast;
}

export default {
  analyzeSprayWindow,
  getExtendedSprayForecast,
  calculateDeltaT,
  RISK_LEVELS
};
