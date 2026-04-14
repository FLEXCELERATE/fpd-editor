/**
 * Shared design tokens for VDI 3682 diagram rendering.
 *
 * Single source of truth for colours, font sizes, and stroke widths
 * used by both the SVG renderer and the PDF exporter.
 */

// ---------- Colour palette (hex) ----------

export const COLORS: Record<string, string> = {
    product: '#E51400',
    energy: '#6E9AD1',
    information: '#2F4DA1',
    processOperator: '#11AE4B',
    technicalResource: '#888889',
    flow: '#000000',
    alternativeFlow: '#f5a623',
    parallelFlow: '#4a90d9',
    usage: '#888889',
    crossSystem: '#9b59b6',
    black: '#000000',
    white: '#ffffff',
};

// ---------- Typography ----------

export const FONT_FAMILY = 'Helvetica, Arial, sans-serif';
export const STATE_LABEL_FONT_SIZE = 11;
export const PROCESS_LABEL_FONT_SIZE = 13;
export const SYSTEM_LIMIT_LABEL_FONT_SIZE = 12;

// ---------- Stroke ----------

export const STROKE_WIDTH = 1.5;
