import React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[HabiZ ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080d12] text-[#f1f5f9] flex items-center justify-center p-4 selection:bg-teal-500 selection:text-white">
          <div className="relative w-full max-w-lg bg-[#0e1620] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden text-center space-y-6">
            {/* Ambient teal backdrop glow */}
            <div
              className="absolute -top-12 -right-12 w-48 h-48 pointer-events-none opacity-30 blur-3xl rounded-full"
              style={{ background: 'radial-gradient(circle, #178274 0%, transparent 70%)' }}
            />

            {/* Icon Header */}
            <div className="mx-auto w-16 h-16 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 shadow-lg">
              <AlertCircle size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Something interrupted this view
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
                Your habit data and streak momentum are safe. A quick refresh usually resolves this.
              </p>
            </div>

            {/* Error Message Snippet */}
            {this.state.error?.message && (
              <div className="text-left bg-black/40 border border-white/[0.06] rounded-xl p-3 text-[11px] font-mono text-red-300/90 break-words max-h-24 overflow-y-auto">
                {this.state.error.message}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#178274] hover:bg-[#136c60] text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <RefreshCw size={14} /> Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/[0.08] rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
              >
                <Home size={14} /> Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
