/** TypeScript type definitions for diagram rendering. */

/** Bounding box of all diagram content including margins. */
export interface DiagramBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Viewport {
    x: number;
    y: number;
    zoom: number;
}
