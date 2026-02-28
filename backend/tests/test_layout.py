"""Unit tests for the new vertical multi-PO layout engine."""

import time

import pytest

from models.fpb_model import (
    Flow,
    FlowType,
    Identification,
    ProcessOperator,
    State,
    StatePlacement,
    StateType,
    SystemLimit,
    TechnicalResource,
    Usage,
)
from models.process_model import ProcessModel
from services.layout import LayoutConfig, compute_layout


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ident(uid: str, name: str | None = None) -> Identification:
    return Identification(unique_ident=uid, long_name=name or uid)


def _elem_dict(result: dict) -> dict[str, dict]:
    return {e["id"]: e for e in result["elements"]}


# ---------------------------------------------------------------------------
# Basic tests
# ---------------------------------------------------------------------------

def test_empty_model():
    """Empty model should return empty layout."""
    model = ProcessModel()
    result = compute_layout(model)

    assert result["elements"] == []
    assert result["connections"] == []
    assert result["systemLimit"] is None


def test_single_state():
    """A single state with no flows should still be laid out."""
    model = ProcessModel(
        states=[
            State(id="s1", label="Solo", state_type=StateType.PRODUCT,
                  identification=_ident("s1", "Solo")),
        ],
    )
    result = compute_layout(model)

    assert len(result["elements"]) == 1
    assert result["elements"][0]["id"] == "s1"


def test_single_po_with_states():
    """Single PO with input/output states – basic linear flow."""
    model = ProcessModel(
        states=[
            State(id="s1", label="Input", state_type=StateType.PRODUCT,
                  identification=_ident("s1")),
            State(id="s2", label="Output", state_type=StateType.PRODUCT,
                  identification=_ident("s2")),
        ],
        process_operators=[
            ProcessOperator(id="p1", label="Processing",
                            identification=_ident("p1")),
        ],
        flows=[
            Flow(id="f1", source_ref="s1", target_ref="p1",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="p1", target_ref="s2",
                 flow_type=FlowType.FLOW),
        ],
    )
    result = compute_layout(model)
    elems = _elem_dict(result)

    # All elements positioned
    assert len(elems) == 3

    # Product input should be above PO (boundary-top auto-detection)
    assert elems["s1"]["y"] < elems["p1"]["y"], "Product input should be above PO"

    # Product output should be below PO (boundary-bottom auto-detection)
    assert elems["s2"]["y"] > elems["p1"]["y"], "Product output should be below PO"


# ---------------------------------------------------------------------------
# Topological PO ordering (vertical stacking)
# ---------------------------------------------------------------------------

def test_two_pos_vertical_ordering():
    """Two POs connected via intermediate state should stack vertically."""
    model = ProcessModel(
        states=[
            State(id="s1", label="Input", state_type=StateType.PRODUCT,
                  identification=_ident("s1")),
            State(id="s_mid", label="Intermediate", state_type=StateType.PRODUCT,
                  identification=_ident("s_mid")),
            State(id="s2", label="Output", state_type=StateType.PRODUCT,
                  identification=_ident("s2")),
        ],
        process_operators=[
            ProcessOperator(id="p1", label="Step 1",
                            identification=_ident("p1")),
            ProcessOperator(id="p2", label="Step 2",
                            identification=_ident("p2")),
        ],
        flows=[
            Flow(id="f1", source_ref="s1", target_ref="p1",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="p1", target_ref="s_mid",
                 flow_type=FlowType.FLOW),
            Flow(id="f3", source_ref="s_mid", target_ref="p2",
                 flow_type=FlowType.FLOW),
            Flow(id="f4", source_ref="p2", target_ref="s2",
                 flow_type=FlowType.FLOW),
        ],
    )
    result = compute_layout(model)
    elems = _elem_dict(result)

    # p1 should be above p2 (earlier in topological order → lower y)
    assert elems["p1"]["y"] < elems["p2"]["y"], \
        "p1 (upstream) should be above p2 (downstream)"

    # Intermediate state between the two POs
    assert elems["s_mid"]["y"] > elems["p1"]["y"], \
        "Intermediate state should be below p1"
    assert elems["s_mid"]["y"] < elems["p2"]["y"], \
        "Intermediate state should be above p2"


