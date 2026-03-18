import { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component that catches JavaScript errors in child components,
 * logs error information, and displays a fallback UI instead of crashing the whole app.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary componentName="Editor" fallback={(error, reset) => (
 *   <div>
 *     <p>Error: {error.message}</p>
 *     <button onClick={reset}>Retry</button>
 *   </div>
 * )}>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  /**
   * Update state so the next render will show the fallback UI.
   * This lifecycle is invoked after an error has been thrown by a descendant component.
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  /**
   * Log error information for debugging.
   * This lifecycle is invoked after an error has been thrown by a descendant component.
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const componentName = this.props.componentName || 'Component';

    console.error(`[ErrorBoundary] Error in ${componentName}:`, error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  /**
   * Reset the error boundary state to allow retry.
   */
  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError);
      }

      // Default fallback UI
      const componentName = this.props.componentName || 'Component';
      return (
        <div
          style={{
            padding: '20px',
            margin: '20px',
            border: '2px solid #dc3545',
            borderRadius: '4px',
            backgroundColor: '#f8d7da',
            color: '#721c24',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0' }}>
            ⚠️ {componentName} Error
          </h3>
          <p style={{ margin: '0 0 10px 0' }}>
            <strong>Error:</strong> {this.state.error.message}
          </p>
          <button
            onClick={this.resetError}
            style={{
              padding: '8px 16px',
              backgroundColor: '#721c24',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
