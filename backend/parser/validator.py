"""VDI 3682 connection rule validation for Formalized Process Descriptions."""

from models.process_model import ProcessModel
from models.fpb_model import Flow, FlowType, Usage


def _classify_element(element_id: str, model: ProcessModel) -> str | None:
    """Return the element category for a given ID, or None if not found."""
    for s in model.states:
        if s.id == element_id:
            return "state"
    for po in model.process_operators:
        if po.id == element_id:
            return "process_operator"
    for tr in model.technical_resources:
        if tr.id == element_id:
            return "technical_resource"
    return None


def validate_connections(model: ProcessModel) -> list[str]:
    """Validate all connections in a ProcessModel against VDI 3682 rules.

    Returns a list of error messages. An empty list means all connections are valid.
    """
    errors: list[str] = []

    # Track seen flow connections for duplicate detection
    seen_flows: set[tuple[str, str]] = set()

    for flow in model.flows:
        source_type = _classify_element(flow.source_ref, model)
        target_type = _classify_element(flow.target_ref, model)

        # Check references exist
        if source_type is None:
            errors.append(f"Flow '{flow.id}': source '{flow.source_ref}' not found")
            continue
        if target_type is None:
            errors.append(f"Flow '{flow.id}': target '{flow.target_ref}' not found")
            continue

        # Check for duplicate flows
        pair = (flow.source_ref, flow.target_ref)
        if pair in seen_flows:
            errors.append(
                f"Flow '{flow.id}': duplicate connection from "
                f"'{flow.source_ref}' to '{flow.target_ref}'"
            )
        else:
            seen_flows.add(pair)

        # Validate source-target pairs for flows
        valid = False
        if source_type == "state" and target_type == "process_operator":
            valid = True
        elif source_type == "process_operator" and target_type == "state":
            valid = True
        if not valid:
            errors.append(
                f"Flow '{flow.id}': invalid connection from "
                f"{source_type} '{flow.source_ref}' to "
                f"{target_type} '{flow.target_ref}'. "
                f"Flows must connect State <-> ProcessOperator"
            )

    # Validate usages
    seen_usages: set[tuple[str, str]] = set()

    for usage in model.usages:
        po_type = _classify_element(usage.process_operator_ref, model)
        tr_type = _classify_element(usage.technical_resource_ref, model)

        if po_type is None:
            errors.append(
                f"Usage '{usage.id}': process operator "
                f"'{usage.process_operator_ref}' not found"
            )
            continue
        if tr_type is None:
            errors.append(
                f"Usage '{usage.id}': technical resource "
                f"'{usage.technical_resource_ref}' not found"
            )
            continue

        if po_type != "process_operator":
            errors.append(
                f"Usage '{usage.id}': '{usage.process_operator_ref}' "
                f"is not a ProcessOperator"
            )
        if tr_type != "technical_resource":
            errors.append(
                f"Usage '{usage.id}': '{usage.technical_resource_ref}' "
                f"is not a TechnicalResource"
            )

        # Check for duplicate usages
        u_pair = (usage.process_operator_ref, usage.technical_resource_ref)
        if u_pair in seen_usages:
            errors.append(
                f"Usage '{usage.id}': duplicate usage between "
                f"'{usage.process_operator_ref}' and "
                f"'{usage.technical_resource_ref}'"
            )
        else:
            seen_usages.add(u_pair)

    return errors
