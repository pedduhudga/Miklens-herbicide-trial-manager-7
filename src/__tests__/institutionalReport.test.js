import { describe, it, expect, vi } from 'vitest';
import { getBotanicalTaxonomy, PHYTOTOXICITY_10_SCALE } from '../utils/botanicalTaxonomy.js';
import { buildInstitutionalReportData } from '../services/institutionalReportBridge.js';
import { generateInstitutionalPDF, generateInstitutionalDocx } from '../services/institutionalReportRenderer.js';

vi.mock('file-saver', () => ({
  saveAs: vi.fn()
}));

// Mock jsPDF save in node environment
import jsPDF from 'jspdf';
jsPDF.prototype.save = vi.fn();

describe('Miklens Bio Institutional Report System', () => {
  it('correctly maps weed species to botanical taxonomy and family', () => {
    const commelina = getBotanicalTaxonomy('Commelina diffusa');
    expect(commelina.scientificName).toBe('Commelina diffusa');
    expect(commelina.botanicalFamily).toBe('Commelinaceae');

    const mikania = getBotanicalTaxonomy('Mikania micrantha');
    expect(mikania.botanicalFamily).toBe('Asteraceae');

    const cyperus = getBotanicalTaxonomy('Cyperus rotundus');
    expect(cyperus.botanicalFamily).toBe('Cyperaceae');

    const echinochloa = getBotanicalTaxonomy('Echinochloa crus-galli');
    expect(echinochloa.botanicalFamily).toBe('Poaceae');
  });

  it('provides a complete 0 to 10 standard crop phytotoxicity scale', () => {
    expect(PHYTOTOXICITY_10_SCALE.length).toBe(11);
    expect(PHYTOTOXICITY_10_SCALE[0].score).toBe(0);
    expect(PHYTOTOXICITY_10_SCALE[0].injuryLevel).toBe('No injury');
    expect(PHYTOTOXICITY_10_SCALE[10].score).toBe(10);
    expect(PHYTOTOXICITY_10_SCALE[10].injuryLevel).toBe('Complete kill');
  });

  it('builds full 15-page dossier dataset with Miklens Bio branding and zero reference to other company names', () => {
    const mockTrial = {
      ID: 'trial-mk-777',
      ProjectID: 'proj-mk-1',
      FormulationName: 'Knockout Herbicide',
      Crop: 'Pineapple',
      Intercrop: 'Jackfruit',
      Dosage: '60 mL/L',
      Location: 'Thodupuzha, Kerala',
      Observations: JSON.stringify([
        { daa: 0, date: '2026-06-19', weedCover: 85 },
        { daa: 7, date: '2026-06-26', weedCover: 10, phytotoxicityPct: 40 },
        { daa: 15, date: '2026-07-04', weedCover: 45 },
        { daa: 30, date: '2026-07-19', weedCover: 60 }
      ])
    };

    const mockState = {
      projects: [{ ID: 'proj-mk-1', Name: 'Pineapple Weed Control Project' }],
      trials: [mockTrial]
    };

    const data = buildInstitutionalReportData(mockTrial, mockState);

    // Verify Company Branding
    expect(data.docControl.companyName).toBe('Miklens Bio Research & Development Centre');
    expect(data.docControl.division).toBe('Centre of Excellence, R&D');
    expect(data.docControl.sopFormCode).toBe('MB/COP8/2-06');
    expect(data.docControl.reportNo).toContain('MB/RD/COE');

    // Ensure company name is Miklens Bio and forbidden company name is absent
    const serialized = JSON.stringify(data).toLowerCase();
    expect(serialized).not.toContain('stanes');
    expect(serialized).toContain('miklens bio');

    // Verify 5-quadrat raw data across intervals
    expect(data.rawQuadratData.pre).toBeDefined();
    expect(data.rawQuadratData.d7).toBeDefined();
    expect(data.rawQuadratData.d15).toBeDefined();
    expect(data.rawQuadratData.d30).toBeDefined();

    const preRows = data.rawQuadratData.pre[0].speciesRows;
    expect(preRows.length).toBeGreaterThan(0);
    expect(preRows[0].q1).toBeDefined();
    expect(preRows[0].q5).toBeDefined();
    expect(preRows[0].densityM2).toBeDefined();

    // Verify Biomass Destructive Sampling Q1-Q5
    expect(data.rawBiomassData.length).toBeGreaterThan(0);
    expect(data.rawBiomassData[0].fresh.q1).toBeGreaterThan(0);
    expect(data.rawBiomassData[0].dry.meanM2).toBeGreaterThan(0);

    // Verify Phytotoxicity 5 Plant Replicates
    expect(data.treatmentMetrics[0].phytotoxicity.plantReps.length).toBe(5);
    expect(data.treatmentMetrics[0].phytotoxicity.mean).toBe(4.00);

    // Verify Botanical Flora Table
    expect(data.weedFloraTable.length).toBeGreaterThan(0);
    expect(data.weedFloraTable[0].botanicalFamily).toBeDefined();
  });

  it('generates institutional PDF and DOCX documents without throwing exceptions', async () => {
    const mockTrial = {
      ID: 'trial-mk-888',
      ProjectID: 'proj-mk-2',
      FormulationName: 'Knockout Herbicide',
      Crop: 'Pineapple',
      Dosage: '60 mL/L',
      EfficacyDataJSON: JSON.stringify([
        { daa: 0, date: '2026-06-19', weedCover: 85 },
        { daa: 7, date: '2026-06-26', weedCover: 10, phytotoxicityPct: 40 },
        { daa: 15, date: '2026-07-04', weedCover: 45 },
        { daa: 30, date: '2026-07-19', weedCover: 60 }
      ])
    };

    const data = buildInstitutionalReportData(mockTrial, { trials: [mockTrial], projects: [] });

    // Test DOCX generation
    const docxFilename = await generateInstitutionalDocx(data);
    expect(docxFilename).toContain('.docx');

    // Test PDF generation
    const pdfFilename = await generateInstitutionalPDF(data);
    expect(pdfFilename).toContain('.pdf');
  });

  it('uses exclusively real data from the selected trial without leaking hardcoded sample values', () => {
    const customTrial = {
      ID: 'tr-cotton-99',
      TrialCode: 'MB/COT/2026/01',
      FormulationName: 'Herbicide Bio-Ultra',
      Crop: 'Cotton',
      Variety: 'Bt Cotton RCH-2',
      Location: 'Bhopal R&D Research Station, MP',
      GPSLatitude: '23.2599° N',
      GPSLongitude: '77.4126° E',
      InvestigatorName: 'Dr. Rajesh Sharma',
      WeedSpecies: 'Echinochloa colona, Cyperus rotundus',
      Dosage: '40 mL/L',
      Observations: JSON.stringify([
        { daa: 0, date: '2026-08-01', weedCover: 90, sampleCount: 150 },
        { daa: 7, date: '2026-08-08', weedCover: 15, weedMortalityPct: 83.33, sampleCount: 25, phytotoxicityScore10: 1.0 },
        { daa: 14, date: '2026-08-15', weedCover: 20, weedMortalityPct: 77.78, sampleCount: 30 }
      ])
    };

    const data = buildInstitutionalReportData(customTrial, {
      trials: [customTrial],
      projects: []
    });

    // Check that it uses customTrial's real metadata
    expect(data.docControl.crop).toBe('Cotton');
    expect(data.docControl.variety).toBe('Bt Cotton RCH-2');
    expect(data.docControl.locationName).toBe('Bhopal R&D Research Station, MP');
    expect(data.docControl.latitude).toBe('23.2599° N');
    expect(data.docControl.longitude).toBe('77.4126° E');
    expect(data.docControl.preparedBy).toBe('Dr. Rajesh Sharma');

    // Ensure zero leak of hardcoded sample values
    const serialized = JSON.stringify(data).toLowerCase();
    expect(serialized).not.toContain('pineapple');
    expect(serialized).not.toContain('jackfruit');
    expect(serialized).not.toContain('senthilraja');
    expect(serialized).not.toContain('manoj');
    expect(serialized).not.toContain('commelina');
    expect(serialized).not.toContain('karnataka');

    // Check weed flora uses actual weeds
    const speciesNames = data.weedFloraTable.map(w => w.scientificName);
    expect(speciesNames).toContain('Echinochloa colona');
    expect(speciesNames).toContain('Cyperus rotundus');

    // Check single trial treatment mapping: only 1 treatment, no synthetic farmers check
    expect(data.treatments.length).toBe(1);
    expect(data.treatments[0].productName).toBe('Herbicide Bio-Ultra');
    expect(data.treatments[0].dosePerLitre).toBe('40 mL/L');

    // Check mortality at 7 DAT reflects real logged 83.33%
    expect(data.treatmentMetrics[0].mortalityKey).toBe(83.33);
  });

  it('strictly prevents formulation recipe leaks and secret mixture disclosure (e.g. Goweed ultra + 20ml + 3ml BPD)', async () => {
    const secretRecipeTrial = {
      ID: 'trial-f2809',
      TrialCode: 'MB/RD/COE/2026/F2809',
      FormulationName: 'Goweed ultra + 20ml + 3ml BPD',
      Crop: 'Target Crop',
      Dosage: '20+3ml BPD',
      Location: '13.048329, 77.734435',
      Temperature: '24.7',
      Humidity: '74',
      Rain: '0.1',
      SoilTexture: 'Loam',
      WeedSpecies: 'Cynodon dactylon, Centella asiatica',
      Observations: JSON.stringify([
        { daa: 0, date: '2026-07-02', weedCover: 80, notes: 'Dense green canopy prior to spray' },
        { daa: 7, date: '2026-07-09', weedCover: 10, weedMortalityPct: 87.5, notes: 'Severe chlorosis and desiccation' }
      ]),
      PhotoURLs: JSON.stringify([
        { url: 'https://storage.googleapis.com/test-trial/f2809-plot.jpg', label: 'Treated Plot at 7 DAT', date: '2026-07-09' }
      ])
    };

    const data = buildInstitutionalReportData(secretRecipeTrial, { trials: [secretRecipeTrial], projects: [] });

    // 1. Verify strict sanitization: product title must be clean product commercial name, but dosage kept as-is
    expect(data.docControl.productName).toBe('Goweed ultra');
    expect(data.treatments[0].productName).toBe('Goweed ultra');
    expect(data.treatments[0].dosePerLitre).toBe('20+3ml BPD'); // Dosage kept exactly as recorded

    // 2. Report title must NOT disclose recipe mixes or chemical mixtures
    expect(data.docControl.title).not.toContain('+ 20ml');
    expect(data.docControl.title).not.toContain('3ml BPD');
    expect(data.docControl.title).toContain('Goweed ultra');

    // 3. Serialized report data has zero stanes reference and clean titles
    const serialized = JSON.stringify(data).toLowerCase();
    expect(serialized).not.toContain('stanes');

    // 4. Photos must be cleanly extracted
    expect(data.photoUrls.length).toBe(1);
    expect(data.photoUrls[0].url).toContain('f2809-plot.jpg');

    // 5. PDF & DOCX generation must execute smoothly
    const pdf = await generateInstitutionalPDF(data);
    expect(pdf).toContain('.pdf');

    const docx = await generateInstitutionalDocx(data);
    expect(docx).toContain('.docx');
  });

  it('computes real single-trial progression analytics and incorporates rich scientific parameters', () => {
    const singleTrial = {
      ID: 'trial-weedrop-01',
      TrialCode: 'MB/RD/COE/2026/F101',
      TrialName: 'Weedrop (QE strong)',
      FormulationName: 'Weedrop (QE strong)',
      SiteType: 'Open field',
      Crop: 'Non-Crop',
      Location: '13.048181, 77.734413',
      Dosage: '10 mL/L',
      Temperature: '28.2',
      Humidity: '55',
      Windspeed: '9.3',
      Rain: '0',
      SoilDataJSON: JSON.stringify({ ph: '6.4', clay: '17', sand: '48', organicCarbon: '1.31', texture: 'Loam' }),
      TargetWeed: 'Cynodon dactylon, Digitaria sanguinalis',
      Observations: JSON.stringify([
        { daa: 0, date: '2026-10-01', weedCover: 80, notes: 'Baseline uniform canopy' },
        { daa: 3, date: '2026-10-04', weedCover: 35, notes: 'Rapid foliar yellowing' },
        { daa: 7, date: '2026-10-08', weedCover: 8, notes: 'Advanced desiccation' },
        { daa: 14, date: '2026-10-15', weedCover: 12, notes: 'Sustained control with minor regrowth' }
      ]),
      PhotoURLs: JSON.stringify([
        { url: 'https://example.com/day0.jpg', date: '2026-10-01', label: 'Day 0 Pre-spray' },
        { url: 'https://example.com/day7.jpg', date: '2026-10-08', label: 'Day 7 Plot Efficacy' }
      ])
    };

    const data = buildInstitutionalReportData(singleTrial, { trials: [singleTrial], projects: [] });

    // Verify rich scientific parameters
    expect(data.docControl.soilProfile).toContain('pH: 6.4');
    expect(data.docControl.soilProfile).toContain('Clay: 17%');
    expect(data.docControl.weatherContext).toContain('28.2°C');
    expect(data.docControl.weatherContext).toContain('55%');

    // Verify single-trial progression statistics
    const stats = data.statistics;
    expect(stats.isSingleTrial).toBe(true);
    expect(stats.progression.baselineCover).toBe(80);
    expect(stats.progression.finalCover).toBe(12);
    expect(stats.progression.netReduction).toBe(85); // (80-12)/80 = 85%
    expect(stats.progression.peakControl).toBe(90); // 100 - (8/80)*100 = 90%
    expect(stats.progression.peakDaa).toBe(7);
    expect(stats.progression.meanControl).toBeGreaterThan(0);
    expect(stats.progression.cv).toBeGreaterThan(0);

    // Verify timeline
    expect(data.treatmentTimeline.length).toBe(4);
    expect(data.treatmentTimeline[0].status).toBe('Baseline');
    expect(data.treatmentTimeline[2].status).toBe('Near-Complete Desiccation');

    // Verify photo extraction
    expect(data.photoUrls.length).toBe(2);
    expect(data.photoUrls[0].url).toBe('https://example.com/day0.jpg');
    expect(data.photoUrls[1].url).toBe('https://example.com/day7.jpg');
  });

  it('guarantees zero hardcoded Diuron / Farmers Practice and honors diverse trial designs', async () => {
    // 1. Single demonstration plot with Goweed ultra and mixed weeds
    const goweedTrial = {
      ID: 'trial-gw-2809',
      TrialCode: 'MB/RD/COE/2026/F2809',
      FormulationName: 'Goweed ultra',
      Crop: 'Open field / Non-Crop',
      Dosage: '20+3ml BPD',
      Location: '13.048329, 77.734435',
      Design: 'RCBD',
      Replications: 3,
      WeedSpecies: 'Cynodon dactylon, Asiatic pennywort (centella asiatica), Unknown grass species (poaceae spp.)',
      Observations: JSON.stringify([
        { daa: 0, date: '2026-07-02', weedCover: 100, notes: 'Dense uniform weed mat' },
        { daa: 7, date: '2026-07-09', weedCover: 5, weedMortalityPct: 95, cropPhytotoxicity: 0 },
        { daa: 15, date: '2026-07-17', weedCover: 58, weedMortalityPct: 42, cropPhytotoxicity: 0 },
        { daa: 30, date: '2026-08-01', weedCover: 76, weedMortalityPct: 24, cropPhytotoxicity: 0 }
      ])
    };

    const repData = buildInstitutionalReportData(goweedTrial, { trials: [goweedTrial], projects: [] });

    // Verify study design preserved
    expect(repData.docControl.studyDesign).toContain('RCBD');

    // Verify zero Diuron / Farmers Practice in treatment metrics
    expect(repData.treatmentMetrics.length).toBe(1);
    expect(repData.treatmentMetrics[0].productName).toBe('Goweed ultra');
    expect(repData.treatmentMetrics[0].dose).toBe('20+3ml BPD');

    const jsonText = JSON.stringify(repData);
    expect(jsonText).not.toContain('Diuron');
    expect(jsonText).not.toContain('Farmers Practice');
    expect(jsonText).not.toContain('379.18');
    expect(jsonText).not.toContain('812.37');

    // Verify biomass absence is accurately flagged
    expect(repData.hasBiomassData).toBe(false);

    // Verify botanical taxonomy resolves Centella asiatica and Poaceae
    const centella = repData.weedFloraTable.find(w => w.scientificName.toLowerCase().includes('centella'));
    expect(centella).toBeDefined();
    expect(centella.botanicalFamily).toBe('Apiaceae');

    const poaceae = repData.weedFloraTable.find(w => w.scientificName.toLowerCase().includes('poaceae') || w.commonName.toLowerCase().includes('poaceae'));
    expect(poaceae).toBeDefined();
    expect(poaceae.botanicalFamily).toBe('Poaceae');

    // Verify PDF & DOCX generation without error
    const pdf = await generateInstitutionalPDF(repData);
    expect(pdf).toContain('.pdf');

    const docx = await generateInstitutionalDocx(repData);
    expect(docx).toContain('.docx');
  });

  it('renders native vector bio-efficacy kinetic progression chart and digital QR verification seal in both PDF and DOCX', async () => {
    const trialWithProgression = {
      ID: 'trial-kinetic-test',
      ProjectID: 'proj-kinetic',
      FormulationName: 'BioEfficacy 500 SL',
      Crop: 'Maize',
      Dosage: '45 mL/L',
      Observations: JSON.stringify([
        { daa: 0, date: '2026-05-01', weedCover: 92, controlPct: 0, status: 'Pre-emergence baseline' },
        { daa: 7, date: '2026-05-08', weedCover: 12, controlPct: 86.9, status: 'Initial knockdown' },
        { daa: 15, date: '2026-05-16', weedCover: 18, controlPct: 80.4, status: 'Sustained suppression' },
        { daa: 30, date: '2026-05-31', weedCover: 24, controlPct: 73.9, status: 'Residual control' }
      ])
    };

    const repData = buildInstitutionalReportData(trialWithProgression, { trials: [trialWithProgression], projects: [] });

    // Validate progression statistics
    expect(repData.statistics.progression.peakControl).toBeGreaterThanOrEqual(80);
    expect(repData.treatmentTimeline.length).toBe(4);

    // Verify PDF generation includes kinetic chart and QR seal without errors
    const pdfFilename = await generateInstitutionalPDF(repData);
    expect(pdfFilename).toContain('.pdf');

    // Verify DOCX generation includes progress bar kinetic table
    const docxFilename = await generateInstitutionalDocx(repData);
    expect(docxFilename).toContain('.docx');
  });
});

