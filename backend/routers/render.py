"""Render router — returns diagram as SVG image."""

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from models.process_model import ProcessModel
from parser.lexer import LexerError
from parser.parser import FpdParser, ParseError
from parser.validator import validate_connections
from services.layout import compute_layout
from services.svg_renderer import render_svg

router = APIRouter()


class RenderRequest(BaseModel):
    """Request body for SVG render endpoint."""

    source: str


@router.post("/render/svg")
async def render_svg_endpoint(request: RenderRequest) -> Response:
    """Parse FPD text and return a rendered SVG diagram."""
    try:
        parser = FpdParser(request.source)
        model = parser.parse()
    except (LexerError, ParseError) as exc:
        model = ProcessModel(errors=[str(exc)])

    validate_connections(model)
    diagram = compute_layout(model)
    svg = render_svg(diagram)

    return Response(content=svg, media_type="image/svg+xml")
