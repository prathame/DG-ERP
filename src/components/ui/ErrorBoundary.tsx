// @ts-nocheck — project omits @types/react; class Component still works at runtime
import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { clientLogger, ensureCorrelationId } from '../../lib/logger';

/** Catches lazy-route / render failures so the app shell stays usable. */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorId: null };
  }

  static getDerivedStateFromError(error) {
    return { error, errorId: ensureCorrelationId().slice(0, 8) };
  }

  componentDidCatch(error, info) {
    clientLogger.exception('[ErrorBoundary] Component crash', error, {
      componentStack: info?.componentStack,
      errorId: this.state.errorId,
    });
  }

  reset = () => {
    this.setState({ error: null, errorId: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center" role="alert">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mb-4" aria-hidden="true">
            <AlertTriangle className="text-rose-600" size={24} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Something went wrong</h2>
          <p className="text-sm text-gray-500 max-w-sm mb-2">
            This screen failed to load. Your data is safe — try again or switch tabs.
          </p>
          {this.state.errorId ? (
            <p className="text-xs text-gray-400 mb-6 font-mono">Ref: {this.state.errorId}</p>
          ) : (
            <div className="mb-6" />
          )}
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark transition-colors"
          >
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
