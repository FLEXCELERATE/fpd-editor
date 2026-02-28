"""Import router for FPB text and VDI 3682 XML file uploads."""

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Path to optional HSU FPD_Schema.xsd for XSD validation
_SCHEMA_DIR = Path(__file__).resolve().parent.parent / "schemas"
_XSD_PATH = _SCHEMA_DIR / "FPD_Schema.xsd"

from export.text_exporter import export_text
from models.fpb_model import (
    Flow,
    FlowType,
    Identification,
    ProcessOperator,
    State,
    StateType,
    SystemLimit,
    TechnicalResource,
    Usage,
)
from models.process_model import ProcessModel
from parser.lexer import LexerError
from parser.parser import FpbParser, ParseError
from parser.validator import validate_connections
from services.layout import compute_layout
from services.session import SessionManager

router = APIRouter()
session_manager = SessionManager()


class ImportResponse(BaseModel):
    """Response body for import endpoint."""

    session_id: str
    source: str
    model: dict[str, Any]
    diagram: dict[str, Any]


def _detect_format(filename: str, content: str) -> str:
    """Detect file format from filename extension and content.

    Returns:
        'text' for FPB text files, 'xml' for VDI 3682 XML files.

    Raises:
        HTTPException: If format cannot be determined.
    """
    lower_name = filename.lower()
    if lower_name.endswith(".xml"):
        return "xml"
    if lower_name.endswith(".fpb") or lower_name.endswith(".txt"):
        return "text"

    # Fallback: inspect content
    stripped = content.strip()
    if stripped.startswith("<?xml") or stripped.startswith("<"):
        return "xml"
    if "@startfpb" in stripped:
        return "text"

    raise HTTPException(
        status_code=400,
        detail="Unable to detect file format. Use .fpb, .txt, or .xml extension.",
    )


def _import_text(content: str) -> tuple[ProcessModel, str]:
    """Import FPB text content, returning model and source text."""
    try:
        parser = FpbParser(content)
        model = parser.parse()
    except (LexerError, ParseError) as exc:
        raise HTTPException(status_code=400, detail=f"Parse error: {exc}") from exc

    return model, content


# ---------------------------------------------------------------------------
# XML import helpers
# ---------------------------------------------------------------------------

_STATE_TYPE_MAP = {
    "product": StateType.PRODUCT,
    "energy": StateType.ENERGY,
    "information": StateType.INFORMATION,
}

_FLOW_TYPE_MAP = {
    "flow": FlowType.FLOW,
    "alternativeFlow": FlowType.ALTERNATIVE_FLOW,
    "parallelFlow": FlowType.PARALLEL_FLOW,
}


def _parse_identification(elem, ns: dict) -> tuple[str, str, str | None]:
    """Extract (unique_id, long_name, short_name) from an element's identification child."""
    ident = elem.find("fpb:identification", ns)
    if ident is None:
        return "", "", None
    unique_id = ident.get("uniqueIdent", "")
    long_name = ident.get("longName", unique_id)
    short_name = ident.get("shortName")
    return unique_id, long_name, short_name


def _parse_xml_legacy(root, ns: dict) -> ProcessModel:
    """Parse our original/legacy XML format with sourceRef/targetRef in flows."""
    model = ProcessModel()

    # Extract title from system limit
    system_limit = root.find(".//fpb:systemLimit", ns)
    if system_limit is not None:
        ident = system_limit.find("fpb:identification", ns)
        if ident is not None:
            model.title = ident.get("longName", "Untitled Process")

    # Parse states
    for state_elem in root.findall(".//fpb:states/fpb:state", ns):
        state_type_str = state_elem.get("stateType", "product")
        state_type = _STATE_TYPE_MAP.get(state_type_str, StateType.PRODUCT)
        unique_id, long_name, short_name = _parse_identification(state_elem, ns)
        if not unique_id:
            continue
        model.states.append(
            State(
                id=unique_id,
                state_type=state_type,
                identification=Identification(
                    unique_ident=unique_id, long_name=long_name, short_name=short_name,
                ),
                label=long_name,
            )
        )

    # Parse process operators
    for po_elem in root.findall(".//fpb:processOperators/fpb:processOperator", ns):
        unique_id, long_name, short_name = _parse_identification(po_elem, ns)
        if not unique_id:
            continue
        model.process_operators.append(
            ProcessOperator(
                id=unique_id,
                identification=Identification(
                    unique_ident=unique_id, long_name=long_name, short_name=short_name,
                ),
                label=long_name,
            )
        )

    # Parse technical resources
    for tr_elem in root.findall(".//fpb:technicalResources/fpb:technicalResource", ns):
        unique_id, long_name, short_name = _parse_identification(tr_elem, ns)
        if not unique_id:
            continue
        model.technical_resources.append(
            TechnicalResource(
                id=unique_id,
                identification=Identification(
                    unique_ident=unique_id, long_name=long_name, short_name=short_name,
                ),
                label=long_name,
            )
        )

    # Parse flows (legacy: sourceRef/targetRef children)
    for flow_elem in root.findall(".//fpb:flowContainer/fpb:flow", ns):
        flow_id = flow_elem.get("id", "")
        flow_type_str = flow_elem.get("flowType", "flow")
        flow_type = _FLOW_TYPE_MAP.get(flow_type_str, FlowType.FLOW)
        source_ref_elem = flow_elem.find("fpb:sourceRef", ns)
        target_ref_elem = flow_elem.find("fpb:targetRef", ns)
        if source_ref_elem is None or target_ref_elem is None:
            continue
        model.flows.append(
            Flow(
                id=flow_id,
                source_ref=source_ref_elem.text or "",
                target_ref=target_ref_elem.text or "",
                flow_type=flow_type,
            )
        )

    # Parse usages (legacy: sourceRef/targetRef children)
    for usage_elem in root.findall(".//fpb:flowContainer/fpb:usage", ns):
        usage_id = usage_elem.get("id", "")
        source_ref_elem = usage_elem.find("fpb:sourceRef", ns)
        target_ref_elem = usage_elem.find("fpb:targetRef", ns)
        if source_ref_elem is None or target_ref_elem is None:
            continue
        model.usages.append(
            Usage(
                id=usage_id,
                process_operator_ref=source_ref_elem.text or "",
                technical_resource_ref=target_ref_elem.text or "",
            )
        )

    return model


