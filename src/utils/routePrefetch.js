/**
 * Lightweight route chunk prefetcher for instant zero-delay tab switching.
 * Deduplicates calls and skips prefetching on Save-Data / slow 2G / offline connections.
 */

const prefetched = new Set();

const ROUTE_LOADERS = {
  '/': () => import('../pages/Dashboard.jsx'),
  '/dashboard': () => import('../pages/Dashboard.jsx'),
  '/trials': () => import('../pages/Trials.jsx'),
  '/projects': () => import('../pages/Projects.jsx'),
  '/large-scale-trials': () => import('../pages/LargeScaleTrials.jsx'),
  '/formulations': () => import('../pages/Formulations.jsx'),
  '/scanner': () => import('../pages/PlotScanner.jsx'),
  '/plot-scanner': () => import('../pages/PlotScanner.jsx'),
  '/reports': () => import('../pages/Reports.jsx'),
  '/analytics': () => import('../pages/Analytics.jsx'),
  '/statistics': () => import('../pages/Statistics.jsx'),
  '/ai-assistant': () => import('../pages/AIAssistant.jsx'),
  '/organisations': () => import('../pages/Organisations.jsx'),
  '/ingredients': () => import('../pages/Ingredients.jsx'),
  '/data-management': () => import('../pages/DataManagement.jsx'),
  '/settings': () => import('../pages/Settings.jsx'),
  '/field-map': () => import('../pages/FieldMap.jsx'),
  '/compare-trials': () => import('../pages/CompareTrials.jsx'),
};

export function prefetchRoute(path) {
  if (!path || prefetched.has(path)) return;
  if (typeof navigator !== 'undefined') {
    if (!navigator.onLine) return;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') {
      return;
    }
  }
  const loader = ROUTE_LOADERS[path];
  if (!loader) return;
  prefetched.add(path);
  loader().catch(() => {
    // Allow retry later if transient network error
    prefetched.delete(path);
  });
}