def test_four_pos_dosing_module_style():
    """Four POs in a chain (DosingModule pattern) should stack top-to-bottom."""
    model = ProcessModel(
        states=[
            State(id="P1", label="Input", state_type=StateType.PRODUCT,
                  identification=_ident("P1")),
            State(id="P7", label="Stored", state_type=StateType.PRODUCT,
                  identification=_ident("P7")),
            State(id="P8", label="Transported", state_type=StateType.PRODUCT,
                  identification=_ident("P8")),
            State(id="P10", label="Circulated", state_type=StateType.PRODUCT,
                  identification=_ident("P10")),
            State(id="P12", label="Product", state_type=StateType.PRODUCT,
                  identification=_ident("P12")),
        ],
        process_operators=[
            ProcessOperator(id="O1", label="Storing",
                            identification=_ident("O1")),
            ProcessOperator(id="O2", label="Transporting",
                            identification=_ident("O2")),
            ProcessOperator(id="O3", label="Circulation",
                            identification=_ident("O3")),
            ProcessOperator(id="O4", label="Dosing",
                            identification=_ident("O4")),
        ],
        flows=[
            Flow(id="f1", source_ref="P1", target_ref="O1",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="O1", target_ref="P7",
                 flow_type=FlowType.FLOW),
            Flow(id="f3", source_ref="P7", target_ref="O2",
                 flow_type=FlowType.FLOW),
            Flow(id="f4", source_ref="O2", target_ref="P8",
                 flow_type=FlowType.FLOW),
            Flow(id="f5", source_ref="P8", target_ref="O3",
                 flow_type=FlowType.FLOW),
            Flow(id="f6", source_ref="O3", target_ref="P10",
                 flow_type=FlowType.FLOW),
            Flow(id="f7", source_ref="P10", target_ref="O4",
                 flow_type=FlowType.FLOW),
            Flow(id="f8", source_ref="O4", target_ref="P12",
                 flow_type=FlowType.FLOW),
        ],
    )
    result = compute_layout(model)
    elems = _elem_dict(result)

    # POs should be in strict vertical order: O1 < O2 < O3 < O4
    assert elems["O1"]["y"] < elems["O2"]["y"], "O1 above O2"
    assert elems["O2"]["y"] < elems["O3"]["y"], "O2 above O3"
    assert elems["O3"]["y"] < elems["O4"]["y"], "O3 above O4"

    # Intermediate states between PO pairs
    assert elems["P7"]["y"] > elems["O1"]["y"], "P7 below O1"
    assert elems["P7"]["y"] < elems["O2"]["y"], "P7 above O2"

    assert elems["P8"]["y"] > elems["O2"]["y"], "P8 below O2"
    assert elems["P8"]["y"] < elems["O3"]["y"], "P8 above O3"

    assert elems["P10"]["y"] > elems["O3"]["y"], "P10 below O3"
    assert elems["P10"]["y"] < elems["O4"]["y"], "P10 above O4"


# ---------------------------------------------------------------------------
# State classification (auto-detect boundary sides)
# ---------------------------------------------------------------------------

def test_auto_boundary_product_top_bottom():
    """Products auto-detect: input→top, output→bottom."""
    model = ProcessModel(
        states=[
            State(id="in_prod", label="Raw Material", state_type=StateType.PRODUCT,
                  identification=_ident("in_prod")),
            State(id="out_prod", label="Finished Good", state_type=StateType.PRODUCT,
                  identification=_ident("out_prod")),
        ],
        process_operators=[
            ProcessOperator(id="p1", label="Make",
                            identification=_ident("p1")),
        ],
        flows=[
            Flow(id="f1", source_ref="in_prod", target_ref="p1",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="p1", target_ref="out_prod",
                 flow_type=FlowType.FLOW),
        ],
    )
    result = compute_layout(model)
    elems = _elem_dict(result)

    assert elems["in_prod"]["y"] < elems["p1"]["y"], \
        "Product input should be on top boundary (above PO)"
    assert elems["out_prod"]["y"] > elems["p1"]["y"], \
        "Product output should be on bottom boundary (below PO)"


def test_auto_boundary_info_left_right():
    """Information auto-detects: input→left, output→right."""
    model = ProcessModel(
        states=[
            State(id="in_info", label="Pressure", state_type=StateType.INFORMATION,
                  identification=_ident("in_info")),
            State(id="out_info", label="Flow Rate", state_type=StateType.INFORMATION,
                  identification=_ident("out_info")),
            State(id="in_prod", label="Input", state_type=StateType.PRODUCT,
                  identification=_ident("in_prod")),
        ],
        process_operators=[
            ProcessOperator(id="p1", label="Process",
                            identification=_ident("p1")),
        ],
        flows=[
            Flow(id="f1", source_ref="in_info", target_ref="p1",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="p1", target_ref="out_info",
                 flow_type=FlowType.FLOW),
            Flow(id="f3", source_ref="in_prod", target_ref="p1",
                 flow_type=FlowType.FLOW),
        ],
    )
    result = compute_layout(model)
    elems = _elem_dict(result)

    # Info input should be to the left of PO
    assert elems["in_info"]["x"] < elems["p1"]["x"], \
        "Information input should be on left boundary"

    # Info output should be to the right of PO
    assert elems["out_info"]["x"] > elems["p1"]["x"], \
        "Information output should be on right boundary"


