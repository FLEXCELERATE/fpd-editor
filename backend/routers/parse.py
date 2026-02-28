"""Parse router for FPB text processing."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from models.process_model import ProcessModel
from parser.lexer import LexerError
from parser.parser import FpbParser, ParseError
from parser.validator import validate_connections
from services.layout import compute_layout
from services.session import SessionManager

router = APIRouter()
session_manager = SessionManager()


class ParseRequest(BaseModel):
    """Request body for parse endpoint."""

    source: str
    session_id: str | None = None


class ParseResponse(BaseModel):
    """Response body for parse endpoint."""

    session_id: str
    model: dict[str, Any]
    diagram: dict[str, Any]


@router.post("/parse", response_model=ParseResponse)
async def parse_fpb(request: ParseRequest) -> ParseResponse:
    """Parse FPB text, validate, compute layout, and return model + diagram data."""
    source = request.source

    try:
        parser = FpbParser(source)
        model = parser.parse()
    except (LexerError, ParseError) as exc:
        model = ProcessModel(errors=[str(exc)])

    validation_errors = validate_connections(model)
    if validation_errors:
        model.errors.extend(validation_errors)

    diagram = compute_layout(model)

    session_data = {
        "source": source,
        "model": model.model_dump(),
        "diagram": diagram,
    }

    session_id = None
    if request.session_id:
        session = session_manager.get_session(request.session_id)
        if session:
            session_manager.update_session_data(request.session_id, session_data)
            session_id = request.session_id

    if not session_id:
        session_id = session_manager.create_session()
        session_manager.update_session_data(session_id, session_data)

    return ParseResponse(
        session_id=session_id,
        model=model.model_dump(),
        diagram=diagram,
    )
