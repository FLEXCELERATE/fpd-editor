"""XML exporter producing HSU FPD_Schema.xsd-compatible VDI 3682 XML.

The output follows the distributed flow architecture defined by the HSU Hamburg
FPD_Schema.xsd (https://github.com/hsu-aut/IndustrialStandard-XSD-VDI3682):

- flowContainer holds flow registrations (id + flowType) — no sourceRef/targetRef
- Each element has its own <flows> child with <entry>/<exit> bindings
- Usages appear as flowType="usage" in flowContainer and per-element <usages>
- SystemLimit uses direct @id/@name attributes
- identification always includes a <references/> child
"""

from collections import defaultdict

from lxml import etree

from models.fpb_model import FlowType, StateType
from models.process_model import ProcessModel

VDI3682_NAMESPACE = "http://www.vdivde.de/3682"
XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance"
FPB_PREFIX = "fpb"

NSMAP = {
    FPB_PREFIX: VDI3682_NAMESPACE,
    "xsi": XSI_NAMESPACE,
}

_STATE_TYPE_MAP = {
    StateType.PRODUCT: "product",
    StateType.ENERGY: "energy",
    StateType.INFORMATION: "information",
}

_FLOW_TYPE_MAP = {
    FlowType.FLOW: "flow",
    FlowType.ALTERNATIVE_FLOW: "alternativeFlow",
    FlowType.PARALLEL_FLOW: "parallelFlow",
}


def _fpb_tag(local_name: str) -> str:
    """Create a qualified element name in the VDI 3682 namespace."""
    return f"{{{VDI3682_NAMESPACE}}}{local_name}"


def _add_identification(
    parent: etree._Element,
    unique_ident: str,
    long_name: str | None = None,
    short_name: str | None = None,
) -> None:
    """Add an HSU-style identification element with nested <references/>."""
    ident = etree.SubElement(parent, _fpb_tag("identification"))
    ident.set("uniqueIdent", unique_ident)
    if long_name:
        ident.set("longName", long_name)
    if short_name:
        ident.set("shortName", short_name)
    etree.SubElement(ident, _fpb_tag("references"))


def _add_empty_children(parent: etree._Element, *names: str) -> None:
    """Add empty child elements (characteristics, assignments, etc.)."""
    for name in names:
        etree.SubElement(parent, _fpb_tag(name))


def _add_flows_element(
    parent: etree._Element,
    element_id: str,
    flows_as_source: list,
    flows_as_target: list,
) -> None:
    """Add <flows> with entry/exit bindings for this element."""
    flows_elem = etree.SubElement(parent, _fpb_tag("flows"))
    for flow in flows_as_source:
        flow_ref = etree.SubElement(flows_elem, _fpb_tag("flow"))
        flow_ref.set("id", flow.id)
        exit_elem = etree.SubElement(flow_ref, _fpb_tag("exit"))
        exit_elem.set("id", element_id)
    for flow in flows_as_target:
        flow_ref = etree.SubElement(flows_elem, _fpb_tag("flow"))
        flow_ref.set("id", flow.id)
        entry_elem = etree.SubElement(flow_ref, _fpb_tag("entry"))
        entry_elem.set("id", element_id)


def _add_usages_element(parent: etree._Element, usages_list: list) -> None:
    """Add <usages> with usage ID references."""
    usages_elem = etree.SubElement(parent, _fpb_tag("usages"))
    for usage in usages_list:
        usage_ref = etree.SubElement(usages_elem, _fpb_tag("usage"))
        usage_ref.set("id", usage.id)