def test_auto_boundary_energy_left_right():
    """Energy auto-detects: input→left, output→right."""
    model = ProcessModel(
        states=[
            State(id="e_in", label="Electrical Energy", state_type=StateType.ENERGY,
                  identification=_ident("e_in")),
            State(id="in_prod", label="Material", state_type=StateType.PRODUCT,
                  identification=_ident("in_prod")),
        ],
        process_operators=[
            ProcessOperator(id="p1", label="Transform",
                            identification=_ident("p1")),
        ],
        flows=[
            Flow(id="f1", source_ref="e_in", target_ref="p1",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="in_prod", target_ref="p1",
                 flow_type=FlowType.FLOW),
        ],
    )
    result = compute_layout(model)
    elems = _elem_dict(result)

    # Energy input should be to the left of PO
    assert elems["e_in"]["x"] < elems["p1"]["x"], \
        "Energy input should be on left boundary"


# ---------------------------------------------------------------------------
# Explicit boundary overrides
# ---------------------------------------------------------------------------

def test_explicit_boundary_left_overrides_product():
    """@boundary-left forces a product to the left side."""
    model = ProcessModel(
        states=[
            State(id="s1", label="Forced Left", state_type=StateType.PRODUCT,
                  identification=_ident("s1"),
                  placement=StatePlacement.BOUNDARY_LEFT),
        ],
        process_operators=[
            ProcessOperator(id="p1", label="Process",
                            identification=_ident("p1")),
        ],
        flows=[
            Flow(id="f1", source_ref="s1", target_ref="p1",
                 flow_type=FlowType.FLOW),
        ],
    )
    result = compute_layout(model)
    elems = _elem_dict(result)

    # Despite being a product (normally top), @boundary-left forces it left
    assert elems["s1"]["x"] < elems["p1"]["x"], \
        "@boundary-left should place product to the left of PO"


def test_explicit_internal_state():
    """@internal forces a state to be inside even if it's a pure source/sink."""
    model = ProcessModel(
        states=[
            State(id="s_in", label="Input", state_type=StateType.PRODUCT,
                  identification=_ident("s_in")),
            State(id="s_forced", label="Forced Internal",
                  state_type=StateType.PRODUCT,
                  identification=_ident("s_forced"),
                  placement=StatePlacement.INTERNAL),
            State(id="s_out", label="Output", state_type=StateType.PRODUCT,
                  identification=_ident("s_out")),
        ],
        process_operators=[
            ProcessOperator(id="p1", label="Step 1",
                            identification=_ident("p1")),
            ProcessOperator(id="p2", label="Step 2",
                            identification=_ident("p2")),
        ],
        flows=[
            Flow(id="f1", source_ref="s_in", target_ref="p1",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="p1", target_ref="s_forced",
                 flow_type=FlowType.FLOW),
            Flow(id="f3", source_ref="s_forced", target_ref="p2",
                 flow_type=FlowType.FLOW),
            Flow(id="f4", source_ref="p2", target_ref="s_out",
                 flow_type=FlowType.FLOW),
        ],
    )
    result = compute_layout(model)
    elems = _elem_dict(result)

    # Forced internal should be between the two POs
    assert elems["s_forced"]["y"] > elems["p1"]["y"], "Internal state below p1"
    assert elems["s_forced"]["y"] < elems["p2"]["y"], "Internal state above p2"


# ---------------------------------------------------------------------------
# Technical resources
# ---------------------------------------------------------------------------

def test_technical_resources_outside_system_limit():
    """Technical resources should be outside (right of) the system limit."""
    model = ProcessModel(
        states=[
            State(id="s1", label="Input", state_type=StateType.PRODUCT,
                  identification=_ident("s1")),
            State(id="s2", label="Output", state_type=StateType.PRODUCT,
                  identification=_ident("s2")),
        ],
        process_operators=[
            ProcessOperator(id="p1", label="Processing",
                            identification=_ident("p1")),
        ],
        flows=[
            Flow(id="f1", source_ref="s1", target_ref="p1",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="p1", target_ref="s2",
                 flow_type=FlowType.FLOW),
        ],
        technical_resources=[
            TechnicalResource(id="tr1", label="Machine",
                              identification=_ident("tr1")),
        ],
        usages=[
            Usage(id="u1", process_operator_ref="p1",
                  technical_resource_ref="tr1"),
        ],
    )
    result = compute_layout(model)
    elems = _elem_dict(result)
    sl = result["systemLimit"]

    assert sl is not None
    assert "tr1" in elems

    # TR should be to the right of system limit
    assert elems["tr1"]["x"] >= sl["x"] + sl["width"], \
        "Technical resource should be to the right of the system limit"

    # Usage connections present
    usage_conns = [c for c in result["connections"] if c.get("isUsage")]
    assert len(usage_conns) == 1


