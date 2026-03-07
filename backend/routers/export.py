"""Export router for text, XML, PDF, SVG, and PNG download endpoints."""

import cairosvg
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from lxml import etree
from pydantic import BaseModel

from export.pdf_exporter import export_pdf
from export.text_exporter import export_text
from export.xml_exporter import export_xml
from models.process_model import ProcessModel
from parser.lexer import LexerError
from parser.parser import FpdParser, ParseError
from parser.validator import validate_connections
from schemas import validate_xsd
from services.layout import compute_layout
from services.session import SessionManager
from services.svg_renderer import render_svg

router = APIRouter()
session_manager = SessionManager()


class ExportRequest(BaseModel):
    """Request body for export endpoints."""

    session_id: str


class SourceExportRequest(BaseModel):
    """Request body for source-based export endpoints (no session required)."""

    source: str


def _parse_source(source: str) -> ProcessModel:
    """Parse FPD source text into a ProcessModel."""
    try:
        parser = FpdParser(source)
        model = parser.parse()
    except (LexerError, ParseError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    validation_errors = validate_connections(model)
    if validation_errors:
        model.errors.extend(validation_errors)

    return model


def _get_model_from_session(session_id: str) -> ProcessModel:
    """Retrieve and reconstruct a ProcessModel from session data.

    Raises:
        HTTPException: If session not found or model data missing.
    """
    session = session_manager.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    model_data = session.data.get("model")
    if model_data is None:
        raise HTTPException(status_code=400, detail="No model data in session")

    return ProcessModel(**model_data)


def _sanitize_filename(title: str, fallback: str = "diagram") -> str:
    """Derive a safe filename from the model title."""
    return title.replace('"', "").replace("/", "_").replace("\\", "_").strip() or fallback


@router.post("/export/text")
async def export_text_endpoint(request: ExportRequest) -> Response:
    """Export the current model as FPD text."""
    model = _get_model_from_session(request.session_id)
    content = export_text(model)
    filename = _sanitize_filename(model.title)
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}.fpd"'},
    )


@router.post("/export/xml")
async def export_xml_endpoint(request: ExportRequest) -> Response:
    """Export the current model as VDI 3682 XML.

    The exported XML is validated against FPD_Schema.xsd. Any validation
    warnings are returned in the X-XSD-Warnings response header.
    """
    model = _get_model_from_session(request.session_id)
    content = export_xml(model)

    # Validate exported XML against the XSD schema
    warnings: list[str] = []
    try:
        parser = etree.XMLParser(resolve_entities=False, no_network=True)
        root = etree.fromstring(content.encode("UTF-8"), parser=parser)
        warnings = validate_xsd(root)
    except etree.XMLSyntaxError:
        warnings = ["Generated XML could not be parsed for validation"]

    filename = _sanitize_filename(model.title)
    headers: dict[str, str] = {
        "Content-Disposition": f'attachment; filename="{filename}.xml"',
    }
    if warnings:
        headers["X-XSD-Warnings"] = "; ".join(warnings)

    return Response(
        content=content,
        media_type="application/xml; charset=utf-8",
        headers=headers,
    )


@router.post("/export/pdf")
async def export_pdf_endpoint(request: ExportRequest) -> Response:
    """Export the current model as a PDF document."""
    model = _get_model_from_session(request.session_id)
    content = export_pdf(model)
    filename = _sanitize_filename(model.title)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )


# --- Source-based endpoints (no session required) ---


@router.post("/export/source/svg")
async def export_svg_from_source(request: SourceExportRequest) -> Response:
    """Export FPD source text as an SVG image."""
    model = _parse_source(request.source)
    diagram = compute_layout(model)
    svg = render_svg(diagram)
    filename = _sanitize_filename(model.title)
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}.svg"'},
    )


@router.post("/export/source/png")
async def export_png_from_source(request: SourceExportRequest) -> Response:
    """Export FPD source text as a PNG image."""
    model = _parse_source(request.source)
    diagram = compute_layout(model)
    svg = render_svg(diagram)
    png_bytes = cairosvg.svg2png(bytestring=svg.encode("utf-8"), scale=2.0)
    filename = _sanitize_filename(model.title)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="{filename}.png"'},
    )


@router.post("/export/source/pdf")
async def export_pdf_from_source(request: SourceExportRequest) -> Response:
    """Export FPD source text as a PDF document."""
    model = _parse_source(request.source)
    content = export_pdf(model)
    filename = _sanitize_filename(model.title)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )


@router.post("/export/source/xml")
async def export_xml_from_source(request: SourceExportRequest) -> Response:
    """Export FPD source text as VDI 3682 XML."""
    model = _parse_source(request.source)
    content = export_xml(model)

    warnings: list[str] = []
    try:
        xml_parser = etree.XMLParser(resolve_entities=False, no_network=True)
        root = etree.fromstring(content.encode("UTF-8"), parser=xml_parser)
        warnings = validate_xsd(root)
    except etree.XMLSyntaxError:
        warnings = ["Generated XML could not be parsed for validation"]

    filename = _sanitize_filename(model.title)
    headers: dict[str, str] = {
        "Content-Disposition": f'attachment; filename="{filename}.xml"',
    }
    if warnings:
        headers["X-XSD-Warnings"] = "; ".join(warnings)

    return Response(
        content=content,
        media_type="application/xml; charset=utf-8",
        headers=headers,
    )


@router.post("/export/source/text")
async def export_text_from_source(request: SourceExportRequest) -> Response:
    """Export FPD source text as formatted FPD text."""
    model = _parse_source(request.source)
    content = export_text(model)
    filename = _sanitize_filename(model.title)
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}.fpd"'},
    )
