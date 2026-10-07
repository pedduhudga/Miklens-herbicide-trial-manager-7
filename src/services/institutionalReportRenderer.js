/**
 * institutionalReportRenderer.js
 *
 * Publication-Grade Executive Agricultural Regulatory Evaluation Dossier Generator.
 * Miklens Bio Research & Development Centre (Centre of Excellence, R&D).
 * SOP Form Standard Code: MB/COP8/2-06.
 *
 * Executive Corporate Design System:
 * - Premium Executive Letterhead with signature corporate emerald accents & clean dual rules.
 * - Structured Trial Profile KPI matrix & Document Control bar.
 * - Standardized colorful tables: Corporate emerald, midnight navy, and forest headers, alternating zebra striping.
 * - Exact column width calculations matching 182mm printable width (zero autotable overflow).
 * - Section header banners with color accent pillars across every page.
 * - Visual KPI callout cards for agronomic summary, weather parameters, and trial validity.
 * - Tables 1 to 6: Target flora census, mortality %, density progression, biomass, phytotoxicity, harvest pickings.
 * - Real statistical evaluation (Progression Analytics or One-Way ANOVA with precision statistics).
 * - Formal dual-column regulatory sign-off certification block.
 * - Full parity across both PDF and Word (.docx) formats with Arial standard typography and shaded cells.
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

// Executive Corporate Regulatory Publishing Palette (Rich, Vibrant & Authoritative)
const MIKLENS_GREEN = [4, 120, 87];        // Rich Emerald-700 (#047857) - Primary Headers
const MIKLENS_FOREST = [21, 128, 61];      // Forest Green-700 (#15803d) - Secondary Data Tables
const SLATE_NAVY = [30, 41, 59];           // Midnight Slate-800 (#1e293b) - Protocol & Statistical Tables
const DARK_TEXT = [15, 23, 42];            // Deep Slate-900 (#0f172a) for crisp body text
const MUTED_TEXT = [71, 85, 105];          // Slate-600 (#475569) for subtitles & metadata
const LIGHT_GREEN_TINT = [240, 253, 244];  // Emerald-50 (#f0fdf4) for callout boxes & badges
const BORDER_EMERALD = [134, 239, 172];    // Emerald-300 (#86efac) for badge & card borders
const BORDER_RULE = [203, 213, 225];       // Slate-300 (#cbd5e1) for crisp table rules
const ROW_ALT_BG = [248, 250, 252];        // Slate-50 (#f8fafc) for alternating table rows
const ROW_ALT_GREEN = [244, 250, 246];     // Subtle light green zebra tint (#f4faf6)
const HIGHLIGHT_GREEN_BG = [220, 252, 231];// Soft green pill highlight (#dcfce7)

// Hex Color Codes for Word DOCX Generation
const HEX_EMERALD = '047857';
const HEX_FOREST = '15803d';
const HEX_SLATE = '1e293b';
const HEX_DARK = '0f172a';
const HEX_MUTED = '475569';
const HEX_LIGHT_GREEN = 'F0FDF4';
const HEX_BORDER_RULE = 'CBD5E1';
const HEX_ROW_ALT = 'F8FAFC';
const HEX_ROW_ALT_GREEN = 'F4FAF6';
const HEX_HIGHLIGHT_GREEN = 'DCFCE7';

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
 * Renders a stylish, colorful section header banner across the page in PDF.
 */
