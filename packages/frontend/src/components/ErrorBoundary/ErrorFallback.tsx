import './ErrorFallback.css';

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
  componentName?: string;
}

/**
 * Error fallback UI component that displays a user-friendly error message
 * with a retry button. Used by ErrorBoundary to show errors gracefully.
 */
export function ErrorFallback({ error, resetError, componentName = 'Component' }: ErrorFallbackProps) {
  return (
    <div className="error-fallback">
      <div className="error-fallback__content">
        <div className="error-fallback__header">
          <span className="error-fallback__icon">⚠</span>
          <h3 className="error-fallback__title">{componentName} Error</h3>
        </div>
        <div className="error-fallback__body">
          <p className="error-fallback__message">
            <strong>Error:</strong> {error.message}
          </p>
          {error.stack && (
            <details className="error-fallback__details">
              <summary className="error-fallback__summary">Stack Trace</summary>
              <pre className="error-fallback__stack">{error.stack}</pre>
            </details>
          )}
        </div>
        <div className="error-fallback__actions">
          <button onClick={resetError} className="error-fallback__button">
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
