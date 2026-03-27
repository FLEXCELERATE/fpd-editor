/**
 * SVG renderer for VDI 3682 process diagrams.
 *
 * Generates a complete SVG string from diagram layout data.
 * Shapes, colors, and routing match the React frontend exactly
 * (see frontend/src/components/Diagram/elements.tsx, connections.tsx, routing.ts).
 *
 * Faithfully ported from backend/services/svg_renderer.py.
 */

import {
  LayoutElement,
  LayoutConnection,
  SystemLimitRect,
  DiagramLayout,
} from './layout';
import { escapeXml } from '../utils';

// ---------- Design tokens (match frontend/src/theme/designTokens.ts) ----------

const COLORS: Record<string, string> = {
  product: '#E51400',
  energy: '#6E9AD1',
  information: '#2F4DA1',
  processOperator: '#11AE4B',
  technicalResource: '#888889',
  flow: '#000',
  alternativeFlow: '#f5a623',
  parallelFlow: '#4a90d9',
  usage: '#888889',
  crossSystem: '#9b59b6',
  black: '#000',
};

const FONT_FAMILY = 'Helvetica, Arial, sans-serif';
const STROKE_WIDTH = 1.5;
const STATE_LABEL_FONT_SIZE = 11;
const PROCESS_LABEL_FONT_SIZE = 13;
const SYSTEM_LIMIT_LABEL_FONT_SIZE = 12;

// ---------- Routing (matches frontend/src/components/Diagram/routing.ts) ----------

type Point = [number, number];

function centerOf(el: LayoutElement): Point {
  return [el.x + el.width / 2, el.y + el.height / 2];
}

function determineSide(fromEl: LayoutElement, toEl: LayoutElement): string {
  const [fcx, fcy] = centerOf(fromEl);
  const [tcx, tcy] = centerOf(toEl);
  const dx = tcx - fcx;
  const dy = tcy - fcy;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0 ? 'bottom' : 'top';
  }
  return dx >= 0 ? 'right' : 'left';
}

function portPosition(
  el: LayoutElement,
  side: string,
  index: number,
  count: number,
): Point {
  const { x, y, width: w, height: h } = el;
  if (side === 'top') {
    const sp = w / (count + 1);
    return [x + sp * (index + 1), y];
  }
  if (side === 'bottom') {
    const sp = w / (count + 1);
    return [x + sp * (index + 1), y + h];
  }
  if (side === 'left') {
    const sp = h / (count + 1);
    return [x, y + sp * (index + 1)];
  }
  // right
  const sp = h / (count + 1);
  return [x + w, y + sp * (index + 1)];
}

function orthogonalWaypoints(
  src: Point,
  tgt: Point,
  sSide: string,
  tSide: string,
): Point[] {
  const isVSrc = sSide === 'top' || sSide === 'bottom';
  const isVTgt = tSide === 'top' || tSide === 'bottom';

  if (isVSrc && isVTgt) {
    if (src[0] === tgt[0]) {
      return [src, tgt];
    }
    const midY = (src[1] + tgt[1]) / 2;
    return [src, [src[0], midY], [tgt[0], midY], tgt];
  }

  if (!isVSrc && !isVTgt) {
    if (src[1] === tgt[1]) {
      return [src, tgt];
    }
    const midX = (src[0] + tgt[0]) / 2;
    return [src, [midX, src[1]], [midX, tgt[1]], tgt];
  }

  // Mixed: L-shaped
  if (isVSrc) {
    return [src, [src[0], tgt[1]], tgt];
  }
  return [src, [tgt[0], src[1]], tgt];
}

interface RoutingMeta {
  conn: LayoutConnection;
  source: LayoutElement;
  target: LayoutElement;
  sourceSide: string;
  targetSide: string;
  isDirect: boolean;
}

interface PortGroupEntry {
  metaIndex: number;
  role: 'source' | 'target';
}

interface PortGroup {
  element: LayoutElement;
  side: string;
  entries: PortGroupEntry[];
}

interface RoutedConnection {
  conn: LayoutConnection;
  points: Point[];
  isDirect: boolean;
}

