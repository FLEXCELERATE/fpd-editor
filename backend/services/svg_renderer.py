"""SVG renderer for VDI 3682 process diagrams.

Generates a complete SVG string from diagram layout data.
Shapes, colors, and routing match the React frontend exactly
(see frontend/src/components/Diagram/elements.tsx, connections.tsx, routing.ts).
"""

from __future__ import annotations

import math
from typing import Any
from xml.sax.saxutils import escape

# ---------- Design tokens (match frontend/src/theme/designTokens.ts) ----------

COLORS = {
    "product": "#E51400",
    "energy": "#6E9AD1",
    "information": "#2F4DA1",
    "processOperator": "#11AE4B",
    "technicalResource": "#888889",
    "flow": "#000",
    "alternativeFlow": "#f5a623",
    "parallelFlow": "#4a90d9",
    "usage": "#888889",
    "crossSystem": "#9b59b6",
    "black": "#000",
}

FONT_FAMILY = "Helvetica, Arial, sans-serif"
STROKE_WIDTH = 1.5
STATE_LABEL_FONT_SIZE = 11
PROCESS_LABEL_FONT_SIZE = 13
SYSTEM_LIMIT_LABEL_FONT_SIZE = 12

# ---------- Routing (matches frontend/src/components/Diagram/routing.ts) ----------


def _center_of(el: dict) -> tuple[float, float]:
    return el["x"] + el["width"] / 2, el["y"] + el["height"] / 2


def _determine_side(from_el: dict, to_el: dict) -> str:
    fcx, fcy = _center_of(from_el)
    tcx, tcy = _center_of(to_el)
    dx = tcx - fcx
    dy = tcy - fcy
    if abs(dy) >= abs(dx):
        return "bottom" if dy >= 0 else "top"
    return "right" if dx >= 0 else "left"


def _port_position(
    el: dict, side: str, index: int, count: int
) -> tuple[float, float]:
    x, y, w, h = el["x"], el["y"], el["width"], el["height"]
    if side == "top":
        sp = w / (count + 1)
        return x + sp * (index + 1), y
    if side == "bottom":
        sp = w / (count + 1)
        return x + sp * (index + 1), y + h
    if side == "left":
        sp = h / (count + 1)
        return x, y + sp * (index + 1)
    # right
    sp = h / (count + 1)
    return x + w, y + sp * (index + 1)


def _orthogonal_waypoints(
    src: tuple[float, float],
    tgt: tuple[float, float],
    s_side: str,
    t_side: str,
) -> list[tuple[float, float]]:
    is_v_src = s_side in ("top", "bottom")
    is_v_tgt = t_side in ("top", "bottom")

    if is_v_src and is_v_tgt:
        if src[0] == tgt[0]:
            return [src, tgt]
        mid_y = (src[1] + tgt[1]) / 2
        return [src, (src[0], mid_y), (tgt[0], mid_y), tgt]

    if not is_v_src and not is_v_tgt:
        if src[1] == tgt[1]:
            return [src, tgt]
        mid_x = (src[0] + tgt[0]) / 2
        return [src, (mid_x, src[1]), (mid_x, tgt[1]), tgt]

    # Mixed: L-shaped
    if is_v_src:
        return [src, (src[0], tgt[1]), tgt]
    return [src, (tgt[0], src[1]), tgt]


def _compute_routing(
    elements: list[dict], connections: list[dict]
) -> list[dict]:
    """Compute routed connections with edge ports and orthogonal waypoints."""
    lookup = {el["id"]: el for el in elements}

    # Step 1: determine sides
    metas = []
    for conn in connections:
        source = lookup.get(conn["sourceId"])
        target = lookup.get(conn["targetId"])
        if not source or not target:
            continue
        s_side = conn.get("sourceSide") or _determine_side(source, target)
        t_side = conn.get("targetSide") or _determine_side(target, source)
        is_direct = conn.get("flowType") == "alternativeFlow"
        metas.append({
            "conn": conn,
            "source": source,
            "target": target,
            "sourceSide": s_side,
            "targetSide": t_side,
            "isDirect": is_direct,
        })

    # Step 2: group by (elementId, side)
    port_groups: dict[str, dict] = {}
    for i, m in enumerate(metas):
        s_key = f"{m['source']['id']}:{m['sourceSide']}"
        if s_key not in port_groups:
            port_groups[s_key] = {
                "element": m["source"],
                "side": m["sourceSide"],
                "entries": [],
            }
        port_groups[s_key]["entries"].append({"metaIndex": i, "role": "source"})

        t_key = f"{m['target']['id']}:{m['targetSide']}"
        if t_key not in port_groups:
            port_groups[t_key] = {
                "element": m["target"],
                "side": m["targetSide"],
                "entries": [],
            }
        port_groups[t_key]["entries"].append({"metaIndex": i, "role": "target"})

    # Step 3: assign port positions
    source_ports: dict[int, tuple[float, float]] = {}
    target_ports: dict[int, tuple[float, float]] = {}

    for group in port_groups.values():
        el, side, entries = group["element"], group["side"], group["entries"]
        use_y = side in ("left", "right")

        def _connected_pos(entry: dict) -> float:
            m = metas[entry["metaIndex"]]
            connected = m["target"] if entry["role"] == "source" else m["source"]
            cx, cy = _center_of(connected)
            return cy if use_y else cx

        entries.sort(key=_connected_pos)
        count = len(entries)
        for idx, entry in enumerate(entries):
            port = _port_position(el, side, idx, count)
            if entry["role"] == "source":
                source_ports[entry["metaIndex"]] = port
            else:
                target_ports[entry["metaIndex"]] = port

    # Step 4: waypoints
    routed = []
    for i, m in enumerate(metas):
        sp = source_ports.get(i)
        tp = target_ports.get(i)
        if not sp or not tp:
            continue

        if m["isDirect"]:
            points = [sp, tp]
        else:
            points = _orthogonal_waypoints(sp, tp, m["sourceSide"], m["targetSide"])

        routed.append({"conn": m["conn"], "points": points, "isDirect": m["isDirect"]})

    return routed


