"""Export router for text, XML, and PDF download endpoints."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from lxml import etree
from pydantic import BaseModel

from export.pdf_exporter import export_pdf
from export.text_exporter import export_text
from export.xml_exporter import export_xml
from models.process_model import ProcessModel
from schemas import validate_xsd
from services.session import SessionManager

router = APIRouter()
session_manager = SessionManager()


class ExportRequest(BaseModel):
    """Request body for export endpoints."""

    session_id: str


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
