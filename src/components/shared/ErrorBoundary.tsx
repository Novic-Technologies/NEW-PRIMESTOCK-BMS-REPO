import React from 'react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import { AlertTriangle, RefreshCw } from 'lucide-react';

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  let errorMessage = "An unexpected error occurred.";
  let isFirestoreError = false;

  try {
    const parsed = JSON.parse(error.message || '');
    if (parsed.error && parsed.operationType) {
      errorMessage = `Database Error: ${parsed.error}`;
      isFirestoreError = true;
    }
  } catch (e) {
    // Not a JSON error
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-alt p-6">
      <div className="card max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-danger/10 text-danger rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-primary">Something went wrong</h2>
          <p className="text-text-muted mt-2">{errorMessage}</p>
        </div>
        {isFirestoreError && (
          <div className="p-4 bg-surface-alt rounded-lg text-left">
            <p className="text-xs font-bold text-text-muted uppercase tracking-widest mb-2">Technical Details</p>
            <pre className="text-[10px] text-text-secondary overflow-auto max-h-32">
              {error.message}
            </pre>
          </div>
        )}
        <button 
          onClick={() => {
            resetErrorBoundary();
            window.location.reload();
          }}
          className="btn btn-primary w-full gap-2"
        >
          <RefreshCw size={18} />
          Reload Application
        </button>
      </div>
    </div>
  );
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary FallbackComponent={ErrorFallback}>
      {children}
    </ReactErrorBoundary>
  );
}