# ---------- SVG content bounds ----------


def _compute_content_bounds(
    elements: list[dict], system_limits: list[dict]
) -> dict:
    """Compute bounding box including labels, with margin."""
    char_w = STATE_LABEL_FONT_SIZE * 0.6
    sl_char_w = SYSTEM_LIMIT_LABEL_FONT_SIZE * 0.6

    all_x: list[float] = []
    all_y: list[float] = []
    all_right: list[float] = []
    all_bottom: list[float] = []

    for e in elements:
        all_right.append(e["x"] + e["width"])
        all_bottom.append(e["y"] + e["height"])
        if e["type"] == "state":
            longest = max(len(e["id"]), len(e.get("label", "")))
            label_width = longest * char_w
            anchor_x = e["x"] + e["width"] / 2 - 6
            all_x.append(anchor_x - label_width)
            all_y.append(e["y"] - 35)
        else:
            all_x.append(e["x"])
            all_y.append(e["y"])

    for sl in system_limits:
        all_x.append(sl["x"])
        all_bottom.append(sl["y"] + sl["height"])
        sl_label_w = len(sl.get("label", "")) * sl_char_w
        all_right.append(sl["x"] + sl["width"] + sl_label_w)
        all_y.append(sl["y"] - SYSTEM_LIMIT_LABEL_FONT_SIZE - 5)

    if not all_x:
        return {"x": 0, "y": 0, "width": 800, "height": 600}

    margin = 50
    min_x = min(all_x) - margin
    min_y = min(all_y) - margin
    max_x = max(all_right) + margin
    max_y = max(all_bottom) + margin
    return {"x": min_x, "y": min_y, "width": max_x - min_x, "height": max_y - min_y}


# ---------- SVG element renderers ----------


def _render_marker_defs() -> str:
    """SVG <defs> with arrowhead markers matching frontend connections.tsx."""
    markers = ""
    for mid, color, mw, mh in [
        ("arrow-flow", COLORS["flow"], 8, 8),
        ("arrow-alternative", COLORS["alternativeFlow"], 8, 8),
        ("arrow-parallel", COLORS["parallelFlow"], 8, 8),
        ("arrow-usage", COLORS["usage"], 6, 6),
        ("arrow-crossSystem", COLORS["crossSystem"], 8, 8),
    ]:
        markers += (
            f'<marker id="{mid}" viewBox="0 0 10 10" refX="10" refY="5" '
            f'markerWidth="{mw}" markerHeight="{mh}" orient="auto-start-reverse" '
            f'markerUnits="strokeWidth">'
            f'<path d="M 0 0 L 10 5 L 0 10 Z" fill="{color}"/>'
            f"</marker>\n"
        )
    return f"<defs>\n{markers}</defs>\n"


def _render_system_limit(sl: dict) -> str:
    x, y, w, h = sl["x"], sl["y"], sl["width"], sl["height"]
    label = escape(sl.get("label", ""))
    svg = (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" '
        f'fill="none" stroke="{COLORS["black"]}" stroke-width="{STROKE_WIDTH}" '
        f'stroke-dasharray="10,12"/>\n'
    )
    if label:
        svg += (
            f'<text x="{x + w}" y="{y - 5}" text-anchor="start" '
            f'font-size="{SYSTEM_LIMIT_LABEL_FONT_SIZE}" font-weight="bold" '
            f'font-family="{FONT_FAMILY}" fill="{COLORS["black"]}">{label}</text>\n'
        )
    return svg


