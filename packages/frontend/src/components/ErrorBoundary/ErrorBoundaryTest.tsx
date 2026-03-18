import { useState } from 'react';

/**
 * Test component that can be used to inject errors into components
 * for testing error boundary isolation.
 *
 * Usage:
 * 1. Import this component into the component you want to test
 * 2. Add a button or keyboard shortcut to trigger the error
 * 3. Verify that only the component with the error crashes
 * 4. Verify other components continue working
 * 5. Verify the retry button re-mounts the component
 */

interface ErrorInjectorProps {
  componentName: string;
  children?: React.ReactNode;
}

/**
 * Component that can throw an error on demand for testing error boundaries.
 * Press the "Throw Error" button to simulate a crash.
 */
export function ErrorInjector({ componentName, children }: ErrorInjectorProps) {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (shouldThrow) {
    throw new Error(`Simulated error in ${componentName} component for testing`);
  }

  return (
    <div style={{ padding: '10px', border: '1px dashed #999', margin: '5px' }}>
      <div style={{ marginBottom: '5px', fontSize: '12px', color: '#666' }}>
        Error Boundary Test: {componentName}
      </div>
      <button
        onClick={() => setShouldThrow(true)}
        style={{
          padding: '5px 10px',
          fontSize: '11px',
          backgroundColor: '#dc3545',
          color: 'white',
          border: 'none',
          borderRadius: '3px',
          cursor: 'pointer',
          marginBottom: '10px',
        }}
      >
        Throw Error
      </button>
      {children}
    </div>
  );
}

/**
 * Keyboard shortcut for testing errors.
 * Add this to any component to enable error testing via keyboard:
 *
 * - Ctrl+Shift+E = Throw error in Editor
 * - Ctrl+Shift+D = Throw error in Diagram
 * - Ctrl+Shift+T = Throw error in Toolbar
 */
export function useErrorTestShortcut(componentName: string, enabled: boolean = false) {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (!enabled) return null;

  // Listen for keyboard shortcuts
  if (typeof window !== 'undefined') {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey) {
        if (componentName === 'Editor' && e.key === 'E') {
          e.preventDefault();
          setShouldThrow(true);
        } else if (componentName === 'Diagram' && e.key === 'D') {
          e.preventDefault();
          setShouldThrow(true);
        } else if (componentName === 'Toolbar' && e.key === 'T') {
          e.preventDefault();
          setShouldThrow(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Note: In real implementation, this would need cleanup
  }

  if (shouldThrow) {
    throw new Error(`Simulated error in ${componentName} via keyboard shortcut`);
  }

  return null;
}
