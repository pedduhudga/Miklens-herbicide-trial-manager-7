import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        // CDN Libraries
        jsPDF: 'readonly',
        JSZip: 'readonly',
        vis: 'readonly',
        Chart: 'readonly',
        L: 'readonly',
        // Legacy Window-bound Globals/Utility Functions
        state: 'writable',
        showToast: 'readonly',
        applyFilters: 'readonly',
        apiCall: 'readonly',
        safeJsonParse: 'readonly',
        getAppState: 'readonly',
        validateEfficacyData: 'readonly',
        attemptChartRecovery: 'readonly',
        calculateRCBD_Stats: 'readonly',
        normalizeReportText: 'readonly',
        tempDiv: 'readonly',
        buildSpeciesContinuityTable: 'readonly',
        buildEnvironmentalSuitabilityIndex: 'readonly',
        buildStatisticalSignificanceBlock: 'readonly',
        buildEvidenceTraceabilityMatrix: 'readonly',
        buildSpeciesConfidenceBands: 'readonly',
        buildDoseResponseRecommendationPanel: 'readonly',
        openTrialDetail: 'readonly',
        analyzePhotoForEfficacy: 'readonly',
        saveTrialStatistics: 'readonly',
        fetchWithRetry: 'readonly',
        fetchSoilData: 'readonly',
        allTrials: 'readonly',
        refreshRelevantUI: 'readonly',
        identifyWeedsFromPhoto: 'readonly',
        shouldAutoIdentifyGeneralPhotoWeeds: 'readonly',
        analyzeGeneralPhotoWeeds: 'readonly',
        analyzeWeedCover: 'readonly',
        showGridWeedCoverModal: 'readonly',
        updateObservationWeedCover: 'readonly',
        isDrivePermissionError: 'readonly',
        repConfig: 'readonly',
        render: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