def export_xml(model: ProcessModel) -> str:
    """Convert a ProcessModel to HSU FPD_Schema.xsd-compatible XML.

    Args:
        model: The process model to export.

    Returns:
        A string containing VDI 3682 XML compatible with the HSU schema.
    """
    # --- Build lookup indices ---
    source_flows: dict[str, list] = defaultdict(list)
    target_flows: dict[str, list] = defaultdict(list)
    for flow in model.flows:
        source_flows[flow.source_ref].append(flow)
        target_flows[flow.target_ref].append(flow)

    po_usages: dict[str, list] = defaultdict(list)
    tr_usages: dict[str, list] = defaultdict(list)
    for usage in model.usages:
        po_usages[usage.process_operator_ref].append(usage)
        tr_usages[usage.technical_resource_ref].append(usage)

    # --- Root element ---
    root = etree.Element(_fpb_tag("project"), nsmap=NSMAP)

    proj_info = etree.SubElement(root, _fpb_tag("projectInformation"))
    proj_info.set("entryPoint", "process_1")

    process = etree.SubElement(root, _fpb_tag("process"))
    process.set("id", "process_1")

    # --- SystemLimit (HSU: direct @id/@name) ---
    if model.system_limits:
        sl = model.system_limits[0]
        sl_elem = etree.SubElement(process, _fpb_tag("systemLimit"))
        sl_elem.set("id", sl.identification.unique_ident)
        sl_elem.set("name", sl.label or model.title or "System Boundary")
    else:
        sl_elem = etree.SubElement(process, _fpb_tag("systemLimit"))
        sl_elem.set("id", "sl_1")
        sl_elem.set("name", model.title or "System Boundary")

    # --- States ---
    states_elem = etree.SubElement(process, _fpb_tag("states"))
    for state in model.states:
        state_elem = etree.SubElement(states_elem, _fpb_tag("state"))
        state_elem.set(
            "stateType",
            _STATE_TYPE_MAP.get(state.state_type, "product"),
        )
        _add_identification(
            state_elem,
            state.identification.unique_ident,
            long_name=state.label or None,
            short_name=state.identification.short_name,
        )
        _add_empty_children(state_elem, "characteristics", "assignments")
        _add_flows_element(
            state_elem,
            state.id,
            source_flows.get(state.id, []),
            target_flows.get(state.id, []),
        )

    # --- ProcessOperators ---
    pos_elem = etree.SubElement(process, _fpb_tag("processOperators"))
    for po in model.process_operators:
        po_elem = etree.SubElement(pos_elem, _fpb_tag("processOperator"))
        _add_identification(
            po_elem,
            po.identification.unique_ident,
            long_name=po.label or None,
            short_name=po.identification.short_name,
        )
        _add_empty_children(po_elem, "characteristics", "assignments")
        _add_flows_element(
            po_elem,
            po.id,
            source_flows.get(po.id, []),
            target_flows.get(po.id, []),
        )
        _add_usages_element(po_elem, po_usages.get(po.id, []))

    # --- TechnicalResources ---
    trs_elem = etree.SubElement(process, _fpb_tag("technicalResources"))
    for tr in model.technical_resources:
        tr_elem = etree.SubElement(trs_elem, _fpb_tag("technicalResource"))
        _add_identification(
            tr_elem,
            tr.identification.unique_ident,
            long_name=tr.label or None,
            short_name=tr.identification.short_name,
        )
        _add_empty_children(tr_elem, "characteristics", "assignments")
        _add_usages_element(tr_elem, tr_usages.get(tr.id, []))

    # --- FlowContainer (registry only — no sourceRef/targetRef) ---
    fc_elem = etree.SubElement(process, _fpb_tag("flowContainer"))
    for flow in model.flows:
        flow_elem = etree.SubElement(fc_elem, _fpb_tag("flow"))
        flow_elem.set("id", flow.id)
        flow_elem.set("flowType", _FLOW_TYPE_MAP.get(flow.flow_type, "flow"))
    for usage in model.usages:
        flow_elem = etree.SubElement(fc_elem, _fpb_tag("flow"))
        flow_elem.set("id", usage.id)
        flow_elem.set("flowType", "usage")

    xml_bytes = etree.tostring(
        root,
        xml_declaration=True,
        encoding="UTF-8",
        pretty_print=True,
    )
    return xml_bytes.decode("UTF-8")
