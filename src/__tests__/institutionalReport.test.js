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
});
