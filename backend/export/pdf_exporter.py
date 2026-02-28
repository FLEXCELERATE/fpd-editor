"""PDF exporter that renders ProcessModel as a PDF document with configurable page size and orientation."""

from datetime import datetime
from enum import Enum
from io import BytesIO

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4, LETTER, landscape, portrait
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from models.fpb_model import FlowType, StateType
from models.process_model import ProcessModel


class PageSize(str, Enum):
    """Supported PDF page sizes."""
    A4 = "A4"
    LETTER = "Letter"


class Orientation(str, Enum):
    """Supported PDF page orientations."""
    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"


# Layout constants (VDI 3682 standard)
_ELEMENT_WIDTH = 140
_ELEMENT_HEIGHT = 60
_PO_WIDTH = 160
_PO_HEIGHT = 70
_TR_WIDTH = 140
_TR_HEIGHT = 50
_H_SPACING = 80
_V_SPACING = 100
_PADDING = 40
_FONT_SIZE = 13
_TITLE_FONT_SIZE = 18
_TITLE_BLOCK_HEIGHT = 60
_MARGIN = 20

# VDI 3682 color scheme (VDI 3682 standard)
_COLORS = {
    StateType.PRODUCT: {"fill": HexColor("#D4E6F1"), "stroke": HexColor("#2980B9")},
    StateType.ENERGY: {"fill": HexColor("#FADBD8"), "stroke": HexColor("#E74C3C")},
    StateType.INFORMATION: {"fill": HexColor("#D5F5E3"), "stroke": HexColor("#27AE60")},
}
_PO_COLOR = {"fill": HexColor("#F9E79F"), "stroke": HexColor("#F39C12")}
_TR_COLOR = {"fill": HexColor("#E8DAEF"), "stroke": HexColor("#8E44AD")}

_FLOW_STYLES = {
    FlowType.FLOW: {"stroke": HexColor("#2C3E50"), "dash": None},
    FlowType.ALTERNATIVE_FLOW: {"stroke": HexColor("#7F8C8D"), "dash": [6, 4]},
    FlowType.PARALLEL_FLOW: {"stroke": HexColor("#2C3E50"), "dash": None},
}


def _get_page_size(page_size: PageSize, orientation: Orientation) -> tuple[float, float]:
    """Get page dimensions based on size and orientation."""
    size_map = {
        PageSize.A4: A4,
        PageSize.LETTER: LETTER,
    }

    base_size = size_map.get(page_size, A4)

    if orientation == Orientation.LANDSCAPE:
        return landscape(base_size)
    return portrait(base_size)


def _truncate_label(label: str, max_chars: int = 18) -> str:
    """Truncate label to fit within element bounds."""
    if len(label) <= max_chars:
        return label
    return label[: max_chars - 1] + "…"


def _draw_rounded_rect(c: canvas.Canvas, x: float, y: float, width: float, height: float,
                       radius: float, fill_color: Color, stroke_color: Color, stroke_width: float = 2,
                       dash: list[float] | None = None):
    """Draw a rounded rectangle with fill and stroke."""
    c.saveState()
    c.setFillColor(fill_color)
    c.setStrokeColor(stroke_color)
    c.setLineWidth(stroke_width)

    if dash:
        c.setDash(dash)

    # Draw rounded rectangle
    c.roundRect(x, y, width, height, radius, fill=1, stroke=1)
    c.restoreState()


def _draw_title_block(c: canvas.Canvas, model: ProcessModel, page_width: float, page_height: float):
    """Draw title block at the bottom of the page with process name, date, and VDI 3682 label."""
    block_y = _MARGIN
    block_height = _TITLE_BLOCK_HEIGHT

    # Draw border
    c.setStrokeColor(HexColor("#2C3E50"))
    c.setLineWidth(1)
    c.rect(_MARGIN, block_y, page_width - 2 * _MARGIN, block_height)

    # Process title
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(HexColor("#2C3E50"))
    c.drawString(_MARGIN + 10, block_y + block_height - 25, f"Process: {model.title}")

    # Export date
    c.setFont("Helvetica", 10)
    export_date = datetime.now().strftime("%Y-%m-%d %H:%M")
    c.drawString(_MARGIN + 10, block_y + block_height - 45, f"Exported: {export_date}")

    # VDI 3682 label (right side)
    c.setFont("Helvetica-Oblique", 9)
    c.setFillColor(HexColor("#7F8C8D"))
    vdi_label = "VDI 3682 Formalized Process Description"
    label_width = c.stringWidth(vdi_label, "Helvetica-Oblique", 9)
    c.drawString(page_width - _MARGIN - label_width - 10, block_y + 10, vdi_label)


