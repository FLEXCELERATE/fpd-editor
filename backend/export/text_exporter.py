"""Text exporter that converts ProcessModel back to FPB text syntax."""

from models.process_model import ProcessModel
from models.fpb_model import FlowType, StateType


_FLOW_TYPE_OPERATORS = {
    FlowType.FLOW: "-->",
    FlowType.ALTERNATIVE_FLOW: "-.->",
    FlowType.PARALLEL_FLOW: "==>",
}

_STATE_TYPE_KEYWORDS = {
    StateType.PRODUCT: "product",
    StateType.ENERGY: "energy",
    StateType.INFORMATION: "information",
}


def _escape_label(label: str) -> str:
    """Escape double quotes in a label string."""
    return label.replace("\\", "\\\\").replace('"', '\\"')


def _export_state_line(state, keyword: str) -> str:
    """Build a single state declaration line."""
    label = state.label or state.id
    line = f'{keyword} {state.id} "{_escape_label(label)}"'
    if state.placement is not None:
        line += f" @{state.placement.value}"
    return line


def _export_elements_for_system(
    model: ProcessModel,
    system_id: str | None,
    indent: str,
) -> list[str]:
    """Export all elements and connections belonging to a specific system_id."""
    lines: list[str] = []

    # States grouped by type
    for state_type in StateType:
        keyword = _STATE_TYPE_KEYWORDS[state_type]
        for state in model.states:
            if state.state_type == state_type and state.system_id == system_id:
                lines.append(indent + _export_state_line(state, keyword))

    # Process operators
    for po in model.process_operators:
        if po.system_id == system_id:
            label = po.label or po.id
            lines.append(f'{indent}process_operator {po.id} "{_escape_label(label)}"')

    # Technical resources
    for tr in model.technical_resources:
        if tr.system_id == system_id:
            label = tr.label or tr.id
            lines.append(f'{indent}technical_resource {tr.id} "{_escape_label(label)}"')

    if lines:
        lines.append("")

    # Flows
    for flow in model.flows:
        if flow.system_id == system_id:
            flow_type = flow.flow_type if flow.flow_type else FlowType.FLOW
            operator = _FLOW_TYPE_OPERATORS.get(flow_type, "-->")
            lines.append(f"{indent}{flow.source_ref} {operator} {flow.target_ref}")

    # Usages
    for usage in model.usages:
        if usage.system_id == system_id:
            lines.append(
                f"{indent}{usage.process_operator_ref} <..> "
                f"{usage.technical_resource_ref}"
            )

    return lines


def export_text(model: ProcessModel) -> str:
    """Convert a ProcessModel back to FPB text syntax.

    Preserves system blocks when the model contains systems.
    Falls back to flat export for models without systems.

    Args:
        model: The process model to export.

    Returns:
        A string containing valid FPB text that can be re-parsed.
    """
    lines: list[str] = []
    lines.append("@startfpb")

    if model.title:
        lines.append(f'title "{_escape_label(model.title)}"')

    lines.append("")

    if model.system_limits:
        # Multi-system export: wrap elements in system blocks
        for sl in model.system_limits:
            lines.append(f'system "{_escape_label(sl.label)}" {{')
            system_lines = _export_elements_for_system(
                model, sl.id, indent="  "
            )
            lines.extend(system_lines)
            lines.append("}")
            lines.append("")
    else:
        # Flat export (no systems)
        flat_lines = _export_elements_for_system(model, None, indent="")
        lines.extend(flat_lines)
        lines.append("")

    lines.append("@endfpb")
    lines.append("")

    return "\n".join(lines)
