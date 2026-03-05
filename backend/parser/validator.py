"""VDI 3682 connection rule validation for Formalized Process Descriptions."""

from models.process_model import ProcessModel
from models.fpd_model import Flow, FlowType, Usage


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


def _get_system_id(element_id: str, model: ProcessModel) -> str | None:
    """Return the system_id for a given element ID, or None if not found."""
    for s in model.states:
        if s.id == element_id:
            return s.system_id
    for po in model.process_operators:
        if po.id == element_id:
            return po.system_id
    for tr in model.technical_resources:
        if tr.id == element_id:
            return tr.system_id
    return None


def validate_connections(model: ProcessModel) -> list[str]:
    """Validate all connections in a ProcessModel against VDI 3682 rules.

    Rules:
    - Flows must connect State <-> ProcessOperator (within a system)
    - State -> State flows are allowed ONLY as cross-system connections
      (flow.system_id is None, and the two states belong to different systems)
    - Cross-system State -> ProcessOperator flows are invalid
      (use State -> State for cross-system linking)
    - Usages must connect ProcessOperator <-> TechnicalResource within the same system

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
        if source_type == "state" and target_type == "state":
            # State -> State: only allowed as cross-system connection
            source_sys = _get_system_id(flow.source_ref, model)
            target_sys = _get_system_id(flow.target_ref, model)
            if flow.system_id is None and source_sys != target_sys and source_sys is not None and target_sys is not None:
                valid = True
            else:
                errors.append(
                    f"Flow '{flow.id}': State -> State connection from "
                    f"'{flow.source_ref}' to '{flow.target_ref}' is only allowed "
                    f"as a cross-system connection (outside system blocks, "
                    f"between states in different systems)"
                )
                continue
        elif source_type == "state" and target_type == "process_operator":
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
            continue

        # Check for cross-system State <-> ProcessOperator flows
        if model.system_limits and (
            (source_type == "state" and target_type == "process_operator")
            or (source_type == "process_operator" and target_type == "state")
        ):
            source_sys = _get_system_id(flow.source_ref, model)
            target_sys = _get_system_id(flow.target_ref, model)
            if source_sys is not None and target_sys is not None and source_sys != target_sys:
                errors.append(
                    f"Flow '{flow.id}': cross-system reference from "
                    f"'{flow.source_ref}' (system '{source_sys}') to "
                    f"'{flow.target_ref}' (system '{target_sys}'). "
                    f"Use State -> State connections for cross-system linking"
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

        # Check for cross-system usages
        if model.system_limits:
            po_sys = _get_system_id(usage.process_operator_ref, model)
            tr_sys = _get_system_id(usage.technical_resource_ref, model)
            if po_sys is not None and tr_sys is not None and po_sys != tr_sys:
                errors.append(
                    f"Usage '{usage.id}': cross-system reference between "
                    f"'{usage.process_operator_ref}' (system '{po_sys}') and "
                    f"'{usage.technical_resource_ref}' (system '{tr_sys}'). "
                    f"TechnicalResources must belong to the same system as "
                    f"their ProcessOperator"
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
