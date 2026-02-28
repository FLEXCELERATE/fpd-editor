/** TypeScript type definitions for diagram rendering. */

import type { FlowType, StateType } from "./fpb";

export type DiagramElementType =
  | "state"
  | "processOperator"
  | "technicalResource";

export interface DiagramElement {
  id: string;
  type: DiagramElementType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Only set when type is "state". */
  stateType?: StateType;
  /** Line number in source text where element is declared. */
  line_number?: number;
}

export interface DiagramConnection {
  id: string;
  sourceId: string;
  targetId: string;
  flowType?: FlowType;
  /** True when connection represents a Usage rather than a Flow. */
  isUsage: boolean;
  /** Line number in source text where connection is declared. */
  line_number?: number;
  /** Optional routing hint: which side of the source element to use. */
  sourceSide?: Side;
  /** Optional routing hint: which side of the target element to use. */
  targetSide?: Side;
}

export interface SystemLimitBounds {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramData {
  elements: DiagramElement[];
  connections: DiagramConnection[];
  systemLimits: SystemLimitBounds[];
}

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

/* ---------- Routing types ---------- */

export type Side = "top" | "bottom" | "left" | "right";

export interface Point {
  x: number;
  y: number;
}

/** A connection with pre-computed routing waypoints. */
export interface RoutedConnection {
  connection: DiagramConnection;
  /** Ordered waypoints from source port to target port. */
  points: Point[];
  /** true = straight diagonal line (AlternativeFlow), false = orthogonal path. */
  isDirect: boolean;
}

/** Configuration options for layout algorithm. */
export interface LayoutConfig {
  /** Padding around the diagram. */
  padding: number;
  /** Horizontal gap between elements in the same row. */
  hGap: number;
  /** Vertical gap between rows. */
  vGap: number;
  /** Padding around system limit boundary. */
  systemLimitPadding: number;
  /** Horizontal offset for technical resources beside process operators. */
  resourceOffsetX: number;
}
