"""Layout engine that computes x,y positions for VDI 3682 process diagrams.

Layout strategy (top-to-bottom, multi-PO):
Phase 0: Build connectivity graph
Phase 1: Topological sort of POs (vertical stacking order)
Phase 2: Classify states into 6 categories (boundary-top/bottom/left/right, internal, disconnected)
Phase 3: Assign states to PO rows (Y-level affinity)
Phase 4: Compute coordinates
Phase 5: Compute system limit
Phase 6: Layout disconnected elements
Phase 7: Create connections
"""

from typing import Any

from pydantic import BaseModel, Field

from models.fpd_model import FlowType, StatePlacement, StateType
from models.process_model import ProcessModel


class LayoutConfig(BaseModel):
    """Configuration options for layout algorithm."""
    padding: int = Field(default=40, description="Padding around the diagram")
    h_gap: int = Field(default=40, description="Horizontal gap between elements")
    v_gap: int = Field(default=80, description="Vertical gap between rows")
    system_limit_padding: int = Field(
        default=50, description="Padding around system limit boundary"
    )
    resource_offset_x: int = Field(
        default=40, description="Horizontal offset for technical resources"
    )


# Element sizes (match frontend designTokens)
STATE_MAX_W = 55
STATE_H = 50
PROCESS_W = 150
PROCESS_H = 80
RESOURCE_W = 150
RESOURCE_H = 80

# Internal gap between PO rows with intermediate states
INTERNAL_V_GAP = 40

# Extra vertical space when boundary states sit on top/bottom edges
BOUNDARY_EXTRA_V = 40


# ---------- Phase 0: Build connectivity graph ----------

def _build_connectivity_graph(
    states: list,
    process_operators: list,
    flows: list,
    usages: list,
) -> dict[str, Any]:
    """Build connectivity maps from flows and usages."""
    po_ids = {p.id for p in process_operators}
    state_ids = {s.id for s in states}
    all_flow_refs: set[str] = set()

    state_to_target_pos: dict[str, list[str]] = {s.id: [] for s in states}
    state_to_source_pos: dict[str, list[str]] = {s.id: [] for s in states}
    po_to_input_states: dict[str, list[str]] = {p.id: [] for p in process_operators}
    po_to_output_states: dict[str, list[str]] = {p.id: [] for p in process_operators}

    # Track flow types for PO→State flows to detect alt-flow-only sinks
    state_has_regular_from_po: set[str] = set()
    state_has_alt_from_po: set[str] = set()

    for flow in flows:
        all_flow_refs.add(flow.source_ref)
        all_flow_refs.add(flow.target_ref)

        if flow.source_ref in state_ids and flow.target_ref in po_ids:
            state_to_target_pos[flow.source_ref].append(flow.target_ref)
            po_to_input_states[flow.target_ref].append(flow.source_ref)
        elif flow.source_ref in po_ids and flow.target_ref in state_ids:
            state_to_source_pos[flow.target_ref].append(flow.source_ref)
            po_to_output_states[flow.source_ref].append(flow.target_ref)

            if flow.flow_type == FlowType.ALTERNATIVE_FLOW:
                state_has_alt_from_po.add(flow.target_ref)
            else:
                state_has_regular_from_po.add(flow.target_ref)

    # Alt-flow-only sinks: states that receive ONLY alternative flows from POs
    alt_flow_only_sinks = state_has_alt_from_po - state_has_regular_from_po

    tr_to_po: dict[str, str] = {}
    for usage in usages:
        tr_to_po[usage.technical_resource_ref] = usage.process_operator_ref

    return {
        "state_to_target_pos": state_to_target_pos,
        "state_to_source_pos": state_to_source_pos,
        "po_to_input_states": po_to_input_states,
        "po_to_output_states": po_to_output_states,
        "tr_to_po": tr_to_po,
        "all_flow_refs": all_flow_refs,
        "po_ids": po_ids,
        "alt_flow_only_sinks": alt_flow_only_sinks,
    }


# ---------- Phase 1: Topological sort of POs ----------