# ---------------------------------------------------------------------------
# System limit bounds
# ---------------------------------------------------------------------------

def test_system_limit_encloses_po_and_internal():
    """System limit should enclose POs. Boundary states straddle the edge."""
    model = ProcessModel(
        states=[
            State(id="s1", label="Input", state_type=StateType.PRODUCT,
                  identification=_ident("s1")),
            State(id="s2", label="Output", state_type=StateType.PRODUCT,
                  identification=_ident("s2")),
        ],
        process_operators=[
            ProcessOperator(id="p1", label="Process",
                            identification=_ident("p1")),
        ],
        flows=[
            Flow(id="f1", source_ref="s1", target_ref="p1",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="p1", target_ref="s2",
                 flow_type=FlowType.FLOW),
        ],
    )
    result = compute_layout(model)
    sl = result["systemLimit"]
    elems = _elem_dict(result)

    assert sl is not None

    # PO must be inside system limit
    po = elems["p1"]
    assert po["x"] >= sl["x"], "PO left edge inside SL"
    assert po["y"] >= sl["y"], "PO top edge inside SL"
    assert po["x"] + po["width"] <= sl["x"] + sl["width"], "PO right edge inside SL"
    assert po["y"] + po["height"] <= sl["y"] + sl["height"], "PO bottom edge inside SL"


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------

def test_deterministic_layout():
    """Same input → identical output over multiple runs."""
    model = ProcessModel(
        states=[
            State(id="s1", label="In1", state_type=StateType.PRODUCT,
                  identification=_ident("s1")),
            State(id="s2", label="Mid", state_type=StateType.PRODUCT,
                  identification=_ident("s2")),
            State(id="s3", label="Out", state_type=StateType.PRODUCT,
                  identification=_ident("s3")),
            State(id="i1", label="Info In", state_type=StateType.INFORMATION,
                  identification=_ident("i1")),
        ],
        process_operators=[
            ProcessOperator(id="p1", label="Step1",
                            identification=_ident("p1")),
            ProcessOperator(id="p2", label="Step2",
                            identification=_ident("p2")),
        ],
        flows=[
            Flow(id="f1", source_ref="s1", target_ref="p1",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="p1", target_ref="s2",
                 flow_type=FlowType.FLOW),
            Flow(id="f3", source_ref="s2", target_ref="p2",
                 flow_type=FlowType.FLOW),
            Flow(id="f4", source_ref="p2", target_ref="s3",
                 flow_type=FlowType.FLOW),
            Flow(id="f5", source_ref="i1", target_ref="p1",
                 flow_type=FlowType.FLOW),
        ],
    )

    results = [compute_layout(model) for _ in range(5)]
    first = results[0]

    for i, result in enumerate(results[1:], start=2):
        first_elems = {e["id"]: e for e in first["elements"]}
        curr_elems = {e["id"]: e for e in result["elements"]}

        assert set(first_elems.keys()) == set(curr_elems.keys()), \
            f"Run {i}: different element IDs"

        for eid in first_elems:
            for prop in ("x", "y", "width", "height"):
                assert first_elems[eid][prop] == curr_elems[eid][prop], \
                    f"Run {i}: {eid}.{prop} differs"


# ---------------------------------------------------------------------------
# No overlap
# ---------------------------------------------------------------------------

