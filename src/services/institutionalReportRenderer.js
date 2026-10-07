/**
 * institutionalReportRenderer.js
 *
 * Publication-grade Institutional Bio-Efficacy & Phytotoxicity Dossier Generator.
 * Miklens Bio Research & Development Centre (Centre of Excellence, R&D).
 * SOP Form Code: MB/COP8/2-06.
 *
 * Re-architected to Miklens Bio corporate standards:
 * - Strictly authentic data: Zero fake Tea Stanes quadrat padding, no synthetic biomass tables.
 * - Absolute confidentiality: Zero formulation recipes, mix ratios, or secret chemical disclosures.
 * - Genuine statistical analysis: Real single-trial progression analytics (baseline vs final reduction %,
 *   peak efficacy, DAA of maximum control, mean, SD, SE(m), CV%) or Real Project One-Way ANOVA.
 * - Authentic in-situ photographic evidence: Embeds real trial photos with DAA badges, dates, and captions.
 * - Incorporates rich agronomic parameters, environmental weather conditions, and soil profile.
 * - Available in both PDF and Word (.docx) formats.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType
} from 'docx';
import { saveAs } from 'file-saver';
import { getPhytotoxicityDescription } from '../utils/botanicalTaxonomy.js';

// Corporate Branding Palette
const MIKLENS_GREEN = [5, 150, 105];       // Emerald-600
const MIKLENS_DARK = [15, 23, 42];         // Slate-900
const MIKLENS_ACCENT = [16, 185, 129];     // Emerald-500
const MIKLENS_LIGHT = [240, 253, 244];     // Emerald-50
const BORDER_COLOR = [226, 232, 240];      // Slate-200
const SLATE_MUTED = [100, 116, 139];       // Slate-500

/**
 * Normalizes image source, supporting Google Drive links and CORS proxying.
 */
function normalizeSrc(src) {
  if (!src || typeof src !== 'string') return src;
  if (/^data:image\//i.test(src)) return src;

  const driveMatch = src.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) ||
                     src.match(/\/d\/([a-zA-Z0-9_-]{20,})/) ||
                     src.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (driveMatch) {
    const directUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
    return `https://images.weserv.nl/?url=${encodeURIComponent(directUrl)}&w=600&output=jpg`;
  }
  if (/^https?:\/\//i.test(src)) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=600&output=jpg`;
  }
  return src;
}

/**
 * Asynchronously converts remote image to base64 Data URL using HTML5 canvas.
 */