function computeRouting(
  elements: LayoutElement[],
  connections: LayoutConnection[],
): RoutedConnection[] {
  const lookup: Record<string, LayoutElement> = {};
  for (const el of elements) {
    lookup[el.id] = el;
  }

  // Step 1: determine sides
  const metas: RoutingMeta[] = [];
  for (const conn of connections) {
    const source = lookup[conn.sourceId];
    const target = lookup[conn.targetId];
    if (!source || !target) {
      continue;
    }
    const sSide = conn.sourceSide || determineSide(source, target);
    const tSide = conn.targetSide || determineSide(target, source);
    const isDirect = (conn.flowType || 'flow') === 'alternativeFlow';
    metas.push({
      conn,
      source,
      target,
      sourceSide: sSide,
      targetSide: tSide,
      isDirect,
    });
  }

  // Step 2: group by (elementId, side)
  const portGroups: Record<string, PortGroup> = {};
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i];
    const sKey = `${m.source.id}:${m.sourceSide}`;
    if (!portGroups[sKey]) {
      portGroups[sKey] = {
        element: m.source,
        side: m.sourceSide,
        entries: [],
      };
    }
    portGroups[sKey].entries.push({ metaIndex: i, role: 'source' });

    const tKey = `${m.target.id}:${m.targetSide}`;
    if (!portGroups[tKey]) {
      portGroups[tKey] = {
        element: m.target,
        side: m.targetSide,
        entries: [],
      };
    }
    portGroups[tKey].entries.push({ metaIndex: i, role: 'target' });
  }

  // Step 3: assign port positions
  const sourcePorts: Record<number, Point> = {};
  const targetPorts: Record<number, Point> = {};

  for (const group of Object.values(portGroups)) {
    const { element: el, side, entries } = group;
    const useY = side === 'left' || side === 'right';

    entries.sort((a, b) => {
      const mA = metas[a.metaIndex];
      const connectedA = a.role === 'source' ? mA.target : mA.source;
      const [cxA, cyA] = centerOf(connectedA);
      const posA = useY ? cyA : cxA;

      const mB = metas[b.metaIndex];
      const connectedB = b.role === 'source' ? mB.target : mB.source;
      const [cxB, cyB] = centerOf(connectedB);
      const posB = useY ? cyB : cxB;

      return posA - posB;
    });

    const count = entries.length;
    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx];
      const port = portPosition(el, side, idx, count);
      if (entry.role === 'source') {
        sourcePorts[entry.metaIndex] = port;
      } else {
        targetPorts[entry.metaIndex] = port;
      }
    }
  }

  // Step 4: waypoints
  const routed: RoutedConnection[] = [];
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i];
    const sp = sourcePorts[i];
    const tp = targetPorts[i];
    if (!sp || !tp) {
      continue;
    }

    let points: Point[];
    if (m.isDirect) {
      points = [sp, tp];
    } else {
      points = orthogonalWaypoints(sp, tp, m.sourceSide, m.targetSide);
    }

    routed.push({ conn: m.conn, points, isDirect: m.isDirect });
  }

  return routed;
}

// ---------- SVG content bounds ----------

interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function computeContentBounds(
  elements: LayoutElement[],
  systemLimits: SystemLimitRect[],
): ContentBounds {
  const charW = STATE_LABEL_FONT_SIZE * 0.6;
  const slCharW = SYSTEM_LIMIT_LABEL_FONT_SIZE * 0.6;

  const allX: number[] = [];
  const allY: number[] = [];
  const allRight: number[] = [];
  const allBottom: number[] = [];

  for (const e of elements) {
    allRight.push(e.x + e.width);
    allBottom.push(e.y + e.height);
    if (e.type === 'state') {
      const longest = Math.max(e.id.length, (e.label || '').length);
      const labelWidth = longest * charW;
      const anchorX = e.x + e.width / 2 - 6;
      allX.push(anchorX - labelWidth);
      allY.push(e.y - 35);
    } else {
      allX.push(e.x);
      allY.push(e.y);
    }
  }

  for (const sl of systemLimits) {
    allX.push(sl.x);
    allBottom.push(sl.y + sl.height);
    const slLabelW = (sl.label || '').length * slCharW;
    allRight.push(sl.x + sl.width + slLabelW);
    allY.push(sl.y - SYSTEM_LIMIT_LABEL_FONT_SIZE - 5);
  }

  if (allX.length === 0) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }

  const margin = 50;
  const minX = Math.min(...allX) - margin;
  const minY = Math.min(...allY) - margin;
  const maxX = Math.max(...allRight) + margin;
  const maxY = Math.max(...allBottom) + margin;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ---------- SVG element renderers ----------

