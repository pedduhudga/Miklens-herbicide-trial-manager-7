import { describe, it, expect } from 'vitest';
import { calculateEffectiveControlDays, getDetailedControlDaysInfo } from '../utils/trialLifecycle.js';
import { getEWRSScale, getRatingFromEfficacy } from '../utils/categoryConfig.js';
import { canonicalizeWeedSpecies, getWeedBiology, getWeedEPPOCode } from '../utils/weedUtils.js';
import { lookupEPPO, EPPO_CODES } from '../utils/eppoBBCHData.js';

describe('Trial Tab Advanced Logic: Control Days, Ratings, and Weed Identification', () => {

  // ── 1. CONTROL DAYS: EPPO/EWRS Linear Breakdown Interpolation ───
  describe('Control Days: Scientific Threshold & Linear Interpolation', () => {
    it('calculates linear interpolation when WCE drops below 70% between observations', () => {
      const trial = {
        EfficacyDataJSON: JSON.stringify([
          { daa: 0, weedCover: 100 },
          { daa: 7, controlPct: 95 },
          { daa: 14, controlPct: 80 },
          { daa: 21, controlPct: 60 } // drops from 80% to 60%, crossing 70% exactly at 17.5 DAA
        ])
      };

      const days = calculateEffectiveControlDays(trial);
      // Math.round(17.5) = 18
      expect(days).toBe(18);

      const info = getDetailedControlDaysInfo(trial);
      expect(info.status).toBe('breakdown_regrowth');
      expect(info.isInterpolated).toBe(true);
      expect(info.breakdownDaa).toBe(17.5);
      expect(info.effectiveDays).toBe(18);
    });

    it('returns full observation duration when control is sustained >= 70%', () => {
      const trial = {
        EfficacyDataJSON: JSON.stringify([
          { daa: 0, weedCover: 100 },
          { daa: 7, controlPct: 98 },
          { daa: 14, controlPct: 92 },
          { daa: 28, controlPct: 85 }
        ])
      };

      const days = calculateEffectiveControlDays(trial);
      expect(days).toBe(28);

      const info = getDetailedControlDaysInfo(trial);
      expect(info.status).toBe('active_sustained');
      expect(info.isInterpolated).toBe(false);
      expect(info.effectiveDays).toBe(28);
    });

    it('does not grant fallback days to ineffective treatments that fail from Day 1', () => {
      const trial = {
        EfficacyDataJSON: JSON.stringify([
          { daa: 0, weedCover: 100 },
          { daa: 7, controlPct: 40 }, // already failed < 70%
          { daa: 14, controlPct: 30 }
        ])
      };

      const days = calculateEffectiveControlDays(trial);
      expect(days).toBe(0);

      const info = getDetailedControlDaysInfo(trial);
      expect(info.status).toBe('breakdown_regrowth');
      expect(info.effectiveDays).toBe(0);
    });
  });

  // ── 2. RATINGS: European Weed Research Society (EWRS 1-9) & EPPO ───
  describe('Ratings: EWRS 1-9 Scale and Adaptive EPPO Ratings', () => {
    it('maps efficacy percentage to correct EWRS 1-9 scale grade', () => {
      expect(getEWRSScale(100).score).toBe(1);
      expect(getEWRSScale(97).score).toBe(2);
      expect(getEWRSScale(92).score).toBe(3);
      expect(getEWRSScale(85).score).toBe(4);
      expect(getEWRSScale(75).score).toBe(5);
      expect(getEWRSScale(60).score).toBe(6);
      expect(getEWRSScale(40).score).toBe(7);
      expect(getEWRSScale(25).score).toBe(8);
      expect(getEWRSScale(0).score).toBe(9);
    });

    it('converts herbicide efficacy to EPPO 4-tier rating standard', () => {
      expect(getRatingFromEfficacy('herbicide', 95)).toBe('Excellent');
      expect(getRatingFromEfficacy('herbicide', 75)).toBe('Good');
      expect(getRatingFromEfficacy('herbicide', 65)).toBe('Fair');
      expect(getRatingFromEfficacy('herbicide', 40)).toBe('Poor');
    });
  });

  // ── 3. WEED IDENTIFICATION: Multi-language Botanical Taxonomy & EPPO ───
  describe('Weed Identification: Multi-language Taxonomy, Biology, & EPPO Codes', () => {
    it('canonicalizes Indian vernacular and common names to standard binomials', () => {
      expect(canonicalizeWeedSpecies('motha')).toBe('Purple Nutsedge (Cyperus rotundus)');
      expect(canonicalizeWeedSpecies('sanwa')).toBe('Barnyard Grass (Echinochloa crus-galli)');
      expect(canonicalizeWeedSpecies('gulli danda')).toBe('Little Seed Canary Grass (Phalaris minor)');
      expect(canonicalizeWeedSpecies('bathua')).toBe('Common Lambsquarters (Chenopodium album)');
      expect(canonicalizeWeedSpecies('doob grass')).toBe('Bermuda Grass (Cynodon dactylon)');
      expect(canonicalizeWeedSpecies('kankawwa')).toBe('Tropical Spiderwort (Commelina benghalensis)');
      expect(canonicalizeWeedSpecies('makoi')).toBe('Black Nightshade (Solanum nigrum)');
    });

    it('identifies biological classification, perennial lifecycle, and regrowth risk', () => {
      const mothaBio = getWeedBiology('Purple Nutsedge (Cyperus rotundus)');
      expect(mothaBio.type).toBe('Sedge');
      expect(mothaBio.isPerennial).toBe(true);
      expect(mothaBio.regrowthRisk).toBe(true);
      expect(mothaBio.eppoCode).toBe('CYPRO');

      const doobBio = getWeedBiology('Bermuda Grass (Cynodon dactylon)');
      expect(doobBio.type).toBe('Grass');
      expect(doobBio.isPerennial).toBe(true);
      expect(doobBio.regrowthRisk).toBe(true);
      expect(doobBio.eppoCode).toBe('CYNDA');

      const bathuaBio = getWeedBiology('Common Lambsquarters (Chenopodium album)');
      expect(bathuaBio.type).toBe('Broadleaf');
      expect(bathuaBio.isPerennial).toBe(false);
      expect(bathuaBio.regrowthRisk).toBe(false);
      expect(bathuaBio.eppoCode).toBe('CHEAL');
    });

    it('looks up standard EPPO codes for weed catalog', () => {
      expect(getWeedEPPOCode('Cyperus rotundus')).toBe('CYPRO');
      expect(getWeedEPPOCode('Phalaris minor')).toBe('PHAMI');
      expect(getWeedEPPOCode('Echinochloa colona')).toBe('ECHCO');

      const searchResults = lookupEPPO('Motha');
      expect(searchResults.some(r => r.code === 'CYPRO')).toBe(true);
    });
  });

});