def _topological_sort_pos(
    process_operators: list,
    states: list,
    graph: dict[str, Any],
) -> tuple[list[str], dict[str, int]]:
    """Topological sort of POs via intermediate states. Returns (poOrder, poRank)."""
    po_ids = {p.id for p in process_operators}

    # Build PO precedence graph
    po_successors: dict[str, set[str]] = {p.id: set() for p in process_operators}
    po_predecessors: dict[str, set[str]] = {p.id: set() for p in process_operators}

    for state in states:
        source_pos = graph["state_to_source_pos"].get(state.id, [])
        target_pos = graph["state_to_target_pos"].get(state.id, [])
        if source_pos and target_pos:
            for src_po in source_pos:
                for tgt_po in target_pos:
                    if src_po != tgt_po and src_po in po_ids and tgt_po in po_ids:
                        po_successors[src_po].add(tgt_po)
                        po_predecessors[tgt_po].add(src_po)

    # Kahn's algorithm with cycle breaking
    in_degree = {p.id: len(po_predecessors[p.id]) for p in process_operators}
    po_order: list[str] = []
    po_rank: dict[str, int] = {}
    remaining = {p.id for p in process_operators}
    current_rank = 0

    while remaining:
        ready = sorted(pid for pid in remaining if in_degree.get(pid, 0) == 0)

        if not ready:
            # Cycle: pick node with lowest in_degree
            by_degree = sorted(remaining, key=lambda pid: (in_degree.get(pid, 0), pid))
            ready = [by_degree[0]]

        for po_id in ready:
            po_order.append(po_id)
            po_rank[po_id] = current_rank
            remaining.discard(po_id)
            for succ in po_successors.get(po_id, set()):
                if succ in remaining:
                    in_degree[succ] = in_degree.get(succ, 1) - 1
            # Each PO gets its own rank so it receives a unique row position.
            current_rank += 1

    return po_order, po_rank


# ---------- Phase 2: Classify states ----------

def _product_boundary_side(
    is_input: bool,
    po_rank: dict[str, int] | None,
    connected_pos: list[str],
    max_rank: int,
) -> str:
    """Decide boundary side for a product state in multi-PO layouts.

    Products feeding the first PO → top, products from the last PO → bottom.
    All others → left (inputs) or right (outputs).
    """
    if is_input:
        if po_rank and connected_pos and max_rank > 0:
            min_rank = min(po_rank.get(pid, 0) for pid in connected_pos)
            if min_rank > 0:
                return "boundary-left"
        return "boundary-top"
    else:
        if po_rank and connected_pos and max_rank > 0:
            max_src_rank = max(po_rank.get(pid, 0) for pid in connected_pos)
            if max_src_rank < max_rank:
                return "boundary-right"
        return "boundary-bottom"


def _classify_state(
    state,
    graph: dict[str, Any],
    po_rank: dict[str, int] | None = None,
    max_rank: int = 0,
) -> str:
    """Classify a state into one of 6 categories."""
    if state.id not in graph["all_flow_refs"]:
        return "disconnected"

    source_pos = graph["state_to_source_pos"].get(state.id, [])
    target_pos = graph["state_to_target_pos"].get(state.id, [])
    is_pure_source = len(target_pos) > 0 and len(source_pos) == 0
    is_pure_sink = len(source_pos) > 0 and len(target_pos) == 0
    is_intermediate = len(source_pos) > 0 and len(target_pos) > 0

    # 1. Explicit directional override
    if state.placement == StatePlacement.BOUNDARY_TOP:
        return "boundary-top"
    if state.placement == StatePlacement.BOUNDARY_BOTTOM:
        return "boundary-bottom"
    if state.placement == StatePlacement.BOUNDARY_LEFT:
        return "boundary-left"
    if state.placement == StatePlacement.BOUNDARY_RIGHT:
        return "boundary-right"
    if state.placement == StatePlacement.INTERNAL:
        return "internal"

    # 2. @boundary (auto-detect side)
    if state.placement == StatePlacement.BOUNDARY:
        if is_pure_source:
            if state.state_type == StateType.PRODUCT:
                return _product_boundary_side(True, po_rank, target_pos, max_rank)
            return "boundary-left"
        if is_pure_sink:
            if state.state_type == StateType.PRODUCT:
                return _product_boundary_side(False, po_rank, source_pos, max_rank)
            return "boundary-right"
        if state.state_type == StateType.PRODUCT:
            return "boundary-top"
        return "boundary-left"

    # 3. Fully automatic (placement is None)
    if is_intermediate:
        return "internal"

    if is_pure_source:
        if state.state_type == StateType.PRODUCT:
            return _product_boundary_side(True, po_rank, target_pos, max_rank)
        return "boundary-left"

    if is_pure_sink:
        if state.state_type == StateType.PRODUCT:
            return _product_boundary_side(False, po_rank, source_pos, max_rank)
        return "boundary-right"

    return "boundary-top"


# ---------- Phase 3: Assign state affinities ----------