def _render_state(el: dict) -> str:
    """Render Product (circle), Energy (diamond), Information (hexagon)."""
    x, y, w, h = el["x"], el["y"], el["width"], el["height"]
    eid = escape(el["id"])
    label = escape(el.get("label", el["id"]))
    state_type = el.get("stateType", "product")
    has_name = label != eid

    # Shape
    if state_type == "energy":
        hw, hh = w / 2, h / 2
        points = f"{x+hw},{y} {x+w},{y+hh} {x+hw},{y+h} {x},{y+hh}"
        shape = (
            f'<polygon points="{points}" fill="{COLORS["energy"]}" '
            f'stroke="{COLORS["black"]}" stroke-width="{STROKE_WIDTH}"/>\n'
        )
    elif state_type == "information":
        qw, hh = w * 0.25, h / 2
        points = (
            f"{x+qw},{y} {x+w-qw},{y} {x+w},{y+hh} "
            f"{x+w-qw},{y+h} {x+qw},{y+h} {x},{y+hh}"
        )
        shape = (
            f'<polygon points="{points}" fill="{COLORS["information"]}" '
            f'stroke="{COLORS["black"]}" stroke-width="{STROKE_WIDTH}"/>\n'
        )
    else:
        r = min(w, h) / 2
        cx, cy = x + w / 2, y + h / 2
        shape = (
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{COLORS["product"]}" '
            f'stroke="{COLORS["black"]}" stroke-width="{STROKE_WIDTH}"/>\n'
        )

    # Label above shape (matching frontend: text-anchor="end")
    label_x = x + w / 2 - 6
    id_y = y - 22 if has_name else y - 8
    text = (
        f'<text text-anchor="end" font-size="{STATE_LABEL_FONT_SIZE}" '
        f'font-family="{FONT_FAMILY}" fill="{COLORS["black"]}">'
        f'<tspan x="{label_x}" y="{id_y}">{eid}</tspan>'
    )
    if has_name:
        text += f'<tspan x="{label_x}" dy="14">{label}</tspan>'
    text += "</text>\n"

    return f"<g>{shape}{text}</g>\n"


def _auto_font_size(
    lines: list[str], max_width_px: float, default_size: float, min_size: float = 7
) -> float:
    longest = max(lines, key=len) if lines else ""
    needed = len(longest) * default_size * 0.6
    if needed <= max_width_px:
        return default_size
    scaled = (max_width_px / len(longest)) / 0.6 if longest else default_size
    return max(min_size, scaled)


def _render_process_operator(el: dict) -> str:
    """Sharp-corner rectangle (green) with centered label."""
    x, y, w, h = el["x"], el["y"], el["width"], el["height"]
    eid = escape(el["id"])
    label = escape(el.get("label", el["id"]))
    has_name = label != eid
    lines = [eid, label] if has_name else [eid]
    fs = _auto_font_size(lines, w - 12, PROCESS_LABEL_FONT_SIZE)

    shape = (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="0" ry="0" '
        f'fill="{COLORS["processOperator"]}" '
        f'stroke="{COLORS["black"]}" stroke-width="{STROKE_WIDTH}"/>\n'
    )

    cx = x + w / 2
    if has_name:
        id_y = y + h / 2 - fs * 0.6
        text = (
            f'<text text-anchor="middle" font-size="{fs}" '
            f'font-family="{FONT_FAMILY}" fill="{COLORS["black"]}">'
            f'<tspan x="{cx}" y="{id_y}">{eid}</tspan>'
            f'<tspan x="{cx}" dy="{fs * 1.2}">{label}</tspan>'
            f"</text>\n"
        )
    else:
        text = (
            f'<text x="{cx}" y="{y + h / 2}" text-anchor="middle" '
            f'dominant-baseline="middle" font-size="{fs}" '
            f'font-family="{FONT_FAMILY}" fill="{COLORS["black"]}">{eid}</text>\n'
        )

    return f"<g>{shape}{text}</g>\n"


