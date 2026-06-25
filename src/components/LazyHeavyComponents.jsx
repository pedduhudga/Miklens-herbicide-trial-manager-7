import { lazy } from 'react';

// Lazy load heavy chart components
export const LazyChartCard = lazy(() => import('./ChartCard.jsx'));

// Lazy load heavy report generators 
export const LazyAdvancedReportGenerator = lazy(() => 
  import('../services/advancedReportGenerator.js').then(module => ({
    default: () => {
      // Return a component wrapper for the service
      const { AdvancedReportGenerator } = module;
      return { AdvancedReportGenerator };
    }
  }))
);

// Lazy load PDF generation functions
export const LazyPDFGenerator = lazy(() =>
  import('../services/pdfReportRenderer.js').then(module => ({
    default: module
  }))
);

// Lazy load Excel generation functions  
export const LazyExcelGenerator = lazy(() =>
  import('../services/excelReportRenderer.js').then(module => ({
    default: module
  }))
);

// Lazy load PPTX generation functions
export const LazyPPTXGenerator = lazy(() =>
  import('../services/pptxReportRenderer.js').then(module => ({
    default: module
  }))
);

// Lazy load DOCX generation functions
export const LazyDOCXGenerator = lazy(() =>
  import('../services/docxReportRenderer.js').then(module => ({
    default: module
  }))
);

// Lazy load AI services
export const LazyAIService = lazy(() =>
  import('../services/multiProviderAI.js').then(module => ({
    default: module
  }))
);

// Lazy load statistics services
export const LazyStatsService = lazy(() =>
  import('../services/statsExporter.js').then(module => ({
    default: module
  }))
);

// Lazy load mapping components (Leaflet is heavy)
export const LazyMapComponent = lazy(() => import('./PlotMap.jsx'));

// Lazy load photo cropper (CropperJS is heavy)
export const LazyCropperModal = lazy(() => import('./CropperModal.jsx'));

// Lazy load QR code generator
export const LazyQRGenerator = lazy(() =>
  import('qrcode').then(module => ({
    default: module.default || module
  }))
);