def test_no_element_overlap_long_chain():
    """A long single chain with 50+ elements should not overlap."""
    states = []
    pos = []
    flows = []

    # Build a long chain: s_in → P0 → s0_mid → P1 → s1_mid → ... → P24 → s_out
    # 25 POs + 26 states = 51 elements
    num_pos = 25

    s_in = "s_in"
    states.append(
        State(id=s_in, label="Input", state_type=StateType.PRODUCT,
              identification=_ident(s_in)),
    )

    prev_state = s_in
    for i in range(num_pos):
        po_id = f"P{i}"
        pos.append(
            ProcessOperator(id=po_id, label=f"Step {i}",
                            identification=_ident(po_id)),
        )
        flows.append(
            Flow(id=f"f{i}_in", source_ref=prev_state, target_ref=po_id,
                 flow_type=FlowType.FLOW),
        )

        if i < num_pos - 1:
            mid_id = f"s{i}_mid"
            states.append(
                State(id=mid_id, label=f"Mid {i}",
                      state_type=StateType.PRODUCT,
                      identification=_ident(mid_id)),
            )
            flows.append(
                Flow(id=f"f{i}_out", source_ref=po_id, target_ref=mid_id,
                     flow_type=FlowType.FLOW),
            )
            prev_state = mid_id
        else:
            s_out = "s_out"
            states.append(
                State(id=s_out, label="Output", state_type=StateType.PRODUCT,
                      identification=_ident(s_out)),
            )
            flows.append(
                Flow(id=f"f{i}_out", source_ref=po_id, target_ref=s_out,
                     flow_type=FlowType.FLOW),
            )

    # Also add a few info states on left/right for variety
    for i in range(0, num_pos, 5):
        info_id = f"info_L{i}"
        states.append(
            State(id=info_id, label=f"Info {i}",
                  state_type=StateType.INFORMATION,
                  identification=_ident(info_id)),
        )
        flows.append(
            Flow(id=f"fi{i}", source_ref=info_id, target_ref=f"P{i}",
                 flow_type=FlowType.FLOW),
        )

    model = ProcessModel(states=states, process_operators=pos, flows=flows)

    result = compute_layout(model)
    elements = result["elements"]
    total = len(states) + len(pos)
    assert len(elements) == total
    assert total >= 50, f"Expected 50+ elements, got {total}"

    # Pairwise overlap check
    overlaps = []
    for i in range(len(elements)):
        for j in range(i + 1, len(elements)):
            a, b = elements[i], elements[j]
            x_overlap = (a["x"] < b["x"] + b["width"] and
                         a["x"] + a["width"] > b["x"])
            y_overlap = (a["y"] < b["y"] + b["height"] and
                         a["y"] + a["height"] > b["y"])
            if x_overlap and y_overlap:
                overlaps.append((a["id"], b["id"]))

    assert not overlaps, \
        f"Found {len(overlaps)} overlaps: {overlaps[:5]}"


# ---------------------------------------------------------------------------
# Performance
# ---------------------------------------------------------------------------

def test_layout_performance_50_elements():
    """50 elements should layout in under 200ms."""
    states = []
    pos = []
    flows = []

    for chain in range(10):
        s_in = f"s{chain}_in"
        s_mid = f"s{chain}_mid"
        s_out = f"s{chain}_out"
        p1 = f"p{chain}_a"
        p2 = f"p{chain}_b"

        states.extend([
            State(id=s_in, label=f"In {chain}", state_type=StateType.PRODUCT,
                  identification=_ident(s_in)),
            State(id=s_mid, label=f"Mid {chain}", state_type=StateType.PRODUCT,
                  identification=_ident(s_mid)),
            State(id=s_out, label=f"Out {chain}", state_type=StateType.PRODUCT,
                  identification=_ident(s_out)),
        ])
        pos.extend([
            ProcessOperator(id=p1, label=f"P {chain}A",
                            identification=_ident(p1)),
            ProcessOperator(id=p2, label=f"P {chain}B",
                            identification=_ident(p2)),
        ])
        flows.extend([
            Flow(id=f"f{chain}_1", source_ref=s_in, target_ref=p1,
                 flow_type=FlowType.FLOW),
            Flow(id=f"f{chain}_2", source_ref=p1, target_ref=s_mid,
                 flow_type=FlowType.FLOW),
            Flow(id=f"f{chain}_3", source_ref=s_mid, target_ref=p2,
                 flow_type=FlowType.FLOW),
            Flow(id=f"f{chain}_4", source_ref=p2, target_ref=s_out,
                 flow_type=FlowType.FLOW),
        ])

    model = ProcessModel(states=states, process_operators=pos, flows=flows)

    start = time.perf_counter()
    result = compute_layout(model)
    elapsed_ms = (time.perf_counter() - start) * 1000

    assert len(result["elements"]) == 50
    assert elapsed_ms < 200, f"Layout took {elapsed_ms:.1f}ms (limit 200ms)"


# ---------------------------------------------------------------------------
# Multi-system tests
# ---------------------------------------------------------------------------

def _make_simple_system(system_id: str, prefix: str) -> dict:
    """Helper: simple 3-element system."""
    return {
        "states": [
            State(id=f"{prefix}_s1", label=f"{prefix} In",
                  state_type=StateType.PRODUCT,
                  identification=_ident(f"{prefix}_s1"),
                  system_id=system_id),
            State(id=f"{prefix}_s2", label=f"{prefix} Out",
                  state_type=StateType.PRODUCT,
                  identification=_ident(f"{prefix}_s2"),
                  system_id=system_id),
        ],
        "process_operators": [
            ProcessOperator(id=f"{prefix}_p1", label=f"{prefix} Proc",
                            identification=_ident(f"{prefix}_p1"),
                            system_id=system_id),
        ],
        "flows": [
            Flow(id=f"{prefix}_f1", source_ref=f"{prefix}_s1",
                 target_ref=f"{prefix}_p1", flow_type=FlowType.FLOW,
                 system_id=system_id),
            Flow(id=f"{prefix}_f2", source_ref=f"{prefix}_p1",
                 target_ref=f"{prefix}_s2", flow_type=FlowType.FLOW,
                 system_id=system_id),
        ],
    }


