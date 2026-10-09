async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {
    try {
        const response = await fetch(url, options);
        if (!response.ok && retries > 0) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response;
    } catch (error) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw error;
    }
}

export async function fetchWeather(lat, lon, date = null, getAppState) {
    let url = '';
    try {
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);
        if (!lat || !lon || isNaN(latNum) || isNaN(lonNum)) {
            console.error("fetchWeather: Invalid coordinates:", lat, lon);
            return null;
        }
        // Validate date format YYYY-MM-DD
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!date || typeof date !== 'string' || !dateRegex.test(date)) {
            console.error("fetchWeather: Invalid date format:", date);
            return null;
        }

        const targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
            console.error("fetchWeather: Invalid Date object:", date);
            return null;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Calculate age of date in days
        const diffTime = today - targetDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const dateStr = date; // YYYY-MM-DD

        // 1. TRY PREMIUM: OpenWeatherMap (if key provided)
        const appState = typeof getAppState === 'function' ? getAppState() : null;
        if (appState?.settings?.openWeatherMapKey) {
            try {
                const unixTime = Math.floor(targetDate.getTime() / 1000);
                const owmUrl = `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${latNum}&lon=${lonNum}&dt=${unixTime}&appid=${appState.settings.openWeatherMapKey}&units=metric`;
                const response = await fetchWithRetry(owmUrl);
                if (response.ok) {
                    const data = await response.json();
                    if (data.data && data.data[0]) {
                        const w = data.data[0];
                        return {
                            temp: w.temp,
                            humidity: w.humidity,
                            wind: w.wind_speed,
                            rain: w.rain ? (w.rain['1h'] || 0) : 0,
                            dewPoint: w.dew_point,
                            cloudCover: w.clouds,
                            provider: 'OpenWeatherMap'
                        };
                    }
                }
            } catch (e) { console.warn('OpenWeatherMap failed, trying other providers...', e); }
        }

        // 1.5 TRY Visual Crossing (if key provided or selected)
        if (appState?.settings?.visualCrossingKey || (typeof document !== 'undefined' && document.getElementById('settings-soil-provider')?.value === 'visual-crossing')) {
            try {
                // If they selected it but no key in state, maybe they typed it in the input recently?
                const vcKey = appState?.settings?.visualCrossingKey || (typeof document !== 'undefined' ? document.getElementById('settings-vc-key')?.value : null);
                if (vcKey) {
                    const vcUrl = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${latNum},${lonNum}/${dateStr}?key=${vcKey}&unitGroup=metric&include=days`;
                    const response = await fetchWithRetry(vcUrl);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.days && data.days.length > 0) {
                            const w = data.days[0];
                            return {
                                temp: w.tempmax || w.temp,
                                humidity: w.humidity,
                                wind: w.windspeed,
                                rain: w.precip || 0,
                                dewPoint: w.dew,
                                cloudCover: w.cloudcover,
                                sunlight: w.solarradiation,
                                provider: 'Visual Crossing'
                            };
                        }
                    }
                }
            } catch (e) { console.warn('Visual Crossing failed...', e); }
        }

        // 1.7 TRY Tomorrow.io (if key provided or selected)
        if (appState?.settings?.tomorrowKey || (typeof document !== 'undefined' && document.getElementById('settings-soil-provider')?.value === 'tomorrow-io')) {
            try {
                const tmKey = appState?.settings?.tomorrowKey || (typeof document !== 'undefined' ? document.getElementById('settings-tomorrow-key')?.value : null);
                if (tmKey) {
                    const tmUrl = `https://api.tomorrow.io/v4/weather/history/recent?location=${latNum},${lonNum}&apikey=${tmKey}`;
                    const response = await fetchWithRetry(tmUrl);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.timelines && data.timelines.daily && data.timelines.daily.length > 0) {
                            const w = data.timelines.daily[0].values;
                            return {
                                temp: w.temperatureMax,
                                humidity: w.humidityAvg,
                                wind: w.windSpeedMax,
                                rain: w.precipitationAccumulation || 0,
                                dewPoint: w.dewPointAvg,
                                cloudCover: w.cloudCoverAvg,
                                sunlight: w.solarRadiationAvg,
                                provider: 'Tomorrow.io'
                            };
                        }
                    }
                }
            } catch (e) { console.warn('Tomorrow.io failed...', e); }
        }

        // 2. PRIMARY: Open-Meteo
        const isOldArchive = diffDays > 14;
        if (isOldArchive) {
            url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_max,relative_humidity_2m_mean,wind_speed_10m_max,rain_sum,dew_point_2m_mean,cloud_cover_mean,shortwave_radiation_sum&timezone=auto`;
        } else {
            url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,relative_humidity_2m_mean,wind_speed_10m_max,rain_sum,dew_point_2m_mean,cloud_cover_mean,shortwave_radiation_sum&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;
        }

        const res = await fetchWithRetry(url);
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            console.error('Weather API Error Detail:', errData);
            throw new Error(`Weather API Error: ${res.status}${errData.reason ? ' - ' + errData.reason : ''}`);
        }
        const data = await res.json();

        if (data.daily && data.daily.time && data.daily.time.length > 0) {
            console.log('Weather API Response Dates:', data.daily.time, 'Looking for:', dateStr);

            // Find the index that matches our requested date
            const index = data.daily.time.findIndex(t => t === dateStr);
            const safeIndex = index !== -1 ? index : 0;

            if (index === -1) {
                console.warn('Weather date mismatch! API returned:', data.daily.time[0], 'Expected:', dateStr);
            }

            // Sanity check: if returned date is not what we asked for, and we are in strict mode
            if (index === -1 && data.daily.time[0] !== dateStr) {
                // If the mismatch is significant, return null.
                if (Math.abs(new Date(data.daily.time[0]) - targetDate) > 86400000) {
                    console.error('Weather date mismatch too large. Aborting.');
                    return null;
                }
            }

            return {
                temp: data.daily.temperature_2m_max[safeIndex],
                humidity: data.daily.relative_humidity_2m_mean[safeIndex],
                wind: data.daily.wind_speed_10m_max[safeIndex],
                rain: data.daily.rain_sum[safeIndex],
                dewPoint: data.daily.dew_point_2m_mean ? data.daily.dew_point_2m_mean[safeIndex] : null,
                cloudCover: data.daily.cloud_cover_mean ? data.daily.cloud_cover_mean[safeIndex] : null,
                sunlight: data.daily.shortwave_radiation_sum ? data.daily.shortwave_radiation_sum[safeIndex] : null,
                provider: 'Open-Meteo'
            };
        }
        return null;
    } catch (e) {
        console.error("Weather fetch failed:", e);
        console.error("Failed URL:", url);
        if (typeof showToast === 'function') {
            showToast('Could not fetch weather data.', 'error');
        }
        return null;
    }
}

export async function fetchSoilData(lat, lon, date = null) {
    try {
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);
        if (isNaN(latNum) || isNaN(lonNum)) return null;

        let temp = null;
        let moisture = null;

        const todayStr = new Date().toISOString().split('T')[0];
        const targetDateStr = date || todayStr;

        const isPast = targetDateStr < todayStr;
        const baseUrl = isPast 
            ? `https://archive-api.open-meteo.com/v1/archive?latitude=${latNum}&longitude=${lonNum}&start_date=${targetDateStr}&end_date=${targetDateStr}&hourly=soil_temperature_0_to_7cm,soil_moisture_0_to_7cm&timezone=auto`
            : `https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lonNum}&hourly=soil_temperature_6cm,soil_moisture_3_9cm&start_date=${targetDateStr}&end_date=${targetDateStr}&timezone=auto`;

        try {
            const response = await fetch(baseUrl);
            if (response.ok) {
                const data = await response.json();
                if (data.hourly) {
                    const tempKey = isPast ? 'soil_temperature_0_to_7cm' : 'soil_temperature_6cm';
                    const moistKey = isPast ? 'soil_moisture_0_to_7cm' : 'soil_moisture_3_9cm';
                    
                    const temps = data.hourly[tempKey] || [];
                    const moists = data.hourly[moistKey] || [];
                    
                    if (temps.length > 0) {
                        const validTemps = temps.filter(v => v !== null && !isNaN(v));
                        if (validTemps.length > 0) {
                            temp = validTemps.reduce((a, b) => a + b, 0) / validTemps.length;
                        }
                    }
                    if (moists.length > 0) {
                        const validMoists = moists.filter(v => v !== null && !isNaN(v));
                        if (validMoists.length > 0) {
                            moisture = (validMoists.reduce((a, b) => a + b, 0) / validMoists.length) * 100; // convert to percentage
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Open-Meteo soil fetch failed:", e);
        }

        // Return real physical measurements if available; do NOT fabricate hardcoded or pseudo-random soil chemical data
        return {
            soilTemp: temp !== null ? parseFloat(temp.toFixed(1)) : null,
            soilMoisture: moisture !== null ? parseFloat(moisture.toFixed(1)) : null,
            soilPH: null,
            soilClay: null,
            soilSand: null,
            soilOC: null,
            soilTexture: null
        };
    } catch (e) {
        console.error("fetchSoilData failed:", e);
        return null;
    }
}

/**
 * Evaluates spray application weather suitability and chemical rainfastness risk.
 *
 * @param {Object} params
 * @param {Object|string} params.weather - Weather data or conditions { temp, wind, rain, humidity }
 * @param {Object|string} params.formulation - Formulation object or name
 * @param {string} [params.activeCategory='herbicide'] - Category
 * @returns {Object} Risk analysis { status, severity, rainfastHours, chemistryType, risks, recommendations, isOptimal }
 */
export function evaluateSprayWeatherRisk({ weather = {}, formulation = null, activeCategory = 'herbicide' }) {
    const temp = typeof weather?.temp === 'number' ? weather.temp : parseFloat(weather?.temp || weather?.Temperature || 25);
    const wind = typeof weather?.wind === 'number' ? weather.wind : parseFloat(weather?.wind || weather?.Windspeed || weather?.wind_speed || 8);
    const humidity = typeof weather?.humidity === 'number' ? weather.humidity : parseFloat(weather?.humidity || weather?.Humidity || 60);
    const rainDesc = String(weather?.rain || weather?.Rain || '').toLowerCase();

    // Determine rainfastness requirement (in hours) based on chemistry
    let rainfastHours = 2.0;
    let chemistryType = 'Standard Systemic';

    const formText = (
        (typeof formulation === 'string' ? formulation : '') + ' ' +
        (formulation?.Name || '') + ' ' +
        (formulation?.Notes || '') + ' ' +
        (formulation?.IngredientsJSON || '')
    ).toLowerCase();

    if (
        formText.includes('glufosinate') ||
        formText.includes('paraquat') ||
        formText.includes('diquat') ||
        formText.includes('carfentrazone') ||
        formText.includes('oxyfluorfen')
    ) {
        rainfastHours = 0.5;
        chemistryType = 'Rapid Contact Knockdown (0.5h Rainfast)';
    } else if (
        formText.includes('glyphosate') ||
        formText.includes('glycyl') ||
        formText.includes('goweed')
    ) {
        rainfastHours = formText.includes('surfactant') || formText.includes('ams') ? 2.0 : 3.5;
        chemistryType = 'Deep Systemic Translocation (2-4h Rainfast)';
    } else if (
        formText.includes('2,4-d') ||
        formText.includes('dicamba') ||
        formText.includes('mcpa') ||
        formText.includes('triclopyr')
    ) {
        rainfastHours = 2.5;
        chemistryType = 'Synthetic Auxin Systemic (2.5h Rainfast)';
    } else if (
        formText.includes('clethodim') ||
        formText.includes('haloxyfop') ||
        formText.includes('quizalofop')
    ) {
        rainfastHours = 1.5;
        chemistryType = 'ACCase Foliar Graminicide (1.5h Rainfast)';
    }

    const risks = [];
    const recommendations = [];

    // 1. Evaluate Wind & Drift Hazard
    if (wind > 20) {
        risks.push({
            type: 'drift',
            severity: 'high',
            title: `High Wind Drift Risk (${wind} km/h)`,
            message: 'Wind speed exceeds 20 km/h. Severe risk of off-target herbicide drift and plot cross-contamination.'
        });
        recommendations.push('Do NOT apply under wind > 20 km/h. Postpone spray until early morning or calm evening window.');
    } else if (wind > 14) {
        risks.push({
            type: 'drift',
            severity: 'moderate',
            title: `Moderate Drift Risk (${wind} km/h)`,
            message: 'Elevated droplet drift hazard. Fine spray droplets will drift outside the target microplot boundary.'
        });
        recommendations.push('Lower boom height and switch to coarse air-induction nozzles to suppress fine driftable droplets.');
    } else if (wind < 3) {
        risks.push({
            type: 'inversion',
            severity: 'moderate',
            title: 'Dead Calm / Temperature Inversion Risk',
            message: 'Extremely calm wind (< 3 km/h) often correlates with surface temperature inversions, suspending small droplets in fog layers.'
        });
        recommendations.push('Verify vertical air mixing; avoid spraying if smoke or mist hangs horizontally near the soil.');
    }

    // 2. Evaluate Rain & Wash-off Risk
    const isRainingNow = rainDesc.includes('rain') || rainDesc.includes('wet') || rainDesc.includes('shower') || rainDesc.includes('storm');
    if (isRainingNow) {
        risks.push({
            type: 'washoff',
            severity: 'high',
            title: 'High Wash-Off Risk (Precipitation Active)',
            message: `Active precipitation will strip unabsorbed herbicide before the required ${rainfastHours}h rainfast duration.`
        });
        recommendations.push(`Halt application immediately. Foliar active requires at least ${rainfastHours}h dry canopy post-spray.`);
    } else if (rainDesc.includes('cloudy') || rainDesc.includes('overcast') || humidity > 85) {
        risks.push({
            type: 'washoff',
            severity: 'moderate',
            title: `High Humidity / Wash-Off Caution (${humidity}%)`,
            message: `Overcast high-humidity conditions slow droplet drying and increase wash-off risk if rain arrives within ${rainfastHours} hours.`
        });
        recommendations.push(`Add rain-adhering sticker adjuvant to shorten required rainfast duration.`);
    }

    // 3. Evaluate Temperature & Volatilization
    if (temp > 32) {
        risks.push({
            type: 'volatilization',
            severity: 'high',
            title: `High Heat Volatilization (${temp}°C)`,
            message: 'Air temperature exceeds 32°C. Droplets rapidly evaporate before leaf absorption, and auxin herbicides may vaporize.'
        });
        recommendations.push('Schedule application before 9:00 AM or after 5:00 PM when temperatures are below 28°C.');
    } else if (temp < 12) {
        risks.push({
            type: 'cold',
            severity: 'moderate',
            title: `Low Temperature Translocation Slowdown (${temp}°C)`,
            message: 'Cold ambient temperature slows down plant vascular transport, significantly delaying visual symptom onset.'
        });
        recommendations.push('Expect delayed herbicide knockdown (3–5 extra days to reach peak efficacy).');
    }

    const hasHigh = risks.some(r => r.severity === 'high');
    const hasModerate = risks.some(r => r.severity === 'moderate');

    let status = 'Optimal Application Conditions';
    let severity = 'optimal';
    if (hasHigh) {
        status = 'High Spray Hazard';
        severity = 'high';
    } else if (hasModerate) {
        status = 'Moderate Spray Caution';
        severity = 'moderate';
    }

    if (risks.length === 0) {
        recommendations.push(`Conditions optimal: ${temp}°C, ${wind} km/h wind, dry foliage. Optimal for ${chemistryType}.`);
    }

    return {
        status,
        severity,
        rainfastHours,
        chemistryType,
        temp,
        wind,
        humidity,
        risks,
        recommendations,
        isOptimal: severity === 'optimal'
    };
}

/**
 * Calculate Growing Degree Days (GDD) for a single day
 * Formula: max(0, ((Tmax + Tmin) / 2) - Tbase)
 */
export function calculateGDD(tMax, tMin, baseTemp = 10) {
    if (typeof tMax !== 'number' || typeof tMin !== 'number' || isNaN(tMax) || isNaN(tMin)) return 0;
    const dayMean = (tMax + tMin) / 2;
    return dayMean > baseTemp ? Math.round((dayMean - baseTemp) * 10) / 10 : 0;
}

/**
 * Computes an agronomic synthesis of ambient microclimate and cumulative weather
 */
export function computeObservationWeatherSummary(temp, humidity, wind, rain, cumulativeRain = null) {
    const parts = [];
    if (temp != null) {
        if (temp >= 32) parts.push(`Tropical Heat (${temp}°C) accelerates cellular desiccation`);
        else if (temp < 15) parts.push(`Cool Weather (${temp}°C) slowing systemic phloem translocation`);
        else parts.push(`Moderate Temperature (${temp}°C)`);
    }
    if (humidity != null) {
        if (humidity >= 75) parts.push(`High Humidity (${humidity}%) promoting cuticle hydration`);
        else if (humidity < 40) parts.push(`Low Humidity (${humidity}%) accelerating droplet drying`);
    }
    if (cumulativeRain != null && cumulativeRain > 0) {
        if (cumulativeRain >= 25) parts.push(`Significant cumulative rainfall (${cumulativeRain}mm) providing ample root-zone moisture`);
        else parts.push(`Cumulative rainfall: ${cumulativeRain}mm`);
    }
    return parts.join(' | ') || 'Standard ambient field microclimate';
}

// In-memory cache for observation weather (key: lat_lon_obsDate_appDate)
const obsWeatherCache = new Map();

/**
 * Agronomic Observation Weather & Interval Tracker
 * Fetches ambient microclimate on observation day PLUS cumulative interval metrics since trial application.
 *
 * @param {number|string} lat - Latitude
 * @param {number|string} lon - Longitude
 * @param {string|Date} obsDateStr - Date/time of observation/photo
 * @param {string|Date} [appDateStr=null] - Date of trial creation / application (Day 0)
 * @param {Function} [getAppState=null] - App state getter
 * @returns {Promise<Object|null>} Weather snapshot + interval agronomic metrics
 */
export async function fetchObservationWeather(lat, lon, obsDateStr, appDateStr = null, getAppState = null) {
    try {
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);
        if (isNaN(latNum) || isNaN(lonNum)) return null;

        // Normalize dates to YYYY-MM-DD
        const extractDateStr = (d) => {
            if (!d) return null;
            if (typeof d === 'string') {
                const m = d.match(/^\d{4}-\d{2}-\d{2}/);
                return m ? m[0] : null;
            }
            if (d instanceof Date && !isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }
            return null;
        };

        const todayStr = new Date().toISOString().split('T')[0];
        const obsDate = extractDateStr(obsDateStr) || todayStr;
        const appDate = extractDateStr(appDateStr);

        const cacheKey = `${latNum.toFixed(4)}_${lonNum.toFixed(4)}_${obsDate}_${appDate || 'none'}`;
        if (obsWeatherCache.has(cacheKey)) {
            return obsWeatherCache.get(cacheKey);
        }

        // 1. Fetch ambient observation day weather
        const [ambientWeather, soilData] = await Promise.all([
            fetchWeather(latNum, lonNum, obsDate, getAppState).catch(() => null),
            fetchSoilData(latNum, lonNum, obsDate).catch(() => null)
        ]);

        let cumulativeRainSinceApp = null;
        let rainEventsCount = 0;
        let meanTempSinceApp = null;
        let maxTempSinceApp = null;
        let minTempSinceApp = null;
        let gddSinceApp = null;
        let intervalSummary = null;

        // 2. Fetch interval weather if application date is valid and <= obsDate
        if (appDate && appDate <= obsDate) {
            try {
                const isArchive = obsDate < todayStr;
                const intervalUrl = isArchive
                    ? `https://archive-api.open-meteo.com/v1/archive?latitude=${latNum}&longitude=${lonNum}&start_date=${appDate}&end_date=${obsDate}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,rain_sum&timezone=auto`
                    : `https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lonNum}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,rain_sum&start_date=${appDate}&end_date=${obsDate}&timezone=auto`;

                const intervalRes = await fetchWithRetry(intervalUrl, {}, 2, 800);
                if (intervalRes && intervalRes.ok) {
                    const intData = await intervalRes.json();
                    if (intData.daily && Array.isArray(intData.daily.time)) {
                        const rainArr = intData.daily.rain_sum || intData.daily.precipitation_sum || [];
                        const tMeanArr = intData.daily.temperature_2m_mean || [];
                        const tMaxArr = intData.daily.temperature_2m_max || [];
                        const tMinArr = intData.daily.temperature_2m_min || [];

                        const totalRain = rainArr.reduce((acc, r) => acc + (typeof r === 'number' && !isNaN(r) ? r : 0), 0);
                        cumulativeRainSinceApp = Math.round(totalRain * 10) / 10;
                        rainEventsCount = rainArr.filter(r => typeof r === 'number' && r >= 1.0).length;

                        const validMeans = tMeanArr.filter(t => typeof t === 'number' && !isNaN(t));
                        if (validMeans.length > 0) {
                            meanTempSinceApp = Math.round((validMeans.reduce((a, b) => a + b, 0) / validMeans.length) * 10) / 10;
                        }

                        const validMax = tMaxArr.filter(t => typeof t === 'number' && !isNaN(t));
                        if (validMax.length > 0) maxTempSinceApp = Math.max(...validMax);

                        const validMin = tMinArr.filter(t => typeof t === 'number' && !isNaN(t));
                        if (validMin.length > 0) minTempSinceApp = Math.min(...validMin);

                        // Compute Growing Degree Days (Base 10°C standard for agricultural weed/crop metabolism)
                        let gddSum = 0;
                        const baseTemp = 10;
                        for (let i = 0; i < intData.daily.time.length; i++) {
                            const max = tMaxArr[i];
                            const min = tMinArr[i];
                            if (typeof max === 'number' && typeof min === 'number') {
                                const dayMean = (max + min) / 2;
                                if (dayMean > baseTemp) {
                                    gddSum += (dayMean - baseTemp);
                                }
                            }
                        }
                        gddSinceApp = Math.round(gddSum);

                        intervalSummary = `${cumulativeRainSinceApp}mm rain (${rainEventsCount} rain events) · Mean ${meanTempSinceApp ?? '—'}°C · ${gddSinceApp} GDD since spray`;
                    }
                }
            } catch (intErr) {
                console.warn('[Observation Weather] Interval weather query failed:', intErr.message);
            }
        }

        // 3. Synthesize agronomic weather impact
        const currentTemp = ambientWeather?.temp !== undefined ? ambientWeather.temp : null;
        const currentHumidity = ambientWeather?.humidity !== undefined ? ambientWeather.humidity : null;
        const currentWind = ambientWeather?.wind !== undefined ? ambientWeather.wind : null;
        const currentRain = ambientWeather?.rain !== undefined ? ambientWeather.rain : 0;

        let agronomicImpact = '';
        if (cumulativeRainSinceApp !== null) {
            if (cumulativeRainSinceApp >= 15) {
                agronomicImpact = `High soil moisture activation (${cumulativeRainSinceApp}mm rain since spray); favorable for residual barrier formation and active weed uptake.`;
            } else if (cumulativeRainSinceApp < 3 && appDate && appDate !== obsDate) {
                agronomicImpact = `Dry soil interval (<3mm rain); pre-emergence residual activation may be moisture-limited.`;
            } else {
                agronomicImpact = `Moderate precipitation (${cumulativeRainSinceApp}mm); stable canopy conditions.`;
            }
        }
        if (currentTemp !== null) {
            if (currentTemp > 32) {
                agronomicImpact += (agronomicImpact ? ' ' : '') + `High heat on observation day (${currentTemp}°C) accelerates visual foliar desiccation.`;
            } else if (currentTemp < 14) {
                agronomicImpact += (agronomicImpact ? ' ' : '') + `Cool ambient temperatures (${currentTemp}°C) slow vascular transport and visual symptom onset.`;
            } else if (currentHumidity !== null && currentHumidity >= 55) {
                agronomicImpact += (agronomicImpact ? ' ' : '') + `Optimal temperature & humidity (${currentTemp}°C, ${currentHumidity}% RH) for active plant metabolism.`;
            }
        }

        const result = {
            temp: currentTemp !== null ? Math.round(currentTemp * 10) / 10 : null,
            humidity: currentHumidity !== null ? Math.round(currentHumidity) : null,
            wind: currentWind !== null ? Math.round(currentWind * 10) / 10 : null,
            rain: currentRain !== null ? Math.round(currentRain * 10) / 10 : 0,
            dewPoint: ambientWeather?.dewPoint ?? null,
            soilTemp: soilData?.soilTemp ?? null,
            soilMoisture: soilData?.soilMoisture ?? null,
            cumulativeRainSinceApp,
            rainEventsCount,
            meanTempSinceApp,
            maxTempSinceApp,
            minTempSinceApp,
            gddSinceApp,
            intervalSummary,
            agronomicImpact: agronomicImpact.trim() || null,
            condition: currentRain > 0 ? 'Precipitation' : (currentHumidity > 75 ? 'High Humidity' : (currentTemp > 30 ? 'Warm & Dry' : 'Moderate')),
            provider: ambientWeather?.provider || 'Open-Meteo',
            obsDate,
            appDate
        };

        obsWeatherCache.set(cacheKey, result);
        return result;
    } catch (err) {
        console.error('fetchObservationWeather failed:', err);
        return null;
    }
}

/**
 * Invalidate in-memory observation weather cache
 */
export function clearWeatherCache() {
    obsWeatherCache.clear();
}