def _parse_xml_hsu(root, ns: dict) -> ProcessModel:
    """Parse HSU FPD_Schema.xsd-compatible XML format.

    Flow connections are reconstructed from per-element entry/exit bindings
    and the flowContainer registry.
    """
    model = ProcessModel()

    # SystemLimit: direct @id/@name attributes (HSU style)
    system_limit_elem = root.find(".//fpb:systemLimit", ns)
    if system_limit_elem is not None:
        sl_name = system_limit_elem.get("name")
        sl_id = system_limit_elem.get("id", "sl_1")
        if not sl_name:
            # Fallback: try nested identification (hybrid format)
            ident = system_limit_elem.find("fpb:identification", ns)
            sl_name = ident.get("longName", "Untitled Process") if ident is not None else "Untitled Process"
        model.title = sl_name
        model.system_limits.append(
            SystemLimit(
                id=sl_id,
                identification=Identification(unique_ident=sl_id, long_name=sl_name),
                label=sl_name,
            )
        )

    # Parse states
    for state_elem in root.findall(".//fpb:states/fpb:state", ns):
        state_type_str = state_elem.get("stateType", "product")
        state_type = _STATE_TYPE_MAP.get(state_type_str, StateType.PRODUCT)
        unique_id, long_name, short_name = _parse_identification(state_elem, ns)
        if not unique_id:
            continue
        model.states.append(
            State(
                id=unique_id,
                state_type=state_type,
                identification=Identification(
                    unique_ident=unique_id, long_name=long_name, short_name=short_name,
                ),
                label=long_name,
            )
        )

    # Parse process operators
    for po_elem in root.findall(".//fpb:processOperators/fpb:processOperator", ns):
        unique_id, long_name, short_name = _parse_identification(po_elem, ns)
        if not unique_id:
            continue
        model.process_operators.append(
            ProcessOperator(
                id=unique_id,
                identification=Identification(
                    unique_ident=unique_id, long_name=long_name, short_name=short_name,
                ),
                label=long_name,
            )
        )

    # Parse technical resources
    for tr_elem in root.findall(".//fpb:technicalResources/fpb:technicalResource", ns):
        unique_id, long_name, short_name = _parse_identification(tr_elem, ns)
        if not unique_id:
            continue
        model.technical_resources.append(
            TechnicalResource(
                id=unique_id,
                identification=Identification(
                    unique_ident=unique_id, long_name=long_name, short_name=short_name,
                ),
                label=long_name,
            )
        )

    # Build flow registry from flowContainer
    flow_registry: dict[str, str] = {}  # flow_id -> flowType string
    for fc_flow in root.findall(".//fpb:flowContainer/fpb:flow", ns):
        fid = fc_flow.get("id", "")
        ftype = fc_flow.get("flowType", "flow")
        if fid:
            flow_registry[fid] = ftype

    # Reconstruct source/target from entry/exit bindings on elements.
    # Scan all per-element <flows>/<flow> children across the entire document.
    flow_sources: dict[str, str] = {}  # flow_id -> element_id (exit = source)
    flow_targets: dict[str, str] = {}  # flow_id -> element_id (entry = target)

    for flow_ref in root.findall(".//fpb:flows/fpb:flow", ns):
        fid = flow_ref.get("id", "")
        if not fid:
            continue
        for exit_elem in flow_ref.findall("fpb:exit", ns):
            eid = exit_elem.get("id", "")
            if eid:
                flow_sources[fid] = eid
        for entry_elem in flow_ref.findall("fpb:entry", ns):
            eid = entry_elem.get("id", "")
            if eid:
                flow_targets[fid] = eid

    # Create Flow and Usage objects from the registry + bindings
    po_ids = {po.id for po in model.process_operators}
    tr_ids = {tr.id for tr in model.technical_resources}

    for fid, ftype_str in flow_registry.items():
        src = flow_sources.get(fid, "")
        tgt = flow_targets.get(fid, "")

        if ftype_str == "usage":
            # Determine which is PO and which is TR
            if src in po_ids:
                po_ref, tr_ref = src, tgt
            elif tgt in po_ids:
                po_ref, tr_ref = tgt, src
            elif src in tr_ids:
                po_ref, tr_ref = tgt, src
            else:
                po_ref, tr_ref = src, tgt
            if po_ref and tr_ref:
                model.usages.append(
                    Usage(id=fid, process_operator_ref=po_ref, technical_resource_ref=tr_ref)
                )
        else:
            flow_type = _FLOW_TYPE_MAP.get(ftype_str, FlowType.FLOW)
            if src and tgt:
                model.flows.append(
                    Flow(id=fid, source_ref=src, target_ref=tgt, flow_type=flow_type)
                )

    return model


