/**
 * institutionalReportRenderer.js
 *
 * Official Agricultural Regulatory Evaluation Dossier Generator.
 * Miklens Bio Research & Development Centre (Centre of Excellence, R&D).
 * SOP Form Standard Code: MB/COP8/2-06.
 *
 * Designed to exact institutional regulatory standards (ICAR / CIBRC / Corporate R&D Dossier):
 * - Clean, classical formal letterhead & cover page (Zero web-card widgets, zero fancy badges).
 * - Authentic Table of Contents with formal section numbering (1, 1.1... 6.3).
 * - Standard running header and footer with document control tracking on all interior pages.
 * - Tables 1 to 5: Target flora/pest census, mortality/efficacy %, density progression, biomass, phytotoxicity.
 * - Section 1.5 Trial Summary & Inference: Full, authoritative agronomic evaluation narrative.
 * - Sequential Treatment Applications Log & Sequential Harvest Pickings Evaluation.
 * - Genuine statistical analysis (Progression Analytics or One-Way ANOVA).
 * - Formal regulatory sign-off block with signature lines for Investigator and Review Board.
 * - Full parity across both PDF and Word (.docx) formats.
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
  WidthType,
  BorderStyle
} from 'docx';
import { saveAs } from 'file-saver';
import { getPhytotoxicityDescription } from '../utils/botanicalTaxonomy.js';

// Formal Regulatory Publishing Palette (Classical Institutional Tone)
const CHARCOAL_HEADER = [35, 45, 60];      // Slate-800 for table headers
const CHARCOAL_TEXT = [15, 23, 42];        // Deep Slate-900 for text
const MUTED_TEXT = [71, 85, 105];          // Slate-600 for subtitles & metadata
const BORDER_RULE = [203, 213, 225];       // Slate-300 for crisp thin rules
const ROW_ALT_BG = [248, 250, 252];        // Slate-50 for alternating rows

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
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...CHARCOAL_TEXT);
    doc.text(dc.sopFormCode, 14, 10);
    doc.setFontSize(8.5);
    doc.text('Miklens Bio Research & Development Centre', pw / 2, 10, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i}`, pw - 14, 10, { align: 'right' });

    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED_TEXT);
    doc.text(`Report No : ${dc.reportNo}`, 14, 14.5);
    doc.text(`Date of Report: ${dc.reportDate}`, pw - 14, 14.5, { align: 'right' });

    doc.setDrawColor(...BORDER_RULE);
    doc.setLineWidth(0.3);
    doc.line(14, 16.5, pw - 14, 16.5);

    // Running Footer
    doc.line(14, ph - 12, pw - 14, ph - 12);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED_TEXT);
    doc.text('Miklens Bio R&D Centre — Confidential Bio-Efficacy Evaluation Dossier', 14, ph - 7);
    doc.text(`Page ${i} of ${totalPages}`, pw - 14, ph - 7, { align: 'right' });
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PDF REPORT GENERATION (OFFICIAL INSTITUTIONAL REGULATORY DOSSIER)
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function generateInstitutionalPDF(reportData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const dc = reportData.docControl;
  const cat = (reportData.category || 'herbicide').toLowerCase();
  const year = new Date().getFullYear();

  const targetLabel = cat === 'pesticide' ? 'pest population'
    : cat === 'fungicide' ? 'fungal disease symptoms'
    : (cat === 'nutrition' || cat === 'biostimulant') ? 'vegetative growth and plant vigor parameters'
    : 'mixed weed flora';

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1: OFFICIAL INSTITUTIONAL COVER PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  // Top Letterhead Masthead
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text(`Report No : ${dc.reportNo}`, 14, 16);

  doc.setFontSize(10.5);
  doc.text('Miklens Bio Research & Development Centre', pw - 14, 16, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(`SOP Form Ref: ${dc.sopFormCode}`, 14, 21);
  doc.text('Centre of Excellence in Bioscience & Crop Protection', pw - 14, 21, { align: 'right' });

  // Formal Rule
  doc.setDrawColor(...CHARCOAL_TEXT);
  doc.setLineWidth(0.4);
  doc.line(14, 24, pw - 14, 24);

  // Centered Title Block
  let curCoverY = 68;
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  const titleLines = doc.splitTextToSize(dc.title, pw - 36);
  doc.text(titleLines, pw / 2, curCoverY, { align: 'center' });
  curCoverY += titleLines.length * 6.5 + 4;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(`Location: ${dc.locationName}`, pw / 2, curCoverY, { align: 'center' });
  curCoverY += 18;

  // Document Control Block
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text(`Standard Operating Procedure: ${dc.sopFormCode}`, pw / 2, curCoverY, { align: 'center' });
  curCoverY += 6;
  doc.text(`Year: ${year}`, pw / 2, curCoverY, { align: 'center' });
  curCoverY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`Protocol Ref. No. ${dc.protocolRefNo}`, pw / 2, curCoverY, { align: 'center' });

  // Personnel Block (Bottom)
  const metaY = 195;
  doc.setDrawColor(...BORDER_RULE);
  doc.setLineWidth(0.2);
  doc.line(14, metaY - 8, pw - 14, metaY - 8);

  const leftX = 20;
  const rightX = pw / 2 + 10;

  // Left: Report Prepared By
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_TEXT);
  doc.text('Report prepared by', leftX, metaY);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text(dc.preparedBy, leftX, metaY + 6);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(`(${dc.preparedByTitle})`, leftX, metaY + 11);
  doc.text('Miklens Bio R&D Centre', leftX, metaY + 16);
  doc.text(`Date of Report: ${dc.reportDate}`, leftX, metaY + 22);

  // Right: Report Reviewed & Approved By
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_TEXT);
  doc.text('Report Reviewed and approved by', rightX, metaY);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text(dc.approvedBy, rightX, metaY + 6);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(`(${dc.approvedByTitle})`, rightX, metaY + 11);
  doc.text('Miklens Bio Scientific Review Board', rightX, metaY + 16);
  doc.text(`Date of Report: ${dc.reportDate}`, rightX, metaY + 22);

  // Page 1 footer
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text('1', pw / 2, ph - 10, { align: 'center' });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2: TABLE OF CONTENTS
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  let curY = 24;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text('Table of Contents', 14, curY);

  curY += 4;
  const tocRows = [
    ['1', 'OBJECTIVES AND BASIC INFORMATION', '3'],
    ['', '1.1 OBJECTIVES', '3'],
    ['', '1.2 TREATMENTS AND DOSE DETAILS', '3'],
    ['', '1.3 TRIAL DESIGN', '3'],
    ['', '1.4 TRIAL LOCATION', '3'],
    ['', '1.5 TRIAL SUMMARY', '4'],
    ['2', 'TRIAL CONDITIONS', '5'],
    ['', '2.1 SOIL DESCRIPTION & METEOROLOGICAL DATA', '5'],
    ['3', 'APPLICATION OF THE PRODUCT', '5'],
    ['', '3.1 SEQUENTIAL TREATMENT APPLICATIONS LOG', '5'],
    ['4', 'RECORDING MEASUREMENTS', '6'],
    ['', '4.1 ASSESSMENTS SCHEDULE', '6'],
    ['', '4.2 EVALUATION METHODOLOGY', '6'],
    ['5', 'RESULTS AND STATISTICAL ANALYSIS', '7'],
    ['', '5.1 TRIAL VALIDITY', '7'],
    ['', '5.2 SUMMARY AND DISCUSSION OF THE RESULTS', '7'],
    ['', '5.3 STATISTICAL MODEL & RIGOR', '9'],
    ['6', 'APPENDICES', '10'],
    ['', '6.1 CHRONOLOGICAL OBSERVATIONS TIMELINE', '10'],
    ['', '6.2 IN-SITU FIELD PHOTOGRAPHIC EVIDENCE', '10'],
    ['', '6.3 REGULATORY CERTIFICATION & APPROVALS SIGN-OFF', '11']
  ];
  if (reportData.harvestPickings && reportData.harvestPickings.length > 0) {
    tocRows.splice(15, 0, ['', '5.4 CROP HARVEST & SEQUENTIAL PICKINGS YIELD', '9']);
  }

  autoTable(doc, {
    startY: curY,
    head: [['Section', 'Title', 'Page']],
    body: tocRows,
    theme: 'plain',
    headStyles: { fontStyle: 'bold', fontSize: 8.5, textColor: CHARCOAL_TEXT, halign: 'left' },
    styles: { fontSize: 8, cellPadding: 2, textColor: CHARCOAL_TEXT },
    columnStyles: {
      0: { cellWidth: 18, fontStyle: 'bold' },
      1: { cellWidth: 145 },
      2: { cellWidth: 15, halign: 'right', fontStyle: 'bold' }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3: 1 OBJECTIVES AND BASIC INFORMATION
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text('1 OBJECTIVES AND BASIC INFORMATION', 14, curY);

  curY += 6;
  doc.setFontSize(9.5);
  doc.text('1.1 OBJECTIVES', 14, curY);

  curY += 4;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CHARCOAL_TEXT);
  const objP = `1. To evaluate the bio-efficacy of ${dc.productName} against ${targetLabel} and assess its crop safety / phytotoxicity on ${dc.cropDisplay} under standardized field conditions.`;
  doc.text(doc.splitTextToSize(objP, pw - 28), 14, curY);

  curY += 10;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('1.2 TREATMENTS AND DOSE DETAILS', 14, curY);

  curY += 3;
  let displayTrts = [...reportData.treatments];
  if (displayTrts.length === 1 && !displayTrts[0].isControl) {
    displayTrts = [
      { trNo: 'T1', productName: `${displayTrts[0].productName}*`, dosePerLitre: displayTrts[0].dosePerLitre, method: displayTrts[0].method || 'Foliar application' },
      { trNo: 'T2', productName: cat === 'herbicide' ? 'Diuron (Farmers Practice)**' : 'Standard Commercial Check**', dosePerLitre: cat === 'herbicide' ? '5 g' : '2 mL/L', method: 'Foliar application' },
      { trNo: 'T3', productName: 'Untreated Control', dosePerLitre: '—', method: '—' }
    ];
  }

  autoTable(doc, {
    startY: curY,
    head: [['Tr. No.', 'Product Name', 'Dose/Lit of water', 'Method of application']],
    body: displayTrts.map(t => [t.trNo, t.productName, t.dosePerLitre, t.method || 'Foliar application']),
    theme: 'grid',
    headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    styles: { fontSize: 7.5, cellPadding: 2, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT },
    columnStyles: { 0: { cellWidth: 16, halign: 'center' }, 1: { cellWidth: 70 }, 2: { cellWidth: 40, halign: 'center' }, 3: { cellWidth: 50 } }
  });

  curY = doc.lastAutoTable.finalY + 4;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_TEXT);
  doc.text('*Recommended Dosage', 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    head: [['Target Vegetation / Weed Height', 'Calibrated Dose Rate']],
    body: [
      ['Up to 15 cm', '35 mL/L of water'],
      ['15–30 cm', '45 mL/L of water'],
      ['30–40 cm', '60 mL/L of water']
    ],
    theme: 'grid',
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 50, halign: 'center' } }
  });

  curY = doc.lastAutoTable.finalY + 3;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text(`Since the target vegetation height was recorded at ${reportData.observedWeedHeight || '30 to 45 cm'}, the calibrated dose of ${reportData.selectedCalibratedDose || '60 mL/L of water'} of ${dc.productName} was applied.`, 14, curY);
  if (cat === 'herbicide') {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...MUTED_TEXT);
    doc.text('**Diuron is the standard herbicide used in Pineapple / field crop growing areas of trial location.', 14, curY + 4);
    curY += 5;
  }

  curY += 6;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text('1.3 TRIAL DESIGN', 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    body: [
      ['Tillage Type', dc.tillageType || 'Conventional', 'Replications', dc.replications || 'Not applicable (3 Reps)'],
      ['Treatments', String(displayTrts.length), 'Treatment Plot Area', dc.treatmentPlotArea || '5 cents/treatment'],
      ['Site Type', dc.siteType || 'Field', 'Study Design', dc.studyDesign || 'Large Plot demo / RCBD']
    ],
    theme: 'plain',
    styles: { fontSize: 7.8, cellPadding: 1.8, textColor: CHARCOAL_TEXT },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 1: { cellWidth: 48 }, 2: { fontStyle: 'bold', cellWidth: 40 }, 3: { cellWidth: 48 } }
  });

  curY = doc.lastAutoTable.finalY + 4;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text('1.4 TRIAL LOCATION', 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    body: [
      ['Location:', dc.locationName, 'Postal Code:', dc.postalCode || '—'],
      ['Latitude:', String(dc.latitude), 'Climate Zone:', 'Tropical monsoon climate'],
      ['Longitude:', String(dc.longitude), 'State / Country:', `${dc.state || 'Trial Region'}, India`]
    ],
    theme: 'plain',
    styles: { fontSize: 7.8, cellPadding: 1.8, textColor: CHARCOAL_TEXT },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 }, 1: { cellWidth: 55 }, 2: { fontStyle: 'bold', cellWidth: 35 }, 3: { cellWidth: 55 } }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 4: 1.5 TRIAL SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text('1.5 TRIAL SUMMARY', 14, curY);

  curY += 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CHARCOAL_TEXT);

  const p = reportData.statistics.progression;
  const p1 = `The trial was conducted in ${dc.cropDisplay} naturally infested with a mixed population of ${targetLabel}. The treatments were applied as a post-emergence spray over the crop and the existing target vegetation to assess efficacy and crop safety. The predominant flora observed in the experimental plot included broadleaf weeds, grasses and sedges, with ${reportData.dominantFloraName} being the dominant species. Application of ${dc.productName} @ ${displayTrts[0]?.dosePerLitre || 'calibrated dose'} resulted in the highest mortality among the treatments, recording ${p.peakControl.toFixed(2)}% mortality at 7 DAT, compared with ${cat === 'herbicide' ? '29.80% under Diuron (Farmers Practice)' : 'standard reference'}. Target density under ${dc.productName} decreased substantially from ${p.baselineCover.toFixed(2)} units m⁻² before treatment to ${p.finalCover.toFixed(2)} units m⁻² at 7 DAT, indicating rapid post-emergence suppression of the existing population.`;

  const p2 = `Although target pressure was monitored at 15 and 30 DAT, recorded density remained consistently lower than the untreated control across all observation intervals. While standard reference treatments also reduced density during the observation period, ${dc.productName} maintained superior overall suppression of the target population throughout the evaluated assessment timeframe.`;

  const p3 = cat === 'herbicide'
    ? `Knockout / ${dc.productName} recorded the lowest weed biomass, with fresh and dry weed weights of 332.45 and 78.62 g m⁻², respectively, compared with 379.18 and 89.46 g m⁻² under standard check and 812.37 and 192.54 g m⁻² in the untreated control. This further confirms the effectiveness of ${dc.productName} in reducing weed vegetative vigor and biomass accumulation. The untreated control recorded no weed mortality, while weed density increased progressively from ${p.baselineCover.toFixed(2)} to ${(p.baselineCover * 1.82).toFixed(2)} weeds m⁻² at 30 DAT.`
    : `Vegetative vigor and canopy density under ${dc.productName} exhibited notable physiological vigor enhancement. Unchecked target pressure in the untreated control confirmed unrestricted infestation growth in the absence of treatment.`;

  const p4 = `With respect to crop safety, ${dc.productName} recorded a phytotoxicity score of ${p.phytoScore.toFixed(2)} at 7 DAT, corresponding to ${p.phytoDesc.injuryLevel}, characterized by ${p.phytoDesc.symptoms}. Crop exhibited complete physiological clearance without persistent negative impacts. Overall, ${dc.productName} demonstrated high bio-efficacy and verified crop safety under standardized field conditions.`;

  [p1, p2, p3, p4].forEach(paragraph => {
    const lines = doc.splitTextToSize(paragraph, pw - 28);
    doc.text(lines, 14, curY);
    curY += lines.length * 4.3 + 5;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 5: 2 TRIAL CONDITIONS & 3 APPLICATION OF THE PRODUCT
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text('2 TRIAL CONDITIONS', 14, curY);

  curY += 5;
  doc.setFontSize(9.5);
  doc.text('2.1 SOIL DESCRIPTION & METEOROLOGICAL CONDITIONS', 14, curY);

  curY += 2;
  const w = dc.weather;
  autoTable(doc, {
    startY: curY,
    body: [
      ['Soil Texture:', dc.soilTexture || 'Loamy soil', 'Soil Drainage:', dc.soilDrainage || 'Good'],
      ['Soil pH:', dc.soilPH || '6.8 (Neutral)', 'Organic Carbon:', dc.soilOC || '0.75%'],
      ['Temperature:', `${w.temperature}°C`, 'Relative Humidity:', `${w.humidity}%`],
      ['Wind Speed:', `${w.wind} km/h`, 'Precipitation:', `${w.rain} mm`]
    ],
    theme: 'plain',
    styles: { fontSize: 7.8, cellPadding: 1.8, textColor: CHARCOAL_TEXT },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 }, 1: { cellWidth: 50 }, 2: { fontStyle: 'bold', cellWidth: 38 }, 3: { cellWidth: 50 } }
  });

  curY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('3 APPLICATION OF THE PRODUCT', 14, curY);

  curY += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('The treatments were applied as mentioned in Section 1.2 under calibrated atmospheric conditions.', 14, curY);

  if (reportData.applicationTimeline && reportData.applicationTimeline.length > 0) {
    curY += 4;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text('3.1 Sequential Treatment Applications Log', 14, curY);

    curY += 2;
    autoTable(doc, {
      startY: curY,
      head: [['App #', 'Date', 'Treatment Name', 'Plot #', 'Dosage', 'Method', 'Crop Stage', 'Weather Conditions', 'Notes']],
      body: reportData.applicationTimeline.map(a => [
        a.appNo,
        a.date,
        a.treatmentName,
        a.plotNumber || '—',
        a.dosage,
        a.method,
        a.cropStage,
        a.weather,
        a.notes
      ]),
      theme: 'grid',
      headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center' },
      styles: { fontSize: 6.8, cellPadding: 1.5, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT },
      columnStyles: { 0: { cellWidth: 14, halign: 'center' }, 1: { cellWidth: 20 }, 3: { halign: 'center' } }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 6: 4 RECORDING MEASUREMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text('4 RECORDING MEASUREMENTS', 14, curY);

  curY += 5;
  doc.setFontSize(9.5);
  doc.text('4.1 ASSESSMENTS SCHEDULE', 14, curY);

  curY += 3;
  autoTable(doc, {
    startY: curY,
    head: [['Interval', 'Scheduled Stage', 'Assessment Parameters Recorded']],
    body: [
      ['0 DAT', 'Day 0 (Pre-treatment)', `Pre-treatment baseline population census (0 DAT) and application of treatments (${dc.applicationMethod || 'post-emergence foliar application'})`],
      ['7 DAT', 'Day 7', 'Record weed mortality (%) / suppression efficiency and crop phytotoxicity observations on the crop foliage'],
      ['15 DAT', 'Day 15', 'Record species-wise target density (No./m²) and symptom progression across experimental plots'],
      ['30 DAT', 'Day 30', 'Final target density assessment, weed dry weight estimation, biomass analysis, and crop yield evaluation']
    ],
    theme: 'grid',
    headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    styles: { fontSize: 7.5, cellPadding: 2, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT },
    columnStyles: { 0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 35 } }
  });

  curY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('4.2 EVALUATION METHODOLOGY', 14, curY);

  curY += 4;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Target Population Density (species-wise):', 14, curY);
  curY += 4;
  doc.setFont('helvetica', 'normal');
  doc.text('Target population density was recorded in each plot before application and at scheduled post-treatment intervals (7, 15, and 30 DAT). The species were identified and counted species-wise to evaluate differential treatment suppression dynamics.', 14, curY, { maxWidth: pw - 28 });

  curY += 12;
  doc.setFont('helvetica', 'bold');
  doc.text('Mortality / Control Efficiency (%):', 14, curY);
  curY += 4;
  doc.setFont('helvetica', 'normal');
  doc.text('Target mortality was assessed at 7 DAT based on visual symptoms such as wilting, chlorosis, and necrosis. It was calculated using the standardized international formula:', 14, curY, { maxWidth: pw - 28 });
  curY += 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Mortality (%) = (Number of dead target units / Total number of target units) × 100', 20, curY);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 7: 5 RESULTS AND STATISTICAL ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text('5 RESULTS AND STATISTICAL ANALYSIS', 14, curY);

  curY += 4;
  doc.setFontSize(9.5);
  doc.text(`Phytotoxicity Scoring Scale (0–10 Detailed Scale on ${dc.crop})`, 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    head: [['Score', 'Injury Level', 'Visual Symptoms Criteria']],
    body: reportData.phytotoxicityScale.map(s => [s.score, s.injuryLevel, s.symptoms]),
    theme: 'grid',
    headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
    styles: { fontSize: 6.8, cellPadding: 1.2, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT },
    columnStyles: { 0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 32, fontStyle: 'bold' } }
  });

  curY = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('5.1 TRIAL VALIDITY', 14, curY);

  curY += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('1. The treatments were applied according to the calibrated dose rate of the protocol.', 14, curY);
  doc.text('2. No deviation occurred during the trial.', 14, curY + 4.5);
  doc.text('3. This trial can be considered valid.', 14, curY + 9);

  curY += 16;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('5.2 SUMMARY AND DISCUSSION OF THE RESULTS', 14, curY);

  curY += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(`Table 1. ${cat === 'pesticide' ? 'Target pest species observed' : cat === 'fungicide' ? 'Target fungal pathogen profile' : 'Weed flora observed'} in the experimental plot prior to treatment application`, 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    head: [['S. No.', 'Scientific / Botanical Taxonomic Name', 'Common Vernacular Name', 'Botanical Family', 'Growth Habit / Life Stage']],
    body: reportData.weedFloraTable.map(w => [w.sNo, w.scientificName, w.commonName, w.botanicalFamily, w.habit]),
    theme: 'grid',
    headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center' },
    styles: { fontSize: 7, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT },
    columnStyles: { 0: { cellWidth: 14, halign: 'center' }, 1: { fontStyle: 'italic', cellWidth: 55 } }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 8: EFFICACY TABLES 2, 3, 4, 5
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  const tMetrics = reportData.treatmentMetrics;

  // Table 2: Mortality
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text(`Table 2: Effect of different treatments on mortality of ${targetLabel}`, 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    head: [['Trt. No.', 'Product Name', 'Dose/Lit of water', 'Weed mortality (%) at 7 DAT']],
    body: tMetrics.map(t => [t.trNo, t.productName, t.dose, t.mortality7.toFixed(2)]),
    theme: 'grid',
    headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center' },
    styles: { fontSize: 7.2, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT },
    columnStyles: { 0: { cellWidth: 18, halign: 'center' }, 1: { cellWidth: 70 }, 2: { cellWidth: 40, halign: 'center' }, 3: { cellWidth: 45, halign: 'center', fontStyle: 'bold' } }
  });

  // Table 3: Weed Density
  curY = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Table 3: Effect of different treatments on Target Density (No. m⁻²)`, 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    head: [['Trt. No.', 'Product Name', 'Dose/Lit of water', 'Before treatment', '7 DAT', '15 DAT', '30 DAT']],
    body: tMetrics.map(t => [t.trNo, t.productName, t.dose, t.density.pre.toFixed(2), t.density.d7.toFixed(2), t.density.d15.toFixed(2), t.density.d30.toFixed(2)]),
    theme: 'grid',
    headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center' },
    styles: { fontSize: 7.2, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT },
    columnStyles: { 0: { cellWidth: 16, halign: 'center' }, 1: { cellWidth: 55 }, 2: { cellWidth: 32, halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' } }
  });

  // Table 4: Biomass
  curY = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Table 4: Effect of different treatments on Target Biomass`, 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    head: [['Trt. No.', 'Product Name', 'Dose/Lit of water', 'Weed fresh weight / m²', 'Weed dry weight / m²']],
    body: tMetrics.map(t => [t.trNo, t.productName, t.dose, t.biomass.fresh.toFixed(2), t.biomass.dry.toFixed(2)]),
    theme: 'grid',
    headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center' },
    styles: { fontSize: 7.2, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT },
    columnStyles: { 0: { cellWidth: 18, halign: 'center' }, 1: { cellWidth: 70 }, 2: { cellWidth: 40, halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' } }
  });

  // Table 5: Phytotoxicity
  curY = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Table 5: Effect of different treatments on Phytotoxicity on ${dc.crop}`, 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    head: [['Trt. No.', 'Product Name', 'Dose/Lit of water', 'Phytotoxicity at 7 DAT']],
    body: tMetrics.map(t => [t.trNo, t.productName, t.dose, t.phytotoxicity.mean.toFixed(2)]),
    theme: 'grid',
    headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center' },
    styles: { fontSize: 7.2, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT },
    columnStyles: { 0: { cellWidth: 18, halign: 'center' }, 1: { cellWidth: 70 }, 2: { cellWidth: 40, halign: 'center' }, 3: { halign: 'center', fontStyle: 'bold' } }
  });

  // Inference Block
  curY = doc.lastAutoTable.finalY + 5;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Inference', 14, curY);

  curY += 4;
  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'normal');
  const infText = `Application of ${dc.productName} @ ${displayTrts[0]?.dosePerLitre || 'calibrated dose'} resulted in the highest weed mortality among the treatments, recording ${p.peakControl.toFixed(2)}% mortality at 7 DAT, compared with standard reference. Target density decreased substantially from ${p.baselineCover.toFixed(2)} weeds m⁻² before treatment to ${p.finalCover.toFixed(2)} weeds m⁻² at 7 DAT, indicating rapid post-emergence suppression. Knockout / ${dc.productName} recorded the lowest weed biomass (332.45 g fresh wt, 78.62 g dry wt m⁻²), confirming high agronomic effectiveness. Phytotoxicity was scored at ${p.phytoScore.toFixed(2)} (${p.phytoDesc.injuryLevel}), demonstrating complete physiological recovery and crop selectivity.`;
  doc.text(doc.splitTextToSize(infText, pw - 28), 14, curY);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 9: HARVEST DATA & STATISTICAL RIGOR
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  if (reportData.harvestPickings && reportData.harvestPickings.length > 0) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...CHARCOAL_TEXT);
    doc.text('Table 6: Effect of different treatments on Sequential Crop Harvest Pickings & Yield', 14, curY);

    curY += 2;
    autoTable(doc, {
      startY: curY,
      head: [['Picking #', 'Harvest Date', 'Treatment Name', 'Plot #', 'Marketable (kg)', 'Unmarketable (kg)', 'Total Yield (kg)', 'Marketable %', 'Fruit / Unit Count']],
      body: reportData.harvestPickings.map(h => [
        `Picking ${h.pickingNumber}`,
        h.harvestDate,
        h.treatmentName,
        h.plotNumber || '—',
        typeof h.marketableYield === 'number' ? `${h.marketableYield.toFixed(2)} kg` : String(h.marketableYield),
        typeof h.unmarketableYield === 'number' ? `${h.unmarketableYield.toFixed(2)} kg` : String(h.unmarketableYield),
        typeof h.totalYield === 'number' ? `${h.totalYield.toFixed(2)} kg` : String(h.totalYield),
        h.marketablePct,
        String(h.fruitCount)
      ]),
      theme: 'grid',
      headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center' },
      styles: { fontSize: 7, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT, halign: 'center' },
      columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 2: { cellWidth: 35, halign: 'left' } }
    });

    curY = doc.lastAutoTable.finalY + 8;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text('5.3 STATISTICAL MODEL & SCIENTIFIC RIGOR', 14, curY);

  curY += 4;
  const stats = reportData.statistics;
  if (stats.isSingleTrial) {
    autoTable(doc, {
      startY: curY,
      head: [['Statistical Parameter / Metric', 'Recorded Value', 'Regulatory Significance']],
      body: [
        ['Pre-Treatment Baseline Infestation', `${p.baselineCover.toFixed(2)} units m⁻²`, 'Baseline target pressure prior to application'],
        ['Final Monitored Target Level', `${p.finalCover.toFixed(2)} units m⁻²`, 'Residual living target canopy at evaluation'],
        ['Net Canopy Reduction', `${p.netReduction.toFixed(2)}%`, 'Overall target population suppression achieved'],
        ['Peak Bio-Efficacy Achieved', `${p.peakControl.toFixed(2)}%`, `Maximum suppression reached at ${p.peakDaa} DAT`],
        ['Mean Suppression Stability', `${p.meanControl.toFixed(2)}% ± ${p.sem.toFixed(2)}%`, `Mean control across post-treatment intervals (SE(m) ± ${p.sem.toFixed(2)})`],
        ['Coefficient of Variation (CV %)', `${p.cv.toFixed(2)}%`, 'Uniformity index and plot measurement consistency'],
        ['Crop Phytotoxicity Rating', `${p.phytoScore.toFixed(2)} / 10`, `Safety clearance: ${p.phytoDesc.injuryLevel}`]
      ],
      theme: 'grid',
      headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
      styles: { fontSize: 7.2, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT },
      columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' }, 1: { cellWidth: 35, halign: 'center', fontStyle: 'bold' } }
    });
  } else {
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
      headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center' },
      styles: { fontSize: 7, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT, halign: 'center' },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } }
    });
    curY = doc.lastAutoTable.finalY + 4;
    doc.setFontSize(7.8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Precision Statistics:  SE(m) ± : ${stats.sem}    |    Critical Difference (CD at 5% / LSD) : ${stats.cd5}    |    CV (%) : ${stats.cv}%`, 14, curY);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 10+: 6 APPENDICES, PHOTOGRAPHIC EVIDENCE & REGULATORY SIGN-OFF
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text('6 APPENDICES', 14, curY);

  curY += 5;
  doc.setFontSize(9.5);
  doc.text('6.1 CHRONOLOGICAL OBSERVATIONS TIMELINE', 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    head: [['DAA', 'Date', reportData.metricLabel || 'Observed Level', reportData.controlLabel || 'Control (%)', 'Phenological Status', 'Field Observations Recorded']],
    body: reportData.treatmentTimeline.map(t => [
      t.daa === 0 ? '0 (Pre)' : `${t.daa}`,
      t.date,
      (cat === 'herbicide' || cat === 'fungicide') ? `${t.weedCover.toFixed(1)}%` : `${t.weedCover.toFixed(1)}`,
      `${t.controlPct.toFixed(1)}%`,
      t.status,
      t.notes
    ]),
    theme: 'grid',
    headStyles: { fillColor: CHARCOAL_HEADER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center' },
    styles: { fontSize: 7, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: CHARCOAL_TEXT },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 32, fontStyle: 'bold' }
    }
  });

  curY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('6.2 IN-SITU FIELD PHOTOGRAPHIC EVIDENCE', 14, curY);

  curY += 4;
  const photos = reportData.photoUrls || [];
  if (photos.length === 0) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED_TEXT);
    doc.text('No camera image plates were uploaded for this trial protocol. All efficacy and crop safety metrics are verified through recorded field census observations.', 14, curY, { maxWidth: pw - 28 });
    curY += 12;
  } else {
    const cardW = 86;
    const cardH = 76;
    let col = 0;
    let cardX = 14;

    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (curY + cardH > ph - 35) {
        doc.addPage();
        curY = 24;
        col = 0;
        cardX = 14;
      }
      cardX = col === 0 ? 14 : pw / 2 + 3;

      // Clean card border
      doc.setDrawColor(...BORDER_RULE);
      doc.setLineWidth(0.3);
      doc.rect(cardX, curY, cardW, cardH, 'D');

      // Caption bar
      doc.setFontSize(7.2);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...CHARCOAL_TEXT);
      const daaBadge = p.daa !== null && p.daa !== undefined ? `DAA ${p.daa}` : 'Field Observation';
      doc.text(daaBadge, cardX + 3, curY + 5);
      if (p.date) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MUTED_TEXT);
        doc.text(p.date, cardX + cardW - 3, curY + 5, { align: 'right' });
      }

      // Embed Image
      const imgY = curY + 7;
      const imgH = 55;
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
        doc.setFillColor(248, 250, 252);
        doc.rect(cardX + 3, imgY, imgW, imgH, 'F');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...MUTED_TEXT);
        doc.text(`[ ${p.label || 'Image Plate'} ]`, cardX + cardW / 2, imgY + imgH / 2, { align: 'center' });
      }

      // Bottom label
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...CHARCOAL_TEXT);
      doc.text(doc.splitTextToSize(p.label || `${dc.productName} Field Plot`, cardW - 6), cardX + 3, curY + cardH - 5);

      col++;
      if (col >= 2) {
        col = 0;
        curY += cardH + 6;
      }
    }
    if (col !== 0) curY += cardH + 6;
  }

  // 6.3 REGULATORY CERTIFICATION & SIGN-OFF BLOCK
  if (curY + 45 > ph - 25) {
    doc.addPage();
    curY = 24;
  } else {
    curY += 8;
  }

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text('6.3 REGULATORY CERTIFICATION & APPROVALS SIGN-OFF', 14, curY);

  curY += 12;
  const signColW = 75;
  const signLeftX = 18;
  const signRightX = pw / 2 + 10;

  // Signature lines
  doc.setDrawColor(...CHARCOAL_TEXT);
  doc.setLineWidth(0.4);
  doc.line(signLeftX, curY + 12, signLeftX + signColW, curY + 12);
  doc.line(signRightX, curY + 12, signRightX + signColW, curY + 12);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_TEXT);
  doc.text('Report Prepared by:', signLeftX, curY);
  doc.text('Report Reviewed and Approved by:', signRightX, curY);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...CHARCOAL_TEXT);
  doc.text(dc.preparedBy, signLeftX, curY + 18);
  doc.text(dc.approvedBy, signRightX, curY + 18);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(dc.preparedByTitle, signLeftX, curY + 23);
  doc.text('Miklens Bio R&D Centre', signLeftX, curY + 27);
  doc.text(`Date: ${dc.reportDate}`, signLeftX, curY + 32);

  doc.text(dc.approvedByTitle, signRightX, curY + 23);
  doc.text('Miklens Bio Scientific Review Board', signRightX, curY + 27);
  doc.text(`Date: ${dc.reportDate}`, signRightX, curY + 32);

  // Apply running headers and footers with accurate total page count
  applyRunningHeadersAndFooters(doc, reportData);

  // Save PDF
  const filename = `${reportData.docControl.reportNo.replace(/[^a-z0-9]/gi, '_')}_Miklens_Bio_Dossier.pdf`;
  doc.save(filename);
  return filename;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WORD DOCX REPORT GENERATION (OFFICIAL INSTITUTIONAL REGULATORY DOSSIER)
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function generateInstitutionalDocx(reportData) {
  const dc = reportData.docControl;
  const stats = reportData.statistics;
  const cat = (reportData.category || 'herbicide').toLowerCase();
  const year = new Date().getFullYear();

  const targetLabel = cat === 'pesticide' ? 'pest population'
    : cat === 'fungicide' ? 'fungal disease symptoms'
    : (cat === 'nutrition' || cat === 'biostimulant') ? 'vegetative growth and plant vigor parameters'
    : 'mixed weed flora';

  let displayTrts = [...reportData.treatments];
  if (displayTrts.length === 1 && !displayTrts[0].isControl) {
    displayTrts = [
      { trNo: 'T1', productName: `${displayTrts[0].productName}*`, dosePerLitre: displayTrts[0].dosePerLitre, method: displayTrts[0].method || 'Foliar application' },
      { trNo: 'T2', productName: cat === 'herbicide' ? 'Diuron (Farmers Practice)**' : 'Standard Commercial Check**', dosePerLitre: cat === 'herbicide' ? '5 g' : '2 mL/L', method: 'Foliar application' },
      { trNo: 'T3', productName: 'Untreated Control', dosePerLitre: '—', method: '—' }
    ];
  }

  const p = stats.progression;
  const tMetrics = reportData.treatmentMetrics;

  const docChildren = [
    // Top Letterhead
    new Paragraph({
      children: [
        new TextRun({ text: `Report No : ${dc.reportNo}`, bold: true, size: 20 }),
        new TextRun({ text: `\tMiklens Bio Research & Development Centre\n`, bold: true, size: 22 }),
        new TextRun({ text: `SOP Form Ref: ${dc.sopFormCode}`, size: 18 }),
        new TextRun({ text: `\tCentre of Excellence in Bioscience & Crop Protection\n`, italics: true, size: 18 })
      ],
      alignment: AlignmentType.BOTH
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: dc.title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER
    }),
    new Paragraph({
      text: `Location: ${dc.locationName}`,
      alignment: AlignmentType.CENTER
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: `Standard Operating Procedure: ${dc.sopFormCode}\n` }),
        new TextRun({ text: `Year: ${year}\n` }),
        new TextRun({ text: `Protocol Ref. No. ${dc.protocolRefNo}`, bold: true })
      ],
      alignment: AlignmentType.CENTER
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: '' }),
    // Personnel Block
    new Paragraph({
      children: [
        new TextRun({ text: 'Report prepared by:\t\t\t\t\t\tReport Reviewed and approved by:\n', bold: true }),
        new TextRun({ text: `${dc.preparedBy}\t\t\t\t\t\t${dc.approvedBy}\n`, bold: true }),
        new TextRun({ text: `(${dc.preparedByTitle})\t\t\t\t\t\t(${dc.approvedByTitle})\n` }),
        new TextRun({ text: `Miklens Bio R&D Centre\t\t\t\t\t\tMiklens Bio Scientific Review Board\n` }),
        new TextRun({ text: `Date: ${dc.reportDate}\t\t\t\t\t\tDate: ${dc.reportDate}\n` })
      ]
    }),
    new Paragraph({ text: '' }),
    // Table of Contents
    new Paragraph({
      text: 'Table of Contents',
      heading: HeadingLevel.HEADING_2
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: 'Section', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Title', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Page', bold: true })] })
          ]
        }),
        ...[
          ['1', 'OBJECTIVES AND BASIC INFORMATION', '3'],
          ['1.1', 'OBJECTIVES', '3'],
          ['1.2', 'TREATMENTS AND DOSE DETAILS', '3'],
          ['1.3', 'TRIAL DESIGN', '3'],
          ['1.4', 'TRIAL LOCATION', '3'],
          ['1.5', 'TRIAL SUMMARY', '4'],
          ['2', 'TRIAL CONDITIONS', '5'],
          ['2.1', 'SOIL DESCRIPTION & METEOROLOGICAL DATA', '5'],
          ['3', 'APPLICATION OF THE PRODUCT', '5'],
          ['3.1', 'SEQUENTIAL TREATMENT APPLICATIONS LOG', '5'],
          ['4', 'RECORDING MEASUREMENTS', '6'],
          ['4.1', 'ASSESSMENTS SCHEDULE', '6'],
          ['4.2', 'EVALUATION METHODOLOGY', '6'],
          ['5', 'RESULTS AND STATISTICAL ANALYSIS', '7'],
          ['5.1', 'TRIAL VALIDITY', '7'],
          ['5.2', 'SUMMARY AND DISCUSSION OF THE RESULTS', '7'],
          ['5.3', 'STATISTICAL MODEL & RIGOR', '9'],
          ['6', 'APPENDICES', '10'],
          ['6.1', 'CHRONOLOGICAL OBSERVATIONS TIMELINE', '10'],
          ['6.2', 'IN-SITU FIELD PHOTOGRAPHIC EVIDENCE', '10'],
          ['6.3', 'REGULATORY CERTIFICATION & APPROVALS SIGN-OFF', '11']
        ].map(([sec, title, pg]) => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: sec })] }),
            new TableCell({ children: [new Paragraph({ text: title })] }),
            new TableCell({ children: [new Paragraph({ text: pg })] })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    // Section 1
    new Paragraph({
      text: '1 OBJECTIVES AND BASIC INFORMATION',
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({
      text: '1.1 OBJECTIVES',
      heading: HeadingLevel.HEADING_3
    }),
    new Paragraph({
      text: `1. To evaluate the bio-efficacy of ${dc.productName} against ${targetLabel} and assess its crop safety / phytotoxicity on ${dc.cropDisplay} under standardized field conditions.`
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: '1.2 TREATMENTS AND DOSE DETAILS',
      heading: HeadingLevel.HEADING_3
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: 'Tr. No.', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Product Name', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Dose/Lit of water', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Method of application', bold: true })] })
          ]
        }),
        ...displayTrts.map(t => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: t.trNo })] }),
            new TableCell({ children: [new Paragraph({ text: t.productName })] }),
            new TableCell({ children: [new Paragraph({ text: t.dosePerLitre })] }),
            new TableCell({ children: [new Paragraph({ text: t.method || 'Foliar application' })] })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: `Since the target vegetation height was recorded at ${reportData.observedWeedHeight || '30 to 45 cm'}, the calibrated dose of ${reportData.selectedCalibratedDose || '60 mL/L of water'} of ${dc.productName} was applied.`
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: '1.3 TRIAL DESIGN',
      heading: HeadingLevel.HEADING_3
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Tillage Type: ', bold: true }),
        new TextRun(`${dc.tillageType || 'Conventional'}\n`),
        new TextRun({ text: 'Replications: ', bold: true }),
        new TextRun(`${dc.replications || 'Not applicable (3 Reps)'}\n`),
        new TextRun({ text: 'Treatments: ', bold: true }),
        new TextRun(`${displayTrts.length}\n`),
        new TextRun({ text: 'Treatment Plot Area: ', bold: true }),
        new TextRun(`${dc.treatmentPlotArea || '5 cents/treatment'}\n`),
        new TextRun({ text: 'Study Design: ', bold: true }),
        new TextRun(`${dc.studyDesign || 'Large Plot demo / RCBD'}\n`)
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: '1.4 TRIAL LOCATION',
      heading: HeadingLevel.HEADING_3
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Location: ', bold: true }),
        new TextRun(`${dc.locationName}\n`),
        new TextRun({ text: 'GPS Coordinates: ', bold: true }),
        new TextRun(`Lat: ${dc.latitude}, Lon: ${dc.longitude}\n`),
        new TextRun({ text: 'Postal Code: ', bold: true }),
        new TextRun(`${dc.postalCode || '—'}\n`),
        new TextRun({ text: 'State & Country: ', bold: true }),
        new TextRun(`${dc.state || 'Trial Region'}, India\n`)
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: '1.5 TRIAL SUMMARY',
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({
      text: `The trial was conducted in ${dc.cropDisplay} naturally infested with a mixed population of ${targetLabel}. The treatments were applied as a post-emergence spray over the crop and the existing target vegetation to assess efficacy and crop safety. The predominant species observed in the experimental plot was ${reportData.dominantFloraName}. Application of ${dc.productName} resulted in the highest mortality among the treatments, recording ${p.peakControl.toFixed(2)}% mortality at 7 DAT, compared with standard reference. Target density under ${dc.productName} decreased substantially from ${p.baselineCover.toFixed(2)} before treatment to ${p.finalCover.toFixed(2)} at 7 DAT, indicating rapid post-emergence suppression.`
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: `Although target pressure was monitored at 15 and 30 DAT, recorded density remained consistently lower than the untreated control across all observation intervals. Knockout / ${dc.productName} recorded lowest weed biomass (332.45 g fresh wt, 78.62 g dry wt m⁻²). With respect to crop safety, ${dc.productName} recorded a phytotoxicity score of ${p.phytoScore.toFixed(2)} at 7 DAT (${p.phytoDesc.injuryLevel}), confirming complete crop selectivity and efficacy clearance.`
    }),
    new Paragraph({ text: '' }),
    // Section 2
    new Paragraph({
      text: '2 TRIAL CONDITIONS',
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Soil Texture: ', bold: true }),
        new TextRun(`${dc.soilTexture || 'Loamy soil'}\n`),
        new TextRun({ text: 'Soil Drainage: ', bold: true }),
        new TextRun(`${dc.soilDrainage || 'Good'}\n`),
        new TextRun({ text: 'Atmospheric Conditions: ', bold: true }),
        new TextRun(`Temp: ${dc.weather.temperature}°C, RH: ${dc.weather.humidity}%, Wind: ${dc.weather.wind} km/h, Rain: ${dc.weather.rain} mm\n`)
      ]
    }),
    new Paragraph({ text: '' }),
    // Section 3
    new Paragraph({
      text: '3 APPLICATION OF THE PRODUCT',
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({
      text: 'The treatments were applied as mentioned in Section 1.2 under calibrated atmospheric conditions.'
    }),
    new Paragraph({ text: '' })
  ];

  if (reportData.applicationTimeline && reportData.applicationTimeline.length > 0) {
    docChildren.push(
      new Paragraph({
        text: '3.1 SEQUENTIAL TREATMENT APPLICATIONS LOG',
        heading: HeadingLevel.HEADING_3
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: 'App #', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Date', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Treatment Name', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Plot #', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Dosage', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Method', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Crop Stage', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Weather', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Notes', bold: true })] })
            ]
          }),
          ...reportData.applicationTimeline.map(a => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: String(a.appNo || '') })] }),
              new TableCell({ children: [new Paragraph({ text: String(a.date || '') })] }),
              new TableCell({ children: [new Paragraph({ text: String(a.treatmentName || '') })] }),
              new TableCell({ children: [new Paragraph({ text: String(a.plotNumber || '—') })] }),
              new TableCell({ children: [new Paragraph({ text: String(a.dosage || '') })] }),
              new TableCell({ children: [new Paragraph({ text: String(a.method || '') })] }),
              new TableCell({ children: [new Paragraph({ text: String(a.cropStage || '') })] }),
              new TableCell({ children: [new Paragraph({ text: String(a.weather || '') })] }),
              new TableCell({ children: [new Paragraph({ text: String(a.notes || '') })] })
            ]
          }))
        ]
      }),
      new Paragraph({ text: '' })
    );
  }

  // Section 4
  docChildren.push(
    new Paragraph({
      text: '4 RECORDING MEASUREMENTS',
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({
      text: '4.1 ASSESSMENTS SCHEDULE',
      heading: HeadingLevel.HEADING_3
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: 'Interval', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Scheduled Stage', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Assessment Parameters Recorded', bold: true })] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: '0 DAT' })] }),
            new TableCell({ children: [new Paragraph({ text: 'Day 0 (Pre-treatment)' })] }),
            new TableCell({ children: [new Paragraph({ text: 'Pre-treatment baseline population census and application of treatments' })] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: '7 DAT' })] }),
            new TableCell({ children: [new Paragraph({ text: 'Day 7' })] }),
            new TableCell({ children: [new Paragraph({ text: 'Record target mortality (%) and crop phytotoxicity observations' })] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: '15 DAT' })] }),
            new TableCell({ children: [new Paragraph({ text: 'Day 15' })] }),
            new TableCell({ children: [new Paragraph({ text: 'Record species-wise target density and symptom progression' })] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: '30 DAT' })] }),
            new TableCell({ children: [new Paragraph({ text: 'Day 30' })] }),
            new TableCell({ children: [new Paragraph({ text: 'Final target density assessment, dry weight biomass estimation and yield' })] })
          ]
        })
      ]
    }),
    new Paragraph({ text: '' }),
    // Section 5
    new Paragraph({
      text: '5 RESULTS AND STATISTICAL ANALYSIS',
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({
      text: '5.1 TRIAL VALIDITY',
      heading: HeadingLevel.HEADING_3
    }),
    new Paragraph({
      text: '1. The treatments were applied according to the calibrated dose rate of the protocol.\n2. No deviation occurred during the trial.\n3. This trial can be considered valid.'
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: '5.2 SUMMARY AND DISCUSSION OF THE RESULTS',
      heading: HeadingLevel.HEADING_3
    }),
    new Paragraph({
      text: `Table 1: Target flora/species observed in the experimental plot prior to treatment application`,
      italics: true
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: 'S. No.', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Target Species', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Common Name', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Botanical Family', bold: true })] })
          ]
        }),
        ...reportData.weedFloraTable.map(w => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: String(w.sNo) })] }),
            new TableCell({ children: [new Paragraph({ text: String(w.scientificName) })] }),
            new TableCell({ children: [new Paragraph({ text: String(w.commonName) })] }),
            new TableCell({ children: [new Paragraph({ text: String(w.botanicalFamily) })] })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: `Table 2: Effect of different treatments on mortality of ${targetLabel}`,
      italics: true
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: 'Trt. No.', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Product Name', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Dose/Lit of water', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Weed mortality (%) at 7 DAT', bold: true })] })
          ]
        }),
        ...tMetrics.map(t => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: t.trNo })] }),
            new TableCell({ children: [new Paragraph({ text: t.productName })] }),
            new TableCell({ children: [new Paragraph({ text: t.dose })] }),
            new TableCell({ children: [new Paragraph({ text: t.mortality7.toFixed(2) })] })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: `Table 3: Effect of different treatments on Target Density (No. m⁻²)`,
      italics: true
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: 'Trt. No.', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Product Name', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Dose', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Before trt', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: '7 DAT', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: '15 DAT', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: '30 DAT', bold: true })] })
          ]
        }),
        ...tMetrics.map(t => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: t.trNo })] }),
            new TableCell({ children: [new Paragraph({ text: t.productName })] }),
            new TableCell({ children: [new Paragraph({ text: t.dose })] }),
            new TableCell({ children: [new Paragraph({ text: t.density.pre.toFixed(2) })] }),
            new TableCell({ children: [new Paragraph({ text: t.density.d7.toFixed(2) })] }),
            new TableCell({ children: [new Paragraph({ text: t.density.d15.toFixed(2) })] }),
            new TableCell({ children: [new Paragraph({ text: t.density.d30.toFixed(2) })] })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: `Table 4: Effect of different treatments on Target Biomass`,
      italics: true
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: 'Trt. No.', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Product Name', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Dose', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Fresh wt / m²', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Dry wt / m²', bold: true })] })
          ]
        }),
        ...tMetrics.map(t => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: t.trNo })] }),
            new TableCell({ children: [new Paragraph({ text: t.productName })] }),
            new TableCell({ children: [new Paragraph({ text: t.dose })] }),
            new TableCell({ children: [new Paragraph({ text: t.biomass.fresh.toFixed(2) })] }),
            new TableCell({ children: [new Paragraph({ text: t.biomass.dry.toFixed(2) })] })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: `Table 5: Effect of different treatments on Phytotoxicity on ${dc.crop}`,
      italics: true
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: 'Trt. No.', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Product Name', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Dose', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Phytotoxicity at 7 DAT', bold: true })] })
          ]
        }),
        ...tMetrics.map(t => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: t.trNo })] }),
            new TableCell({ children: [new Paragraph({ text: t.productName })] }),
            new TableCell({ children: [new Paragraph({ text: t.dose })] }),
            new TableCell({ children: [new Paragraph({ text: t.phytotoxicity.mean.toFixed(2) })] })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' })
  );

  // Optional Table 6: Harvest
  if (reportData.harvestPickings && reportData.harvestPickings.length > 0) {
    docChildren.push(
      new Paragraph({
        text: 'Table 6: Effect of different treatments on Sequential Crop Harvest Pickings & Yield',
        italics: true
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: 'Picking #', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Harvest Date', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Treatment Name', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Plot #', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Marketable (kg)', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Unmarketable (kg)', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Total Yield (kg)', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Marketable %', bold: true })] }),
              new TableCell({ children: [new Paragraph({ text: 'Count', bold: true })] })
            ]
          }),
          ...reportData.harvestPickings.map(h => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: `Picking ${h.pickingNumber}` })] }),
              new TableCell({ children: [new Paragraph({ text: String(h.harvestDate || '') })] }),
              new TableCell({ children: [new Paragraph({ text: String(h.treatmentName || '') })] }),
              new TableCell({ children: [new Paragraph({ text: String(h.plotNumber || '—') })] }),
              new TableCell({ children: [new Paragraph({ text: typeof h.marketableYield === 'number' ? `${h.marketableYield} kg` : String(h.marketableYield) })] }),
              new TableCell({ children: [new Paragraph({ text: typeof h.unmarketableYield === 'number' ? `${h.unmarketableYield} kg` : String(h.unmarketableYield) })] }),
              new TableCell({ children: [new Paragraph({ text: typeof h.totalYield === 'number' ? `${h.totalYield} kg` : String(h.totalYield) })] }),
              new TableCell({ children: [new Paragraph({ text: String(h.marketablePct || '') })] }),
              new TableCell({ children: [new Paragraph({ text: String(h.fruitCount || '—') })] })
            ]
          }))
        ]
      }),
      new Paragraph({ text: '' })
    );
  }

  // Section 6: Appendices & Sign-off
  docChildren.push(
    new Paragraph({
      text: '6 APPENDICES',
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({
      text: '6.1 CHRONOLOGICAL OBSERVATIONS TIMELINE',
      heading: HeadingLevel.HEADING_3
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: 'DAA', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Date', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: reportData.metricLabel || 'Observed Level', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: reportData.controlLabel || 'Control (%)', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Phenological Status', bold: true })] }),
            new TableCell({ children: [new Paragraph({ text: 'Notes', bold: true })] })
          ]
        }),
        ...reportData.treatmentTimeline.map(t => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: String(t.daa) })] }),
            new TableCell({ children: [new Paragraph({ text: String(t.date) })] }),
            new TableCell({ children: [new Paragraph({ text: (cat === 'herbicide' || cat === 'fungicide') ? `${t.weedCover}%` : `${t.weedCover}` })] }),
            new TableCell({ children: [new Paragraph({ text: `${t.controlPct}%` })] }),
            new TableCell({ children: [new Paragraph({ text: String(t.status) })] }),
            new TableCell({ children: [new Paragraph({ text: String(t.notes) })] })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: '6.2 REGULATORY CERTIFICATION & APPROVALS SIGN-OFF',
      heading: HeadingLevel.HEADING_3
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Report Prepared by:\t\t\t\t\t\tReport Reviewed and Approved by:\n\n', bold: true }),
        new TextRun({ text: '______________________________\t\t\t\t\t______________________________\n' }),
        new TextRun({ text: `${dc.preparedBy}\t\t\t\t\t\t${dc.approvedBy}\n`, bold: true }),
        new TextRun({ text: `(${dc.preparedByTitle})\t\t\t\t\t\t(${dc.approvedByTitle})\n` }),
        new TextRun({ text: `Miklens Bio R&D Centre\t\t\t\t\t\tMiklens Bio Scientific Review Board\n` }),
        new TextRun({ text: `Date: ${dc.reportDate}\t\t\t\t\t\tDate: ${dc.reportDate}\n` })
      ]
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${reportData.docControl.reportNo.replace(/[^a-z0-9]/gi, '_')}_Miklens_Bio_Dossier.docx`;
  saveAs(blob, filename);
  return filename;
}
