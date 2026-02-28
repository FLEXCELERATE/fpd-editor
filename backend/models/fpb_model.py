"""Pydantic data models for VDI 3682 Formalized Process Description elements."""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class StateType(str, Enum):
    """Types of State elements in VDI 3682."""
    PRODUCT = "product"
    ENERGY = "energy"
    INFORMATION = "information"


class StatePlacement(str, Enum):
    """Placement hint for where a State sits relative to the system limit."""
    BOUNDARY = "boundary"
    BOUNDARY_TOP = "boundary-top"
    BOUNDARY_BOTTOM = "boundary-bottom"
    BOUNDARY_LEFT = "boundary-left"
    BOUNDARY_RIGHT = "boundary-right"
    INTERNAL = "internal"


class FlowType(str, Enum):
    """Types of Flow connections in VDI 3682."""
    FLOW = "flow"
    ALTERNATIVE_FLOW = "alternativeFlow"
    PARALLEL_FLOW = "parallelFlow"


class Identification(BaseModel):
    """VDI 3682 element identification with unique ID and optional names."""
    unique_ident: str
    long_name: Optional[str] = None
    short_name: Optional[str] = None


class State(BaseModel):
    """A State element (Product, Energy, or Information) in VDI 3682."""
    id: str
    state_type: StateType
    identification: Identification
    label: str
    placement: Optional[StatePlacement] = None
    line_number: Optional[int] = None
    system_id: Optional[str] = None


class ProcessOperator(BaseModel):
    """A ProcessOperator element in VDI 3682."""
    id: str
    identification: Identification
    label: str
    line_number: Optional[int] = None
    system_id: Optional[str] = None


class TechnicalResource(BaseModel):
    """A TechnicalResource element in VDI 3682."""
    id: str
    identification: Identification
    label: str
    line_number: Optional[int] = None
    system_id: Optional[str] = None


class Flow(BaseModel):
    """A Flow connection between State and ProcessOperator in VDI 3682."""
    id: str
    source_ref: str
    target_ref: str
    flow_type: FlowType = FlowType.FLOW
    line_number: Optional[int] = None
    system_id: Optional[str] = None


class Usage(BaseModel):
    """A Usage connection between ProcessOperator and TechnicalResource."""
    id: str
    process_operator_ref: str
    technical_resource_ref: str
    line_number: Optional[int] = None
    system_id: Optional[str] = None


class SystemLimit(BaseModel):
    """A SystemLimit element (Systemgrenze) in VDI 3682."""
    id: str
    identification: Identification
    label: str
    line_number: Optional[int] = None