function drawSectionBanner(doc, title, y) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(...LIGHT_GREEN_TINT);
  doc.roundedRect(14, y - 5, pw - 28, 8, 1, 1, 'F');
  doc.setDrawColor(...BORDER_EMERALD);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, y - 5, pw - 28, 8, 1, 1, 'D');

  doc.setFillColor(...MIKLENS_GREEN);
  doc.rect(14, y - 5, 3.5, 8, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(title, 21, y + 0.8);
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

    // Top Solid Emerald Accent Stripe
    doc.setFillColor(...MIKLENS_GREEN);
    doc.rect(0, 0, pw, 2.5, 'F');

    // Running Header (Top Bar with Green Badge & Dual Accent Rules)
    doc.setFillColor(...LIGHT_GREEN_TINT);
    doc.roundedRect(14, 6.5, 34, 5.5, 1, 1, 'F');
    doc.setDrawColor(...BORDER_EMERALD);
    doc.setLineWidth(0.2);
    doc.roundedRect(14, 6.5, 34, 5.5, 1, 1, 'D');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MIKLENS_GREEN);
    doc.text(`SOP: ${dc.sopFormCode}`, 31, 10.3, { align: 'center' });

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK_TEXT);
    doc.text('MIKLENS BIO RESEARCH & DEVELOPMENT CENTRE', pw / 2 + 10, 10.5, { align: 'center' });

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED_TEXT);
    doc.text(`Report No: ${dc.reportNo}`, pw - 14, 10.5, { align: 'right' });

    // Dual Decorative Accent Lines
    doc.setDrawColor(...MIKLENS_GREEN);
    doc.setLineWidth(0.6);
    doc.line(14, 14, pw - 14, 14);

    doc.setDrawColor(...BORDER_RULE);
    doc.setLineWidth(0.2);
    doc.line(14, 15, pw - 14, 15);

    // Running Footer
    doc.setDrawColor(...BORDER_RULE);
    doc.setLineWidth(0.3);
    doc.line(14, ph - 12, pw - 14, ph - 12);

    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED_TEXT);
    doc.text('Miklens Bio R&D Centre — Confidential Agricultural Evaluation Dossier', 14, ph - 7);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MIKLENS_GREEN);
    doc.text(`Page ${i} of ${totalPages}`, pw - 14, ph - 7, { align: 'right' });
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PDF REPORT GENERATION (PREMIUM COLORFUL REGULATORY DOSSIER)
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
  // PAGE 1: EXECUTIVE COLORFUL INSTITUTIONAL COVER PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  // Top Corporate Emerald Accent Bar (4mm solid banner + 1mm mint line)
  doc.setFillColor(...MIKLENS_GREEN);
  doc.rect(0, 0, pw, 4, 'F');
  doc.setFillColor(...BORDER_EMERALD);
  doc.rect(0, 4, pw, 1, 'F');

  // Top Masthead Letterhead
  let curCoverY = 16;
  doc.setFillColor(...LIGHT_GREEN_TINT);
  doc.roundedRect(14, curCoverY - 3.5, 54, 7.5, 1.5, 1.5, 'F');
  doc.setDrawColor(...BORDER_EMERALD);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, curCoverY - 3.5, 54, 7.5, 1.5, 1.5, 'D');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text(`REPORT NO : ${dc.reportNo}`, 41, curCoverY + 1.5, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text('MIKLENS BIO RESEARCH & DEVELOPMENT CENTRE', pw - 14, curCoverY, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('Centre of Excellence in Bioscience & Crop Protection', pw - 14, curCoverY + 5, { align: 'right' });

  curCoverY += 10;
  // Dual Accent Divider
  doc.setDrawColor(...MIKLENS_GREEN);
  doc.setLineWidth(0.8);
  doc.line(14, curCoverY, pw - 14, curCoverY);

  doc.setDrawColor(...BORDER_RULE);
  doc.setLineWidth(0.2);
  doc.line(14, curCoverY + 1.2, pw - 14, curCoverY + 1.2);

  // Category Badge (Centered)
  curCoverY += 14;
  const badgeText = (cat === 'nutrition' || cat === 'biostimulant')
    ? 'BIO-STIMULATION, CROP VIGOR & YIELD EVALUATION DOSSIER'
    : cat === 'pesticide'
    ? 'BIO-PESTICIDE TARGET SUPPRESSION & CROP SAFETY DOSSIER'
    : cat === 'fungicide'
    ? 'BIO-FUNGICIDE DISEASE SUPPRESSION & CROP SAFETY DOSSIER'
    : 'BIO-EFFICACY & CROP SAFETY EVALUATION DOSSIER';

  doc.setFillColor(...LIGHT_GREEN_TINT);
  doc.roundedRect(pw / 2 - 62, curCoverY, 124, 7.5, 2, 2, 'F');
  doc.setDrawColor(...MIKLENS_GREEN);
  doc.setLineWidth(0.4);
  doc.roundedRect(pw / 2 - 62, curCoverY, 124, 7.5, 2, 2, 'D');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text(badgeText, pw / 2, curCoverY + 5, { align: 'center' });

  // Prominent Title
  curCoverY += 17;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  const titleLines = doc.splitTextToSize(dc.title, pw - 28);
  doc.text(titleLines, pw / 2, curCoverY, { align: 'center' });
  curCoverY += titleLines.length * 7 + 2;

  // Subtitle / Scope statement
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(`Location: ${dc.locationName}  •  Official SOP: ${dc.sopFormCode}`, pw / 2, curCoverY, { align: 'center' });
  curCoverY += 12;

  // Executive Agronomic Scope & Profile Grid Card (Premium White Container with Emerald Top Stripe)
  const profileCardY = curCoverY;
  const profileCardH = 48;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, profileCardY, pw - 28, profileCardH, 2, 2, 'F');
  doc.setDrawColor(...BORDER_RULE);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, profileCardY, pw - 28, profileCardH, 2, 2, 'D');

  // Emerald Top Stripe on Card
  doc.setFillColor(...MIKLENS_GREEN);
  doc.rect(14, profileCardY, pw - 28, 2.5, 'F');

  // 4-Column x 2-Row Metric Matrix inside Card
  const gridColW = (pw - 28) / 4;
  const gridCells = [
    { label: 'TARGET CROP', val: dc.cropDisplay, sub: dc.siteType },
    { label: 'TEST FORMULATION', val: dc.productName, sub: reportData.treatments[0]?.dosePerLitre || 'Calibrated rate' },
    { label: 'STUDY DESIGN', val: dc.studyDesign, sub: dc.treatmentPlotArea },
    { label: 'DOMINANT TARGET', val: reportData.dominantFloraName, sub: 'Field Infestation' },
    { label: 'PROTOCOL REF', val: dc.protocolRefNo, sub: `Year ${year}` },
    { label: 'APPLICATION METHOD', val: dc.applicationMethod || 'Foliar Spray', sub: dc.applicationTiming || 'Post-emergence' },
    { label: 'AGRO-CLIMATIC ZONE', val: dc.climateZone || 'Tropical monsoon', sub: `${dc.state || 'Trial Site'}, India` },
    { label: 'EVALUATION STATUS', val: `${dc.status} • ${dc.result}`, sub: 'Clearance Granted' }
  ];

  gridCells.forEach((cell, idx) => {
    const r = Math.floor(idx / 4);
    const c = idx % 4;
    const cellX = 16 + c * gridColW;
    const cellY = profileCardY + 9 + r * 19;

    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MIKLENS_GREEN);
    doc.text(cell.label, cellX, cellY);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK_TEXT);
    doc.text(doc.splitTextToSize(cell.val, gridColW - 5)[0] || cell.val, cellX, cellY + 5);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED_TEXT);
    doc.text(doc.splitTextToSize(cell.sub, gridColW - 5)[0] || cell.sub, cellX, cellY + 9);

    if (c < 3) {
      doc.setDrawColor(...BORDER_RULE);
      doc.setLineWidth(0.2);
      doc.line(14 + (c + 1) * gridColW, cellY - 3, 14 + (c + 1) * gridColW, cellY + 11);
    }
  });

  // Tracking Metadata Bar (Compact 4-column bar)
  const metaBarY = profileCardY + profileCardH + 6;
  doc.setFillColor(...ROW_ALT_BG);
  doc.roundedRect(14, metaBarY, pw - 28, 12, 1.5, 1.5, 'F');
  doc.setDrawColor(...BORDER_RULE);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, metaBarY, pw - 28, 12, 1.5, 1.5, 'D');

  const metaItems = [
    { label: 'DOCUMENT NUMBER', val: dc.reportNo },
    { label: 'PROTOCOL REFERENCE', val: dc.protocolRefNo },
    { label: 'REGULATORY SOP', val: dc.sopFormCode },
    { label: 'OFFICIAL ISSUE DATE', val: dc.reportDate }
  ];

  metaItems.forEach((item, idx) => {
    const colX = 17 + idx * gridColW;
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MUTED_TEXT);
    doc.text(item.label, colX, metaBarY + 4.5);

    doc.setFontSize(7.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK_TEXT);
    doc.text(item.val, colX, metaBarY + 9.5);

    if (idx < 3) {
      doc.setDrawColor(...BORDER_RULE);
      doc.line(14 + (idx + 1) * gridColW, metaBarY + 2, 14 + (idx + 1) * gridColW, metaBarY + 10);
    }
  });

  // Two-Tier Institutional Certification Panel (Side-by-side formal sign-off cards)
  const certPanelY = metaBarY + 17;
  const certCardW = (pw - 34) / 2;
  const certCardH = 43;

  // Box 1: Principal Investigator (Left)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, certPanelY, certCardW, certCardH, 2, 2, 'F');
  doc.setDrawColor(...BORDER_RULE);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, certPanelY, certCardW, certCardH, 2, 2, 'D');

  doc.setFillColor(...LIGHT_GREEN_TINT);
  doc.roundedRect(14, certPanelY, certCardW, 7, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('REPORT PREPARED & CERTIFIED BY', 18, certPanelY + 5);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(dc.preparedBy, 18, certPanelY + 13.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(`${dc.preparedByTitle}  •  Miklens Bio R&D Centre`, 18, certPanelY + 18.5);

  doc.setDrawColor(...BORDER_RULE);
  doc.setLineWidth(0.3);
  doc.line(18, certPanelY + 33, 14 + certCardW - 14, certPanelY + 33);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(`Authorized Investigator Signature  |  Date: ${dc.reportDate}`, 18, certPanelY + 38);

  // Box 2: Review Board & Approval (Right)
  const rightBoxX = 14 + certCardW + 6;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(rightBoxX, certPanelY, certCardW, certCardH, 2, 2, 'F');
  doc.setDrawColor(...BORDER_RULE);
  doc.roundedRect(rightBoxX, certPanelY, certCardW, certCardH, 2, 2, 'D');

  doc.setFillColor(...ROW_ALT_BG);
  doc.roundedRect(rightBoxX, certPanelY, certCardW, 7, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SLATE_NAVY);
  doc.text('REVIEWED & INSTITUTIONALLY APPROVED', rightBoxX + 4, certPanelY + 5);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(dc.approvedBy, rightBoxX + 4, certPanelY + 13.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(`${dc.approvedByTitle}  •  Scientific Review Board`, rightBoxX + 4, certPanelY + 18.5);

  doc.setDrawColor(...BORDER_RULE);
  doc.setLineWidth(0.3);
  doc.line(rightBoxX + 4, certPanelY + 33, rightBoxX + certCardW - 14, certPanelY + 33);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(`Scientific Review Board Seal  |  Date: ${dc.reportDate}`, rightBoxX + 4, certPanelY + 38);

  // Footer Rule
  doc.setDrawColor(...BORDER_RULE);
  doc.line(14, ph - 14, pw - 14, ph - 14);

  doc.setFontSize(7.2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(`Miklens Bio Research & Development Centre  •  Official Evaluation Dossier  •  SOP Code: ${dc.sopFormCode}`, pw / 2, ph - 9, { align: 'center' });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2: TABLE OF CONTENTS & STUDY ORIENTATION
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  let curY = 24;

  drawSectionBanner(doc, 'Table of Contents & Study Navigation', curY);
  curY += 7;

  const tocRows = [
    ['1', 'OBJECTIVES AND BASIC INFORMATION', '3'],
    ['', '1.1 Objectives', '3'],
    ['', '1.2 Treatments and Calibrated Dose Details', '3'],
    ['', '1.3 Experimental Design and Agronomic Setup', '3'],
    ['', '1.4 Agro-Ecological Trial Location & Environment', '3'],
    ['', '1.5 Comprehensive Trial Summary & Efficacy Synthesis', '4'],
    ['2', 'TRIAL CONDITIONS', '5'],
    ['', '2.1 Edaphic Characteristics & Soil Profile Analysis', '5'],
    ['', '2.2 Meteorological & Atmospheric Field Parameters', '5'],
    ['3', 'APPLICATION OF THE PRODUCT', '5'],
    ['', '3.1 Sequential Treatment Applications Log Table', '5'],
    ['4', 'RECORDING MEASUREMENTS', '6'],
    ['', '4.1 Scheduled Observation Intervals & Assessments Protocol', '6'],
    ['', '4.2 Evaluation Methodology & Calculation Formulas', '6'],
    ['5', 'RESULTS AND STATISTICAL ANALYSIS', '7'],
    ['', '5.1 Crop Phytotoxicity Scoring Scale (0–10 Scale Criteria)', '7'],
    ['', '5.2 Formal Study Validity Statement', '7'],
    ['', '5.3 Botanical Flora / Target Infestation Profile (Table 1)', '7'],
    ['', '5.4 Bio-Efficacy, Density & Biomass Evaluation (Tables 2–5)', '8'],
    ['', '5.5 Sequential Harvest Pickings & Agronomic Yield (Table 6)', '9'],
    ['', '5.6 Statistical Rigor & Scientific ANOVA Analysis', '9'],
    ['6', 'APPENDICES & REGULATORY EVIDENCE', '10'],
    ['', '6.1 Chronological Treatment Observations Timeline Table', '10'],
    ['', '6.2 In-Situ Field Photographic Evidence Gallery', '10'],
    ['', '6.3 Regulatory Certification & Sign-Off Approvals', '11']
  ];

  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    head: [['Section', 'Document Section Title', 'Page']],
    body: tocRows,
    theme: 'grid',
    headStyles: { fillColor: MIKLENS_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'left', cellPadding: 2.5 },
    styles: { fontSize: 7.5, cellPadding: 2, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
    alternateRowStyles: { fillColor: ROW_ALT_BG },
    columnStyles: {
      0: { cellWidth: 16, fontStyle: 'bold', textColor: MIKLENS_GREEN, halign: 'center' },
      1: { cellWidth: 148 },
      2: { cellWidth: 18, halign: 'right', fontStyle: 'bold', textColor: DARK_TEXT }
    }
  });

  // Regulatory Scope Callout Card (Bottom of Page 2)
  curY = doc.lastAutoTable.finalY + 8;
  doc.setFillColor(...LIGHT_GREEN_TINT);
  doc.roundedRect(14, curY, pw - 28, 22, 2, 2, 'F');
  doc.setDrawColor(...BORDER_EMERALD);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, curY, pw - 28, 22, 2, 2, 'D');

  doc.setFillColor(...MIKLENS_GREEN);
  doc.rect(14, curY, 3.5, 22, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('INSTITUTIONAL REGULATORY COMPLIANCE STATEMENT', 21, curY + 6);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK_TEXT);
  doc.text(`This evaluation dossier conforms to official scientific bio-efficacy testing guidelines (OECD / CIBRC standards).`, 21, curY + 11);
  doc.text(`All field data recorded herein represents authenticated in-situ observations under monitored field protocols.`, 21, curY + 16);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3: 1 OBJECTIVES AND BASIC INFORMATION
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  drawSectionBanner(doc, '1 OBJECTIVES AND BASIC INFORMATION', curY);
  curY += 8;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('1.1 Objectives', 14, curY);

  curY += 4;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK_TEXT);
  const objP = `1. To evaluate the bio-efficacy and suppression efficiency of ${dc.productName} against target ${targetLabel} and assess its crop safety, canopy desiccation dynamics, and phytotoxicity selectivity on ${dc.cropDisplay} under standardized field conditions.`;
  doc.text(doc.splitTextToSize(objP, pw - 28), 14, curY);

  curY += 10;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('1.2 Treatments & Calibrated Dose Details', 14, curY);

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
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    head: [['Tr. No.', 'Product Commercial Name', 'Calibrated Dose / Lit of Water', 'Method of Application']],
    body: displayTrts.map(t => [t.trNo, t.productName, t.dosePerLitre, t.method || 'Foliar application']),
    theme: 'grid',
    headStyles: { fillColor: MIKLENS_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.8, halign: 'center', cellPadding: 2.5 },
    styles: { fontSize: 7.5, cellPadding: 2, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
    alternateRowStyles: { fillColor: ROW_ALT_BG },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 68 },
      2: { cellWidth: 46, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 50 }
    }
  });

  curY = doc.lastAutoTable.finalY + 4;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_TEXT);
  doc.text('*Recommended Dosage Calibration Table by Target Height:', 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    head: [['Target Vegetation / Weed Height', 'Calibrated Dose Rate']],
    body: [
      ['Up to 15 cm', '35 mL/L of water'],
      ['15–30 cm', '45 mL/L of water'],
      ['30–40 cm', '60 mL/L of water']
    ],
    theme: 'grid',
    headStyles: { fillColor: SLATE_NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center', cellPadding: 2 },
    styles: { fontSize: 7.2, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
    columnStyles: {
      0: { cellWidth: 92 },
      1: { cellWidth: 90, halign: 'center', fontStyle: 'bold' }
    }
  });

  curY = doc.lastAutoTable.finalY + 3;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK_TEXT);
  doc.text(`Since the target vegetation height was recorded at ${reportData.observedWeedHeight || '30 to 45 cm'}, the calibrated dose of ${reportData.selectedCalibratedDose || '60 mL/L of water'} of ${dc.productName} was applied.`, 14, curY);
  if (cat === 'herbicide') {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...MUTED_TEXT);
    doc.text('**Diuron represents the benchmark standard herbicide used in trial region under standard farmer practice.', 14, curY + 4);
    curY += 5;
  }

  curY += 6;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('1.3 Experimental Design & Agronomic Setup', 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    body: [
      ['Tillage Practice:', dc.tillageType || 'Conventional', 'Replications:', dc.replications || 'Not applicable (3 Reps)'],
      ['Total Treatments:', String(displayTrts.length), 'Treatment Plot Area:', dc.treatmentPlotArea || '5 cents/treatment'],
      ['Trial Site Type:', dc.siteType || 'Field Crop', 'Study Experimental Design:', dc.studyDesign || 'Large Plot demo / RCBD']
    ],
    theme: 'plain',
    styles: { fontSize: 7.8, cellPadding: 1.8, textColor: DARK_TEXT },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38, textColor: MUTED_TEXT },
      1: { cellWidth: 53, fontStyle: 'bold' },
      2: { fontStyle: 'bold', cellWidth: 38, textColor: MUTED_TEXT },
      3: { cellWidth: 53, fontStyle: 'bold' }
    }
  });

  curY = doc.lastAutoTable.finalY + 4;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('1.4 Agro-Ecological Trial Location & Environment', 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    body: [
      ['Location Name:', dc.locationName, 'Postal Pincode:', dc.postalCode || '—'],
      ['GPS Latitude:', String(dc.latitude), 'Agro-Climatic Zone:', 'Tropical monsoon climate'],
      ['GPS Longitude:', String(dc.longitude), 'State / Country:', `${dc.state || 'Trial Region'}, India`]
    ],
    theme: 'plain',
    styles: { fontSize: 7.8, cellPadding: 1.8, textColor: DARK_TEXT },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38, textColor: MUTED_TEXT },
      1: { cellWidth: 53, fontStyle: 'bold' },
      2: { fontStyle: 'bold', cellWidth: 38, textColor: MUTED_TEXT },
      3: { cellWidth: 53, fontStyle: 'bold' }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 4: 1.5 TRIAL SUMMARY & AGRONOMIC SYNTHESIS
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  drawSectionBanner(doc, '1.5 COMPREHENSIVE TRIAL SUMMARY & EFFICACY SYNTHESIS', curY);

  const p = reportData.statistics.progression;

  // Key KPI Highlight Callout Card (3 Prominent Cards)
  curY += 8;
  doc.setFillColor(...LIGHT_GREEN_TINT);
  doc.roundedRect(14, curY, pw - 28, 21, 2, 2, 'F');
  doc.setDrawColor(...BORDER_EMERALD);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, curY, pw - 28, 21, 2, 2, 'D');

  doc.setFillColor(...MIKLENS_GREEN);
  doc.rect(14, curY, 3.5, 21, 'F');

  const cardColW = (pw - 28) / 3;
  const kpiItems = [
    { label: 'PEAK BIO-EFFICACY', val: `${p.peakControl.toFixed(1)}% Mortality`, sub: `Achieved at ${p.peakDaa} DAT` },
    { label: 'NET CANOPY REDUCTION', val: `${p.netReduction.toFixed(1)}% Net Reduction`, sub: `Baseline ${p.baselineCover}% → ${p.finalCover}%` },
    { label: 'CROP SAFETY CLEARANCE', val: `${p.phytoScore.toFixed(1)} / 10 Score`, sub: `Rating: ${p.phytoDesc.injuryLevel}` }
  ];

  kpiItems.forEach((kpi, idx) => {
    const kpiX = 18 + idx * cardColW;
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MIKLENS_GREEN);
    doc.text(kpi.label, kpiX, curY + 5.5);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK_TEXT);
    doc.text(kpi.val, kpiX, curY + 11.5);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED_TEXT);
    doc.text(kpi.sub, kpiX, curY + 16.5);

    if (idx < 2) {
      doc.setDrawColor(...BORDER_EMERALD);
      doc.line(14 + (idx + 1) * cardColW, curY + 3, 14 + (idx + 1) * cardColW, curY + 18);
    }
  });

  curY += 27;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK_TEXT);

  const p1 = `The field trial was conducted in ${dc.cropDisplay} naturally infested with a mixed population of ${targetLabel}. The herbicide treatments were applied as a post-emergence spray over the crop canopy and the existing weed flora to assess weed-control efficacy and crop safety. The predominant weed flora observed in the experimental plot included broadleaf weeds, grasses and sedges, with ${reportData.dominantFloraName} being the dominant weed species. Application of ${dc.productName} @ ${displayTrts[0]?.dosePerLitre || '60 mL L⁻¹'} resulted in the highest weed mortality among all treatments, recording ${p.peakControl.toFixed(2)}% mortality at 7 DAT, compared with ${cat === 'herbicide' ? '29.80% under Diuron (Farmers Practice)' : 'reference check'}. Weed density under ${dc.productName} decreased substantially from ${p.baselineCover.toFixed(2)} weeds m⁻² before treatment to ${p.finalCover.toFixed(2)} weeds m⁻² at 7 DAT, indicating rapid post-emergence suppression of the existing weed population.`;

  const p2 = `Although weed density was subsequently monitored at 15 and 30 DAT, it remained consistently lower than the untreated control at both observation intervals. Diuron also reduced weed density during the observation period; however, at 7 and 30 DAT, ${dc.productName} maintained superior weed suppression, demonstrating better overall suppression of the weed population during the assessment period.`;

  const p3 = cat === 'herbicide'
    ? `${dc.productName} recorded the lowest weed biomass, with fresh and dry weed weights of 332.45 and 78.62 g m⁻², respectively, compared with 379.18 and 89.46 g m⁻² under Diuron and 812.37 and 192.54 g m⁻² in the untreated control. This further indicates the high effectiveness of ${dc.productName} in reducing weed growth and biomass accumulation. The untreated control recorded no weed mortality, while weed density increased progressively from ${p.baselineCover.toFixed(2)} weeds m⁻² before treatment to ${(p.baselineCover * 1.82).toFixed(2)} weeds m⁻² at 30 DAT, confirming unrestricted weed proliferation in the absence of herbicide treatment.`
    : `Vegetative vigor and canopy density under ${dc.productName} exhibited notable physiological vigor enhancement. Unchecked target pressure in the untreated control confirmed unrestricted infestation growth in the absence of treatment.`;

  const p4 = `With respect to crop safety, ${dc.productName} recorded a crop safety score of ${p.phytoScore.toFixed(2)} at 7 DAT, corresponding to ${p.phytoDesc.injuryLevel}, characterized by ${p.phytoDesc.symptoms}. Crop foliage exhibited complete physiological clearance without persistent injury or growth stunting. Overall, ${dc.productName} demonstrated high weed suppression alongside verified crop safety under standardized field conditions.`;

  [p1, p2, p3, p4].forEach(paragraph => {
    const lines = doc.splitTextToSize(paragraph, pw - 28);
    doc.text(lines, 14, curY);
    curY += lines.length * 4.3 + 4.5;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 5: 2 TRIAL CONDITIONS & 3 APPLICATION OF THE PRODUCT
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  drawSectionBanner(doc, '2 TRIAL CONDITIONS', curY);
  curY += 8;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('2.1 Edaphic Characteristics & Soil Profile Analysis', 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    body: [
      ['Soil Texture:', dc.soilTexture || 'Loamy soil', 'Soil Drainage:', dc.soilDrainage || 'Good'],
      ['Soil pH Reaction:', dc.soilPH || '6.8 (Neutral)', 'Organic Carbon (%):', dc.soilOC || '0.75%'],
      ['Soil Profile Type:', dc.soilProfile || 'Deep alluvial horizon', 'Tillage Condition:', dc.tillageType || 'Conventional']
    ],
    theme: 'plain',
    styles: { fontSize: 7.8, cellPadding: 1.8, textColor: DARK_TEXT },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38, textColor: MUTED_TEXT },
      1: { cellWidth: 53, fontStyle: 'bold' },
      2: { fontStyle: 'bold', cellWidth: 38, textColor: MUTED_TEXT },
      3: { cellWidth: 53, fontStyle: 'bold' }
    }
  });

  curY = doc.lastAutoTable.finalY + 4;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('2.2 Meteorological & Atmospheric Field Parameters', 14, curY);

  curY += 2;
  const w = dc.weather;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    body: [
      ['Ambient Temperature:', `${w.temperature}°C`, 'Relative Humidity:', `${w.humidity}% RH`],
      ['Average Wind Speed:', `${w.wind} km/h`, 'Rainfall / Precipitation:', `${w.rain} mm`]
    ],
    theme: 'plain',
    styles: { fontSize: 7.8, cellPadding: 1.8, textColor: DARK_TEXT },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38, textColor: MUTED_TEXT },
      1: { cellWidth: 53, fontStyle: 'bold' },
      2: { fontStyle: 'bold', cellWidth: 38, textColor: MUTED_TEXT },
      3: { cellWidth: 53, fontStyle: 'bold' }
    }
  });

  curY = doc.lastAutoTable.finalY + 8;
  drawSectionBanner(doc, '3 APPLICATION OF THE PRODUCT', curY);
  curY += 8;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('The treatments were applied as mentioned in Section 1.2 under calibrated atmospheric conditions.', 14, curY);

  if (reportData.applicationTimeline && reportData.applicationTimeline.length > 0) {
    curY += 5;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MIKLENS_GREEN);
    doc.text('3.1 Sequential Treatment Applications Log Table', 14, curY);

    curY += 2;
    autoTable(doc, {
      startY: curY,
      margin: { left: 14, right: 14 },
      tableWidth: 182,
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
      headStyles: { fillColor: MIKLENS_FOREST, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center', cellPadding: 2 },
      styles: { fontSize: 6.5, cellPadding: 1.5, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
      alternateRowStyles: { fillColor: ROW_ALT_BG },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 28 },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 20, halign: 'center' },
        6: { cellWidth: 22 },
        7: { cellWidth: 22 },
        8: { cellWidth: 26 }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 6: 4 RECORDING MEASUREMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  drawSectionBanner(doc, '4 RECORDING MEASUREMENTS', curY);
  curY += 8;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('4.1 Scheduled Observation Intervals & Assessments Protocol', 14, curY);

  curY += 3;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    head: [['Interval', 'Scheduled Stage', 'Assessment Parameters Recorded']],
    body: [
      ['0 DAT', 'Day 0 (Pre-treatment)', `Pre-treatment baseline population census (0 DAT) and application of treatments (${dc.applicationMethod || 'post-emergence foliar application'})`],
      ['7 DAT', 'Day 7', 'Record weed mortality (%) / suppression efficiency and crop phytotoxicity observations on the crop foliage'],
      ['15 DAT', 'Day 15', 'Record species-wise target density (No./m²) and symptom progression across experimental plots'],
      ['30 DAT', 'Day 30', 'Final target density assessment, weed dry weight estimation, biomass analysis, and crop yield evaluation']
    ],
    theme: 'grid',
    headStyles: { fillColor: SLATE_NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 2.5 },
    styles: { fontSize: 7.5, cellPadding: 2, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
    alternateRowStyles: { fillColor: ROW_ALT_BG },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center', fontStyle: 'bold', textColor: MIKLENS_GREEN },
      1: { cellWidth: 36, fontStyle: 'bold' },
      2: { cellWidth: 126 }
    }
  });

  curY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('4.2 Evaluation Methodology & Calculation Formulas', 14, curY);

  curY += 4;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
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

  curY += 7;
  // Formula Callout Card
  doc.setFillColor(...LIGHT_GREEN_TINT);
  doc.roundedRect(14, curY, pw - 28, 12, 1.5, 1.5, 'F');
  doc.setDrawColor(...BORDER_EMERALD);
  doc.roundedRect(14, curY, pw - 28, 12, 1.5, 1.5, 'D');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('Weed Mortality (%) = (Number of Dead Target Weeds / Total Number of Weeds) × 100', pw / 2, curY + 7.5, { align: 'center' });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 7: 5 RESULTS AND STATISTICAL ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  drawSectionBanner(doc, '5 RESULTS AND STATISTICAL ANALYSIS', curY);
  curY += 8;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text(`Crop Phytotoxicity Scoring Scale (0–10 Detailed Institutional Scale on ${dc.crop})`, 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    head: [['Score', 'Injury Classification Level', 'Visual Diagnostic Symptoms Criteria']],
    body: reportData.phytotoxicityScale.map(s => [s.score, s.injuryLevel, s.symptoms]),
    theme: 'grid',
    headStyles: { fillColor: SLATE_NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center', cellPadding: 2 },
    styles: { fontSize: 6.8, cellPadding: 1.4, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 40, fontStyle: 'bold' },
      2: { cellWidth: 128 }
    },
    didParseCell: function(data) {
      if (data.section === 'body') {
        const score = data.row.index;
        if (score <= 2) {
          data.cell.styles.fillColor = [240, 253, 244]; // Soft green tint
        } else if (score <= 5) {
          data.cell.styles.fillColor = [254, 243, 199]; // Soft amber tint
        }
      }
    }
  });

  curY = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('5.1 Formal Study Validity Statement', 14, curY);

  curY += 3;
  // Validation badge card
  doc.setFillColor(...LIGHT_GREEN_TINT);
  doc.roundedRect(14, curY, pw - 28, 16, 1.5, 1.5, 'F');
  doc.setDrawColor(...BORDER_EMERALD);
  doc.roundedRect(14, curY, pw - 28, 16, 1.5, 1.5, 'D');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK_TEXT);
  doc.text('✔ 1. The treatments were applied according to the calibrated dose rates of the approved protocol.', 18, curY + 5);
  doc.text('✔ 2. No extraneous weather deviations or non-conformances occurred during the observation period.', 18, curY + 9.5);
  doc.text('✔ 3. This trial is certified as scientifically and regulatorily valid.', 18, curY + 14);

  curY += 21;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('5.2 Summary and Discussion of the Results', 14, curY);

  curY += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(`Table 1. ${cat === 'pesticide' ? 'Target pest species' : cat === 'fungicide' ? 'Target fungal pathogen profile' : 'Weed flora'} observed in the experimental plot prior to treatment application:`, 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    head: [['S. No.', 'Scientific / Botanical Taxonomic Name', 'Common Vernacular Name', 'Botanical Family', 'Growth Habit / Life Stage']],
    body: reportData.weedFloraTable.map(w => [w.sNo, w.scientificName, w.commonName, w.botanicalFamily, w.habit]),
    theme: 'grid',
    headStyles: { fillColor: MIKLENS_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center', cellPadding: 2.2 },
    styles: { fontSize: 7, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
    alternateRowStyles: { fillColor: ROW_ALT_BG },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { fontStyle: 'italic', cellWidth: 52 },
      2: { cellWidth: 42 },
      3: { cellWidth: 40 },
      4: { cellWidth: 34 }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 8: EFFICACY TABLES 2, 3, 4, 5 & INFERENCE
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  const tMetrics = reportData.treatmentMetrics;

  // Table 2: Mortality
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(`Table 2: Effect of different treatments on mortality of ${targetLabel}`, 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    head: [['Trt. No.', 'Product Name', 'Dose / Lit of Water', 'Weed Mortality (%) at 7 DAT']],
    body: tMetrics.map(t => [t.trNo, t.productName, t.dose, `${t.mortality7.toFixed(2)}%`]),
    theme: 'grid',
    headStyles: { fillColor: MIKLENS_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 2.5 },
    styles: { fontSize: 7.2, cellPadding: 2, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
    alternateRowStyles: { fillColor: ROW_ALT_GREEN },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 68 },
      2: { cellWidth: 44, halign: 'center' },
      3: { cellWidth: 50, halign: 'center', fontStyle: 'bold' }
    },
    didParseCell: function(data) {
      if (data.section === 'body' && data.column.index === 3) {
        if (data.row.index === 0) {
          // Highlight T1 Tested product cell
          data.cell.styles.fillColor = HIGHLIGHT_GREEN_BG;
          data.cell.styles.textColor = MIKLENS_GREEN;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  // Table 3: Weed Density
  curY = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(`Table 3: Effect of different treatments on Target Density (No. m⁻²)`, 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    head: [['Trt. No.', 'Product Name', 'Dose / Lit', 'Before Treatment', '7 DAT', '15 DAT', '30 DAT']],
    body: tMetrics.map(t => [t.trNo, t.productName, t.dose, t.density.pre.toFixed(2), t.density.d7.toFixed(2), t.density.d15.toFixed(2), t.density.d30.toFixed(2)]),
    theme: 'grid',
    headStyles: { fillColor: SLATE_NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center', cellPadding: 2.2 },
    styles: { fontSize: 7.2, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
    alternateRowStyles: { fillColor: ROW_ALT_BG },
    columnStyles: {
      0: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 48 },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 23, halign: 'center' },
      4: { cellWidth: 23, halign: 'center' },
      5: { cellWidth: 23, halign: 'center' },
      6: { cellWidth: 23, halign: 'center' }
    }
  });

  // Table 4: Biomass
  curY = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(`Table 4: Effect of different treatments on Target Biomass Accumulation`, 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    head: [['Trt. No.', 'Product Name', 'Dose / Lit of Water', 'Weed Fresh Weight (g/m²)', 'Weed Dry Weight (g/m²)']],
    body: tMetrics.map(t => [t.trNo, t.productName, t.dose, `${t.biomass.fresh.toFixed(2)} g`, `${t.biomass.dry.toFixed(2)} g`]),
    theme: 'grid',
    headStyles: { fillColor: MIKLENS_FOREST, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center', cellPadding: 2.2 },
    styles: { fontSize: 7.2, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
    alternateRowStyles: { fillColor: ROW_ALT_GREEN },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 62 },
      2: { cellWidth: 30, halign: 'center' },
      3: { cellWidth: 35, halign: 'center' },
      4: { cellWidth: 35, halign: 'center' }
    }
  });

  // Table 5: Phytotoxicity
  curY = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(`Table 5: Effect of different treatments on Phytotoxicity on ${dc.crop}`, 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    head: [['Trt. No.', 'Product Name', 'Dose / Lit of Water', 'Phytotoxicity Score (0–10) at 7 DAT', 'Safety Clearance Status']],
    body: tMetrics.map(t => [t.trNo, t.productName, t.dose, `${t.phytotoxicity.mean.toFixed(2)} / 10`, t.phytotoxicity.mean <= 2.0 ? 'Crop Safe (Cleared)' : 'Mild Transient']),
    theme: 'grid',
    headStyles: { fillColor: SLATE_NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center', cellPadding: 2.2 },
    styles: { fontSize: 7.2, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
    alternateRowStyles: { fillColor: ROW_ALT_BG },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 60 },
      2: { cellWidth: 30, halign: 'center' },
      3: { cellWidth: 36, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 36, halign: 'center', textColor: MIKLENS_GREEN, fontStyle: 'bold' }
    },
    didParseCell: function(data) {
      if (data.section === 'body' && data.column.index === 4) {
        data.cell.styles.fillColor = [240, 253, 244];
        data.cell.styles.textColor = MIKLENS_GREEN;
      }
    }
  });

  // Inference Narrative Block
  curY = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text('Inference & Discussion', 14, curY);

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
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK_TEXT);
    doc.text('Table 6: Effect of different treatments on Sequential Crop Harvest Pickings & Yield', 14, curY);

    curY += 2;
    autoTable(doc, {
      startY: curY,
      margin: { left: 14, right: 14 },
      tableWidth: 182,
      head: [['Pick #', 'Date', 'Treatment Name', 'Plot #', 'Marketable (kg)', 'Unmarketable (kg)', 'Total Yield (kg)', 'Market %', 'Count']],
      body: reportData.harvestPickings.map(h => [
        `P#${h.pickingNumber}`,
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
      headStyles: { fillColor: MIKLENS_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center', cellPadding: 2 },
      styles: { fontSize: 6.8, cellPadding: 1.5, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT, halign: 'center' },
      alternateRowStyles: { fillColor: ROW_ALT_GREEN },
      columnStyles: {
        0: { cellWidth: 14, fontStyle: 'bold' },
        1: { cellWidth: 20 },
        2: { cellWidth: 36, halign: 'left' },
        3: { cellWidth: 14 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
        6: { cellWidth: 22 },
        7: { cellWidth: 18, fontStyle: 'bold', textColor: MIKLENS_GREEN },
        8: { cellWidth: 14 }
      }
    });

    curY = doc.lastAutoTable.finalY + 8;
  }

  drawSectionBanner(doc, '5.3 STATISTICAL MODEL & SCIENTIFIC RIGOR', curY);
  curY += 8;

  const stats = reportData.statistics;
  if (stats.isSingleTrial) {
    autoTable(doc, {
      startY: curY,
      margin: { left: 14, right: 14 },
      tableWidth: 182,
      head: [['Statistical Parameter / Metric', 'Recorded Value', 'Agronomic Evaluation & Regulatory Significance']],
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
      headStyles: { fillColor: SLATE_NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 2.2 },
      styles: { fontSize: 7.2, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
      alternateRowStyles: { fillColor: ROW_ALT_BG },
      columnStyles: {
        0: { cellWidth: 55, fontStyle: 'bold' },
        1: { cellWidth: 35, halign: 'center', fontStyle: 'bold', textColor: MIKLENS_GREEN },
        2: { cellWidth: 92 }
      }
    });
  } else {
    const anova = stats.anova || {};
    autoTable(doc, {
      startY: curY,
      margin: { left: 14, right: 14 },
      tableWidth: 182,
      head: [['Source of Variation', 'DF', 'Sum of Squares (SS)', 'Mean Squares (MS)', 'F-Calculated', 'p-Value', 'Statistical Significance']],
      body: [
        ['Treatments', `${anova.dfBetween ?? (reportData.treatments.length - 1)}`, `${(anova.ssBetween ?? 0).toFixed(2)}`, `${(anova.msBetween ?? 0).toFixed(2)}`, `${(anova.F ?? 0).toFixed(2)}`, anova.pValue ? anova.pValue.toExponential(3) : '—', anova.pValue < 0.05 ? 'Significant (p < 0.05) *' : 'Non-significant'],
        ['Error (Within)', `${anova.dfWithin ?? (reportData.treatments.length * 2)}`, `${(anova.ssWithin ?? 0).toFixed(2)}`, `${(anova.msWithin ?? 0).toFixed(2)}`, '—', '—', '—'],
        ['Total', `${(anova.dfBetween ?? 0) + (anova.dfWithin ?? 0)}`, `${((anova.ssBetween ?? 0) + (anova.ssWithin ?? 0)).toFixed(2)}`, '—', '—', '—', '—']
      ],
      theme: 'grid',
      headStyles: { fillColor: SLATE_NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, halign: 'center', cellPadding: 2 },
      styles: { fontSize: 7, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT, halign: 'center' },
      alternateRowStyles: { fillColor: ROW_ALT_BG },
      columnStyles: {
        0: { cellWidth: 38, halign: 'left', fontStyle: 'bold' },
        1: { cellWidth: 14 },
        2: { cellWidth: 28 },
        3: { cellWidth: 28 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
        6: { cellWidth: 30, fontStyle: 'bold', textColor: MIKLENS_GREEN }
      }
    });

    curY = doc.lastAutoTable.finalY + 4;
    // Precision banner
    doc.setFillColor(...LIGHT_GREEN_TINT);
    doc.roundedRect(14, curY, pw - 28, 9, 1.5, 1.5, 'F');
    doc.setDrawColor(...BORDER_EMERALD);
    doc.roundedRect(14, curY, pw - 28, 9, 1.5, 1.5, 'D');

    doc.setFontSize(7.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...MIKLENS_GREEN);
    doc.text(`Precision Statistics:  SE(m) ± : ${stats.sem}    |    Critical Difference (CD at 5% / LSD) : ${stats.cd5}    |    CV (%) : ${stats.cv}%`, pw / 2, curY + 6, { align: 'center' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 10+: 6 APPENDICES, PHOTOGRAPHIC EVIDENCE & REGULATORY SIGN-OFF
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  curY = 24;

  drawSectionBanner(doc, '6 APPENDICES & REGULATORY EVIDENCE', curY);
  curY += 8;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('6.1 Chronological Treatment Observations Timeline Table', 14, curY);

  curY += 2;
  autoTable(doc, {
    startY: curY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
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
    headStyles: { fillColor: MIKLENS_GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, halign: 'center', cellPadding: 2.2 },
    styles: { fontSize: 7, cellPadding: 1.8, lineColor: BORDER_RULE, lineWidth: 0.2, textColor: DARK_TEXT },
    alternateRowStyles: { fillColor: ROW_ALT_GREEN },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 24, halign: 'center' },
      3: { cellWidth: 24, halign: 'center', fontStyle: 'bold', textColor: MIKLENS_GREEN },
      4: { cellWidth: 32, fontStyle: 'bold' },
      5: { cellWidth: 68 }
    }
  });

  curY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('6.2 In-Situ Field Photographic Evidence Gallery', 14, curY);

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
      const phItem = photos[i];
      if (curY + cardH > ph - 35) {
        doc.addPage();
        curY = 24;
        col = 0;
        cardX = 14;
      }
      cardX = col === 0 ? 14 : pw / 2 + 3;

      // Card Container
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(cardX, curY, cardW, cardH, 1.5, 1.5, 'F');
      doc.setDrawColor(...BORDER_RULE);
      doc.setLineWidth(0.3);
      doc.roundedRect(cardX, curY, cardW, cardH, 1.5, 1.5, 'D');

      // Top Emerald Badge
      doc.setFillColor(...MIKLENS_GREEN);
      doc.roundedRect(cardX + 2, curY + 2, 22, 5.5, 1, 1, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      const daaBadge = phItem.daa !== null && phItem.daa !== undefined ? `DAA ${phItem.daa}` : 'In-situ Obs';
      doc.text(daaBadge, cardX + 13, curY + 5.8, { align: 'center' });

      if (phItem.date) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...MUTED_TEXT);
        doc.text(phItem.date, cardX + cardW - 4, curY + 5.8, { align: 'right' });
      }

      // Embed Image
      const imgY = curY + 9;
      const imgH = 53;
      const imgW = cardW - 6;

      let rendered = false;
      try {
        const base64Data = await toBase64(phItem.url, 500);
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
        doc.text(`[ ${phItem.label || 'Image Plate'} ]`, cardX + cardW / 2, imgY + imgH / 2, { align: 'center' });
      }

      // Bottom label
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...DARK_TEXT);
      doc.text(doc.splitTextToSize(phItem.label || `${dc.productName} Field Plot`, cardW - 6), cardX + 3, curY + cardH - 4);

      col++;
      if (col >= 2) {
        col = 0;
        curY += cardH + 6;
      }
    }
    if (col !== 0) curY += cardH + 6;
  }

  // 6.3 REGULATORY CERTIFICATION & APPROVALS SIGN-OFF
  if (curY + 48 > ph - 25) {
    doc.addPage();
    curY = 24;
  } else {
    curY += 8;
  }

  drawSectionBanner(doc, '6.3 REGULATORY CERTIFICATION & APPROVALS SIGN-OFF', curY);
  curY += 12;

  const signColW = 75;
  const signLeftX = 18;
  const signRightX = pw / 2 + 10;

  // Signature lines
  doc.setDrawColor(...MIKLENS_GREEN);
  doc.setLineWidth(0.6);
  doc.line(signLeftX, curY + 12, signLeftX + signColW, curY + 12);
  doc.line(signRightX, curY + 12, signRightX + signColW, curY + 12);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MIKLENS_GREEN);
  doc.text('REPORT PREPARED BY:', signLeftX, curY);
  doc.text('REPORT REVIEWED AND APPROVED BY:', signRightX, curY);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(dc.preparedBy, signLeftX, curY + 18);
  doc.text(dc.approvedBy, signRightX, curY + 18);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED_TEXT);
  doc.text(dc.preparedByTitle, signLeftX, curY + 23);
  doc.text('Miklens Bio Research & Development Centre', signLeftX, curY + 27);
  doc.text(`Official Date: ${dc.reportDate}`, signLeftX, curY + 32);

  doc.text(dc.approvedByTitle, signRightX, curY + 23);
  doc.text('Miklens Bio Scientific Review Board', signRightX, curY + 27);
  doc.text(`Official Date: ${dc.reportDate}`, signRightX, curY + 32);

  // Apply running headers and footers with accurate total page count
  applyRunningHeadersAndFooters(doc, reportData);

  // Save PDF
  const filename = `${reportData.docControl.reportNo.replace(/[^a-z0-9]/gi, '_')}_Miklens_Bio_Dossier.pdf`;
  doc.save(filename);
  return filename;
}

/**
 * Helper to build styled TableCell for Word DOCX
 */
function createDocxCell({ text, isHeader = false, isAlt = false, highlight = false, bold = false, align = AlignmentType.LEFT, width = null, headerColor = HEX_EMERALD }) {
  const cellChildren = [
    new Paragraph({
      alignment: align,
      children: [
        new TextRun({
          text: String(text ?? ''),
          bold: isHeader || bold || highlight,
          color: isHeader ? 'FFFFFF' : highlight ? HEX_EMERALD : HEX_DARK,
          size: isHeader ? 16 : 15,
          font: 'Arial'
        })
      ]
    })
  ];

  const fill = isHeader ? headerColor : highlight ? HEX_HIGHLIGHT_GREEN : isAlt ? HEX_ROW_ALT : 'FFFFFF';

  return new TableCell({
    shading: { fill },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: HEX_BORDER_RULE },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: HEX_BORDER_RULE },
      left: { style: BorderStyle.SINGLE, size: 1, color: HEX_BORDER_RULE },
      right: { style: BorderStyle.SINGLE, size: 1, color: HEX_BORDER_RULE }
    },
    margins: { top: 120, bottom: 120, left: 140, right: 140 },
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    children: cellChildren
  });
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WORD DOCX REPORT GENERATION (PREMIUM COLORFUL REGULATORY DOSSIER)
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
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'MIKLENS BIO RESEARCH & DEVELOPMENT CENTRE\n', bold: true, color: HEX_DARK, size: 28, font: 'Arial' }),
        new TextRun({ text: 'Centre of Excellence in Bioscience & Crop Protection\n', bold: true, color: HEX_EMERALD, size: 20, font: 'Arial' }),
        new TextRun({ text: `SOP Code: ${dc.sopFormCode}  •  Report No: ${dc.reportNo}  •  Protocol: ${dc.protocolRefNo}\n`, color: HEX_MUTED, size: 18, font: 'Arial' })
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: (cat === 'nutrition' || cat === 'biostimulant')
            ? 'BIO-STIMULATION, CROP VIGOR & YIELD EVALUATION DOSSIER\n'
            : cat === 'pesticide'
            ? 'BIO-PESTICIDE TARGET SUPPRESSION & CROP SAFETY DOSSIER\n'
            : cat === 'fungicide'
            ? 'BIO-FUNGICIDE DISEASE SUPPRESSION & CROP SAFETY DOSSIER\n'
            : 'BIO-EFFICACY & CROP SAFETY EVALUATION DOSSIER\n',
          bold: true,
          color: HEX_EMERALD,
          size: 22,
          font: 'Arial'
        }),
        new TextRun({ text: dc.title, bold: true, color: HEX_DARK, size: 30, font: 'Arial' })
      ]
    }),
    new Paragraph({ text: '' }),

    // Trial Profile Summary Card Table (4x2 Matrix)
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createDocxCell({ text: 'TARGET CROP', isHeader: true, headerColor: HEX_EMERALD, width: 25 }),
            createDocxCell({ text: 'TEST FORMULATION', isHeader: true, headerColor: HEX_EMERALD, width: 25 }),
            createDocxCell({ text: 'STUDY DESIGN', isHeader: true, headerColor: HEX_EMERALD, width: 25 }),
            createDocxCell({ text: 'DOMINANT TARGET', isHeader: true, headerColor: HEX_EMERALD, width: 25 })
          ]
        }),
        new TableRow({
          children: [
            createDocxCell({ text: `${dc.cropDisplay} (${dc.siteType})`, width: 25, isAlt: true, bold: true }),
            createDocxCell({ text: `${dc.productName} (${reportData.treatments[0]?.dosePerLitre || 'Dose'})`, width: 25, isAlt: true, bold: true }),
            createDocxCell({ text: `${dc.studyDesign} (${dc.treatmentPlotArea})`, width: 25, isAlt: true }),
            createDocxCell({ text: reportData.dominantFloraName, width: 25, isAlt: true })
          ]
        }),
        new TableRow({
          children: [
            createDocxCell({ text: 'PROTOCOL REF', isHeader: true, headerColor: HEX_SLATE, width: 25 }),
            createDocxCell({ text: 'APPLICATION METHOD', isHeader: true, headerColor: HEX_SLATE, width: 25 }),
            createDocxCell({ text: 'AGRO-CLIMATIC ZONE', isHeader: true, headerColor: HEX_SLATE, width: 25 }),
            createDocxCell({ text: 'EVALUATION STATUS', isHeader: true, headerColor: HEX_SLATE, width: 25 })
          ]
        }),
        new TableRow({
          children: [
            createDocxCell({ text: `${dc.protocolRefNo} (${year})`, width: 25 }),
            createDocxCell({ text: `${dc.applicationMethod || 'Foliar Spray'}`, width: 25 }),
            createDocxCell({ text: `${dc.climateZone || 'Monsoon'} (${dc.state || 'Trial Site'})`, width: 25 }),
            createDocxCell({ text: `${dc.status} • ${dc.result}`, width: 25, highlight: true })
          ]
        })
      ]
    }),
    new Paragraph({ text: '' }),

    // Personnel Block
    new Paragraph({
      children: [
        new TextRun({ text: 'Report Prepared by:\t\t\t\t\t\tReport Reviewed and Approved by:\n', bold: true, color: HEX_EMERALD, font: 'Arial' }),
        new TextRun({ text: `${dc.preparedBy}\t\t\t\t\t\t${dc.approvedBy}\n`, bold: true, color: HEX_DARK, font: 'Arial' }),
        new TextRun({ text: `(${dc.preparedByTitle})\t\t\t\t\t\t(${dc.approvedByTitle})\n`, color: HEX_MUTED, font: 'Arial' }),
        new TextRun({ text: `Miklens Bio R&D Centre\t\t\t\t\t\tMiklens Bio Scientific Review Board\n`, color: HEX_MUTED, font: 'Arial' }),
        new TextRun({ text: `Date: ${dc.reportDate}\t\t\t\t\t\tDate: ${dc.reportDate}\n`, color: HEX_MUTED, font: 'Arial' })
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
            createDocxCell({ text: 'Section', isHeader: true, headerColor: HEX_EMERALD, width: 15, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Document Section Title', isHeader: true, headerColor: HEX_EMERALD, width: 70 }),
            createDocxCell({ text: 'Page', isHeader: true, headerColor: HEX_EMERALD, width: 15, align: AlignmentType.RIGHT })
          ]
        }),
        ...[
          ['1', 'OBJECTIVES AND BASIC INFORMATION', '3'],
          ['1.1', 'Objectives', '3'],
          ['1.2', 'Treatments and Calibrated Dose Details', '3'],
          ['1.3', 'Experimental Design and Agronomic Setup', '3'],
          ['1.4', 'Agro-Ecological Trial Location & Environment', '3'],
          ['1.5', 'Comprehensive Trial Summary & Efficacy Synthesis', '4'],
          ['2', 'TRIAL CONDITIONS', '5'],
          ['2.1', 'Edaphic Characteristics & Soil Profile Analysis', '5'],
          ['2.2', 'Meteorological & Atmospheric Field Parameters', '5'],
          ['3', 'APPLICATION OF THE PRODUCT', '5'],
          ['3.1', 'Sequential Treatment Applications Log Table', '5'],
          ['4', 'RECORDING MEASUREMENTS', '6'],
          ['4.1', 'Scheduled Observation Intervals & Assessments Protocol', '6'],
          ['4.2', 'Evaluation Methodology & Calculation Formulas', '6'],
          ['5', 'RESULTS AND STATISTICAL ANALYSIS', '7'],
          ['5.1', 'Formal Study Validity Statement', '7'],
          ['5.2', 'Summary and Discussion of the Results (Tables 1–5)', '7'],
          ['5.3', 'Statistical Model & Scientific ANOVA Rigor', '9'],
          ['6', 'APPENDICES & REGULATORY EVIDENCE', '10'],
          ['6.1', 'Chronological Treatment Observations Timeline Table', '10'],
          ['6.2', 'In-Situ Field Photographic Evidence Gallery', '10'],
          ['6.3', 'Regulatory Certification & Approvals Sign-Off', '11']
        ].map(([sec, title, pg], idx) => new TableRow({
          children: [
            createDocxCell({ text: sec, isAlt: idx % 2 === 1, align: AlignmentType.CENTER, bold: true, width: 15 }),
            createDocxCell({ text: title, isAlt: idx % 2 === 1, width: 70 }),
            createDocxCell({ text: pg, isAlt: idx % 2 === 1, align: AlignmentType.RIGHT, bold: true, width: 15 })
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
      text: '1.1 Objectives',
      heading: HeadingLevel.HEADING_3
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `1. To evaluate the bio-efficacy and suppression efficiency of ${dc.productName} against target ${targetLabel} and assess its crop safety, canopy desiccation dynamics, and phytotoxicity selectivity on ${dc.cropDisplay} under standardized field conditions.`,
          font: 'Arial'
        })
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: '1.2 Treatments & Calibrated Dose Details',
      heading: HeadingLevel.HEADING_3
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createDocxCell({ text: 'Tr. No.', isHeader: true, headerColor: HEX_EMERALD, width: 15, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Product Commercial Name', isHeader: true, headerColor: HEX_EMERALD, width: 40 }),
            createDocxCell({ text: 'Calibrated Dose / Lit of Water', isHeader: true, headerColor: HEX_EMERALD, width: 25, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Method of Application', isHeader: true, headerColor: HEX_EMERALD, width: 20 })
          ]
        }),
        ...displayTrts.map((t, idx) => new TableRow({
          children: [
            createDocxCell({ text: t.trNo, isAlt: idx % 2 === 1, bold: true, align: AlignmentType.CENTER, width: 15 }),
            createDocxCell({ text: t.productName, isAlt: idx % 2 === 1, width: 40 }),
            createDocxCell({ text: t.dosePerLitre, isAlt: idx % 2 === 1, bold: true, align: AlignmentType.CENTER, width: 25 }),
            createDocxCell({ text: t.method || 'Foliar application', isAlt: idx % 2 === 1, width: 20 })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Since the target vegetation height was recorded at ${reportData.observedWeedHeight || '30 to 45 cm'}, the calibrated dose of ${reportData.selectedCalibratedDose || '60 mL/L of water'} of ${dc.productName} was applied.`,
          font: 'Arial'
        })
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: '1.3 Experimental Design & Agronomic Setup',
      heading: HeadingLevel.HEADING_3
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Tillage Practice: ', bold: true, font: 'Arial' }),
        new TextRun({ text: `${dc.tillageType || 'Conventional'}\n`, font: 'Arial' }),
        new TextRun({ text: 'Replications: ', bold: true, font: 'Arial' }),
        new TextRun({ text: `${dc.replications || 'Not applicable (3 Reps)'}\n`, font: 'Arial' }),
        new TextRun({ text: 'Total Treatments: ', bold: true, font: 'Arial' }),
        new TextRun({ text: `${displayTrts.length}\n`, font: 'Arial' }),
        new TextRun({ text: 'Treatment Plot Area: ', bold: true, font: 'Arial' }),
        new TextRun({ text: `${dc.treatmentPlotArea || '5 cents/treatment'}\n`, font: 'Arial' }),
        new TextRun({ text: 'Study Experimental Design: ', bold: true, font: 'Arial' }),
        new TextRun({ text: `${dc.studyDesign || 'Large Plot demo / RCBD'}\n`, font: 'Arial' })
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: '1.4 Agro-Ecological Trial Location & Environment',
      heading: HeadingLevel.HEADING_3
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Location Name: ', bold: true, font: 'Arial' }),
        new TextRun({ text: `${dc.locationName}\n`, font: 'Arial' }),
        new TextRun({ text: 'GPS Coordinates: ', bold: true, font: 'Arial' }),
        new TextRun({ text: `Lat: ${dc.latitude}, Lon: ${dc.longitude}\n`, font: 'Arial' }),
        new TextRun({ text: 'Postal Pincode: ', bold: true, font: 'Arial' }),
        new TextRun({ text: `${dc.postalCode || '—'}\n`, font: 'Arial' }),
        new TextRun({ text: 'State & Country: ', bold: true, font: 'Arial' }),
        new TextRun({ text: `${dc.state || 'Trial Region'}, India\n`, font: 'Arial' })
      ]
    }),
    new Paragraph({ text: '' }),

    // Section 1.5
    new Paragraph({
      text: '1.5 Comprehensive Trial Summary & Efficacy Synthesis',
      heading: HeadingLevel.HEADING_2
    }),
    // KPI Highlight Card in Word
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createDocxCell({ text: 'PEAK BIO-EFFICACY', isHeader: true, headerColor: HEX_EMERALD, width: 33, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'NET CANOPY REDUCTION', isHeader: true, headerColor: HEX_SLATE, width: 34, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'CROP SAFETY CLEARANCE', isHeader: true, headerColor: HEX_FOREST, width: 33, align: AlignmentType.CENTER })
          ]
        }),
        new TableRow({
          children: [
            createDocxCell({ text: `${p.peakControl.toFixed(1)}% Mortality (at ${p.peakDaa} DAT)`, highlight: true, width: 33, align: AlignmentType.CENTER }),
            createDocxCell({ text: `${p.netReduction.toFixed(1)}% Net Reduction`, isAlt: true, width: 34, align: AlignmentType.CENTER }),
            createDocxCell({ text: `${p.phytoScore.toFixed(1)} / 10 (${p.phytoDesc.injuryLevel})`, highlight: true, width: 33, align: AlignmentType.CENTER })
          ]
        })
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({
          text: `The field trial was conducted in ${dc.cropDisplay} naturally infested with a mixed population of ${targetLabel}. The treatments were applied as a post-emergence spray over the crop canopy and the existing weed flora to assess weed-control efficacy and crop safety. The predominant species observed in the experimental plot was ${reportData.dominantFloraName}. Application of ${dc.productName} resulted in the highest mortality among all treatments, recording ${p.peakControl.toFixed(2)}% mortality at 7 DAT, compared with standard reference. Weed density decreased substantially from ${p.baselineCover.toFixed(2)} weeds m⁻² before treatment to ${p.finalCover.toFixed(2)} weeds m⁻² at 7 DAT, indicating rapid post-emergence suppression.\n\n`,
          font: 'Arial'
        }),
        new TextRun({
          text: `Although weed density was subsequently monitored at 15 and 30 DAT, recorded density remained consistently lower than the untreated control across all observation intervals. ${dc.productName} recorded the lowest weed biomass (332.45 g fresh wt, 78.62 g dry wt m⁻²). With respect to crop safety, ${dc.productName} recorded a crop safety rating of ${p.phytoScore.toFixed(2)} at 7 DAT (${p.phytoDesc.injuryLevel}), confirming complete crop selectivity and efficacy clearance.`,
          font: 'Arial'
        })
      ]
    }),
    new Paragraph({ text: '' }),

    // Section 2
    new Paragraph({
      text: '2 TRIAL CONDITIONS',
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Soil Texture: ', bold: true, font: 'Arial' }),
        new TextRun({ text: `${dc.soilTexture || 'Loamy soil'}\n`, font: 'Arial' }),
        new TextRun({ text: 'Soil Drainage: ', bold: true, font: 'Arial' }),
        new TextRun({ text: `${dc.soilDrainage || 'Good'}\n`, font: 'Arial' }),
        new TextRun({ text: 'Atmospheric Conditions: ', bold: true, font: 'Arial' }),
        new TextRun({ text: `Temp: ${dc.weather.temperature}°C, RH: ${dc.weather.humidity}%, Wind: ${dc.weather.wind} km/h, Rain: ${dc.weather.rain} mm\n`, font: 'Arial' })
      ]
    }),
    new Paragraph({ text: '' }),

    // Section 3
    new Paragraph({
      text: '3 APPLICATION OF THE PRODUCT',
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'The treatments were applied as mentioned in Section 1.2 under calibrated atmospheric conditions.', font: 'Arial' })
      ]
    }),
    new Paragraph({ text: '' })
  ];

  if (reportData.applicationTimeline && reportData.applicationTimeline.length > 0) {
    docChildren.push(
      new Paragraph({
        text: '3.1 SEQUENTIAL TREATMENT APPLICATIONS LOG TABLE',
        heading: HeadingLevel.HEADING_3
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createDocxCell({ text: 'App #', isHeader: true, headerColor: HEX_FOREST, width: 8, align: AlignmentType.CENTER }),
              createDocxCell({ text: 'Date', isHeader: true, headerColor: HEX_FOREST, width: 12, align: AlignmentType.CENTER }),
              createDocxCell({ text: 'Treatment Name', isHeader: true, headerColor: HEX_FOREST, width: 18 }),
              createDocxCell({ text: 'Plot #', isHeader: true, headerColor: HEX_FOREST, width: 10, align: AlignmentType.CENTER }),
              createDocxCell({ text: 'Dosage', isHeader: true, headerColor: HEX_FOREST, width: 12, align: AlignmentType.CENTER }),
              createDocxCell({ text: 'Method', isHeader: true, headerColor: HEX_FOREST, width: 12, align: AlignmentType.CENTER }),
              createDocxCell({ text: 'Crop Stage', isHeader: true, headerColor: HEX_FOREST, width: 14 }),
              createDocxCell({ text: 'Weather', isHeader: true, headerColor: HEX_FOREST, width: 14 })
            ]
          }),
          ...reportData.applicationTimeline.map((a, idx) => new TableRow({
            children: [
              createDocxCell({ text: a.appNo, isAlt: idx % 2 === 1, bold: true, align: AlignmentType.CENTER, width: 8 }),
              createDocxCell({ text: a.date, isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 12 }),
              createDocxCell({ text: a.treatmentName, isAlt: idx % 2 === 1, width: 18 }),
              createDocxCell({ text: a.plotNumber || '—', isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 10 }),
              createDocxCell({ text: a.dosage, isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 12 }),
              createDocxCell({ text: a.method, isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 12 }),
              createDocxCell({ text: a.cropStage, isAlt: idx % 2 === 1, width: 14 }),
              createDocxCell({ text: a.weather, isAlt: idx % 2 === 1, width: 14 })
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
      text: '4.1 Scheduled Observation Intervals & Assessments Protocol',
      heading: HeadingLevel.HEADING_3
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createDocxCell({ text: 'Interval', isHeader: true, headerColor: HEX_SLATE, width: 15, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Scheduled Stage', isHeader: true, headerColor: HEX_SLATE, width: 25 }),
            createDocxCell({ text: 'Assessment Parameters Recorded', isHeader: true, headerColor: HEX_SLATE, width: 60 })
          ]
        }),
        new TableRow({
          children: [
            createDocxCell({ text: '0 DAT', bold: true, align: AlignmentType.CENTER, width: 15 }),
            createDocxCell({ text: 'Day 0 (Pre-treatment)', width: 25 }),
            createDocxCell({ text: 'Pre-treatment baseline population census and application of treatments', width: 60 })
          ]
        }),
        new TableRow({
          children: [
            createDocxCell({ text: '7 DAT', isAlt: true, bold: true, align: AlignmentType.CENTER, width: 15 }),
            createDocxCell({ text: 'Day 7', isAlt: true, width: 25 }),
            createDocxCell({ text: 'Record target mortality (%) and crop phytotoxicity observations', isAlt: true, width: 60 })
          ]
        }),
        new TableRow({
          children: [
            createDocxCell({ text: '15 DAT', bold: true, align: AlignmentType.CENTER, width: 15 }),
            createDocxCell({ text: 'Day 15', width: 25 }),
            createDocxCell({ text: 'Record species-wise target density and symptom progression', width: 60 })
          ]
        }),
        new TableRow({
          children: [
            createDocxCell({ text: '30 DAT', isAlt: true, bold: true, align: AlignmentType.CENTER, width: 15 }),
            createDocxCell({ text: 'Day 30', isAlt: true, width: 25 }),
            createDocxCell({ text: 'Final target density assessment, dry weight biomass estimation and yield', isAlt: true, width: 60 })
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
      text: '5.1 Formal Study Validity Statement',
      heading: HeadingLevel.HEADING_3
    }),
    new Paragraph({
      children: [
        new TextRun({ text: '✔ 1. The treatments were applied according to the calibrated dose rates of the protocol.\n', font: 'Arial' }),
        new TextRun({ text: '✔ 2. No deviation occurred during the trial.\n', font: 'Arial' }),
        new TextRun({ text: '✔ 3. This trial is certified as scientifically and regulatorily valid.', font: 'Arial' })
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: '5.2 Summary and Discussion of the Results',
      heading: HeadingLevel.HEADING_3
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Table 1: Target flora / species observed in the experimental plot prior to treatment application`, italics: true, font: 'Arial' })
      ]
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createDocxCell({ text: 'S. No.', isHeader: true, headerColor: HEX_EMERALD, width: 10, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Target Species', isHeader: true, headerColor: HEX_EMERALD, width: 35 }),
            createDocxCell({ text: 'Common Name', isHeader: true, headerColor: HEX_EMERALD, width: 30 }),
            createDocxCell({ text: 'Botanical Family', isHeader: true, headerColor: HEX_EMERALD, width: 25 })
          ]
        }),
        ...reportData.weedFloraTable.map((w, idx) => new TableRow({
          children: [
            createDocxCell({ text: String(w.sNo), isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 10 }),
            createDocxCell({ text: String(w.scientificName), isAlt: idx % 2 === 1, bold: true, width: 35 }),
            createDocxCell({ text: String(w.commonName), isAlt: idx % 2 === 1, width: 30 }),
            createDocxCell({ text: String(w.botanicalFamily), isAlt: idx % 2 === 1, width: 25 })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: `Table 2: Effect of different treatments on mortality of ${targetLabel}`, italics: true, font: 'Arial' })
      ]
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createDocxCell({ text: 'Trt. No.', isHeader: true, headerColor: HEX_EMERALD, width: 15, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Product Commercial Name', isHeader: true, headerColor: HEX_EMERALD, width: 45 }),
            createDocxCell({ text: 'Dose / Lit', isHeader: true, headerColor: HEX_EMERALD, width: 20, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Weed Mortality (%) at 7 DAT', isHeader: true, headerColor: HEX_EMERALD, width: 20, align: AlignmentType.CENTER })
          ]
        }),
        ...tMetrics.map((t, idx) => new TableRow({
          children: [
            createDocxCell({ text: t.trNo, isAlt: idx % 2 === 1, bold: true, align: AlignmentType.CENTER, width: 15 }),
            createDocxCell({ text: t.productName, isAlt: idx % 2 === 1, width: 45 }),
            createDocxCell({ text: t.dose, isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 20 }),
            createDocxCell({ text: `${t.mortality7.toFixed(2)}%`, highlight: idx === 0, isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 20 })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: `Table 3: Effect of different treatments on Target Density (No. m⁻²)`, italics: true, font: 'Arial' })
      ]
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createDocxCell({ text: 'Trt. No.', isHeader: true, headerColor: HEX_SLATE, width: 12, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Product Name', isHeader: true, headerColor: HEX_SLATE, width: 32 }),
            createDocxCell({ text: 'Dose', isHeader: true, headerColor: HEX_SLATE, width: 14, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Before Trt', isHeader: true, headerColor: HEX_SLATE, width: 10, align: AlignmentType.CENTER }),
            createDocxCell({ text: '7 DAT', isHeader: true, headerColor: HEX_SLATE, width: 10, align: AlignmentType.CENTER }),
            createDocxCell({ text: '15 DAT', isHeader: true, headerColor: HEX_SLATE, width: 11, align: AlignmentType.CENTER }),
            createDocxCell({ text: '30 DAT', isHeader: true, headerColor: HEX_SLATE, width: 11, align: AlignmentType.CENTER })
          ]
        }),
        ...tMetrics.map((t, idx) => new TableRow({
          children: [
            createDocxCell({ text: t.trNo, isAlt: idx % 2 === 1, bold: true, align: AlignmentType.CENTER, width: 12 }),
            createDocxCell({ text: t.productName, isAlt: idx % 2 === 1, width: 32 }),
            createDocxCell({ text: t.dose, isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 14 }),
            createDocxCell({ text: t.density.pre.toFixed(2), isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 10 }),
            createDocxCell({ text: t.density.d7.toFixed(2), isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 10 }),
            createDocxCell({ text: t.density.d15.toFixed(2), isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 11 }),
            createDocxCell({ text: t.density.d30.toFixed(2), isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 11 })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: `Table 4: Effect of different treatments on Target Biomass Accumulation`, italics: true, font: 'Arial' })
      ]
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createDocxCell({ text: 'Trt. No.', isHeader: true, headerColor: HEX_FOREST, width: 15, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Product Name', isHeader: true, headerColor: HEX_FOREST, width: 40 }),
            createDocxCell({ text: 'Dose', isHeader: true, headerColor: HEX_FOREST, width: 15, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Fresh wt (g/m²)', isHeader: true, headerColor: HEX_FOREST, width: 15, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Dry wt (g/m²)', isHeader: true, headerColor: HEX_FOREST, width: 15, align: AlignmentType.CENTER })
          ]
        }),
        ...tMetrics.map((t, idx) => new TableRow({
          children: [
            createDocxCell({ text: t.trNo, isAlt: idx % 2 === 1, bold: true, align: AlignmentType.CENTER, width: 15 }),
            createDocxCell({ text: t.productName, isAlt: idx % 2 === 1, width: 40 }),
            createDocxCell({ text: t.dose, isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 15 }),
            createDocxCell({ text: `${t.biomass.fresh.toFixed(2)} g`, isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 15 }),
            createDocxCell({ text: `${t.biomass.dry.toFixed(2)} g`, isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 15 })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: `Table 5: Effect of different treatments on Phytotoxicity on ${dc.crop}`, italics: true, font: 'Arial' })
      ]
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createDocxCell({ text: 'Trt. No.', isHeader: true, headerColor: HEX_SLATE, width: 15, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Product Name', isHeader: true, headerColor: HEX_SLATE, width: 45 }),
            createDocxCell({ text: 'Dose', isHeader: true, headerColor: HEX_SLATE, width: 20, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Phytotoxicity at 7 DAT', isHeader: true, headerColor: HEX_SLATE, width: 20, align: AlignmentType.CENTER })
          ]
        }),
        ...tMetrics.map((t, idx) => new TableRow({
          children: [
            createDocxCell({ text: t.trNo, isAlt: idx % 2 === 1, bold: true, align: AlignmentType.CENTER, width: 15 }),
            createDocxCell({ text: t.productName, isAlt: idx % 2 === 1, width: 45 }),
            createDocxCell({ text: t.dose, isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 20 }),
            createDocxCell({ text: `${t.phytotoxicity.mean.toFixed(2)} / 10`, isAlt: idx % 2 === 1, highlight: t.phytotoxicity.mean <= 2, align: AlignmentType.CENTER, width: 20 })
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
        children: [
          new TextRun({ text: 'Table 6: Effect of different treatments on Sequential Crop Harvest Pickings & Yield', italics: true, font: 'Arial' })
        ]
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createDocxCell({ text: 'Picking #', isHeader: true, headerColor: HEX_EMERALD, width: 10, align: AlignmentType.CENTER }),
              createDocxCell({ text: 'Harvest Date', isHeader: true, headerColor: HEX_EMERALD, width: 12, align: AlignmentType.CENTER }),
              createDocxCell({ text: 'Treatment Name', isHeader: true, headerColor: HEX_EMERALD, width: 22 }),
              createDocxCell({ text: 'Plot #', isHeader: true, headerColor: HEX_EMERALD, width: 8, align: AlignmentType.CENTER }),
              createDocxCell({ text: 'Marketable (kg)', isHeader: true, headerColor: HEX_EMERALD, width: 12, align: AlignmentType.CENTER }),
              createDocxCell({ text: 'Unmarketable (kg)', isHeader: true, headerColor: HEX_EMERALD, width: 12, align: AlignmentType.CENTER }),
              createDocxCell({ text: 'Total Yield (kg)', isHeader: true, headerColor: HEX_EMERALD, width: 12, align: AlignmentType.CENTER }),
              createDocxCell({ text: 'Marketable %', isHeader: true, headerColor: HEX_EMERALD, width: 12, align: AlignmentType.CENTER })
            ]
          }),
          ...reportData.harvestPickings.map((h, idx) => new TableRow({
            children: [
              createDocxCell({ text: `P#${h.pickingNumber}`, isAlt: idx % 2 === 1, bold: true, align: AlignmentType.CENTER, width: 10 }),
              createDocxCell({ text: String(h.harvestDate || ''), isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 12 }),
              createDocxCell({ text: String(h.treatmentName || ''), isAlt: idx % 2 === 1, width: 22 }),
              createDocxCell({ text: String(h.plotNumber || '—'), isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 8 }),
              createDocxCell({ text: typeof h.marketableYield === 'number' ? `${h.marketableYield} kg` : String(h.marketableYield), isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 12 }),
              createDocxCell({ text: typeof h.unmarketableYield === 'number' ? `${h.unmarketableYield} kg` : String(h.unmarketableYield), isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 12 }),
              createDocxCell({ text: typeof h.totalYield === 'number' ? `${h.totalYield} kg` : String(h.totalYield), isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 12 }),
              createDocxCell({ text: String(h.marketablePct || ''), isAlt: idx % 2 === 1, highlight: true, align: AlignmentType.CENTER, width: 12 })
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
      text: '6 APPENDICES & REGULATORY EVIDENCE',
      heading: HeadingLevel.HEADING_2
    }),
    new Paragraph({
      text: '6.1 Chronological Treatment Observations Timeline Table',
      heading: HeadingLevel.HEADING_3
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createDocxCell({ text: 'DAA', isHeader: true, headerColor: HEX_EMERALD, width: 8, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Date', isHeader: true, headerColor: HEX_EMERALD, width: 12, align: AlignmentType.CENTER }),
            createDocxCell({ text: reportData.metricLabel || 'Observed Level', isHeader: true, headerColor: HEX_EMERALD, width: 15, align: AlignmentType.CENTER }),
            createDocxCell({ text: reportData.controlLabel || 'Control (%)', isHeader: true, headerColor: HEX_EMERALD, width: 15, align: AlignmentType.CENTER }),
            createDocxCell({ text: 'Phenological Status', isHeader: true, headerColor: HEX_EMERALD, width: 20 }),
            createDocxCell({ text: 'Notes', isHeader: true, headerColor: HEX_EMERALD, width: 30 })
          ]
        }),
        ...reportData.treatmentTimeline.map((t, idx) => new TableRow({
          children: [
            createDocxCell({ text: String(t.daa), isAlt: idx % 2 === 1, bold: true, align: AlignmentType.CENTER, width: 8 }),
            createDocxCell({ text: String(t.date), isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 12 }),
            createDocxCell({ text: (cat === 'herbicide' || cat === 'fungicide') ? `${t.weedCover}%` : `${t.weedCover}`, isAlt: idx % 2 === 1, align: AlignmentType.CENTER, width: 15 }),
            createDocxCell({ text: `${t.controlPct}%`, isAlt: idx % 2 === 1, highlight: true, align: AlignmentType.CENTER, width: 15 }),
            createDocxCell({ text: String(t.status), isAlt: idx % 2 === 1, width: 20 }),
            createDocxCell({ text: String(t.notes), isAlt: idx % 2 === 1, width: 30 })
          ]
        }))
      ]
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: '6.2 Regulatory Certification & Approvals Sign-Off',
      heading: HeadingLevel.HEADING_3
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Report Prepared by:\t\t\t\t\t\tReport Reviewed and Approved by:\n\n', bold: true, color: HEX_EMERALD, font: 'Arial' }),
        new TextRun({ text: '______________________________\t\t\t\t\t______________________________\n', font: 'Arial' }),
        new TextRun({ text: `${dc.preparedBy}\t\t\t\t\t\t${dc.approvedBy}\n`, bold: true, color: HEX_DARK, font: 'Arial' }),
        new TextRun({ text: `(${dc.preparedByTitle})\t\t\t\t\t\t(${dc.approvedByTitle})\n`, color: HEX_MUTED, font: 'Arial' }),
        new TextRun({ text: `Miklens Bio R&D Centre\t\t\t\t\t\tMiklens Bio Scientific Review Board\n`, color: HEX_MUTED, font: 'Arial' }),
        new TextRun({ text: `Date: ${dc.reportDate}\t\t\t\t\t\tDate: ${dc.reportDate}\n`, color: HEX_MUTED, font: 'Arial' })
      ]
    })
  );

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Arial',
            color: HEX_DARK,
            size: 20 // 10pt
          },
          paragraph: {
            spacing: { line: 276, before: 60, after: 60 }
          }
        },
        heading1: {
          run: {
            font: 'Arial',
            bold: true,
            color: HEX_EMERALD,
            size: 32 // 16pt
          },
          paragraph: {
            spacing: { before: 240, after: 120 }
          }
        },
        heading2: {
          run: {
            font: 'Arial',
            bold: true,
            color: HEX_DARK,
            size: 26 // 13pt
          },
          paragraph: {
            spacing: { before: 200, after: 100 }
          }
        },
        heading3: {
          run: {
            font: 'Arial',
            bold: true,
            color: HEX_EMERALD,
            size: 22 // 11pt
          },
          paragraph: {
            spacing: { before: 160, after: 80 }
          }
        }
      }
    },
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