function renderMarkerDefs(): string {
  let markers = '';
  const markerDefs: [string, string, number, number][] = [
    ['arrow-flow', COLORS['flow'], 8, 8],
    ['arrow-alternative', COLORS['alternativeFlow'], 8, 8],
    ['arrow-parallel', COLORS['parallelFlow'], 8, 8],
    ['arrow-usage', COLORS['usage'], 6, 6],
    ['arrow-crossSystem', COLORS['crossSystem'], 8, 8],
  ];
  for (const [mid, color, mw, mh] of markerDefs) {
    markers +=
      `<marker id="${mid}" viewBox="0 0 10 10" refX="10" refY="5" ` +
      `markerWidth="${mw}" markerHeight="${mh}" orient="auto-start-reverse" ` +
      `markerUnits="strokeWidth">` +
      `<path d="M 0 0 L 10 5 L 0 10 Z" fill="${color}"/>` +
      `</marker>\n`;
  }
  const highlight =
    '<filter id="highlight-glow" x="-50%" y="-50%" width="200%" height="200%">' +
    '<feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>' +
    '<feColorMatrix in="blur" type="matrix" ' +
    'values="0 0 0 0 0.2  0 0 0 0 0.5  0 0 0 0 1  0 0 0 0.6 0" result="glow"/>' +
    '<feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>' +
    '</filter>\n';
  return `<defs>\n${markers}${highlight}</defs>\n`;
}

function renderSystemLimit(sl: SystemLimitRect): string {
  const { x, y, width: w, height: h } = sl;
  const label = escapeXml(sl.label || '');
  let svg =
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" ` +
    `fill="none" stroke="${COLORS['black']}" stroke-width="${STROKE_WIDTH}" ` +
    `stroke-dasharray="10,12"/>\n`;
  if (label) {
    svg +=
      `<text x="${x + w}" y="${y - 5}" text-anchor="start" ` +
      `font-size="${SYSTEM_LIMIT_LABEL_FONT_SIZE}" font-weight="bold" ` +
      `font-family="${FONT_FAMILY}" fill="${COLORS['black']}">${label}</text>\n`;
  }
  return svg;
}

function renderState(el: LayoutElement): string {
  const { x, y, width: w, height: h } = el;
  const eid = escapeXml(el.id);
  const label = escapeXml(el.label || el.id);
  const stateType = el.stateType || 'product';
  const hasName = label !== eid;

  // Shape
  let shape: string;
  if (stateType === 'energy') {
    const hw = w / 2;
    const hh = h / 2;
    const points = `${x + hw},${y} ${x + w},${y + hh} ${x + hw},${y + h} ${x},${y + hh}`;
    shape =
      `<polygon points="${points}" fill="${COLORS['energy']}" ` +
      `stroke="${COLORS['black']}" stroke-width="${STROKE_WIDTH}"/>\n`;
  } else if (stateType === 'information') {
    const qw = w * 0.25;
    const hh = h / 2;
    const points =
      `${x + qw},${y} ${x + w - qw},${y} ${x + w},${y + hh} ` +
      `${x + w - qw},${y + h} ${x + qw},${y + h} ${x},${y + hh}`;
    shape =
      `<polygon points="${points}" fill="${COLORS['information']}" ` +
      `stroke="${COLORS['black']}" stroke-width="${STROKE_WIDTH}"/>\n`;
  } else {
    const r = Math.min(w, h) / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    shape =
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLORS['product']}" ` +
      `stroke="${COLORS['black']}" stroke-width="${STROKE_WIDTH}"/>\n`;
  }

  // Label above shape (matching frontend: text-anchor="end")
  const labelX = x + w / 2 - 6;
  const idY = hasName ? y - 22 : y - 8;
  let text =
    `<text text-anchor="end" font-size="${STATE_LABEL_FONT_SIZE}" ` +
    `font-family="${FONT_FAMILY}" fill="${COLORS['black']}">` +
    `<tspan x="${labelX}" y="${idY}">${eid}</tspan>`;
  if (hasName) {
    text += `<tspan x="${labelX}" dy="14">${label}</tspan>`;
  }
  text += '</text>\n';

  const lineNum = el.lineNumber || '';
  const attrs =
    `data-element-id="${eid}" data-element-type="state" ` +
    `data-state-type="${stateType}" data-line-number="${lineNum}"`;
  return `<g ${attrs}>${shape}${text}</g>\n`;
}