def export_pdf(
    model: ProcessModel,
    page_size: PageSize = PageSize.A4,
    orientation: Orientation = Orientation.LANDSCAPE,
    author: str | None = None
) -> bytes:
    """Render a ProcessModel as a PDF document.

    Lays out states on the left and right of process operators,
    with technical resources below their associated operators.
    Includes a title block with process name, date, and VDI 3682 reference.

    Args:
        model: The process model to render.
        page_size: Page size (A4 or Letter), defaults to A4.
        orientation: Page orientation (portrait or landscape), defaults to landscape.
        author: Optional author name for PDF metadata.

    Returns:
        Bytes containing the PDF document.
    """
    # Get page dimensions
    page_width, page_height = _get_page_size(page_size, orientation)

    # Create PDF in memory
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(page_width, page_height))

    # Set PDF metadata
    c.setTitle(model.title)
    c.setSubject("VDI 3682 Formalized Process Description")
    c.setCreator("Text-Based FPD Tool")
    if author:
        c.setAuthor(author)

    # Calculate available drawing area (accounting for title block)
    draw_area_y = _MARGIN + _TITLE_BLOCK_HEIGHT + _MARGIN
    draw_area_height = page_height - draw_area_y - _PADDING

    # Build element position map
    positions: dict[str, tuple[float, float, float, float]] = {}

    # Determine input/output states from flows
    input_state_ids: set[str] = set()
    output_state_ids: set[str] = set()
    po_ids = {po.id for po in model.process_operators}

    for flow in model.flows:
        if flow.target_ref in po_ids:
            input_state_ids.add(flow.source_ref)
        if flow.source_ref in po_ids:
            output_state_ids.add(flow.target_ref)

    # States not connected to any flow go to input side
    all_state_ids = {s.id for s in model.states}
    unconnected = all_state_ids - input_state_ids - output_state_ids
    input_state_ids |= unconnected

    # Layout columns: input states | process operators | output states
    col_input_x = _PADDING
    col_po_x = _PADDING + _ELEMENT_WIDTH + _H_SPACING
    col_output_x = col_po_x + _PO_WIDTH + _H_SPACING

    title_offset = _TITLE_FONT_SIZE + _PADDING if model.title else 0
    base_y = draw_area_y + title_offset

    # Place input states
    input_states = [s for s in model.states if s.id in input_state_ids]
    for i, state in enumerate(input_states):
        y = base_y + i * (_ELEMENT_HEIGHT + _V_SPACING)
        positions[state.id] = (col_input_x, y, _ELEMENT_WIDTH, _ELEMENT_HEIGHT)

    # Place process operators
    for i, po in enumerate(model.process_operators):
        y = base_y + i * (_PO_HEIGHT + _V_SPACING)
        positions[po.id] = (col_po_x, y, _PO_WIDTH, _PO_HEIGHT)

    # Place output states
    output_states = [s for s in model.states if s.id in output_state_ids]
    for i, state in enumerate(output_states):
        y = base_y + i * (_ELEMENT_HEIGHT + _V_SPACING)
        positions[state.id] = (col_output_x, y, _ELEMENT_WIDTH, _ELEMENT_HEIGHT)

    # Place technical resources below their process operators
    tr_map: dict[str, str] = {}
    for usage in model.usages:
        tr_map[usage.technical_resource_ref] = usage.process_operator_ref

    for tr in model.technical_resources:
        po_ref = tr_map.get(tr.id)
        if po_ref and po_ref in positions:
            px, py, pw, _ = positions[po_ref]
            tx = px + (pw - _TR_WIDTH) / 2
            ty = py + _PO_HEIGHT + 40  # Position below PO
            positions[tr.id] = (tx, ty, _TR_WIDTH, _TR_HEIGHT)
        else:
            # Place unconnected TRs at the bottom
            y = base_y + max(len(input_states), len(model.process_operators), len(output_states)) * (_ELEMENT_HEIGHT + _V_SPACING)
            positions[tr.id] = (col_po_x, y, _TR_WIDTH, _TR_HEIGHT)

    # Convert SVG coordinate system to PDF coordinate system
    # PDF origin is bottom-left, SVG is top-left
    # We'll flip y-coordinates
    if positions:
        max_y = max(y + h for x, y, w, h in positions.values())
        pdf_positions = {}
        for element_id, (x, y, w, h) in positions.items():
            # Flip y coordinate: PDF y = max_y - SVG y - height
            pdf_y = page_height - y - h
            pdf_positions[element_id] = (x, pdf_y, w, h)
        positions = pdf_positions

    # Draw title at the top
    if model.title:
        c.setFont("Helvetica-Bold", _TITLE_FONT_SIZE)
        c.setFillColor(HexColor("#2C3E50"))
        title_x = page_width / 2
        title_y = page_height - _MARGIN - _TITLE_FONT_SIZE
        c.drawCentredString(title_x, title_y, model.title)

    # Draw flows (lines)
    for flow in model.flows:
        if flow.source_ref not in positions or flow.target_ref not in positions:
            continue
        sx, sy, sw, sh = positions[flow.source_ref]
        tx, ty, tw, th = positions[flow.target_ref]

        # Connect from right edge of source to left edge of target
        x1 = sx + sw
        y1 = sy + sh / 2
        x2 = tx
        y2 = ty + th / 2

        # If target is to the left, connect differently
        if tx + tw / 2 < sx + sw / 2:
            x1 = sx
            x2 = tx + tw

        style = _FLOW_STYLES.get(flow.flow_type, _FLOW_STYLES[FlowType.FLOW])
        stroke_w = 3 if flow.flow_type == FlowType.PARALLEL_FLOW else 1.5

        c.setStrokeColor(style["stroke"])
        c.setLineWidth(stroke_w)
        if style["dash"]:
            c.setDash(style["dash"])
        else:
            c.setDash()

        c.line(x1, y1, x2, y2)

        # Draw arrowhead
        arrow_size = 8
        c.saveState()
        c.translate(x2, y2)
        if x2 > x1:  # Pointing right
            c.rotate(0)
        else:  # Pointing left
            c.rotate(180)
        c.setFillColor(style["stroke"])
        c.setStrokeColor(style["stroke"])
        path = c.beginPath()
        path.moveTo(0, 0)
        path.lineTo(-arrow_size, arrow_size / 2)
        path.lineTo(-arrow_size, -arrow_size / 2)
        path.close()
        c.drawPath(path, fill=1, stroke=1)
        c.restoreState()

    # Draw usage connections (dashed)
    for usage in model.usages:
        po_ref = usage.process_operator_ref
        tr_ref = usage.technical_resource_ref
        if po_ref not in positions or tr_ref not in positions:
            continue
        px, py, pw, ph = positions[po_ref]
        tx, ty, tw, th = positions[tr_ref]
        x1 = px + pw / 2
        y1 = py
        x2 = tx + tw / 2
        y2 = ty + th

        c.setStrokeColor(_TR_COLOR["stroke"])
        c.setLineWidth(1.5)
        c.setDash([4, 3])
        c.line(x1, y1, x2, y2)
        c.setDash()

    # Draw states
    for state in model.states:
        if state.id not in positions:
            continue
        x, y, w, h = positions[state.id]
        colors = _COLORS.get(state.state_type, _COLORS[StateType.PRODUCT])
        label = _truncate_label(state.label or state.id)

        # Draw rounded rectangle
        _draw_rounded_rect(c, x, y, w, h, 10, colors["fill"], colors["stroke"])

        # Draw text
        c.setFont("Helvetica", _FONT_SIZE)
        c.setFillColor(HexColor("#2C3E50"))
        text_x = x + w / 2
        text_y = y + h / 2 - _FONT_SIZE / 3
        c.drawCentredString(text_x, text_y, label)

    # Draw process operators (rectangles)
    for po in model.process_operators:
        if po.id not in positions:
            continue
        x, y, w, h = positions[po.id]
        label = _truncate_label(po.label or po.id)

        # Draw rounded rectangle
        _draw_rounded_rect(c, x, y, w, h, 4, _PO_COLOR["fill"], _PO_COLOR["stroke"])

        # Draw text (bold)
        c.setFont("Helvetica-Bold", _FONT_SIZE)
        c.setFillColor(HexColor("#2C3E50"))
        text_x = x + w / 2
        text_y = y + h / 2 - _FONT_SIZE / 3
        c.drawCentredString(text_x, text_y, label)

    # Draw technical resources (dashed rectangles)
    for tr in model.technical_resources:
        if tr.id not in positions:
            continue
        x, y, w, h = positions[tr.id]
        label = _truncate_label(tr.label or tr.id)

        # Draw dashed rounded rectangle
        _draw_rounded_rect(c, x, y, w, h, 4, _TR_COLOR["fill"], _TR_COLOR["stroke"], dash=[6, 3])

        # Draw text
        c.setFont("Helvetica", _FONT_SIZE)
        c.setFillColor(HexColor("#2C3E50"))
        text_x = x + w / 2
        text_y = y + h / 2 - _FONT_SIZE / 3
        c.drawCentredString(text_x, text_y, label)

    # Draw title block at bottom
    _draw_title_block(c, model, page_width, page_height)

    # Finalize PDF
    c.showPage()
    c.save()

    return buffer.getvalue()