def _assign_state_affinities(
    states: list,
    graph: dict[str, Any],
    po_rank: dict[str, int],
    max_rank: int = 0,
) -> dict[str, dict[str, Any]]:
    """Assign each state a category and affiliated PO rank."""
    affinities: dict[str, dict[str, Any]] = {}

    for state in states:
        category = _classify_state(state, graph, po_rank, max_rank)
        source_pos = graph["state_to_source_pos"].get(state.id, [])
        target_pos = graph["state_to_target_pos"].get(state.id, [])

        affiliated_rank = 0
        source_rank = None
        target_rank = None

        if category == "boundary-left":
            if target_pos:
                affiliated_rank = min(po_rank.get(pid, 0) for pid in target_pos)
        elif category == "boundary-right":
            if source_pos:
                affiliated_rank = max(po_rank.get(pid, 0) for pid in source_pos)
        elif category == "internal":
            if source_pos:
                source_rank = max(po_rank.get(pid, 0) for pid in source_pos)
            if target_pos:
                target_rank = min(po_rank.get(pid, 0) for pid in target_pos)
            affiliated_rank = source_rank if source_rank is not None else (target_rank or 0)

        affinities[state.id] = {
            "category": category,
            "affiliated_rank": affiliated_rank,
            "source_rank": source_rank,
            "target_rank": target_rank,
        }

    return affinities


# ---------- Helpers ----------

def _distribute_centered(
    count: int,
    item_size: int,
    gap: int,
    center_pos: float,
) -> list[float]:
    """Distribute items centered around center_pos."""
    if count == 0:
        return []
    total = count * item_size + (count - 1) * gap
    start = center_pos - total / 2
    return [start + i * (item_size + gap) for i in range(count)]


# ---------- Single-system layout ----------