def test_multi_system_two_system_limits():
    """Two systems → two systemLimits entries."""
    a = _make_simple_system("sys_1", "a")
    b = _make_simple_system("sys_2", "b")

    model = ProcessModel(
        system_limits=[
            SystemLimit(id="sys_1", identification=_ident("sys_1", "Mfg"),
                        label="Mfg"),
            SystemLimit(id="sys_2", identification=_ident("sys_2", "Assy"),
                        label="Assy"),
        ],
        states=a["states"] + b["states"],
        process_operators=a["process_operators"] + b["process_operators"],
        flows=a["flows"] + b["flows"],
    )
    result = compute_layout(model)

    assert len(result["systemLimits"]) == 2
    labels = {sl["label"] for sl in result["systemLimits"]}
    assert "Mfg" in labels and "Assy" in labels
    assert len(result["elements"]) == 6


def test_multi_system_non_overlapping():
    """System limits for multiple systems should not overlap."""
    a = _make_simple_system("sys_1", "a")
    b = _make_simple_system("sys_2", "b")

    model = ProcessModel(
        system_limits=[
            SystemLimit(id="sys_1", identification=_ident("sys_1", "A"),
                        label="A"),
            SystemLimit(id="sys_2", identification=_ident("sys_2", "B"),
                        label="B"),
        ],
        states=a["states"] + b["states"],
        process_operators=a["process_operators"] + b["process_operators"],
        flows=a["flows"] + b["flows"],
    )
    result = compute_layout(model)
    sl1, sl2 = result["systemLimits"]

    # Should be side-by-side, not overlapping
    assert sl1["x"] + sl1["width"] <= sl2["x"], \
        "System limits should not overlap horizontally"


def test_multi_system_elements_within_bounds():
    """Elements should be within their respective system limit."""
    a = _make_simple_system("sys_1", "a")
    b = _make_simple_system("sys_2", "b")

    model = ProcessModel(
        system_limits=[
            SystemLimit(id="sys_1", identification=_ident("sys_1", "A"),
                        label="A"),
            SystemLimit(id="sys_2", identification=_ident("sys_2", "B"),
                        label="B"),
        ],
        states=a["states"] + b["states"],
        process_operators=a["process_operators"] + b["process_operators"],
        flows=a["flows"] + b["flows"],
    )
    result = compute_layout(model)
    sl_by_id = {sl["id"]: sl for sl in result["systemLimits"]}

    for prefix, sid in [("a_", "sys_1"), ("b_", "sys_2")]:
        sl = sl_by_id[sid]
        for elem in result["elements"]:
            if not elem["id"].startswith(prefix):
                continue
            if elem["type"] == "technicalResource":
                continue
            # POs must be fully inside
            if elem["type"] == "processOperator":
                assert elem["x"] >= sl["x"], \
                    f"{elem['id']} outside left"
                assert elem["y"] >= sl["y"], \
                    f"{elem['id']} outside top"
                assert elem["x"] + elem["width"] <= sl["x"] + sl["width"], \
                    f"{elem['id']} outside right"
                assert elem["y"] + elem["height"] <= sl["y"] + sl["height"], \
                    f"{elem['id']} outside bottom"


def test_backward_compat_no_explicit_systems():
    """Model without system_limits still produces a systemLimit."""
    model = ProcessModel(
        states=[
            State(id="s1", label="In", state_type=StateType.PRODUCT,
                  identification=_ident("s1")),
            State(id="s2", label="Out", state_type=StateType.PRODUCT,
                  identification=_ident("s2")),
        ],
        process_operators=[
            ProcessOperator(id="p1", label="Proc",
                            identification=_ident("p1")),
        ],
        flows=[
            Flow(id="f1", source_ref="s1", target_ref="p1",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="p1", target_ref="s2",
                 flow_type=FlowType.FLOW),
        ],
    )
    result = compute_layout(model)

    assert result["systemLimit"] is not None
    assert len(result["systemLimits"]) == 1


