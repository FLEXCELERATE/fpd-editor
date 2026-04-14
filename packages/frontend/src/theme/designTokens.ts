/**
 * Design tokens for VDI 3682 diagram elements and UI theme.
 *
 * VDI 3682 element/connection colors and rendering constants are kept in sync
 * with @fpd-editor/core (packages/core/src/services/designTokens.ts).
 * The core package is the canonical source — when changing colors or font sizes,
 * update both files.
 */

/* ---------- Colors ---------- */

/** VDI 3682 standard element colors from FPB.JS reference implementation.
 *  Canonical source: @fpd-editor/core designTokens.COLORS */
export const colors = {
    /** VDI 3682 element type colors */
    vdi3682: {
        product: '#E51400',
        energy: '#6E9AD1',
        information: '#2F4DA1',
        processOperator: '#11AE4B',
        technicalResource: '#888889',
    },

    /** Connection/flow arrow colors */
    connections: {
        flow: '#000000',
        alternativeFlow: '#f5a623',
        parallelFlow: '#4a90d9',
        usage: '#888889',
        crossSystem: '#9b59b6',
    },

    /** Common colors */
    common: {
        white: '#ffffff',
        black: '#000000',
    },

    /** UI theme colors for non-diagram elements (frontend-only) */
    ui: {
        placeholderText: '#888',
        background: '#fff',
    },
} as const;

/* ---------- Typography ---------- */

/** Font sizes for diagram labels and UI elements.
 *  Canonical source: @fpd-editor/core designTokens */
export const typography = {
    fontSize: {
        /** State labels (Product, Energy, Information) */
        stateLabel: 11,
        /** Process operator labels */
        processLabel: 13,
        /** System limit labels */
        systemLimitLabel: 12,
        /** Editor placeholder and Monaco editor (frontend-only) */
        editor: 14,
    },
} as const;

/* ---------- Spacing ---------- */

/** Layout spacing constants for auto-layout engine */
export const spacing = {
    /** Padding around the diagram canvas */
    padding: 40,
    /** Horizontal gap between columns */
    horizontalGap: 100,
    /** Vertical gap between elements in the same column */
    verticalGap: 30,
    /** Padding around system limit boundary */
    systemLimitPadding: 50,
    /** Vertical offset for technical resources below system limit */
    resourceOffsetY: 60,
} as const;

/* ---------- Shapes ---------- */

/** Dimension constants for VDI 3682 element shapes */
export const shapes = {
    /** State dimensions per type */
    state: {
        product: { width: 50, height: 50 },
        energy: { width: 50, height: 50 },
        information: { width: 55, height: 50 },
    },
    /** Process operator dimensions */
    processOperator: {
        width: 150,
        height: 80,
    },
    /** Technical resource dimensions */
    technicalResource: {
        width: 150,
        height: 80,
    },
} as const;

/* ---------- Effects ---------- */

/** Visual effects (opacity, strokes, etc.).
 *  Stroke width canonical source: @fpd-editor/core designTokens.STROKE_WIDTH */
export const effects = {
    /** Fill opacity for shape backgrounds */
    fillOpacity: 1.0,
    /** Stroke widths */
    strokeWidth: {
        /** Default stroke width for shapes */
        default: 1.5,
        /** System limit stroke width */
        systemLimit: 1.5,
    },
    /** Dash patterns */
    dashPattern: {
        /** System limit dashed border pattern */
        systemLimit: '10,12',
    },
} as const;

/* ---------- Legacy exports for backward compatibility ---------- */

/** Max state width across all types (for column spacing) */
export const STATE_MAX_W = Math.max(
    shapes.state.product.width,
    shapes.state.energy.width,
    shapes.state.information.width,
);
/** Common state height */
export const STATE_H = shapes.state.product.height;

/** @deprecated Use shapes.processOperator instead */
export const PROCESS_SIZE = {
    w: shapes.processOperator.width,
    h: shapes.processOperator.height,
};

/** @deprecated Use shapes.technicalResource instead */
export const RESOURCE_SIZE = {
    w: shapes.technicalResource.width,
    h: shapes.technicalResource.height,
};
