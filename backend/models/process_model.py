"""Container model for a complete VDI 3682 process description."""

from pydantic import BaseModel, Field

from .fpb_model import Flow, ProcessOperator, State, SystemLimit, TechnicalResource, Usage


class ProcessModel(BaseModel):
    """Complete process model containing all VDI 3682 elements."""
    title: str = "Untitled Process"
    system_limits: list[SystemLimit] = Field(default_factory=list)
    states: list[State] = Field(default_factory=list)
    process_operators: list[ProcessOperator] = Field(default_factory=list)
    technical_resources: list[TechnicalResource] = Field(default_factory=list)
    flows: list[Flow] = Field(default_factory=list)
    usages: list[Usage] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