def _validate_xsd(root, etree) -> list[str]:
    """Validate XML against HSU FPD_Schema.xsd if available.

    Returns a list of validation warning strings (empty if valid or schema not found).
    """
    if not _XSD_PATH.is_file():
        return []

    try:
        schema_doc = etree.parse(str(_XSD_PATH))
        schema = etree.XMLSchema(schema_doc)
    except etree.XMLSchemaParseError as exc:
        logger.warning("Could not parse XSD schema at %s: %s", _XSD_PATH, exc)
        return [f"XSD schema could not be loaded: {exc}"]

    if not schema.validate(root):
        return [
            f"XSD validation: {err.message}"
            for err in schema.error_log  # type: ignore[union-attr]
        ]
    return []


def _import_xml(content: str) -> tuple[ProcessModel, str, list[str]]:
    """Import VDI 3682 XML content, auto-detecting HSU or legacy format.

    Returns (model, source_text, xsd_warnings).
    """
    try:
        from lxml import etree
    except ImportError as exc:
        raise HTTPException(
            status_code=500, detail="lxml is required for XML import"
        ) from exc

    try:
        parser = etree.XMLParser(resolve_entities=False, no_network=True, dtd_validation=False, load_dtd=False)
        root = etree.fromstring(content.encode("UTF-8"), parser=parser)
    except etree.XMLSyntaxError as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid XML: {exc}"
        ) from exc

    # Optional XSD validation (non-blocking — warnings only)
    xsd_warnings = _validate_xsd(root, etree)

    ns = {"fpb": "http://www.vdivde.de/3682"}

    # Detect format: legacy has sourceRef children in flowContainer flows
    fc_flows = root.findall(".//fpb:flowContainer/fpb:flow", ns)
    is_legacy = any(f.find("fpb:sourceRef", ns) is not None for f in fc_flows)

    if is_legacy:
        model = _parse_xml_legacy(root, ns)
    else:
        model = _parse_xml_hsu(root, ns)

    # Generate FPB text from the imported model
    source = export_text(model)

    return model, source, xsd_warnings


@router.post("/import", response_model=ImportResponse)
async def import_file(file: UploadFile) -> ImportResponse:
    """Import an FPB text file or VDI 3682 XML file.

    Detects the format from the file extension and content, parses it into
    a ProcessModel, and returns the model with generated FPB source text.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    raw_bytes = await file.read()
    try:
        content = raw_bytes.decode("UTF-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400, detail="File must be UTF-8 encoded"
        ) from exc

    file_format = _detect_format(file.filename, content)

    if file_format == "xml":
        model, source, xsd_warnings = _import_xml(content)
        if xsd_warnings:
            model.warnings.extend(xsd_warnings)
    else:
        model, source = _import_text(content)

    validation_errors = validate_connections(model)
    if validation_errors:
        model.warnings.extend(validation_errors)

    diagram = compute_layout(model)

    session_id = session_manager.create_session()
    session_manager.update_session_data(session_id, {
        "source": source,
        "model": model.model_dump(),
        "diagram": diagram,
    })

    return ImportResponse(
        session_id=session_id,
        source=source,
        model=model.model_dump(),
        diagram=diagram,
    )