def test_multi_system_with_technical_resources():
    """Technical resources should be placed outside their system limit."""
    model = ProcessModel(
        system_limits=[
            SystemLimit(id="sys_1", identification=_ident("sys_1", "Sys"),
                        label="Sys"),
        ],
        states=[
            State(id="s1", label="In", state_type=StateType.PRODUCT,
                  identification=_ident("s1"), system_id="sys_1"),
            State(id="s2", label="Out", state_type=StateType.PRODUCT,
                  identification=_ident("s2"), system_id="sys_1"),
        ],
        process_operators=[
            ProcessOperator(id="p1", label="Proc",
                            identification=_ident("p1"), system_id="sys_1"),
        ],
        flows=[
            Flow(id="f1", source_ref="s1", target_ref="p1",
                 flow_type=FlowType.FLOW, system_id="sys_1"),
            Flow(id="f2", source_ref="p1", target_ref="s2",
                 flow_type=FlowType.FLOW, system_id="sys_1"),
        ],
        technical_resources=[
            TechnicalResource(id="tr1", label="Machine",
                              identification=_ident("tr1"),
                              system_id="sys_1"),
        ],
        usages=[
            Usage(id="u1", process_operator_ref="p1",
                  technical_resource_ref="tr1", system_id="sys_1"),
        ],
    )
    result = compute_layout(model)
    sl = result["systemLimits"][0]
    tr = next(e for e in result["elements"] if e["id"] == "tr1")

    assert tr["x"] >= sl["x"] + sl["width"], \
        "TR should be to the right of the system limit"


# ---------------------------------------------------------------------------
# Feedback loop (cycle handling)
# ---------------------------------------------------------------------------

def test_dosing_module_product_placement():
    """DosingModule pattern: product outputs from intermediate POs go to boundary-right."""
    model = ProcessModel(
        states=[
            # Input products (to first PO O1)
            State(id="P1", label="Medium A", state_type=StateType.PRODUCT,
                  identification=_ident("P1")),
            # Output products from O1 (intermediate PO, not last)
            State(id="P5", label="Exhaust Gas", state_type=StateType.PRODUCT,
                  identification=_ident("P5")),
            State(id="P6", label="(Inert) Gas", state_type=StateType.PRODUCT,
                  identification=_ident("P6")),
            # Intermediate state
            State(id="P7", label="Stored", state_type=StateType.PRODUCT,
                  identification=_ident("P7")),
            State(id="P8", label="Transported", state_type=StateType.PRODUCT,
                  identification=_ident("P8")),
            # Final outputs from last PO O3
            State(id="P12", label="Product", state_type=StateType.PRODUCT,
                  identification=_ident("P12")),
        ],
        process_operators=[
            ProcessOperator(id="O1", label="Storing",
                            identification=_ident("O1")),
            ProcessOperator(id="O2", label="Transporting",
                            identification=_ident("O2")),
            ProcessOperator(id="O3", label="Dosing",
                            identification=_ident("O3")),
        ],
        flows=[
            Flow(id="f1", source_ref="P1", target_ref="O1",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="O1", target_ref="P5",
                 flow_type=FlowType.FLOW),
            Flow(id="f3", source_ref="O1", target_ref="P6",
                 flow_type=FlowType.FLOW),
            Flow(id="f4", source_ref="O1", target_ref="P7",
                 flow_type=FlowType.FLOW),
            Flow(id="f5", source_ref="P7", target_ref="O2",
                 flow_type=FlowType.FLOW),
            Flow(id="f6", source_ref="O2", target_ref="P8",
                 flow_type=FlowType.FLOW),
            Flow(id="f7", source_ref="P8", target_ref="O3",
                 flow_type=FlowType.FLOW),
            Flow(id="f8", source_ref="O3", target_ref="P12",
                 flow_type=FlowType.FLOW),
        ],
    )
    result = compute_layout(model)
    elems = _elem_dict(result)

    # P1 (input to first PO) → boundary-top (above O1)
    assert elems["P1"]["y"] < elems["O1"]["y"], \
        "P1 should be above O1 (boundary-top)"

    # P5, P6 (outputs from O1, which is NOT the last PO) → boundary-right
    assert elems["P5"]["x"] > elems["O1"]["x"], \
        "P5 should be to the right of O1 (boundary-right)"
    assert elems["P6"]["x"] > elems["O1"]["x"], \
        "P6 should be to the right of O1 (boundary-right)"

    # P12 (output from O3, which IS the last PO) → boundary-bottom
    assert elems["P12"]["y"] > elems["O3"]["y"], \
        "P12 should be below O3 (boundary-bottom)"


