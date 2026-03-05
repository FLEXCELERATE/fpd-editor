"""Tests for XSD schema validation of XML exports."""

import pytest
from lxml import etree

from export.xml_exporter import export_xml
from models.fpd_model import (
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
from schemas import XSD_PATH, validate_xsd


def _build_sample_model() -> ProcessModel:
    """Build a representative ProcessModel with all element types."""
    return ProcessModel(
        title="Test Process",
        system_limits=[
            SystemLimit(
                id="sl_1",
                identification=Identification(unique_ident="sl_1", long_name="Test Process"),
                label="Test Process",
            ),
        ],
        states=[
            State(
                id="p1",
                state_type=StateType.PRODUCT,
                identification=Identification(unique_ident="p1", long_name="Raw Material"),
                label="Raw Material",
            ),
            State(
                id="p2",
                state_type=StateType.PRODUCT,
                identification=Identification(unique_ident="p2", long_name="Finished Product"),
                label="Finished Product",
            ),
            State(
                id="e1",
                state_type=StateType.ENERGY,
                identification=Identification(unique_ident="e1", long_name="Electricity"),
                label="Electricity",
            ),
        ],
        process_operators=[
            ProcessOperator(
                id="po1",
                identification=Identification(unique_ident="po1", long_name="Manufacturing"),
                label="Manufacturing",
            ),
        ],
        technical_resources=[
            TechnicalResource(
                id="tr1",
                identification=Identification(unique_ident="tr1", long_name="CNC Machine"),
                label="CNC Machine",
            ),
        ],
        flows=[
            Flow(id="f1", source_ref="p1", target_ref="po1", flow_type=FlowType.FLOW),
            Flow(id="f2", source_ref="e1", target_ref="po1", flow_type=FlowType.FLOW),
            Flow(id="f3", source_ref="po1", target_ref="p2", flow_type=FlowType.FLOW),
        ],
        usages=[
            Usage(id="u1", process_operator_ref="po1", technical_resource_ref="tr1"),
        ],
    )


@pytest.fixture
def sample_model() -> ProcessModel:
    return _build_sample_model()


# ---------------------------------------------------------------------------
# Schema availability
# ---------------------------------------------------------------------------

class TestSchemaAvailability:
    def test_xsd_file_exists(self):
        """XSD schema must be present (submodule initialized)."""
        assert XSD_PATH.is_file(), (
            f"XSD schema not found at {XSD_PATH}. "
            "Run 'git submodule update --init' to initialize."
        )


# ---------------------------------------------------------------------------
# Export XSD validation
# ---------------------------------------------------------------------------

class TestExportXsdValidation:
    """Validate that exported XML conforms to FPD_Schema.xsd."""

    def test_full_model_validates(self, sample_model):
        """A complete model export should pass XSD validation."""
        xml_str = export_xml(sample_model)
        root = etree.fromstring(xml_str.encode("UTF-8"))
        warnings = validate_xsd(root)
        assert warnings == [], f"XSD validation errors: {warnings}"

    def test_empty_model_reports_xsd_errors(self):
        """An empty model violates XSD (min 2 states, 1 processOperator required)."""
        model = ProcessModel(title="Empty")
        xml_str = export_xml(model)
        root = etree.fromstring(xml_str.encode("UTF-8"))
        warnings = validate_xsd(root)
        assert len(warnings) > 0, "Empty model should produce XSD validation warnings"
        assert any("states" in w for w in warnings)

    def test_alternative_and_parallel_flows_validate(self):
        """Models with all flow types should pass XSD validation."""
        model = _build_sample_model()
        model.flows.append(
            Flow(id="f4", source_ref="p1", target_ref="po1", flow_type=FlowType.ALTERNATIVE_FLOW)
        )
        model.flows.append(
            Flow(id="f5", source_ref="po1", target_ref="p2", flow_type=FlowType.PARALLEL_FLOW)
        )
        xml_str = export_xml(model)
        root = etree.fromstring(xml_str.encode("UTF-8"))
        warnings = validate_xsd(root)
        assert warnings == [], f"XSD validation errors: {warnings}"


# ---------------------------------------------------------------------------
# Round-trip: export → validate → import → re-export → validate
# ---------------------------------------------------------------------------

class TestXsdRoundTrip:
    def test_export_import_reexport_validates(self, sample_model):
        """XML that passes validation should still pass after import and re-export."""
        from routers.import_file import _import_xml

        xml_str = export_xml(sample_model)

        # First export validates
        root1 = etree.fromstring(xml_str.encode("UTF-8"))
        assert validate_xsd(root1) == []

        # Import and re-export
        reimported_model, _source, _warnings = _import_xml(xml_str)
        xml_str2 = export_xml(reimported_model)

        # Second export also validates
        root2 = etree.fromstring(xml_str2.encode("UTF-8"))
        warnings2 = validate_xsd(root2)
        assert warnings2 == [], f"Re-exported XML validation errors: {warnings2}"