def _compute_single_system_layout(
    states: list,
    process_operators: list,
    technical_resources: list,
    flows: list,
    usages: list,
    config: LayoutConfig,
    offset_x: int = 0,
    offset_y: int = 0,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any] | None]:
    """Compute layout for a single system using the 7-phase algorithm."""
    elements: list[dict[str, Any]] = []
    connections: list[dict[str, Any]] = []

    if not states and not process_operators:
        return elements, connections, None

    # --- Phase 0 ---
    graph = _build_connectivity_graph(states, process_operators, flows, usages)

    # --- Phase 1 ---
    po_order, po_rank = _topological_sort_pos(process_operators, states, graph)
    max_rank = max(po_rank.values()) if po_rank else -1

    # --- Phase 2 + 3 ---
    affinities = _assign_state_affinities(states, graph, po_rank, max_rank)

    # Group states by category
    boundary_top = []
    boundary_bottom = []
    boundary_left: dict[int, list] = {}  # rank -> states
    boundary_right: dict[int, list] = {}
    internal_states = []
    disconnected_states = []

    for state in states:
        aff = affinities.get(state.id)
        if not aff:
            disconnected_states.append(state)
            continue
        cat = aff["category"]
        if cat == "boundary-top":
            boundary_top.append(state)
        elif cat == "boundary-bottom":
            boundary_bottom.append(state)
        elif cat == "boundary-left":
            rank = aff["affiliated_rank"]
            boundary_left.setdefault(rank, []).append(state)
        elif cat == "boundary-right":
            rank = aff["affiliated_rank"]
            boundary_right.setdefault(rank, []).append(state)
        elif cat == "internal":
            internal_states.append(state)
        else:
            disconnected_states.append(state)

    # Group internal states by gap (forward-edge only; backward = feedback)
    internals_by_gap: dict[str, list] = {}
    backward_internals: list = []
    for state in internal_states:
        aff = affinities[state.id]
        s_rank = aff["source_rank"] if aff["source_rank"] is not None else aff["affiliated_rank"]
        t_rank = aff["target_rank"] if aff["target_rank"] is not None else s_rank + 1
        if s_rank < t_rank:
            key = f"{s_rank}-{t_rank}"
            internals_by_gap.setdefault(key, []).append(state)
        else:
            backward_internals.append(state)

    has_intermediates_below = set()
    for key in internals_by_gap:
        s_rank = int(key.split("-")[0])
        has_intermediates_below.add(s_rank)

    # --- Phase 4: Compute coordinates ---

    start_x = offset_x + config.padding
    start_y = offset_y + config.padding

    top_boundary_height = (STATE_H + config.v_gap) if boundary_top else 0
    current_y = start_y + top_boundary_height

    po_row_y: dict[int, float] = {}
    for rank in range(max_rank + 1):
        left_count = len(boundary_left.get(rank, []))
        right_count = len(boundary_right.get(rank, []))
        max_side_count = max(left_count, right_count)
        side_height = max_side_count * (STATE_H + config.h_gap) - config.h_gap if max_side_count > 0 else 0
        row_height = max(PROCESS_H, side_height)

        po_row_y[rank] = current_y + (row_height - PROCESS_H) / 2
        current_y += row_height

        if rank in has_intermediates_below:
            current_y += INTERNAL_V_GAP + STATE_H + INTERNAL_V_GAP
        elif rank < max_rank:
            current_y += config.v_gap

    # Position POs (reserve left space for boundary-left states and feedback lane)
    left_space = 0
    if boundary_left:
        left_space += STATE_MAX_W + config.h_gap
    if backward_internals:
        left_space += STATE_MAX_W + config.h_gap
    core_left_x = start_x + left_space
    po_center_x = core_left_x + PROCESS_W / 2

    po_elements: dict[str, dict[str, Any]] = {}
    for po_id in po_order:
        po = next(p for p in process_operators if p.id == po_id)
        rank = po_rank.get(po_id, 0)
        y = po_row_y.get(rank, start_y)

        el = {
            "id": po.id, "type": "processOperator", "label": po.label,
            "x": core_left_x, "y": y,
            "width": PROCESS_W, "height": PROCESS_H,
        }
        elements.append(el)
        po_elements[po.id] = el

    disconnected_pos = [p for p in process_operators if p.id not in graph["all_flow_refs"]]

    # Position forward-edge internal states (between PO rows)
    for key, gap_states in internals_by_gap.items():
        s_rank, t_rank = (int(x) for x in key.split("-"))
        source_po_y = po_row_y.get(s_rank, start_y)
        # For spans crossing intermediate PO ranks, place the state in the gap
        # directly below the source PO (between s_rank and s_rank+1) to avoid
        # overlapping with POs at intermediate ranks.
        next_row_y = po_row_y.get(min(s_rank + 1, t_rank), po_row_y.get(t_rank, start_y))
        mid_y = (source_po_y + PROCESS_H + next_row_y) / 2 - STATE_H / 2

        xs = _distribute_centered(len(gap_states), STATE_MAX_W, config.h_gap, po_center_x)

        for i, s in enumerate(gap_states):
            elements.append({
                "id": s.id, "type": "state", "label": s.label,
                "x": xs[i], "y": mid_y,
                "width": STATE_MAX_W, "height": STATE_H,
                "stateType": s.state_type.value,
            })

    # 4d) Position backward-edge (feedback) internal states LEFT of POs, inside the SL
    backward_ids = {s.id for s in backward_internals}
    if backward_internals:
        feedback_x = core_left_x - STATE_MAX_W - config.h_gap
        for state in backward_internals:
            aff = affinities[state.id]
            s_rank_val = aff["source_rank"] if aff["source_rank"] is not None else 0
            t_rank_val = aff["target_rank"] if aff["target_rank"] is not None else 0
            min_r = min(s_rank_val, t_rank_val)
            max_r = max(s_rank_val, t_rank_val)
            upper_y = po_row_y.get(min_r, start_y)
            lower_y = po_row_y.get(max_r, start_y)
            mid_y = (upper_y + PROCESS_H + lower_y) / 2 - STATE_H / 2

            elements.append({
                "id": state.id, "type": "state", "label": state.label,
                "x": feedback_x, "y": mid_y,
                "width": STATE_MAX_W, "height": STATE_H,
                "stateType": state.state_type.value,
            })

    # --- Phase 5: Compute system limit ---

    internal_ids = {s.id for s in internal_states}
    core_elements = [
        e for e in elements
        if e["type"] == "processOperator" or
        (e["type"] == "state" and e["id"] in internal_ids)
    ]

    system_limit: dict[str, Any] | None = None

    if core_elements or boundary_top or boundary_bottom:
        if core_elements:
            sl_min_x = min(e["x"] for e in core_elements)
            sl_min_y = min(e["y"] for e in core_elements)
            sl_max_x = max(e["x"] + e["width"] for e in core_elements)
            sl_max_y = max(e["y"] + e["height"] for e in core_elements)
        else:
            sl_min_x = core_left_x
            sl_min_y = start_y
            sl_max_x = core_left_x + PROCESS_W
            sl_max_y = start_y + PROCESS_H

        max_left_count = max((len(v) for v in boundary_left.values()), default=0)
        max_right_count = max((len(v) for v in boundary_right.values()), default=0)
        if max_left_count > 0:
            sl_min_x -= STATE_MAX_W / 2 + config.h_gap
        if max_right_count > 0:
            sl_max_x += STATE_MAX_W / 2 + config.h_gap

        top_w = len(boundary_top) * (STATE_MAX_W + config.h_gap) - config.h_gap if boundary_top else 0
        bot_w = len(boundary_bottom) * (STATE_MAX_W + config.h_gap) - config.h_gap if boundary_bottom else 0
        max_bw = max(top_w, bot_w)
        core_w = sl_max_x - sl_min_x
        if max_bw > core_w:
            extra = (max_bw - core_w) / 2
            sl_min_x -= extra
            sl_max_x += extra

        # Extra vertical space when boundary states sit on top/bottom edges
        if boundary_top:
            sl_min_y -= BOUNDARY_EXTRA_V
        if boundary_bottom:
            sl_max_y += BOUNDARY_EXTRA_V

        slp = config.system_limit_padding
        system_limit = {
            "x": sl_min_x - slp,
            "y": sl_min_y - slp,
            "width": sl_max_x - sl_min_x + slp * 2,
            "height": sl_max_y - sl_min_y + slp * 2,
        }

    # Position boundary states on system limit edges
    if system_limit:
        sl_left = system_limit["x"]
        sl_right = system_limit["x"] + system_limit["width"]
        sl_top = system_limit["y"]
        sl_bottom = system_limit["y"] + system_limit["height"]
        sl_center_x = sl_left + system_limit["width"] / 2

        if boundary_top:
            b_top_y = sl_top - STATE_H / 2
            b_top_xs = _distribute_centered(len(boundary_top), STATE_MAX_W, config.h_gap, sl_center_x)
            for i, s in enumerate(boundary_top):
                elements.append({
                    "id": s.id, "type": "state", "label": s.label,
                    "x": b_top_xs[i], "y": b_top_y,
                    "width": STATE_MAX_W, "height": STATE_H,
                    "stateType": s.state_type.value,
                })

        if boundary_bottom:
            b_bot_y = sl_bottom - STATE_H / 2
            b_bot_xs = _distribute_centered(len(boundary_bottom), STATE_MAX_W, config.h_gap, sl_center_x)
            for i, s in enumerate(boundary_bottom):
                elements.append({
                    "id": s.id, "type": "state", "label": s.label,
                    "x": b_bot_xs[i], "y": b_bot_y,
                    "width": STATE_MAX_W, "height": STATE_H,
                    "stateType": s.state_type.value,
                })

        for rank, left_states in boundary_left.items():
            po_y = po_row_y.get(rank, start_y)
            row_center_y = po_y + PROCESS_H / 2
            ys = _distribute_centered(len(left_states), STATE_H, config.h_gap, row_center_y)
            b_left_x = sl_left - STATE_MAX_W / 2

            for i, s in enumerate(left_states):
                elements.append({
                    "id": s.id, "type": "state", "label": s.label,
                    "x": b_left_x, "y": ys[i],
                    "width": STATE_MAX_W, "height": STATE_H,
                    "stateType": s.state_type.value,
                })

        for rank, right_states in boundary_right.items():
            po_y = po_row_y.get(rank, start_y)
            row_center_y = po_y + PROCESS_H / 2
            ys = _distribute_centered(len(right_states), STATE_H, config.h_gap, row_center_y)
            b_right_x = sl_right - STATE_MAX_W / 2

            for i, s in enumerate(right_states):
                elements.append({
                    "id": s.id, "type": "state", "label": s.label,
                    "x": b_right_x, "y": ys[i],
                    "width": STATE_MAX_W, "height": STATE_H,
                    "stateType": s.state_type.value,
                })

    # Technical resources
    tr_start_x = (
        system_limit["x"] + system_limit["width"] + config.resource_offset_x
        if system_limit
        else core_left_x + PROCESS_W + config.resource_offset_x * 2
    )

    for i, tr in enumerate(technical_resources):
        connected_po_id = graph["tr_to_po"].get(tr.id)
        po_el = po_elements.get(connected_po_id) if connected_po_id else None

        tr_y = (
            po_el["y"] + (po_el["height"] - RESOURCE_H) / 2
            if po_el
            else (po_row_y.get(0, start_y) + i * (RESOURCE_H + config.h_gap))
        )

        elements.append({
            "id": tr.id, "type": "technicalResource", "label": tr.label,
            "x": tr_start_x, "y": tr_y,
            "width": RESOURCE_W, "height": RESOURCE_H,
        })

    # Disconnected elements
    if disconnected_states or disconnected_pos:
        max_el_y = max((e["y"] + e["height"] for e in elements), default=start_y)
        d_start_y = max_el_y + config.v_gap
        cx = start_x

        for s in disconnected_states:
            elements.append({
                "id": s.id, "type": "state", "label": s.label,
                "x": cx, "y": d_start_y,
                "width": STATE_MAX_W, "height": STATE_H,
                "stateType": s.state_type.value,
            })
            cx += STATE_MAX_W + config.h_gap

        for p in disconnected_pos:
            elements.append({
                "id": p.id, "type": "processOperator", "label": p.label,
                "x": cx, "y": d_start_y,
                "width": PROCESS_W, "height": PROCESS_H,
            })
            cx += PROCESS_W + config.h_gap

    # Connections
    boundary_top_ids = {s.id for s in boundary_top}
    boundary_bottom_ids = {s.id for s in boundary_bottom}

    for flow in flows:
        conn: dict[str, Any] = {
            "id": flow.id,
            "sourceId": flow.source_ref,
            "targetId": flow.target_ref,
            "flowType": flow.flow_type.value,
            "isUsage": False,
        }

        # Routing hints for boundary-top states: outgoing arrows always from bottom
        if flow.source_ref in boundary_top_ids:
            conn["sourceSide"] = "bottom"
        # Routing hints for boundary-bottom states: incoming arrows always from top
        if flow.target_ref in boundary_bottom_ids:
            conn["targetSide"] = "top"

        # Routing hints for feedback connections
        if flow.target_ref in backward_ids:
            # PO → feedback state: exit PO left, enter state bottom
            conn["sourceSide"] = "left"
            conn["targetSide"] = "bottom"
        elif flow.source_ref in backward_ids:
            # feedback state → PO: exit state top, enter PO left
            conn["sourceSide"] = "top"
            conn["targetSide"] = "left"

        connections.append(conn)

    for usage in usages:
        connections.append({
            "id": usage.id,
            "sourceId": usage.process_operator_ref,
            "targetId": usage.technical_resource_ref,
            "isUsage": True,
        })

    return elements, connections, system_limit


