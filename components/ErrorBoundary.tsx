import React from 'react';

// Last line of defence: a render error shows a recoverable message instead of a blank page.
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('SpekPlatz crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-gray-500 max-w-sm">SpekPlatz hit an unexpected error. Reloading usually fixes it.</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">
          Reload
        </button>
      </div>
    );
  }
}
