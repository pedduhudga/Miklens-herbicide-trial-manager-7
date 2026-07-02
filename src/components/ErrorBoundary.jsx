import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    
    const errorMsg = error?.message || '';
    const isChunkError = error && (
      error.name === 'ChunkLoadError' || 
      /failed to fetch dynamically imported module/i.test(errorMsg) ||
      /loading chunk/i.test(errorMsg)
    );

    if (isChunkError) {
      console.warn('[ErrorBoundary] Detected chunk load error, attempting automatic reload...');
      const reloadKey = 'chunk_reload_attempts';
      const attempts = parseInt(sessionStorage.getItem(reloadKey) || '0', 10);
      if (attempts < 2) {
        sessionStorage.setItem(reloadKey, String(attempts + 1));
        window.location.reload();
        return;
      }
    }

    try {
      if (typeof window !== 'undefined' && window.currentTrialDraft) {
        localStorage.setItem('trial_draft_recovery', JSON.stringify(window.currentTrialDraft));
        console.log('[ErrorBoundary] Cached trial draft to localStorage for recovery.');
      }
    } catch (e) {
      console.error('[ErrorBoundary] Failed to cache draft on crash:', e);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.hash = '#/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.inline) {
        return (
          <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl text-center space-y-2">
            <AlertTriangle className="w-6 h-6 text-red-500 mx-auto" />
            <h4 className="text-xs font-bold text-red-800 dark:text-red-300">Tab Error</h4>
            <p className="text-[10px] text-red-600 dark:text-red-400 font-mono break-all">{this.state.error?.message || 'Failed to render section'}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-3 py-1 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 text-[10px] font-bold rounded hover:bg-red-200 transition"
            >
              Reset view
            </button>
          </div>
        );
      }
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 border border-red-500/30 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-slate-400 text-sm mb-6">
              The app encountered an unexpected error. Please try reloading.
            </p>
            {this.state.error && (
              <div className="bg-slate-900/50 rounded-lg p-3 mb-6 text-left">
                <p className="text-xs text-red-300 font-mono break-all">
                  {this.state.error.message || 'Unknown error'}
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Home className="w-4 h-4" />
                Go Home
              </button>
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}