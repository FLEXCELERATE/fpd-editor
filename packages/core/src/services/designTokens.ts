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
    // Every kind of flow is drawn in black. Alternative and parallel flows are
    // told apart by their routing, not their colour: an alternative flow runs
    // straight, a parallel one is angled, and both bundle onto a single shared
    // port at the element they branch from or merge into, where a plain flow
    // gets its own. Dashing is reserved for resource assignment.
    flow: '#000000',
    alternativeFlow: '#000000',
    parallelFlow: '#000000',
    usage: '#888889',
    crossSystem: '#000000',
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
