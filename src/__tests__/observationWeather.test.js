import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchObservationWeather,
  computeObservationWeatherSummary,
  calculateGDD,
  clearWeatherCache
} from '../services/weather.js';

describe('Observation Weather & Microclimate Service', () => {
  beforeEach(() => {
    clearWeatherCache();
    vi.restoreAllMocks();
  });

  it('calculates growing degree days (GDD) with base temperature 10°C', () => {
    // Tmean = (28 + 18) / 2 = 23, base 10 -> 13 GDD
    expect(calculateGDD(28, 18, 10)).toBe(13);

    // Below base temp: Tmean = (8 + 4) / 2 = 6 <= 10 -> 0 GDD
    expect(calculateGDD(8, 4, 10)).toBe(0);
  });

  it('computes accurate agronomic impact summaries', () => {
    // Hot and high rain
    const summary1 = computeObservationWeatherSummary(34, 45, 12, 55, 110);
    expect(summary1).toContain('Tropical Heat');
    expect(summary1).toContain('Significant cumulative rainfall');

    // Cool conditions
    const summary2 = computeObservationWeatherSummary(14, 82, 4, 2, 20);
    expect(summary2).toContain('Cool Weather');
  });

  it('fetches observation weather and accumulates rainfall between spray and observation', async () => {
    const mockAppDate = '2026-03-01';
    const mockObsDate = '2026-03-05';

    // Mock global fetch
    global.fetch = vi.fn().mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('start_date=2026-03-01&end_date=2026-03-05')) {
        // Interval query across multi-day window
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            daily: {
              time: ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'],
              rain_sum: [4.2, 10.0, 0, 2.5, 0],
              temperature_2m_mean: [24, 23, 25, 23, 23],
              temperature_2m_max: [30, 29, 31, 28, 28.6],
              temperature_2m_min: [18, 17, 19, 18, 17.5]
            }
          })
        });
      }

      if (urlStr.includes('soil_temperature')) {
        // Soil query
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            hourly: {
              soil_temperature_0_to_7cm: [22.0, 23.0],
              soil_moisture_0_to_7cm: [0.27, 0.27]
            }
          })
        });
      }

      // Ambient weather query
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          daily: {
            time: [mockObsDate],
            temperature_2m_max: [28.6],
            relative_humidity_2m_mean: [52],
            wind_speed_10m_max: [11.5],
            rain_sum: [0],
            dew_point_2m_mean: [18],
            cloud_cover_mean: [20],
            shortwave_radiation_sum: [18]
          }
        })
      });
    });

    const result = await fetchObservationWeather(13.0827, 80.2707, mockObsDate, mockAppDate);

    expect(result).not.toBeNull();
    expect(result.temp).toBe(28.6);
    expect(result.humidity).toBe(52);
    expect(result.wind).toBe(11.5);
    // Cumulative rainfall: 4.2 + 10.0 + 0 + 2.5 + 0 = 16.7 mm
    expect(result.cumulativeRainSinceApp).toBe(16.7);
    expect(result.soilMoisture).toBe(27);
    expect(result.gddSinceApp).toBeGreaterThan(0);
    expect(result.intervalSummary).toContain('16.7mm rain');
  });

  it('uses memory cache on consecutive calls for the same coordinates and dates', async () => {
    let fetchCount = 0;
    const today = new Date().toISOString().split('T')[0];

    global.fetch = vi.fn().mockImplementation(() => {
      fetchCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          daily: {
            time: [today],
            temperature_2m_max: [29.0],
            relative_humidity_2m_mean: [60],
            wind_speed_10m_max: [10],
            rain_sum: [0]
          },
          hourly: {
            soil_temperature_0_to_7cm: [24],
            soil_moisture_0_to_7cm: [0.3]
          }
        })
      });
    });

    const res1 = await fetchObservationWeather(12.9716, 77.5946, today, today);
    const res2 = await fetchObservationWeather(12.9716, 77.5946, today, today);

    expect(res1.temp).toBe(29.0);
    expect(res2.temp).toBe(29.0);
    // 3 network requests for res1 (ambient weather, soil data, interval), 0 for res2 (100% cache hit)
    expect(fetchCount).toBe(3);
  });
});