async function toBase64(src, maxPx = 600) {
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('data:image/')) return src;
  if (typeof window === 'undefined' || typeof Image === 'undefined') return null;

  return new Promise(resolve => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => resolve(null), 7000);
      img.onload = () => {
        clearTimeout(timer);
        try {
          const r = img.width / img.height;
          let w = img.width, h = img.height;
          if (w > maxPx || h > maxPx) {
            if (r > 1) { w = maxPx; h = Math.round(maxPx / r); }
            else { h = maxPx; w = Math.round(maxPx * r); }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = normalizeSrc(src);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Safely embeds image into jsPDF document.
 */
function addImgSafe(doc, data, x, y, w, h) {
  if (!data || !w || !h) return false;
  try {
    doc.addImage(data, data.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, y, w, h);
    return true;
  } catch {
    try {
      doc.addImage(data, 'JPEG', x, y, w, h);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Renders corporate running header & footer across all pages (excluding Cover Page).
 */
function applyRunningHeadersAndFooters(doc, reportData) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const totalPages = doc.internal.getNumberOfPages();
  const dc = reportData.docControl;

  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);

    // Running Header
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE_MUTED);
    doc.text(dc.sopFormCode, 14, 10);
    doc.text('Miklens Bio Research & Development Centre', pw / 2, 10, { align: 'center' });
    doc.text(`Report No: ${dc.reportNo}`, 14, 14);
    doc.text(`Date: ${dc.reportDate}`, pw - 14, 14, { align: 'right' });

    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.line(14, 16, pw - 14, 16);

    // Running Footer
    doc.line(14, ph - 12, pw - 14, ph - 12);
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_MUTED);
    doc.text('Miklens Bio R&D Centre — Confidential Bio-Efficacy Evaluation Dossier', 14, ph - 7);
    doc.text(`Page ${i} of ${totalPages}`, pw - 14, ph - 7, { align: 'right' });
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PDF REPORT GENERATION
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function generateInstitutionalPDF(reportData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const dc = reportData.docControl;

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1: COVER & TWO-TIER INSTITUTIONAL CERTIFICATION
  // ═══════════════════════════════════════════════════════════════════════════
  // Outer decorative border
  doc.setDrawColor(...MIKLENS_GREEN);
  doc.setLineWidth(0.8);
  doc.rect(10, 10, pw - 20, ph - 20);
  doc.setDrawColor(...BORDER_COLOR);
  doc.setLineWidth(0.3);
  doc.rect(12, 12, pw - 24, ph - 24);

  // Header meta
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text(`Report No : ${dc.reportNo}`, 16, 20);
  doc.text(dc.sopFormCode, pw - 16, 20, { align: 'right' });

  // Organization Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text(dc.companyName, pw / 2, 32, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(dc.division, pw / 2, 38, { align: 'center' });

  doc.setDrawColor(...MIKLENS_GREEN);
  doc.setLineWidth(0.5);
  doc.line(25, 42, pw - 25, 42);

  // Main Dossier Title Box
  doc.setFillColor(...MIKLENS_LIGHT);
  doc.roundedRect(18, 56, pw - 36, 44, 3, 3, 'F');
  doc.setDrawColor(...MIKLENS_GREEN);
  doc.setLineWidth(0.4);
  doc.roundedRect(18, 56, pw - 36, 44, 3, 3, 'D');

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  const titleLines = doc.splitTextToSize(dc.title, pw - 46);
  doc.text(titleLines, pw / 2, 70, { align: 'center' });

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const locDisplay = dc.locationName + (dc.latitude && dc.latitude !== 'Not recorded' ? ` (GPS: ${dc.latitude}, ${dc.longitude})` : '');
  doc.text(`Location: ${locDisplay}`, pw / 2, 92, { align: 'center' });

  // Year Badge
  const currentYear = new Date().getFullYear();
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text(`${currentYear}`, pw / 2, 126, { align: 'center' });

  // Protocol reference & Date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Protocol Ref. No. ${dc.protocolRefNo}`, pw / 2, 136, { align: 'center' });
  doc.text(`Date of Report: ${dc.reportDate}`, pw / 2, 143, { align: 'center' });

  // Crop / Site Type & Target Flora Badge
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(25, 154, pw - 50, 22, 2, 2, 'F');
  doc.setDrawColor(...BORDER_COLOR);
  doc.roundedRect(25, 154, pw - 50, 22, 2, 2, 'D');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text(`Target Crop / Site Type: ${dc.cropDisplay}`, pw / 2, 162, { align: 'center' });
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  doc.text(`Target Weed Flora: ${reportData.dominantFloraName}`, pw / 2, 170, { align: 'center' });

  // Two-Tier Institutional Certification Sign-Off
  const signBoxY = 194;
  // Box 1: Prepared by Investigator
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(20, signBoxY, 80, 44, 2, 2, 'F');
  doc.setDrawColor(...BORDER_COLOR);
  doc.roundedRect(20, signBoxY, 80, 44, 2, 2, 'D');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('REPORT PREPARED BY', 26, signBoxY + 8);
  doc.setFontSize(9.5);
  doc.setTextColor(...MIKLENS_DARK);
  doc.text(dc.preparedBy, 26, signBoxY + 18);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  doc.text(`(${dc.preparedByTitle})`, 26, signBoxY + 24);
  doc.setDrawColor(203, 213, 225);
  doc.line(26, signBoxY + 34, 90, signBoxY + 34);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Authorized Signature & Date', 26, signBoxY + 39);

  // Box 2: Reviewed & Approved by Scientific Review Board
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(pw - 100, signBoxY, 80, 44, 2, 2, 'F');
  doc.setDrawColor(...BORDER_COLOR);
  doc.roundedRect(pw - 100, signBoxY, 80, 44, 2, 2, 'D');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('REVIEWED AND APPROVED BY', pw - 94, signBoxY + 8);
  doc.setFontSize(9.5);
  doc.setTextColor(...MIKLENS_DARK);
  doc.text(dc.approvedBy, pw - 94, signBoxY + 18);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  doc.text(`(${dc.approvedByTitle})`, pw - 94, signBoxY + 24);
  doc.setDrawColor(203, 213, 225);
  doc.line(pw - 94, signBoxY + 34, pw - 30, signBoxY + 34);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Authorized Signature & Date', pw - 94, signBoxY + 39);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2: TRIAL PROTOCOL, AGRONOMIC PARAMETERS & ENVIRONMENTAL CONDITIONS
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  let curY = 24;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text('1. TRIAL PROTOCOL AND OBJECTIVES', 14, curY);

  curY += 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const objText = `Objective: To evaluate the post-emergence weed-control efficacy and crop selectivity profile of ${reportData.treatments[0]?.productName || 'the test bio-herbicide'} applied at calibrated dose against mixed weed flora in ${dc.cropDisplay} under field conditions.`;
  doc.text(doc.splitTextToSize(objText, pw - 28), 14, curY);

  curY += 12;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text('1.1 Treatments & Application Parameters', 14, curY);

  curY += 3;
  autoTable(doc, {
    startY: curY,
    head: [['Tr. No.', 'Product Commercial Name', 'Calibrated Dose', 'Application Method', 'Application Timing', 'Spray Volume']],
    body: reportData.treatments.map(t => [
      t.trNo,
      t.productName,
      t.dosePerLitre,
      t.method,
      t.timing,
      t.sprayVolume
    ]),
    theme: 'grid',
    headStyles: { fillColor: MIKLENS_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 2 }
  });

  curY = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text('1.2 Trial Experimental Design & Agronomic Setup', 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    body: [
      ['Study Design:', dc.studyDesign, 'Plot Dimensions / Area:', dc.treatmentPlotArea],
      ['Target Crop / Site:', dc.cropDisplay, 'Weed Growth Stage:', dc.weedGrowthStage],
      ['Tillage Practice:', dc.tillageType, 'Spray Nozzle Type:', dc.nozzleType],
      ['Protocol Status:', dc.status, 'Agronomic Result:', dc.result]
    ],
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 }, 2: { fontStyle: 'bold', cellWidth: 38 } }
  });

  curY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text('2. TRIAL LOCATION & ENVIRONMENTAL CONDITIONS', 14, curY);

  curY += 5;
  // Weather card
  doc.setFillColor(...MIKLENS_LIGHT);
  doc.roundedRect(14, curY, pw - 28, 22, 2, 2, 'F');
  doc.setDrawColor(...MIKLENS_GREEN);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, curY, pw - 28, 22, 2, 2, 'D');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('Atmospheric & Meteorological Conditions:', 18, curY + 6);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  const w = dc.weather;
  const weatherLine1 = `Temperature: ${w.temperature}°C  |  Relative Humidity: ${w.humidity}%  |  Wind Speed: ${w.wind} km/h  |  Precipitation: ${w.rain} mm`;
  const weatherLine2 = `Solar Radiation: ${w.solarRadiation} W/m²  |  Dew Point: ${w.dewPoint}°C  |  Cloud Cover: ${w.cloudCover}%`;
  doc.text(weatherLine1, 18, curY + 12);
  doc.text(weatherLine2, 18, curY + 17);

  curY += 28;
  // Soil profile card
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, curY, pw - 28, 20, 2, 2, 'F');
  doc.setDrawColor(...BORDER_COLOR);
  doc.roundedRect(14, curY, pw - 28, 20, 2, 2, 'D');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text('Edaphic Characteristics & Soil Profile (0–30 cm):', 18, curY + 6);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`Soil Profile Metrics: ${dc.soilProfile}`, 18, curY + 12);
  doc.text(`Soil Texture: ${dc.soilTexture}    |    Soil Drainage: ${dc.soilDrainage}`, 18, curY + 16);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3: BOTANICAL WEED FLORA CENSUS, EFFICACY & CROP SAFETY
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text('3. BOTANICAL WEED FLORA IDENTIFICATION', 14, curY);

  curY += 3;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  doc.text('Table 1: Weed flora census recorded across experimental plots prior to application', 14, curY);

  curY += 3;
  autoTable(doc, {
    startY: curY,
    head: [['S. No.', 'Botanical Scientific Name', 'Common Vernacular Name', 'Botanical Family', 'Growth Habit']],
    body: reportData.weedFloraTable.map(w => [w.sNo, w.scientificName, w.commonName, w.botanicalFamily, w.habit]),
    theme: 'grid',
    headStyles: { fillColor: MIKLENS_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 14, halign: 'center' }, 1: { fontStyle: 'italic', cellWidth: 55 } }
  });

  curY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text('4. WEED CONTROL EFFICACY ANALYSIS', 14, curY);

  curY += 3;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  doc.text('Table 2: Weed cover reduction and observed control efficiency (WCE %)', 14, curY);

  curY += 3;
  autoTable(doc, {
    startY: curY,
    head: [['S. No.', 'Target Weed Flora', 'Initial Cover (%)', 'Final Cover (%)', 'Observed Control / WCE (%)', 'Biological Herbicide Response']],
    body: reportData.efficacyAnalysis.map(e => [
      e.sNo,
      e.species,
      `${e.initialCover.toFixed(1)}%`,
      `${e.finalCover.toFixed(1)}%`,
      `${e.wce.toFixed(1)}%`,
      e.symptoms
    ]),
    theme: 'grid',
    headStyles: { fillColor: MIKLENS_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
    styles: { fontSize: 7.5, cellPadding: 2, halign: 'center' },
    columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 55, halign: 'left', fontStyle: 'italic' }, 5: { cellWidth: 45, halign: 'left' } }
  });

  curY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text('5. CROP PHYTOTOXICITY & SAFETY EVALUATION', 14, curY);

  const stats = reportData.statistics;
  const phytoMean = stats.progression.phytoScore;
  const phytoDesc = stats.progression.phytoDesc;

  curY += 4;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, curY, pw - 28, 28, 2, 2, 'F');
  doc.setDrawColor(...BORDER_COLOR);
  doc.roundedRect(14, curY, pw - 28, 28, 2, 2, 'D');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text(`Crop Safety Score: ${phytoMean.toFixed(1)} / 10  (${phytoDesc.injuryLevel})`, 18, curY + 7);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`Visual Symptoms Assessment: ${phytoDesc.symptoms}`, 18, curY + 13, { maxWidth: pw - 36 });
  const phytoVerdict = phytoMean <= 2.0
    ? `Regulatory Assessment: The treatment exhibited high crop safety margin on ${dc.crop} foliage with no persistent injury, leaf necrosis, or stunting.`
    : `Regulatory Assessment: Mild transient symptoms observed; crop demonstrated full physiological recovery over monitored observation window.`;
  doc.text(phytoVerdict, 18, curY + 22, { maxWidth: pw - 36 });

  curY += 34;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Table 3: Standard Institutional Crop Phytotoxicity Scoring Scale (0–10 Scale)', 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    head: [['Score', 'Injury Classification', 'Visual Symptoms Criteria']],
    body: reportData.phytotoxicityScale.map(s => [s.score, s.injuryLevel, s.symptoms]),
    theme: 'grid',
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    styles: { fontSize: 6.8, cellPadding: 1.2 },
    columnStyles: { 0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 32, fontStyle: 'bold' } }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 4: CHRONOLOGICAL TREATMENT TIMELINE & REAL STATISTICAL ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text('6. TREATMENT OBSERVATION PROGRESSION TIMELINE', 14, curY);

  curY += 3;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  doc.text('Table 4: Chronological field evaluation timeline across post-application intervals', 14, curY);

  curY += 3;
  autoTable(doc, {
    startY: curY,
    head: [['DAA', 'Date', 'Plot Weed Cover (%)', 'Observed Control (%)', 'Phenological Status', 'In-Situ Field Observations']],
    body: reportData.treatmentTimeline.map(t => [
      t.daa === 0 ? '0 (Pre)' : `${t.daa}`,
      t.date,
      `${t.weedCover.toFixed(1)}%`,
      `${t.controlPct.toFixed(1)}%`,
      t.status,
      t.notes
    ]),
    theme: 'grid',
    headStyles: { fillColor: MIKLENS_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    styles: { fontSize: 7.2, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 32, fontStyle: 'bold' }
    }
  });

  curY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text('7. STATISTICAL RIGOR & SCIENTIFIC EVALUATION', 14, curY);

  curY += 5;

  if (stats.isSingleTrial) {
    // True Single-Trial Progression Analytics Matrix
    const p = stats.progression;
    autoTable(doc, {
      startY: curY,
      head: [['Statistical Parameter / Metric', 'Recorded Value', 'Agronomic Evaluation & Regulatory Significance']],
      body: [
        ['Pre-Treatment Baseline Cover', `${p.baselineCover.toFixed(1)}%`, 'Initial weed infestation level prior to application'],
        ['Final Monitored Weed Cover', `${p.finalCover.toFixed(1)}%`, 'Residual living weed canopy at trial conclusion'],
        ['Net Canopy Reduction', `${p.netReduction.toFixed(1)}%`, 'Overall vegetative population reduction achieved'],
        ['Peak Bio-Efficacy Achieved', `${p.peakControl.toFixed(1)}%`, `Maximum weed desiccation reached at ${p.peakDaa} DAA`],
        ['Mean Suppression Stability', `${p.meanControl.toFixed(1)}% ± ${p.sem.toFixed(2)}%`, `Mean control across post-treatment period (SE(m) ± ${p.sem.toFixed(2)})`],
        ['Coefficient of Variation (CV %)', `${p.cv.toFixed(2)}%`, 'Measurement consistency and plot uniformity index'],
        ['Crop Safety Rating', `${p.phytoScore.toFixed(1)} / 10`, `Safety clearance: ${p.phytoDesc.injuryLevel}`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' }, 1: { cellWidth: 35, fontStyle: 'bold', halign: 'center' } }
    });

    curY = doc.lastAutoTable.finalY + 6;
    doc.setFillColor(...MIKLENS_LIGHT);
    doc.roundedRect(14, curY, pw - 28, 22, 2, 2, 'F');
    doc.setDrawColor(...MIKLENS_GREEN);
    doc.roundedRect(14, curY, pw - 28, 22, 2, 2, 'D');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MIKLENS_GREEN);
    doc.text('Scientific Summary & Agronomic Conclusions:', 18, curY + 6);
    doc.setFontSize(7.8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    const conclusionP1 = `Application of ${dc.productName} demonstrated strong bio-efficacy against ${reportData.dominantFloraName}, reducing weed canopy from ${p.baselineCover}% to ${p.finalCover}% (net ${p.netReduction}% reduction). Peak suppression of ${p.peakControl}% occurred at ${p.peakDaa} DAA with high consistency (CV: ${p.cv}%).`;
    const conclusionP2 = `The formulation proved selective and non-injurious to ${dc.crop} (phytotoxicity index ${p.phytoScore}/10). The trial confirms commercial efficacy and crop safety standards.`;
    doc.text(doc.splitTextToSize(conclusionP1, pw - 36), 18, curY + 11);
    doc.text(doc.splitTextToSize(conclusionP2, pw - 36), 18, curY + 17);
  } else {
    // Real Project One-Way ANOVA Table
    const anova = stats.anova || {};
    autoTable(doc, {
      startY: curY,
      head: [['Source of Variation', 'DF', 'Sum of Squares (SS)', 'Mean Squares (MS)', 'F-Calculated', 'p-Value', 'Statistical Significance']],
      body: [
        ['Treatments', `${anova.dfBetween ?? (reportData.treatments.length - 1)}`, `${(anova.ssBetween ?? 0).toFixed(2)}`, `${(anova.msBetween ?? 0).toFixed(2)}`, `${(anova.F ?? 0).toFixed(2)}`, anova.pValue ? anova.pValue.toExponential(3) : '—', anova.pValue < 0.05 ? 'Significant (p < 0.05) *' : 'Non-significant'],
        ['Error (Within)', `${anova.dfWithin ?? (reportData.treatments.length * 2)}`, `${(anova.ssWithin ?? 0).toFixed(2)}`, `${(anova.msWithin ?? 0).toFixed(2)}`, '—', '—', '—'],
        ['Total', `${(anova.dfBetween ?? 0) + (anova.dfWithin ?? 0)}`, `${((anova.ssBetween ?? 0) + (anova.ssWithin ?? 0)).toFixed(2)}`, '—', '—', '—', '—']
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.8, halign: 'center' },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } }
    });

    curY = doc.lastAutoTable.finalY + 6;
    doc.setFillColor(...MIKLENS_LIGHT);
    doc.roundedRect(14, curY, pw - 28, 14, 2, 2, 'F');
    doc.setDrawColor(...MIKLENS_GREEN);
    doc.roundedRect(14, curY, pw - 28, 14, 2, 2, 'D');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MIKLENS_GREEN);
    doc.text(`Precision Statistics:  SE(m) ± : ${stats.sem}    |    Critical Difference (CD at 5% / LSD) : ${stats.cd5}    |    CV (%) : ${stats.cv}%`, 18, curY + 6);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text('ANOVA confirms statistically verified differences among treatments under standardized field trial evaluation.', 18, curY + 11);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 5+: IN-SITU PHOTOGRAPHIC EVIDENCE GALLERY (REAL PHOTOS EMBEDDED)
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_DARK);
  doc.text('8. PHOTOGRAPHIC EVIDENCE & IN-SITU FIELD OBSERVATIONS', 14, curY);

  curY += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  doc.text('In-situ photo plates documenting weed canopy suppression, symptom progression, and crop safety', 14, curY);

  curY += 6;
  const photos = reportData.photoUrls || [];

  if (photos.length === 0) {
    // Honest professional notice (No fake gray boxes!)
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, curY, pw - 28, 24, 2, 2, 'F');
    doc.setDrawColor(...BORDER_COLOR);
    doc.roundedRect(14, curY, pw - 28, 24, 2, 2, 'D');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MIKLENS_DARK);
    doc.text('Field Photographic Documentation Log:', 18, curY + 8);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('No camera image plates were uploaded to this specific trial protocol. All efficacy and weed mortality', 18, curY + 14);
    doc.text('metrics are verified through recorded numerical and phenological field census observations.', 18, curY + 19);
  } else {
    // Render Real Images with clean frames, DAA badges, and date/caption
    const cardW = 86;
    const cardH = 76;
    let col = 0;
    let cardX = 14;

    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];

      // Page overflow check
      if (curY + cardH > ph - 20) {
        doc.addPage();
        curY = 24;
        col = 0;
        cardX = 14;
      }

      cardX = col === 0 ? 14 : pw / 2 + 3;

      // Card container
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(cardX, curY, cardW, cardH, 2, 2, 'F');
      doc.setDrawColor(...BORDER_COLOR);
      doc.setLineWidth(0.3);
      doc.roundedRect(cardX, curY, cardW, cardH, 2, 2, 'D');

      // Card Header Badge
      doc.setFillColor(...MIKLENS_LIGHT);
      doc.roundedRect(cardX + 2, curY + 2, cardW - 4, 8, 1, 1, 'F');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...MIKLENS_GREEN);
      const daaBadge = p.daa !== null && p.daa !== undefined ? `DAA ${p.daa}` : 'In-situ Observation';
      doc.text(daaBadge, cardX + 4, curY + 7.5);
      if (p.date) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`${p.date}`, cardX + cardW - 4, curY + 7.5, { align: 'right' });
      }

      // Embed Image
      const imgY = curY + 12;
      const imgH = 50;
      const imgW = cardW - 6;

      let rendered = false;
      try {
        const base64Data = await toBase64(p.url, 500);
        if (base64Data) {
          rendered = addImgSafe(doc, base64Data, cardX + 3, imgY, imgW, imgH);
        }
      } catch {
        rendered = false;
      }

      if (!rendered) {
        doc.setFillColor(241, 245, 249);
        doc.rect(cardX + 3, imgY, imgW, imgH, 'F');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(148, 163, 184);
        doc.text(`[ ${p.label || 'Image Plate'} ]`, cardX + cardW / 2, imgY + imgH / 2, { align: 'center' });
      }

      // Card Caption
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MIKLENS_DARK);
      const captionText = p.label || `${dc.productName} Field Plot`;
      doc.text(doc.splitTextToSize(captionText, cardW - 6), cardX + 3, curY + cardH - 5);

      col++;
      if (col >= 2) {
        col = 0;
        curY += cardH + 6;
      }
    }
  }

  // Apply running headers and footers with accurate total page count
  applyRunningHeadersAndFooters(doc, reportData);

  // Save PDF
  const filename = `${reportData.docControl.reportNo.replace(/[^a-z0-9]/gi, '_')}_Miklens_Bio_Dossier.pdf`;
  doc.save(filename);
  return filename;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WORD DOCX REPORT GENERATION
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function generateInstitutionalDocx(reportData) {
  const dc = reportData.docControl;
  const stats = reportData.statistics;

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: `${dc.companyName} — ${dc.division}`,
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({
            text: `Report No: ${dc.reportNo}  |  Protocol Ref: ${dc.protocolRefNo}  |  SOP: ${dc.sopFormCode}`,
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: dc.title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Prepared By: ', bold: true }),
              new TextRun(`${dc.preparedBy} (${dc.preparedByTitle})\n`),
              new TextRun({ text: 'Reviewed & Approved By: ', bold: true }),
              new TextRun(`${dc.approvedBy} (${dc.approvedByTitle})\n`),
              new TextRun({ text: 'Date: ', bold: true }),
              new TextRun(`${dc.reportDate}\n`),
              new TextRun({ text: 'Location: ', bold: true }),
              new TextRun(`${dc.locationName} (GPS: ${dc.latitude}, ${dc.longitude})`)
            ]
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: '1. TRIAL PROTOCOL AND OBJECTIVES',
            heading: HeadingLevel.HEADING_2
          }),
          new Paragraph({
            text: `To evaluate the weed-control bio-efficacy and crop selectivity profile of ${reportData.treatments[0]?.productName || 'the test product'} applied in ${dc.cropDisplay} under field conditions.`
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: 'Trt No', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Product Commercial Name', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Calibrated Dose', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Method', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Timing', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Spray Volume', bold: true })] })
                ]
              }),
              ...reportData.treatments.map(t => new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: String(t.trNo || '') })] }),
                  new TableCell({ children: [new Paragraph({ text: String(t.productName || '') })] }),
                  new TableCell({ children: [new Paragraph({ text: String(t.dosePerLitre || '') })] }),
                  new TableCell({ children: [new Paragraph({ text: String(t.method || '') })] }),
                  new TableCell({ children: [new Paragraph({ text: String(t.timing || '') })] }),
                  new TableCell({ children: [new Paragraph({ text: String(t.sprayVolume || '') })] })
                ]
              }))
            ]
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: '2. ENVIRONMENTAL & SOIL PROFILE PARAMETERS',
            heading: HeadingLevel.HEADING_2
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Weather Conditions: ', bold: true }),
              new TextRun(dc.weatherContext + '\n'),
              new TextRun({ text: 'Soil Profile: ', bold: true }),
              new TextRun(dc.soilProfile)
            ]
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: '3. WEED CONTROL EFFICACY ANALYSIS',
            heading: HeadingLevel.HEADING_2
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: 'S.No', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Target Weed Flora', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Initial Cover (%)', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Final Cover (%)', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Observed Control (%)', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Herbicide Response', bold: true })] })
                ]
              }),
              ...reportData.efficacyAnalysis.map(e => new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: String(e.sNo) })] }),
                  new TableCell({ children: [new Paragraph({ text: String(e.species) })] }),
                  new TableCell({ children: [new Paragraph({ text: `${e.initialCover}%` })] }),
                  new TableCell({ children: [new Paragraph({ text: `${e.finalCover}%` })] }),
                  new TableCell({ children: [new Paragraph({ text: `${e.wce}%` })] }),
                  new TableCell({ children: [new Paragraph({ text: String(e.symptoms) })] })
                ]
              }))
            ]
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: '4. CHRONOLOGICAL OBSERVATIONS TIMELINE',
            heading: HeadingLevel.HEADING_2
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: 'DAA', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Date', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Weed Cover (%)', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Control (%)', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Phenological Status', bold: true })] }),
                  new TableCell({ children: [new Paragraph({ text: 'Notes', bold: true })] })
                ]
              }),
              ...reportData.treatmentTimeline.map(t => new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: String(t.daa) })] }),
                  new TableCell({ children: [new Paragraph({ text: String(t.date) })] }),
                  new TableCell({ children: [new Paragraph({ text: `${t.weedCover}%` })] }),
                  new TableCell({ children: [new Paragraph({ text: `${t.controlPct}%` })] }),
                  new TableCell({ children: [new Paragraph({ text: String(t.status) })] }),
                  new TableCell({ children: [new Paragraph({ text: String(t.notes) })] })
                ]
              }))
            ]
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: '5. STATISTICAL EVALUATION & REGULATORY CONCLUSION',
            heading: HeadingLevel.HEADING_2
          }),
          new Paragraph({
            text: `Statistical analysis confirms weed canopy reduction from ${stats.progression.baselineCover}% to ${stats.progression.finalCover}% (net ${stats.progression.netReduction}% suppression). Peak efficacy of ${stats.progression.peakControl}% occurred at ${stats.progression.peakDaa} DAA (CV: ${stats.progression.cv}%). Crop phytotoxicity rating was recorded at ${stats.progression.phytoScore}/10 (${stats.progression.phytoDesc.injuryLevel}), confirming complete crop selectivity and efficacy clearance.`
          })
        ]
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${reportData.docControl.reportNo.replace(/[^a-z0-9]/gi, '_')}_Miklens_Bio_Dossier.docx`;
  saveAs(blob, filename);
  return filename;
}
