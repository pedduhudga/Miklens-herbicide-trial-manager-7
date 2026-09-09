import { describe, it, expect } from 'vitest';
import { evaluateSprayWeatherRisk } from '../services/weather.js';

describe('evaluateSprayWeatherRisk - Spray Weather & Chemical Rainfastness Watchdog', () => {
  it('detects high wind drift hazard when wind speed exceeds 20 km/h', () => {
    const risk = evaluateSprayWeatherRisk({
      weather: { temp: 24, wind: 24, humidity: 60, rain: 'dry' },
      formulation: { Name: 'Glyphosate 41% SL' }
    });

    expect(risk.severity).toBe('high');
    expect(risk.status).toContain('High Spray Hazard');
    expect(risk.risks.some(r => r.type === 'drift')).toBe(true);
    expect(risk.recommendations.some(r => r.includes('Postpone spray'))).toBe(true);
  });

  it('detects active rain wash-off risk and calculates correct systemic rainfast window', () => {
    const risk = evaluateSprayWeatherRisk({
      weather: { temp: 22, wind: 8, humidity: 85, rain: 'light rain' },
      formulation: { Name: 'Glycyl', Notes: 'Contains glyphosate' }
    });

    expect(risk.severity).toBe('high');
    expect(risk.risks.some(r => r.type === 'washoff')).toBe(true);
    expect(risk.rainfastHours).toBeGreaterThanOrEqual(2.0);
    expect(risk.isOptimal).toBe(false);
  });

  it('recognizes rapid contact knockdown formulations with shorter 0.5h rainfast duration', () => {
    const risk = evaluateSprayWeatherRisk({
      weather: { temp: 25, wind: 8, humidity: 55, rain: 'sunny' },
      formulation: { Name: 'Glufosinate Ammonium 13.5%' }
    });

    expect(risk.rainfastHours).toBe(0.5);
    expect(risk.chemistryType).toContain('0.5h Rainfast');
    expect(risk.isOptimal).toBe(true);
    expect(risk.status).toContain('Optimal Application Conditions');
  });

  it('flags high heat volatilization risk when temperature exceeds 32°C', () => {
    const risk = evaluateSprayWeatherRisk({
      weather: { temp: 35, wind: 10, humidity: 40, rain: 'clear' },
      formulation: { Name: '2,4-D Amine' }
    });

    expect(risk.severity).toBe('high');
    expect(risk.risks.some(r => r.type === 'volatilization')).toBe(true);
  });

  it('identifies dead calm temperature inversion risk when wind < 3 km/h', () => {
    const risk = evaluateSprayWeatherRisk({
      weather: { temp: 20, wind: 1.5, humidity: 65, rain: 'dry' },
      formulation: { Name: 'Standard Check' }
    });

    expect(risk.severity).toBe('moderate');
    expect(risk.risks.some(r => r.type === 'inversion')).toBe(true);
  });
});
