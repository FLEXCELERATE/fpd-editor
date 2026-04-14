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

    it('should render zoom percentage rounded to integer', () => {
        render(<ViewportControls {...defaultProps} zoom={1.5} />);
        expect(screen.getByText('150%')).toBeTruthy();
    });

    it('should display correct percentage for various zoom levels', () => {
        const { rerender } = render(<ViewportControls {...defaultProps} zoom={0.5} />);
        expect(screen.getByText('50%')).toBeTruthy();

        rerender(<ViewportControls {...defaultProps} zoom={2.0} />);
        expect(screen.getByText('200%')).toBeTruthy();

        rerender(<ViewportControls {...defaultProps} zoom={0.1} />);
        expect(screen.getByText('10%')).toBeTruthy();

        // Fractional zoom should round correctly
        rerender(<ViewportControls {...defaultProps} zoom={0.333} />);
        expect(screen.getByText('33%')).toBeTruthy();
    });

    it('should provide accessible labels on all buttons', () => {
        render(<ViewportControls {...defaultProps} />);
        const zoomIn = screen.getByLabelText('Zoom in');
        const zoomOut = screen.getByLabelText('Zoom out');
        const zoomToFit = screen.getByLabelText('Zoom to fit');

        // All buttons should also have tooltip titles for sighted users
        expect(zoomIn.getAttribute('title')).toBeTruthy();
        expect(zoomOut.getAttribute('title')).toBeTruthy();
        expect(zoomToFit.getAttribute('title')).toBeTruthy();
    });

    it('should call each handler exactly once per click', () => {
        render(<ViewportControls {...defaultProps} />);

        fireEvent.click(screen.getByLabelText('Zoom in'));
        fireEvent.click(screen.getByLabelText('Zoom out'));
        fireEvent.click(screen.getByLabelText('Zoom to fit'));

        expect(defaultProps.onZoomIn).toHaveBeenCalledTimes(1);
        expect(defaultProps.onZoomOut).toHaveBeenCalledTimes(1);
        expect(defaultProps.onZoomToFit).toHaveBeenCalledTimes(1);
    });

    it('should not call other handlers when one button is clicked', () => {
        render(<ViewportControls {...defaultProps} />);

        fireEvent.click(screen.getByLabelText('Zoom in'));

        expect(defaultProps.onZoomIn).toHaveBeenCalledTimes(1);
        expect(defaultProps.onZoomOut).not.toHaveBeenCalled();
        expect(defaultProps.onZoomToFit).not.toHaveBeenCalled();
    });

    it('should render distinct button symbols (+, −, ⊡)', () => {
        render(<ViewportControls {...defaultProps} />);
        const buttons = screen.getAllByRole('button');

        const texts = buttons.map((b) => b.textContent?.trim());
        // Each button should have non-empty, distinct content
        const unique = new Set(texts.filter(Boolean));
        expect(unique.size).toBe(buttons.length);
    });
});
