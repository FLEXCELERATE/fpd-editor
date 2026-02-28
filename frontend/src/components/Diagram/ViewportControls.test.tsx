/**
 * Unit tests for ViewportControls component
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { ViewportControls } from './ViewportControls';

describe('ViewportControls', () => {
  const defaultProps = {
    zoom: 1.0,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomToFit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render zoom percentage', () => {
    render(<ViewportControls {...defaultProps} zoom={1.5} />);
    expect(screen.getByText('150%')).toBeTruthy();
  });

  it('should render all buttons', () => {
    render(<ViewportControls {...defaultProps} />);
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
    expect(screen.getByLabelText('Zoom out')).toBeTruthy();
    expect(screen.getByLabelText('Zoom to fit')).toBeTruthy();
  });

  it('should call onZoomIn when zoom in button is clicked', () => {
    render(<ViewportControls {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(defaultProps.onZoomIn).toHaveBeenCalledTimes(1);
  });

  it('should call onZoomOut when zoom out button is clicked', () => {
    render(<ViewportControls {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(defaultProps.onZoomOut).toHaveBeenCalledTimes(1);
  });

  it('should call onZoomToFit when zoom to fit button is clicked', () => {
    render(<ViewportControls {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Zoom to fit'));
    expect(defaultProps.onZoomToFit).toHaveBeenCalledTimes(1);
  });

  it('should display correct percentage for various zoom levels', () => {
    const { rerender } = render(<ViewportControls {...defaultProps} zoom={0.5} />);
    expect(screen.getByText('50%')).toBeTruthy();

    rerender(<ViewportControls {...defaultProps} zoom={2.0} />);
    expect(screen.getByText('200%')).toBeTruthy();

    rerender(<ViewportControls {...defaultProps} zoom={0.1} />);
    expect(screen.getByText('10%')).toBeTruthy();
  });
});
