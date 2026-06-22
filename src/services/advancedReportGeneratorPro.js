/**
 * Advanced Report Generator with Progress Support
 * Wraps AdvancedReportGenerator to provide real-time progress updates
 */

import { AdvancedReportGenerator } from './advancedReportGenerator.js';

/**
 * Generate report with progress callback
 * @param {Object|Array} trialOrTrials - Single trial or array of trials
 * @param {string} category - Trial category
 * @param {Function} onProgress - Progress callback (percent, message)
 * @param {AbortSignal} signal - Abort signal for cancellation
 * @returns {Promise<Blob>} Excel file blob
 */
export async function generateReportWithProgress(trialOrTrials, category, onProgress = () => {}, signal = null) {
  const generator = new AdvancedReportGenerator(trialOrTrials, category);
  
  // Wrap the generator's methods to report progress
  const originalGenerate = generator.generateCompleteReport.bind(generator);
  
  // Progress tracking
  let currentStep = 0;
  const totalSteps = 11; // 11 sheets in the report
  
  const reportProgress = (step, message) => {
    const percent = Math.round((step / totalSteps) * 100);
    onProgress(percent, message);
    
    // Check for abort
    if (signal?.aborted) {
      throw new Error('Report generation cancelled');
    }
  };
  
  // Monkey-patch the sheet creation methods to report progress
  const sheetMethods = [
    { name: 'createNarrativeSheet', message: 'Generating Narrative...' },
    { name: 'createTrialInfoSheet', message: 'Building Trial Info...' },
    { name: 'createTreatmentListSheet', message: 'Creating Treatment List...' },
    { name: 'createAssessmentDataSheet', message: 'Processing Assessment Data...' },
    { name: 'createChartworkSheet', message: 'Generating Charts...' },
    { name: 'createPostHarvestSheet', message: 'Processing Post-Harvest Data...' },
    { name: 'createAOVMeansTable', message: 'Calculating ANOVA...' },
    { name: 'createANOVASummarySheet', message: 'Building ANOVA Summary...' },
    { name: 'createFiguresSheet', message: 'Embedding Figures...' },
    { name: 'createChartsSheet', message: 'Generating Charts...' },
    { name: 'createWeatherSheet', message: 'Adding Weather Data...' },
    { name: 'createPhotosSheet', message: 'Embedding Photos...' }
  ];
  
  for (const { name, message } of sheetMethods) {
    if (generator[name]) {
      const original = generator[name].bind(generator);
      generator[name] = async function(...args) {
        currentStep++;
        reportProgress(currentStep, message);
        
        // Small delay to allow UI updates
        await new Promise(resolve => setTimeout(resolve, 10));
        
        return original(...args);
      };
    }
  }
  
  // Initial progress
  reportProgress(0, 'Starting report generation...');
  
  // Generate the report
  await originalGenerate();
  
  // Final progress
  reportProgress(100, 'Report complete!');
  
  // Get the workbook and create blob
  const buffer = await generator.workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Generate report and save with progress
 * @param {Object|Array} trialOrTrials - Single trial or array of trials
 * @param {string} category - Trial category
 * @param {Function} onProgress - Progress callback
 * @param {AbortSignal} signal - Abort signal
 * @returns {Promise<string>} Downloaded filename
 */
export async function generateAndDownloadReport(trialOrTrials, category, onProgress = () => {}, signal = null) {
  const blob = await generateReportWithProgress(trialOrTrials, category, onProgress, signal);
  
  const isArr = Array.isArray(trialOrTrials);
  const firstTrial = isArr ? trialOrTrials[0] : trialOrTrials;
  const filename = `Advanced_Report_${firstTrial?.FormulationName || 'Trial'}_${category}_${Date.now()}.xlsx`;
  
  // Create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  return filename;
}

/**
 * Create abortable report generation
 * @returns {{ generate: Function, abort: Function, signal: AbortSignal }}
 */
export function createAbortableReportGenerator() {
  const controller = new AbortController();
  
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    generate: (trialOrTrials, category, onProgress) => 
      generateReportWithProgress(trialOrTrials, category, onProgress, controller.signal)
  };
}

export default {
  generateReportWithProgress,
  generateAndDownloadReport,
  createAbortableReportGenerator
};