def _render_technical_resource(el: dict) -> str:
    """Rounded rectangle (gray) with centered label."""
    x, y, w, h = el["x"], el["y"], el["width"], el["height"]
    eid = escape(el["id"])
    label = escape(el.get("label", el["id"]))
    has_name = label != eid
    lines = [eid, label] if has_name else [eid]
    fs = _auto_font_size(lines, w - 24, PROCESS_LABEL_FONT_SIZE)

    shape = (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="40" ry="40" '
        f'fill="{COLORS["technicalResource"]}" '
        f'stroke="{COLORS["black"]}" stroke-width="{STROKE_WIDTH}"/>\n'
    )

    cx = x + w / 2
    if has_name:
        id_y = y + h / 2 - fs * 0.6
        text = (
            f'<text text-anchor="middle" font-size="{fs}" '
            f'font-family="{FONT_FAMILY}" fill="{COLORS["black"]}">'
            f'<tspan x="{cx}" y="{id_y}">{eid}</tspan>'
            f'<tspan x="{cx}" dy="{fs * 1.2}">{label}</tspan>'
            f"</text>\n"
        )
    else:
        text = (
            f'<text x="{cx}" y="{y + h / 2}" text-anchor="middle" '
            f'dominant-baseline="middle" font-size="{fs}" '
            f'font-family="{FONT_FAMILY}" fill="{COLORS["black"]}">{eid}</text>\n'
        )

    return f"<g>{shape}{text}</g>\n"


def _render_element(el: dict) -> str:
    el_type = el.get("type")
    if el_type == "state":
        return _render_state(el)
    if el_type == "processOperator":
        return _render_process_operator(el)
    if el_type == "technicalResource":
        return _render_technical_resource(el)
    return ""


def _points_to_path_d(points: list[tuple[float, float]]) -> str:
    if not points:
        return ""
    first = points[0]
    d = f"M {first[0]},{first[1]}"
    for p in points[1:]:
        d += f" L {p[0]},{p[1]}"
    return d


def _render_routed_connection(routed: dict) -> str:
    """Render a single routed connection as an SVG path."""
    conn = routed["conn"]
    points = routed["points"]
    if len(points) < 2:
        return ""

    d = _points_to_path_d(points)

    if conn.get("isCrossSystem"):
        return (
            f'<path d="{d}" fill="none" stroke="{COLORS["crossSystem"]}" '
            f'stroke-width="{STROKE_WIDTH}" stroke-dasharray="8,4" '
            f'marker-end="url(#arrow-crossSystem)"/>\n'
        )

    if conn.get("isUsage"):
        return (
            f'<path d="{d}" fill="none" stroke="{COLORS["usage"]}" '
            f'stroke-width="{STROKE_WIDTH}" stroke-dasharray="6,4" '
            f'marker-start="url(#arrow-usage)" marker-end="url(#arrow-usage)"/>\n'
        )

    flow_type = conn.get("flowType", "flow")
    if flow_type == "alternativeFlow":
        return (
            f'<path d="{d}" fill="none" stroke="{COLORS["flow"]}" '
            f'stroke-width="{STROKE_WIDTH}" '
            f'marker-end="url(#arrow-flow)"/>\n'
        )
    if flow_type == "parallelFlow":
        return (
            f'<path d="{d}" fill="none" stroke="{COLORS["flow"]}" '
            f'stroke-width="{STROKE_WIDTH}" '
            f'marker-end="url(#arrow-flow)"/>\n'
        )

    # Regular flow
    return (
        f'<path d="{d}" fill="none" stroke="{COLORS["flow"]}" '
        f'stroke-width="{STROKE_WIDTH}" '
        f'marker-end="url(#arrow-flow)"/>\n'
    )


# ---------- Public API ----------


def render_svg(diagram: dict[str, Any]) -> str:
    """Generate a complete SVG string from diagram layout data.

    Args:
        diagram: The diagram dict as returned by compute_layout(), containing
                 'elements', 'connections', and 'systemLimits'.

    Returns:
        A complete SVG document string.
    """
    elements = diagram.get("elements", [])
    connections = diagram.get("connections", [])
    system_limits = diagram.get("systemLimits", [])

    if not elements:
        return (
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">'
            '<text x="200" y="100" text-anchor="middle" font-family="sans-serif" '
            'fill="#888">No diagram to display</text></svg>'
        )

    # Compute content bounds
    bounds = _compute_content_bounds(elements, system_limits)
    vb = f'{bounds["x"]} {bounds["y"]} {bounds["width"]} {bounds["height"]}'

    # Compute routing
    routed = _compute_routing(elements, connections)

    # Build SVG
    parts: list[str] = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="{vb}" '
        f'width="{bounds["width"]}" height="{bounds["height"]}" '
        f'style="background:#fff">\n'
    )

    # Defs
    parts.append(_render_marker_defs())

    # White background
    parts.append(
        f'<rect x="{bounds["x"]}" y="{bounds["y"]}" '
        f'width="{bounds["width"]}" height="{bounds["height"]}" fill="#fff"/>\n'
    )

    # System limits
    for sl in system_limits:
        parts.append(_render_system_limit(sl))

    # Connections
    for r in routed:
        parts.append(_render_routed_connection(r))

    # Elements
    for el in elements:
        parts.append(_render_element(el))

    parts.append("</svg>")
    return "".join(parts)
