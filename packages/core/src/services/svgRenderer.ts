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
  SystemLimitRect,
  DiagramLayout,
} from './layout';
import { escapeXml } from '../utils';
import {
  COLORS,
  FONT_FAMILY,
  STROKE_WIDTH,
  STATE_LABEL_FONT_SIZE,
  PROCESS_LABEL_FONT_SIZE,
  SYSTEM_LIMIT_LABEL_FONT_SIZE,
} from './designTokens';
import {
  type Point,
  type RoutedConnection,
  computeRouting,
  computeContentBounds,
  autoFontSize,
} from './routing';

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