function autoFontSize(
  lines: string[],
  maxWidthPx: number,
  defaultSize: number,
  minSize: number = 7,
): number {
  const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b), '');
  const needed = longest.length * defaultSize * 0.6;
  if (needed <= maxWidthPx) {
    return defaultSize;
  }
  const scaled = longest.length > 0 ? (maxWidthPx / longest.length) / 0.6 : defaultSize;
  return Math.max(minSize, scaled);
}

function renderProcessOperator(el: LayoutElement): string {
  const { x, y, width: w, height: h } = el;
  const eid = escapeXml(el.id);
  const label = escapeXml(el.label || el.id);
  const hasName = label !== eid;
  const lines = hasName ? [eid, label] : [eid];
  const fs = autoFontSize(lines, w - 12, PROCESS_LABEL_FONT_SIZE);

  const shape =
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0" ry="0" ` +
    `fill="${COLORS['processOperator']}" ` +
    `stroke="${COLORS['black']}" stroke-width="${STROKE_WIDTH}"/>\n`;

  const cx = x + w / 2;
  let text: string;
  if (hasName) {
    const idY = y + h / 2 - fs * 0.6;
    text =
      `<text text-anchor="middle" font-size="${fs}" ` +
      `font-family="${FONT_FAMILY}" fill="${COLORS['black']}">` +
      `<tspan x="${cx}" y="${idY}">${eid}</tspan>` +
      `<tspan x="${cx}" dy="${fs * 1.2}">${label}</tspan>` +
      `</text>\n`;
  } else {
    text =
      `<text x="${cx}" y="${y + h / 2}" text-anchor="middle" ` +
      `dominant-baseline="middle" font-size="${fs}" ` +
      `font-family="${FONT_FAMILY}" fill="${COLORS['black']}">${eid}</text>\n`;
  }

  const lineNum = el.lineNumber || '';
  const attrs =
    `data-element-id="${eid}" data-element-type="processOperator" ` +
    `data-line-number="${lineNum}"`;
  return `<g ${attrs}>${shape}${text}</g>\n`;
}

