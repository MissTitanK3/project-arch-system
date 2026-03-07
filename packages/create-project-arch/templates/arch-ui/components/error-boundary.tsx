"use client";

import { Component, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="rounded-xl border border-slate-600 bg-slate-900/90 p-6 text-center">
          <h3 className="mb-2">Something went wrong</h3>
          <p className="mb-3 text-slate-400">
            A component encountered an error. This does not affect other panels.
          </p>
          <pre className="inline-block max-w-[80%] whitespace-pre-wrap rounded-md border border-slate-600 bg-slate-950 px-2 py-1 font-mono text-xs">
            {this.state.error?.message ?? "Unknown error"}
          </pre>
          <div className="mt-4">
            <button
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm"
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