def test_feedback_state_no_overlap_with_po():
    """Feedback state (backward edge) must not overlap with any PO."""
    model = ProcessModel(
        states=[
            State(id="P1", label="In", state_type=StateType.PRODUCT,
                  identification=_ident("P1")),
            State(id="P8", label="Transported", state_type=StateType.PRODUCT,
                  identification=_ident("P8")),
            State(id="P9", label="Circulation", state_type=StateType.PRODUCT,
                  identification=_ident("P9")),
            State(id="P10", label="Circulated", state_type=StateType.PRODUCT,
                  identification=_ident("P10")),
            State(id="P12", label="Product", state_type=StateType.PRODUCT,
                  identification=_ident("P12")),
        ],
        process_operators=[
            ProcessOperator(id="O2", label="Transporting",
                            identification=_ident("O2")),
            ProcessOperator(id="O3", label="Circulation",
                            identification=_ident("O3")),
            ProcessOperator(id="O4", label="Dosing",
                            identification=_ident("O4")),
        ],
        flows=[
            Flow(id="f1", source_ref="P1", target_ref="O2",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="O2", target_ref="P8",
                 flow_type=FlowType.FLOW),
            Flow(id="f3", source_ref="P8", target_ref="O3",
                 flow_type=FlowType.FLOW),
            Flow(id="f4", source_ref="O3", target_ref="P9",
                 flow_type=FlowType.FLOW),
            # Feedback: P9 → O2
            Flow(id="f5", source_ref="P9", target_ref="O2",
                 flow_type=FlowType.ALTERNATIVE_FLOW),
            Flow(id="f6", source_ref="O3", target_ref="P10",
                 flow_type=FlowType.FLOW),
            Flow(id="f7", source_ref="P10", target_ref="O4",
                 flow_type=FlowType.FLOW),
            Flow(id="f8", source_ref="O4", target_ref="P12",
                 flow_type=FlowType.FLOW),
        ],
    )
    result = compute_layout(model)
    elems = _elem_dict(result)

    p9 = elems["P9"]

    # P9 must not overlap with any PO
    for po_id in ["O2", "O3", "O4"]:
        po = elems[po_id]
        x_overlap = (p9["x"] < po["x"] + po["width"] and
                     p9["x"] + p9["width"] > po["x"])
        y_overlap = (p9["y"] < po["y"] + po["height"] and
                     p9["y"] + p9["height"] > po["y"])
        assert not (x_overlap and y_overlap), \
            f"P9 overlaps with {po_id}"

    # P9 should be to the LEFT of the PO column (feedback lane)
    assert p9["x"] < elems["O2"]["x"], \
        "Feedback state P9 should be in the feedback lane (left of POs)"


def test_feedback_loop_does_not_crash():
    """A feedback loop (e.g., P9: O3→O2) should not cause infinite loop."""
    model = ProcessModel(
        states=[
            State(id="P1", label="In", state_type=StateType.PRODUCT,
                  identification=_ident("P1")),
            State(id="P7", label="Stored", state_type=StateType.PRODUCT,
                  identification=_ident("P7")),
            State(id="P8", label="Transported", state_type=StateType.PRODUCT,
                  identification=_ident("P8")),
            State(id="P9", label="Circulation", state_type=StateType.PRODUCT,
                  identification=_ident("P9")),
            State(id="P10", label="Circulated", state_type=StateType.PRODUCT,
                  identification=_ident("P10")),
            State(id="P12", label="Product", state_type=StateType.PRODUCT,
                  identification=_ident("P12")),
        ],
        process_operators=[
            ProcessOperator(id="O2", label="Transporting",
                            identification=_ident("O2")),
            ProcessOperator(id="O3", label="Circulation",
                            identification=_ident("O3")),
            ProcessOperator(id="O4", label="Dosing",
                            identification=_ident("O4")),
        ],
        flows=[
            Flow(id="f1", source_ref="P1", target_ref="O2",
                 flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="O2", target_ref="P8",
                 flow_type=FlowType.FLOW),
            Flow(id="f3", source_ref="P8", target_ref="O3",
                 flow_type=FlowType.FLOW),
            Flow(id="f4", source_ref="O3", target_ref="P9",
                 flow_type=FlowType.FLOW),
            # Feedback: P9 goes back to O2
            Flow(id="f5", source_ref="P9", target_ref="O2",
                 flow_type=FlowType.ALTERNATIVE_FLOW),
            Flow(id="f6", source_ref="O3", target_ref="P10",
                 flow_type=FlowType.FLOW),
            Flow(id="f7", source_ref="P10", target_ref="O4",
                 flow_type=FlowType.FLOW),
            Flow(id="f8", source_ref="O4", target_ref="P12",
                 flow_type=FlowType.FLOW),
        ],
    )

    # Should complete without error or infinite loop
    result = compute_layout(model)
    elems = _elem_dict(result)

    # All POs should be positioned
    assert "O2" in elems
    assert "O3" in elems
    assert "O4" in elems

    # All states positioned
    assert len(result["elements"]) == 9
