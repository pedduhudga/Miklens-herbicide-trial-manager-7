import { describe, it, expect } from 'vitest';
import { identifyHrac, identifyMoA, analyzeFormulationSynergy } from '../utils/hracSynergy.js';
import { HRAC_DATABASE, FRAC_DATABASE, IRAC_DATABASE } from '../utils/agrochemicalMoaDatabase.js';

describe('Global Mode of Action (MoA) & Chemical Interaction Engine', () => {
  // ─── 1. HRAC Herbicide Resistance Action Committee ───
  describe('HRAC Global 2024 Classification', () => {
    it('accurately identifies HRAC groups for major herbicide active ingredients', () => {
      const gly = identifyHrac('Glyphosate 41% SL');
      const aux = identifyHrac('2,4-D Ethyl Ester');
      const gram = identifyHrac('Clethodim 240 EC');
      const glu = identifyHrac('Glufosinate Ammonium 13.5%');
      const ppo = identifyHrac('Oxyfluorfen 23.5% EC');
      const hppd = identifyHrac('Mesotrione 480 SC');
      const vlcfa = identifyHrac('S-Metolachlor 960 EC');
      const bio = identifyHrac('Pelargonic Acid');

      expect(gly.group).toBe('HRAC 9');
      expect(gly.wssa).toBe('Group 9');
      expect(gly.committee).toBe('HRAC');
      expect(gly.targetSite).toContain('EPSP synthase');

      expect(aux.group).toBe('HRAC 4');
      expect(aux.wssa).toBe('Group 4');

      expect(gram.group).toBe('HRAC 1');
      expect(gram.wssa).toBe('Group 1');

      expect(glu.group).toBe('HRAC 10');
      expect(glu.wssa).toBe('Group 10');

      expect(ppo.group).toBe('HRAC 14');
      expect(hppd.group).toBe('HRAC 27');
      expect(vlcfa.group).toBe('HRAC 15');
      expect(bio.group).toBe('HRAC 0');
    });

    it('detects Group 1 + Group 4 herbicide antagonism risk', () => {
      const tankMix = [
        { name: 'Clethodim 240 EC', quantity: 2, unit: 'ml' },
        { name: '2,4-D Amine Salt', quantity: 3, unit: 'ml' }
      ];

      const analysis = analyzeFormulationSynergy(tankMix, 'herbicide');

      expect(analysis.isMultiMoa).toBe(true);
      expect(analysis.hasAntagonism).toBe(true);
      expect(analysis.antagonismAlerts.length).toBeGreaterThan(0);
      expect(analysis.antagonismAlerts[0].title).toContain('Antagonism');
    });

    it('identifies synergistic multi-site herbicide combinations', () => {
      const synergisticMix = [
        { name: 'Glyphosate 41% SL', quantity: 10, unit: 'ml' },
        { name: 'Oxyfluorfen 23.5% EC', quantity: 2, unit: 'ml' }
      ];

      const analysis = analyzeFormulationSynergy(synergisticMix, 'herbicide');

      expect(analysis.uniqueGroups).toContain('9');
      expect(analysis.uniqueGroups).toContain('14');
      expect(analysis.multiSiteScore).toContain('Dual MOA');
      expect(analysis.badgeLabel).toBe('HRAC 9+14');
    });
  });

  // ─── 2. FRAC Fungicide Resistance Action Committee ───
  describe('FRAC 2024 Fungicide Classification', () => {
    it('accurately identifies FRAC groups across single-site and multi-site fungicides', () => {
      const stroby = identifyMoA('Azoxystrobin 23% SC', 'fungicide');
      const triazole = identifyMoA('Tebuconazole 25.9% EC', 'fungicide');
      const sdhi = identifyMoA('Fluxapyroxad 300 SC', 'fungicide');
      const oomycete = identifyMoA('Metalaxyl 35% WS', 'fungicide');
      const mancozeb = identifyMoA('Mancozeb 75% WP', 'fungicide');
      const chlorothalonil = identifyMoA('Chlorothalonil 720 SC', 'fungicide');
      const copper = identifyMoA('Copper Oxychloride 50 WP', 'fungicide');

      expect(stroby.code).toBe('FRAC 11');
      expect(stroby.committee).toBe('FRAC');
      expect(stroby.name).toContain('QoI');
      expect(stroby.resistanceRisk).toContain('High');

      expect(triazole.code).toBe('FRAC 3');
      expect(triazole.committee).toBe('FRAC');
      expect(triazole.chemicalFamily).toBe('Triazole');

      expect(sdhi.code).toBe('FRAC 7');
      expect(oomcete.code).toBe('FRAC 4');

      expect(mancozeb.code).toBe('FRAC M03');
      expect(mancozeb.resistanceRisk).toContain('Low');

      expect(chlorothalonil.code).toBe('FRAC M05');
      expect(copper.code).toBe('FRAC M01');
    });

    it('identifies FRAC 11 (QoI) + FRAC 3 (DMI) and Multi-Site synergy in fungicides', () => {
      const fungicideMix = [
        { name: 'Azoxystrobin 18.2%', quantity: 1, unit: 'ml' },
        { name: 'Difenoconazole 11.4%', quantity: 1, unit: 'ml' },
        { name: 'Mancozeb 75% WP', quantity: 2, unit: 'g' }
      ];

      const analysis = analyzeFormulationSynergy(fungicideMix, 'fungicide');

      expect(analysis.committee).toBe('FRAC');
      expect(analysis.uniqueGroups).toContain('11');
      expect(analysis.uniqueGroups).toContain('3');
      expect(analysis.uniqueGroups).toContain('M03');
      expect(analysis.isMultiMoa).toBe(true);
      expect(analysis.multiSiteScore).toContain('Triple MOA');
      expect(analysis.synergies.length).toBeGreaterThan(0);
      expect(analysis.badgeLabel).toBe('FRAC 11+3+M03');
    });
  });

  // ─── 3. IRAC Insecticide Resistance Action Committee ───
  describe('IRAC 2024 Insecticide / Pesticide Classification', () => {
    it('accurately identifies IRAC groups across neuromuscular, metabolic, and IGR classes', () => {
      const diamide = identifyMoA('Chlorantraniliprole 18.5% SC', 'pesticide');
      const neonic = identifyMoA('Imidacloprid 17.8% SL', 'pesticide');
      const pyrethroid = identifyMoA('Lambda-cyhalothrin 5% EC', 'pesticide');
      const avermectin = identifyMoA('Emamectin Benzoate 5% SG', 'pesticide');
      const spinosyn = identifyMoA('Spinetoram 11.7% SC', 'pesticide');
      const fipronil = identifyMoA('Fipronil 5% SC', 'pesticide');
      const op = identifyMoA('Chlorpyrifos 20% EC', 'pesticide');
      const bio = identifyMoA('Azadirachtin 10000 ppm', 'pesticide');

      expect(diamide.code).toBe('IRAC 28');
      expect(diamide.committee).toBe('IRAC');
      expect(diamide.name).toContain('Ryanodine');

      expect(neonic.code).toBe('IRAC 4A');
      expect(pyrethroid.code).toBe('IRAC 3A');
      expect(avermectin.code).toBe('IRAC 6');
      expect(spinosyn.code).toBe('IRAC 5');
      expect(fipronil.code).toBe('IRAC 2B');
      expect(op.code).toBe('IRAC 1B');
      expect(bio.code).toBe('IRAC UNE');
    });

    it('identifies IRAC 28 (Diamide) + IRAC 4A (Neonicotinoid) broad-spectrum dual synergy', () => {
      const insecticideMix = [
        { name: 'Chlorantraniliprole 18.5% SC', quantity: 0.5, unit: 'ml' },
        { name: 'Thiamethoxam 25% WG', quantity: 0.5, unit: 'g' }
      ];

      const analysis = analyzeFormulationSynergy(insecticideMix, 'pesticide');

      expect(analysis.committee).toBe('IRAC');
      expect(analysis.uniqueGroups).toContain('28');
      expect(analysis.uniqueGroups).toContain('4A');
      expect(analysis.isMultiMoa).toBe(true);
      expect(analysis.badgeLabel).toBe('IRAC 28+4A');
      expect(analysis.synergies.some(s => s.title.includes('Dual Feeding Mode'))).toBe(true);
    });
  });

  // ─── 4. Adjuvant & Tank-mix Conditioner Support ───
  describe('Adjuvants & Penetrants Identification', () => {
    it('accurately identifies non-ionic surfactants, organosilicones, and water conditioners', () => {
      const sil = identifyMoA('Organosilicone Super-Spreader');
      const surf = identifyMoA('Non-Ionic Surfactant 80/20');
      const ams = identifyMoA('Ammonium Sulfate Conditioner');

      expect(sil.committee).toBe('Adjuvant');
      expect(sil.targetSite).toContain('surface tension');
      expect(surf.committee).toBe('Adjuvant');
      expect(ams.committee).toBe('Adjuvant');
      expect(ams.targetSite).toContain('Sequester hard water');
    });
  });
});
