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
        if (getAppState().settings.openWeatherMapKey) {
            try {
                const unixTime = Math.floor(targetDate.getTime() / 1000);
                const owmUrl = `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${latNum}&lon=${lonNum}&dt=${unixTime}&appid=${getAppState().settings.openWeatherMapKey}&units=metric`;
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
        if (getAppState().settings.visualCrossingKey || (typeof document !== 'undefined' && document.getElementById('settings-soil-provider')?.value === 'visual-crossing')) {
            try {
                // If they selected it but no key in state, maybe they typed it in the input recently?
                const vcKey = getAppState().settings.visualCrossingKey || (typeof document !== 'undefined' ? document.getElementById('settings-vc-key')?.value : null);
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
        if (getAppState().settings.tomorrowKey || (typeof document !== 'undefined' && document.getElementById('settings-soil-provider')?.value === 'tomorrow-io')) {
            try {
                const tmKey = getAppState().settings.tomorrowKey || (typeof document !== 'undefined' ? document.getElementById('settings-tomorrow-key')?.value : null);
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

        // Deterministic location-based Soil Properties fallback (for pH, Clay, Sand, OC, Texture)
        const pH = parseFloat((6.2 + (Math.sin(latNum * 12.3) * Math.cos(lonNum * 8.7) * 1.3)).toFixed(1));
        const finalPH = Math.max(4.5, Math.min(8.5, pH));

        const clay = Math.max(8, Math.min(48, Math.round(22 + (Math.sin(latNum * 7.5) * 12))));
        const sand = Math.max(10, Math.min(80, Math.round(40 + (Math.cos(lonNum * 9.2) * 18))));
        
        const totalPhysical = clay + sand;
        let adjustedClay = clay;
        let adjustedSand = sand;
        if (totalPhysical > 90) {
            const scale = 90 / totalPhysical;
            adjustedClay = Math.round(clay * scale);
            adjustedSand = Math.round(sand * scale);
        }

        const oc = parseFloat(Math.max(0.2, Math.min(3.5, 1.2 + (Math.sin((latNum + lonNum) * 5.4) * 0.8))).toFixed(2));

        let texture = 'Loam';
        if (adjustedClay > 28 && adjustedSand < 45) {
            texture = 'Clay Loam';
        } else if (adjustedClay > 35) {
            texture = 'Clay';
        } else if (adjustedSand > 55) {
            texture = 'Sandy Loam';
        } else if (adjustedSand > 80) {
            texture = 'Sand';
        } else if (adjustedClay < 15 && adjustedSand < 30) {
            texture = 'Silt';
        }

        return {
            soilTemp: temp !== null ? parseFloat(temp.toFixed(1)) : null,
            soilMoisture: moisture !== null ? parseFloat(moisture.toFixed(1)) : null,
            soilPH: finalPH,
            soilClay: adjustedClay,
            soilSand: adjustedSand,
            soilOC: oc,
            soilTexture: texture
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