function renderTechnicalResource(el: LayoutElement): string {
  const { x, y, width: w, height: h } = el;
  const eid = escapeXml(el.id);
  const label = escapeXml(el.label || el.id);
  const hasName = label !== eid;
  const lines = hasName ? [eid, label] : [eid];
  const fs = autoFontSize(lines, w - 24, PROCESS_LABEL_FONT_SIZE);

  const shape =
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="40" ry="40" ` +
    `fill="${COLORS['technicalResource']}" ` +
    `stroke="${COLORS['black']}" stroke-width="${STROKE_WIDTH}"/>\n`;

  const cx = x + w / 2;
  let text: string;
  if (hasName) {
    const idY = y + h / 2 - fs * 0.6;
    text =
      `<text text-anchor="middle" font-size="${fs}" ` +
      `font-family="${FONT_FAMILY}" fill="${COLORS['black']}">` +
      `<tspan x="${cx}" y="${idY}">${eid}</tspan>` +
      `<tspan x="${cx}" dy="${fs * 1.2}">${label}</tspan>` +
      `</text>\n`;
  } else {
    text =
      `<text x="${cx}" y="${y + h / 2}" text-anchor="middle" ` +
      `dominant-baseline="middle" font-size="${fs}" ` +
      `font-family="${FONT_FAMILY}" fill="${COLORS['black']}">${eid}</text>\n`;
  }

  const lineNum = el.lineNumber || '';
  const attrs =
    `data-element-id="${eid}" data-element-type="technicalResource" ` +
    `data-line-number="${lineNum}"`;
  return `<g ${attrs}>${shape}${text}</g>\n`;
}

function renderElement(el: LayoutElement): string {
  const elType = el.type;
  if (elType === 'state') {
    return renderState(el);
  }
  if (elType === 'processOperator') {
    return renderProcessOperator(el);
  }
  if (elType === 'technicalResource') {
    return renderTechnicalResource(el);
  }
  return '';
}

function pointsToPathD(points: Point[]): string {
  if (points.length === 0) {
    return '';
  }
  const first = points[0];
  let d = `M ${first[0]},${first[1]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0]},${points[i][1]}`;
  }
  return d;
}

function renderRoutedConnection(routed: RoutedConnection): string {
  const { conn, points } = routed;
  if (points.length < 2) {
    return '';
  }

  const d = pointsToPathD(points);
  const connId = escapeXml(conn.id || '');
  const lineNum = conn.lineNumber || '';
  const dataAttrs = `data-connection-id="${connId}" data-line-number="${lineNum}"`;

  if (conn.isCrossSystem) {
    return (
      `<path ${dataAttrs} d="${d}" fill="none" stroke="${COLORS['crossSystem']}" ` +
      `stroke-width="${STROKE_WIDTH}" stroke-dasharray="8,4" ` +
      `marker-end="url(#arrow-crossSystem)"/>\n`
    );
  }

  if (conn.isUsage) {
    return (
      `<path ${dataAttrs} d="${d}" fill="none" stroke="${COLORS['usage']}" ` +
      `stroke-width="${STROKE_WIDTH}" stroke-dasharray="6,4" ` +
      `marker-start="url(#arrow-usage)" marker-end="url(#arrow-usage)"/>\n`
    );
  }

  const flowType = conn.flowType || 'flow';
  if (flowType === 'alternativeFlow') {
    return (
      `<path ${dataAttrs} d="${d}" fill="none" stroke="${COLORS['flow']}" ` +
      `stroke-width="${STROKE_WIDTH}" ` +
      `marker-end="url(#arrow-flow)"/>\n`
    );
  }
  if (flowType === 'parallelFlow') {
    return (
      `<path ${dataAttrs} d="${d}" fill="none" stroke="${COLORS['flow']}" ` +
      `stroke-width="${STROKE_WIDTH}" ` +
      `marker-end="url(#arrow-flow)"/>\n`
    );
  }

  // Regular flow
  return (
    `<path ${dataAttrs} d="${d}" fill="none" stroke="${COLORS['flow']}" ` +
    `stroke-width="${STROKE_WIDTH}" ` +
    `marker-end="url(#arrow-flow)"/>\n`
  );
}

// ---------- Public API ----------

export function renderSvg(diagram: DiagramLayout): string {
  const elements = diagram.elements || [];
  const connections = diagram.connections || [];
  const systemLimits = diagram.systemLimits || [];

  if (elements.length === 0) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">' +
      '<text x="200" y="100" text-anchor="middle" font-family="sans-serif" ' +
      'fill="#888">No diagram to display</text></svg>'
    );
  }

  // Compute content bounds
  const bounds = computeContentBounds(elements, systemLimits);
  const vb = `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`;

  // Compute routing
  const routed = computeRouting(elements, connections);

  // Build SVG
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="${vb}" ` +
    `width="${bounds.width}" height="${bounds.height}" ` +
    `style="background:#fff">\n`,
  );

  // Defs
  parts.push(renderMarkerDefs());

  // White background
  parts.push(
    `<rect x="${bounds.x}" y="${bounds.y}" ` +
    `width="${bounds.width}" height="${bounds.height}" fill="#fff"/>\n`,
  );

  // System limits
  for (const sl of systemLimits) {
    parts.push(renderSystemLimit(sl));
  }

  // Connections
  for (const r of routed) {
    parts.push(renderRoutedConnection(r));
  }

  // Elements
  for (const el of elements) {
    parts.push(renderElement(el));
  }

  parts.push('</svg>');
  return parts.join('');
}
