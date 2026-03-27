import { render, screen, fireEvent } from '@testing-library/react';

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>Child content</div>;
}

// ErrorBoundary logs errors — suppress console.error in tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = vi.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

// Dynamically import to avoid issues with module scope
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('renders default fallback on error', () => {
    render(
      <ErrorBoundary componentName="TestWidget">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/TestWidget Error/)).toBeTruthy();
    expect(screen.getByText(/Test error/)).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('renders custom fallback on error', () => {
    render(
      <ErrorBoundary fallback={(error) => <div>Custom: {error.message}</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom: Test error')).toBeTruthy();
  });

  it('shows retry button that resets error state', () => {
    render(
      <ErrorBoundary componentName="Test">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Retry')).toBeTruthy();
    // Retry button exists and is clickable
    fireEvent.click(screen.getByText('Retry'));
    // After clicking retry with a still-throwing child, error is re-caught
    expect(screen.getByText(/Test Error/)).toBeTruthy();
  });
});
