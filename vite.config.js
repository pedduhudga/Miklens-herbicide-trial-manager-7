import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss()
  ],
  // Use relative base path for GitHub Pages subdirectory and Capacitor file:// support
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Increase chunk size warning limit for large vendor bundles
    chunkSizeWarningLimit: 1500,
    // Advanced code splitting for better performance
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Core React ecosystem
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            
            // Router
            if (id.includes('react-router')) {
              return 'vendor-router';
            }

            // Firebase (large) 
            if (id.includes('firebase') || id.includes('@firebase')) {
              return 'vendor-firebase';
            }

            // PDF generation (very large)
            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('pdfkit')) {
              return 'vendor-pdf';
            }

            // Office documents (very large - separate from PDF)
            if (id.includes('exceljs')) {
              return 'vendor-excel';
            }
            if (id.includes('pptxgenjs')) {
              return 'vendor-pptx';  
            }
            if (id.includes('docx') || id.includes('html-docx')) {
              return 'vendor-docx';
            }

            // Charts (large)
            if (id.includes('chart.js') || id.includes('vis-network')) {
              return 'vendor-charts';
            }

            // Maps (large)
            if (id.includes('leaflet') || id.includes('react-leaflet')) {
              return 'vendor-maps';
            }

            // AI libraries
            if (id.includes('@google') || id.includes('genai')) {
              return 'vendor-ai';
            }

            // Image processing
            if (id.includes('cropperjs') || id.includes('react-cropper')) {
              return 'vendor-image';
            }

            // QR codes
            if (id.includes('qrcode') || id.includes('jsqr')) {
              return 'vendor-qr';
            }

            // Utilities (file handling, compression)
            if (id.includes('file-saver') || id.includes('jszip')) {
              return 'vendor-utils';
            }

            // Icons
            if (id.includes('lucide')) {
              return 'vendor-icons';
            }

            // Capacitor (mobile)
            if (id.includes('@capacitor')) {
              return 'vendor-capacitor';
            }
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'jstat',
      'qrcode', 
      'lucide-react',
      'react-router-dom',
      'file-saver',
      'html2canvas',
      'jspdf',
    ],
  },
})
