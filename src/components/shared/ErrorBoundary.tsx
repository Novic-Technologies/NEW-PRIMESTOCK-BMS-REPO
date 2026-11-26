import React from 'react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import { AlertTriangle, RefreshCw } from 'lucide-react';

function isChunkLoadFailure(error: Error): boolean {
  const msg = error?.message || '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk')
  );
}

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  let errorMessage = 'An unexpected error occurred.';
  let isFirestoreError = false;
  const isChunkError = isChunkLoadFailure(error);

  if (isChunkError) {
    errorMessage = 'A newer version of PrimeStock BMS was deployed. Reload to load the latest application files.';
  } else {
    try {
      const parsed = JSON.parse(error.message || '');
      if (parsed.error && parsed.operationType) {
        errorMessage = `Database Error: ${parsed.error}`;
        isFirestoreError = true;
      }
    } catch {
      // Not a JSON error
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-6">
      <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 max-w-md w-full text-center space-y-6 shadow-soft">
        <div className="w-16 h-16 bg-danger/10 text-danger rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-primary">
            {isChunkError ? 'Update Available' : 'Something went wrong'}
          </h2>
          <p className="text-text-secondary text-sm mt-2">{errorMessage}</p>
        </div>
        {isFirestoreError && (
          <div className="p-4 bg-surface-alt rounded-lg text-left border border-border">
            <p className="text-xs font-bold text-text-muted uppercase tracking-widest mb-2">
              Technical Details
            </p>
            <pre className="text-[10px] text-text-secondary overflow-auto max-h-32">
              {error.message}
            </pre>
          </div>
        )}
        <button
          type="button"
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