def _deduplicate_elements(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove duplicate elements by ID, keeping the first occurrence."""
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for el in elements:
        if el["id"] not in seen:
            seen.add(el["id"])
            result.append(el)
    return result


# ---------- Main layout function ----------

def compute_layout(
    model: ProcessModel, config: LayoutConfig | None = None
) -> dict[str, Any]:
    """Convert a ProcessModel into positioned diagram data.

    Supports multiple systems: groups elements by system_id, computes
    independent layout per system, and arranges systems side-by-side.
    """
    if config is None:
        config = LayoutConfig()

    # Determine unique system IDs
    system_ids: list[str | None] = []
    system_labels: dict[str | None, str] = {}

    for sl in model.system_limits:
        system_ids.append(sl.id)
        system_labels[sl.id] = sl.label

    seen_ids = set(system_ids)
    for elem_list in [model.states, model.process_operators, model.technical_resources]:
        for elem in elem_list:
            sid = elem.system_id
            if sid is not None and sid not in seen_ids:
                system_ids.append(sid)
                system_labels[sid] = sid
                seen_ids.add(sid)

    has_none = any(
        elem.system_id is None
        for elem_list in [model.states, model.process_operators, model.technical_resources]
        for elem in elem_list
    )
    if has_none and None not in seen_ids:
        system_ids.append(None)
        system_labels[None] = "System"
        seen_ids.add(None)

    if not system_ids:
        system_ids = [None]
        system_labels[None] = "System"

    def _filter_by_system(items: list, sid: str | None) -> list:
        return [item for item in items if getattr(item, "system_id", None) == sid]

    system_gap = config.h_gap * 3

    # Cross-system flows (State -> State between different systems)
    cross_system_flows = [f for f in model.flows if f.system_id is None]

    # State-to-system lookup
    state_system_map: dict[str, str] = {}
    for s in model.states:
        if s.system_id is not None:
            state_system_map[s.id] = s.system_id

    # --- Phase 1: Layout each system at origin (0,0) to get sizes ---

    system_results: list[dict[str, Any]] = []

    for sid in system_ids:
        sys_states = _filter_by_system(model.states, sid)
        sys_processes = _filter_by_system(model.process_operators, sid)
        sys_resources = _filter_by_system(model.technical_resources, sid)
        sys_flows = _filter_by_system(model.flows, sid)
        sys_usages = _filter_by_system(model.usages, sid)

        if not sys_states and not sys_processes and not sys_resources:
            continue

        elems, conns, sl = _compute_single_system_layout(
            states=sys_states,
            process_operators=sys_processes,
            technical_resources=sys_resources,
            flows=sys_flows,
            usages=sys_usages,
            config=config,
            offset_x=0,
            offset_y=0,
        )

        system_results.append({
            "sid": sid,
            "label": system_labels.get(sid, "System"),
            "elements": elems,
            "connections": conns,
            "bounds": sl,
        })

    # --- Phase 2: Place systems with optimal (dx, dy) offsets ---
    # For each system after the first, evaluate two candidate placements:
    #   A) Below: same X as connected neighbor, Y shifted for alignment
    #   B) Right: X to the right of all placed systems, Y shifted for alignment
    # Pick whichever gives shorter mean Euclidean distance between connected states.

    import math

    def _get_shifted_bounds(sr: dict, dx: float, dy: float) -> dict | None:
        sl = sr["bounds"]
        if sl is not None:
            return {"x": sl["x"] + dx, "y": sl["y"] + dy,
                    "width": sl["width"], "height": sl["height"]}
        elems = sr["elements"]
        if not elems:
            return None
        min_x = min(e["x"] + dx for e in elems)
        min_y = min(e["y"] + dy for e in elems)
        max_x = max(e["x"] + dx + e["width"] for e in elems)
        max_y = max(e["y"] + dy + e["height"] for e in elems)
        return {"x": min_x, "y": min_y, "width": max_x - min_x, "height": max_y - min_y}

    def _boxes_overlap(a: dict, b: dict, gap: float) -> bool:
        return (
            a["x"] < b["x"] + b["width"] + gap
            and a["x"] + a["width"] + gap > b["x"]
            and a["y"] < b["y"] + b["height"] + gap
            and a["y"] + a["height"] + gap > b["y"]
        )

    def _resolve_overlaps_down(
        sr: dict, dx: float, dy: float, placed: list[dict],
    ) -> float:
        box = _get_shifted_bounds(sr, dx, dy)
        if not box:
            return dy
        max_iter = 50
        has_overlap = True
        while has_overlap and max_iter > 0:
            has_overlap = False
            max_iter -= 1
            for p in placed:
                if _boxes_overlap(box, p, system_gap):
                    dy += p["y"] + p["height"] + system_gap - box["y"]
                    box = _get_shifted_bounds(sr, dx, dy)
                    has_overlap = True
                    break
        return dy

    def _resolve_overlaps_right(
        sr: dict, dx: float, dy: float, placed: list[dict],
    ) -> float:
        box = _get_shifted_bounds(sr, dx, dy)
        if not box:
            return dx
        max_iter = 50
        has_overlap = True
        while has_overlap and max_iter > 0:
            has_overlap = False
            max_iter -= 1
            for p in placed:
                if _boxes_overlap(box, p, system_gap):
                    dx += p["x"] + p["width"] + system_gap - box["x"]
                    box = _get_shifted_bounds(sr, dx, dy)
                    has_overlap = True
                    break
        return dx

    # Element position lookup (absolute positions including offsets)
    element_pos: dict[str, dict] = {}

    # Offsets per system
    system_offset: dict[str | None, tuple[float, float]] = {}
    placed_boxes: list[dict] = []

    # Place first system at origin
    if system_results:
        first = system_results[0]
        system_offset[first["sid"]] = (0.0, 0.0)
        for el in first["elements"]:
            element_pos[el["id"]] = {
                "x": el["x"], "y": el["y"],
                "w": el["width"], "h": el["height"],
            }
        box = _get_shifted_bounds(first, 0, 0)
        if box:
            placed_boxes.append(box)

    for i in range(1, len(system_results)):
        sr = system_results[i]
        sr_sid = sr["sid"]

        # Find cross-system flows connecting this system to already-placed systems
        connected_pairs: list[dict] = []
        for flow in cross_system_flows:
            s_sys = state_system_map.get(flow.source_ref)
            t_sys = state_system_map.get(flow.target_ref)
            if t_sys == sr_sid and s_sys != sr_sid and s_sys in system_offset:
                connected_pairs.append({
                    "src_id": flow.source_ref, "tgt_id": flow.target_ref,
                })
            if s_sys == sr_sid and t_sys != sr_sid and t_sys in system_offset:
                connected_pairs.append({
                    "src_id": flow.target_ref, "tgt_id": flow.source_ref,
                })

        def _compute_align_delta_y(dx: float) -> float:
            if not connected_pairs:
                return 0.0
            total = 0.0
            for pair in connected_pairs:
                placed_el = element_pos.get(pair["src_id"])
                local_el = next(
                    (e for e in sr["elements"] if e["id"] == pair["tgt_id"]),
                    None,
                )
                if placed_el and local_el:
                    placed_cy = placed_el["y"] + placed_el["h"] / 2
                    local_cy = local_el["y"] + local_el["height"] / 2
                    total += placed_cy - local_cy
            return total / len(connected_pairs)

        def _compute_mean_dist(dx: float, dy: float) -> float:
            if not connected_pairs:
                return float("inf")
            total = 0.0
            for pair in connected_pairs:
                placed_el = element_pos.get(pair["src_id"])
                local_el = next(
                    (e for e in sr["elements"] if e["id"] == pair["tgt_id"]),
                    None,
                )
                if placed_el and local_el:
                    pcx = placed_el["x"] + placed_el["w"] / 2
                    pcy = placed_el["y"] + placed_el["h"] / 2
                    lcx = local_el["x"] + local_el["width"] / 2 + dx
                    lcy = local_el["y"] + local_el["height"] / 2 + dy
                    total += math.sqrt((pcx - lcx) ** 2 + (pcy - lcy) ** 2)
            return total / len(connected_pairs)

        best_dx = 0.0
        best_dy = 0.0

        if connected_pairs:
            # Find the connected neighbor's X offset
            neighbor_dx = 0.0
            for pair in connected_pairs:
                placed_el = element_pos.get(pair["src_id"])
                if placed_el:
                    neighbor_sys = state_system_map.get(pair["src_id"])
                    if neighbor_sys and neighbor_sys in system_offset:
                        neighbor_dx = system_offset[neighbor_sys][0]
                        break

            # Candidate A: Below (same X as neighbor, Y aligned + row offset)
            align_dy_a = _compute_align_delta_y(neighbor_dx)
            cand_a_dx = neighbor_dx
            cand_a_dy = align_dy_a + STATE_H + config.v_gap
            cand_a_dy = _resolve_overlaps_down(sr, cand_a_dx, cand_a_dy, placed_boxes)

            # Candidate B: Right (X = right edge of all placed, Y aligned)
            right_edge = (
                max(b["x"] + b["width"] for b in placed_boxes) + system_gap
                if placed_boxes else 0.0
            )
            align_dy_b = _compute_align_delta_y(right_edge)
            cand_b_dx = right_edge
            cand_b_dy = align_dy_b
            if connected_pairs:
                cand_b_dy += STATE_H + config.v_gap
            cand_b_dx = _resolve_overlaps_right(
                sr, cand_b_dx, cand_b_dy, placed_boxes,
            )
            cand_b_dy = _resolve_overlaps_down(
                sr, cand_b_dx, cand_b_dy, placed_boxes,
            )

            dist_a = _compute_mean_dist(cand_a_dx, cand_a_dy)
            dist_b = _compute_mean_dist(cand_b_dx, cand_b_dy)

            if dist_b < dist_a:
                best_dx = cand_b_dx
                best_dy = cand_b_dy
            else:
                best_dx = cand_a_dx
                best_dy = cand_a_dy
        else:
            # No cross-system connections: place side-by-side to the right
            right_edge = (
                max(b["x"] + b["width"] for b in placed_boxes) + system_gap
                if placed_boxes else 0.0
            )
            best_dx = right_edge
            best_dy = 0.0
            best_dx = _resolve_overlaps_right(
                sr, best_dx, best_dy, placed_boxes,
            )
            best_dy = _resolve_overlaps_down(
                sr, best_dx, best_dy, placed_boxes,
            )

        system_offset[sr_sid] = (best_dx, best_dy)
        for el in sr["elements"]:
            element_pos[el["id"]] = {
                "x": el["x"] + best_dx, "y": el["y"] + best_dy,
                "w": el["width"], "h": el["height"],
            }
        box = _get_shifted_bounds(sr, best_dx, best_dy)
        if box:
            placed_boxes.append(box)

    # --- Phase 3: Apply offsets and collect results ---

    all_elements: list[dict[str, Any]] = []
    all_connections: list[dict[str, Any]] = []
    system_limits: list[dict[str, Any]] = []

    for sr in system_results:
        dx, dy = system_offset.get(sr["sid"], (0.0, 0.0))

        for el in sr["elements"]:
            shifted = dict(el)
            shifted["x"] = el["x"] + dx
            shifted["y"] = el["y"] + dy
            all_elements.append(shifted)

        all_connections.extend(sr["connections"])

        sl = sr["bounds"]
        if sl is not None:
            shifted_sl = dict(sl)
            shifted_sl["x"] = sl["x"] + dx
            shifted_sl["y"] = sl["y"] + dy
            shifted_sl["id"] = sr["sid"]
            shifted_sl["label"] = sr["label"]
            system_limits.append(shifted_sl)

    # Build system bounds lookup for source-side detection
    system_bounds_map: dict[str, dict] = {}
    for sl_entry in system_limits:
        system_bounds_map[sl_entry["id"]] = sl_entry

    def _cross_system_source_side(state_id: str) -> str:
        """Determine exit side for a cross-system source state.
        If the state sits on the left/right edge of its system, exit from
        that side. Otherwise default to 'bottom'."""
        sys_id = state_system_map.get(state_id)
        if not sys_id:
            return "bottom"
        bounds = system_bounds_map.get(sys_id)
        pos = element_pos.get(state_id)
        if not bounds or not pos:
            return "bottom"
        el_cx = pos["x"] + pos["w"] / 2
        third_w = bounds["width"] / 3
        if el_cx < bounds["x"] + third_w:
            return "left"
        if el_cx > bounds["x"] + bounds["width"] - third_w:
            return "right"
        return "bottom"

    # Cross-system connections
    for flow in cross_system_flows:
        all_connections.append({
            "id": flow.id,
            "sourceId": flow.source_ref,
            "targetId": flow.target_ref,
            "flowType": flow.flow_type.value,
            "isUsage": False,
            "isCrossSystem": True,
            "sourceSide": _cross_system_source_side(flow.source_ref),
            "targetSide": "top",
        })

    return {
        "elements": _deduplicate_elements(all_elements),
        "connections": all_connections,
        "systemLimits": system_limits,
        "systemLimit": system_limits[0] if system_limits else None,
    }
