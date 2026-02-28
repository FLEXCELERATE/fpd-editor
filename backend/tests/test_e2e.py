"""End-to-end tests for the FPB Editor API.

Covers all VDI 3682 element types, connection types, export/import round-trip,
validation error handling, empty documents, and large diagrams.
"""

import io

import pytest
from fastapi.testclient import TestClient
from lxml import etree

from main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Fixture: full FPB source with all element and connection types
# ---------------------------------------------------------------------------
FULL_FPB_SOURCE = """\
@startfpb
title "Complete Process"

product p1 "Raw Material"
product p2 "Finished Product"
energy e1 "Electricity"
information i1 "Control Signal"
process_operator po1 "Manufacturing"
technical_resource tr1 "CNC Machine"

p1 --> po1
e1 --> po1
i1 --> po1
po1 --> p2
p1 -.-> po1
po1 ==> p2
po1 <..> tr1

@endfpb
"""

EMPTY_FPB_SOURCE = """\
@startfpb
@endfpb
"""


# ---------------------------------------------------------------------------
# 1. Parse all element types
# ---------------------------------------------------------------------------
class TestParseAllElements:
    """Verify parsing produces all VDI 3682 element types."""

    def _parse(self, source: str) -> dict:
        resp = client.post("/api/parse", json={"source": source})
        assert resp.status_code == 200
        return resp.json()

    def test_all_element_types_present(self):
        data = self._parse(FULL_FPB_SOURCE)
        model = data["model"]
        assert model["title"] == "Complete Process"
        assert len(model["states"]) == 4  # p1, p2, e1, i1
        assert len(model["process_operators"]) == 1
        assert len(model["technical_resources"]) == 1

        state_types = {s["state_type"] for s in model["states"]}
        assert "product" in state_types
        assert "energy" in state_types
        assert "information" in state_types

    def test_all_connection_types_present(self):
        data = self._parse(FULL_FPB_SOURCE)
        model = data["model"]
        flow_types = {f["flow_type"] for f in model["flows"]}
        assert "flow" in flow_types
        assert "alternativeFlow" in flow_types
        assert "parallelFlow" in flow_types
        assert len(model["usages"]) == 1

    def test_session_id_returned(self):
        data = self._parse(FULL_FPB_SOURCE)
        assert "session_id" in data
        assert len(data["session_id"]) > 0

    def test_diagram_layout_returned(self):
        data = self._parse(FULL_FPB_SOURCE)
        diagram = data["diagram"]
        assert "elements" in diagram
        assert "connections" in diagram
        assert len(diagram["elements"]) > 0


# ---------------------------------------------------------------------------
# 2. Export endpoints
# ---------------------------------------------------------------------------
class TestExport:
    """Verify XML and text export from a parsed session."""

    @pytest.fixture(autouse=True)
    def _setup_session(self):
        resp = client.post("/api/parse", json={"source": FULL_FPB_SOURCE})
        self.session_id = resp.json()["session_id"]

    def test_export_xml_hsu_structure(self):
        """Verify XML export produces HSU FPD_Schema.xsd-compatible structure."""
        resp = client.post("/api/export/xml", json={"session_id": self.session_id})
        assert resp.status_code == 200
        assert "xml" in resp.headers["content-type"]
        content = resp.text
        root = etree.fromstring(content.encode("UTF-8"))
        ns = {"fpb": "http://www.vdivde.de/3682"}

        # Basic structure
        assert root.tag == "{http://www.vdivde.de/3682}project"
        assert root.find(".//fpb:process", ns) is not None

        # SystemLimit: HSU style with @id/@name (no nested identification)
        sl = root.find(".//fpb:systemLimit", ns)
        assert sl is not None
        assert sl.get("name") is not None
        assert sl.get("id") is not None

        # States with HSU-required children
        states = root.findall(".//fpb:states/fpb:state", ns)
        assert len(states) == 4
        for state in states:
            assert state.find("fpb:identification", ns) is not None
            assert state.find("fpb:characteristics", ns) is not None
            assert state.find("fpb:assignments", ns) is not None
            assert state.find("fpb:flows", ns) is not None
            # identification must have references child
            ident = state.find("fpb:identification", ns)
            assert ident.find("fpb:references", ns) is not None

        # ProcessOperators with usages
        pos = root.findall(".//fpb:processOperators/fpb:processOperator", ns)
        assert len(pos) == 1
        for po in pos:
            assert po.find("fpb:usages", ns) is not None
            assert po.find("fpb:flows", ns) is not None

        # TechnicalResources with usages
        trs = root.findall(".//fpb:technicalResources/fpb:technicalResource", ns)
        assert len(trs) == 1
        for tr in trs:
            assert tr.find("fpb:usages", ns) is not None

        # FlowContainer: registry-only (no sourceRef/targetRef children)
        fc_flows = root.findall(".//fpb:flowContainer/fpb:flow", ns)
        assert len(fc_flows) >= 1
        for fc_flow in fc_flows:
            assert fc_flow.find("fpb:sourceRef", ns) is None
            assert fc_flow.get("flowType") is not None

        # Verify entry/exit bindings exist on elements
        all_elem_flows = root.findall(".//fpb:flows/fpb:flow", ns)
        entries = [f for f in all_elem_flows if f.find("fpb:entry", ns) is not None]
        exits = [f for f in all_elem_flows if f.find("fpb:exit", ns) is not None]
        assert len(entries) > 0
        assert len(exits) > 0

    def test_export_text_fpb_content(self):
        resp = client.post("/api/export/text", json={"session_id": self.session_id})
        assert resp.status_code == 200
        content = resp.text
        assert "@startfpb" in content
        assert "@endfpb" in content
        assert "product p1" in content
        assert "energy e1" in content
        assert "information i1" in content
        assert "process_operator po1" in content
        assert "technical_resource tr1" in content
        assert "-->" in content
        assert "<..>" in content


# ---------------------------------------------------------------------------
# PDF Export tests
# ---------------------------------------------------------------------------
class TestExportPdf:
    """Verify PDF export functionality."""

    @pytest.fixture(autouse=True)
    def _setup_session(self):
        resp = client.post("/api/parse", json={"source": FULL_FPB_SOURCE})
        self.session_id = resp.json()["session_id"]

    def test_export_pdf_valid(self):
        """Verify PDF export returns valid PDF content."""
        resp = client.post("/api/export/pdf", json={"session_id": self.session_id})
        assert resp.status_code == 200
        assert "application/pdf" in resp.headers["content-type"]
        content = resp.content
        # PDF files start with %PDF- signature
        assert content.startswith(b"%PDF-")
        # Verify reasonable size (not empty, not error page)
        assert len(content) > 1000

    def test_export_pdf_empty_document(self):
        """Verify PDF export works with empty diagrams."""
        resp = client.post("/api/parse", json={"source": EMPTY_FPB_SOURCE})
        session_id = resp.json()["session_id"]
        pdf_resp = client.post("/api/export/pdf", json={"session_id": session_id})
        assert pdf_resp.status_code == 200
        assert pdf_resp.content.startswith(b"%PDF-")

    def test_export_pdf_invalid_session(self):
        """Verify PDF export fails gracefully with invalid session."""
        resp = client.post("/api/export/pdf", json={"session_id": "nonexistent"})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 3. Import round-trip: text
# ---------------------------------------------------------------------------
class TestImportTextRoundTrip:
    """Export as text, import back, verify equivalence."""

    def test_text_round_trip(self):
        # Parse original
        parse_resp = client.post("/api/parse", json={"source": FULL_FPB_SOURCE})
        session_id = parse_resp.json()["session_id"]
        original_model = parse_resp.json()["model"]

        # Export as text
        export_resp = client.post("/api/export/text", json={"session_id": session_id})
        exported_text = export_resp.text

        # Import the exported text
        file = io.BytesIO(exported_text.encode("UTF-8"))
        import_resp = client.post(
            "/api/import",
            files={"file": ("process.fpb", file, "text/plain")},
        )
        assert import_resp.status_code == 200
        imported = import_resp.json()

        # Verify source is returned
        assert "@startfpb" in imported["source"]
        assert "@endfpb" in imported["source"]

        # Verify model equivalence
        im = imported["model"]
        assert len(im["states"]) == len(original_model["states"])
        assert len(im["process_operators"]) == len(original_model["process_operators"])
        assert len(im["technical_resources"]) == len(original_model["technical_resources"])


# ---------------------------------------------------------------------------
# 4. Import round-trip: XML
# ---------------------------------------------------------------------------
class TestImportXmlRoundTrip:
    """Export as XML, import back, verify equivalence."""

    def test_xml_round_trip(self):
        # Parse original
        parse_resp = client.post("/api/parse", json={"source": FULL_FPB_SOURCE})
        session_id = parse_resp.json()["session_id"]
        original_model = parse_resp.json()["model"]

        # Export as XML
        export_resp = client.post("/api/export/xml", json={"session_id": session_id})
        exported_xml = export_resp.text

        # Import the exported XML
        file = io.BytesIO(exported_xml.encode("UTF-8"))
        import_resp = client.post(
            "/api/import",
            files={"file": ("process.xml", file, "application/xml")},
        )
        assert import_resp.status_code == 200
        imported = import_resp.json()

        # Verify FPB source regenerated
        assert "@startfpb" in imported["source"]

        # Verify model has same element counts
        im = imported["model"]
        assert len(im["states"]) == len(original_model["states"])
        assert len(im["process_operators"]) == len(original_model["process_operators"])
        assert len(im["technical_resources"]) == len(original_model["technical_resources"])


# ---------------------------------------------------------------------------
# 4b. Import legacy XML (backward compatibility)
# ---------------------------------------------------------------------------
class TestImportLegacyXml:
    """Verify importing old-format XML files (sourceRef/targetRef) still works."""

    LEGACY_XML = """\
<?xml version="1.0" encoding="UTF-8"?>
<fpb:project xmlns:fpb="http://www.vdivde.de/3682"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <fpb:projectInformation entryPoint="process_1"/>
  <fpb:process id="process_1">
    <fpb:systemLimit>
      <fpb:identification uniqueIdent="sl_1" longName="Legacy Process"/>
    </fpb:systemLimit>
    <fpb:states>
      <fpb:state stateType="product">
        <fpb:identification uniqueIdent="p1" longName="Input"/>
      </fpb:state>
      <fpb:state stateType="product">
        <fpb:identification uniqueIdent="p2" longName="Output"/>
      </fpb:state>
    </fpb:states>
    <fpb:processOperators>
      <fpb:processOperator>
        <fpb:identification uniqueIdent="po1" longName="Work"/>
      </fpb:processOperator>
    </fpb:processOperators>
    <fpb:technicalResources>
      <fpb:technicalResource>
        <fpb:identification uniqueIdent="tr1" longName="Machine"/>
      </fpb:technicalResource>
    </fpb:technicalResources>
    <fpb:flowContainer>
      <fpb:flow id="f1" flowType="flow">
        <fpb:sourceRef>p1</fpb:sourceRef>
        <fpb:targetRef>po1</fpb:targetRef>
      </fpb:flow>
      <fpb:flow id="f2" flowType="flow">
        <fpb:sourceRef>po1</fpb:sourceRef>
        <fpb:targetRef>p2</fpb:targetRef>
      </fpb:flow>
      <fpb:usage id="u1">
        <fpb:sourceRef>po1</fpb:sourceRef>
        <fpb:targetRef>tr1</fpb:targetRef>
      </fpb:usage>
    </fpb:flowContainer>
  </fpb:process>
</fpb:project>"""

    def test_legacy_xml_import(self):
        file = io.BytesIO(self.LEGACY_XML.encode("UTF-8"))
        resp = client.post(
            "/api/import",
            files={"file": ("legacy.xml", file, "application/xml")},
        )
        assert resp.status_code == 200
        im = resp.json()["model"]
        assert len(im["states"]) == 2
        assert len(im["process_operators"]) == 1
        assert len(im["technical_resources"]) == 1
        assert len(im["flows"]) == 2
        assert len(im["usages"]) == 1

    def test_legacy_xml_generates_fpb_text(self):
        file = io.BytesIO(self.LEGACY_XML.encode("UTF-8"))
        resp = client.post(
            "/api/import",
            files={"file": ("legacy.xml", file, "application/xml")},
        )
        source = resp.json()["source"]
        assert "@startfpb" in source
        assert "product p1" in source
        assert "-->" in source


# ---------------------------------------------------------------------------
# 5. Invalid connections - error messages
# ---------------------------------------------------------------------------
class TestInvalidConnections:
    """Verify validation errors for invalid VDI 3682 connections."""

    def test_state_to_state_flow_error(self):
        source = """\
@startfpb
product p1 "A"
product p2 "B"
p1 --> p2
@endfpb
"""
        resp = client.post("/api/parse", json={"source": source})
        assert resp.status_code == 200
        model = resp.json()["model"]
        assert len(model["errors"]) > 0
        assert any("State" in e and "ProcessOperator" in e for e in model["errors"])

    def test_tr_to_state_usage_error(self):
        source = """\
@startfpb
product p1 "A"
technical_resource tr1 "Machine"
p1 <..> tr1
@endfpb
"""
        resp = client.post("/api/parse", json={"source": source})
        model = resp.json()["model"]
        assert len(model["errors"]) > 0

    def test_undefined_element_reference(self):
        source = """\
@startfpb
product p1 "A"
p1 --> nonexistent
@endfpb
"""
        resp = client.post("/api/parse", json={"source": source})
        model = resp.json()["model"]
        assert len(model["errors"]) > 0


# ---------------------------------------------------------------------------
# 6. Empty document
# ---------------------------------------------------------------------------
class TestEmptyDocument:
    """Verify empty FPB document doesn't crash."""

    def test_empty_document_parses(self):
        resp = client.post("/api/parse", json={"source": EMPTY_FPB_SOURCE})
        assert resp.status_code == 200
        model = resp.json()["model"]
        assert model["states"] == []
        assert model["process_operators"] == []
        assert model["flows"] == []

    def test_empty_document_export_xml(self):
        resp = client.post("/api/parse", json={"source": EMPTY_FPB_SOURCE})
        session_id = resp.json()["session_id"]
        xml_resp = client.post("/api/export/xml", json={"session_id": session_id})
        assert xml_resp.status_code == 200
        assert "vdivde" in xml_resp.text


# ---------------------------------------------------------------------------
# 7. Large diagram (10+ elements)
# ---------------------------------------------------------------------------
class TestLargeDiagram:
    """Verify layout handles large diagrams."""

    def test_large_diagram_parses_and_exports(self):
        lines = ['@startfpb', 'title "Large Process"']
        for i in range(6):
            lines.append(f'product p{i} "Product {i}"')
        for i in range(3):
            lines.append(f'energy e{i} "Energy {i}"')
        for i in range(2):
            lines.append(f'information info{i} "Info {i}"')
        for i in range(3):
            lines.append(f'process_operator po{i} "Operator {i}"')
        for i in range(2):
            lines.append(f'technical_resource tr{i} "Resource {i}"')
        # Connect inputs to operators, operators to outputs
        for i in range(3):
            lines.append(f"p{i} --> po{i % 3}")
        for i in range(3):
            lines.append(f"e{i} --> po{i}")
        for i in range(3):
            lines.append(f"po{i} --> p{i + 3}")
        for i in range(2):
            lines.append(f"po{i} <..> tr{i}")
        lines.append("@endfpb")
        source = "\n".join(lines)

        # Parse
        resp = client.post("/api/parse", json={"source": source})
        assert resp.status_code == 200
        data = resp.json()
        model = data["model"]
        assert len(model["states"]) == 11  # 6 products + 3 energy + 2 info
        assert len(model["process_operators"]) == 3
        assert len(model["technical_resources"]) == 2

        diagram = data["diagram"]
        assert len(diagram["elements"]) >= 10


# ---------------------------------------------------------------------------
# 8. Health check
# ---------------------------------------------------------------------------
class TestHealth:
    def test_health_endpoint(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# 9. Session reuse
# ---------------------------------------------------------------------------
class TestSessionReuse:
    def test_session_reuse_on_reparse(self):
        resp1 = client.post("/api/parse", json={"source": FULL_FPB_SOURCE})
        sid = resp1.json()["session_id"]
        resp2 = client.post("/api/parse", json={"source": FULL_FPB_SOURCE, "session_id": sid})
        assert resp2.json()["session_id"] == sid


# ---------------------------------------------------------------------------
# 10. Export with invalid session
# ---------------------------------------------------------------------------
class TestExportErrors:
    def test_export_invalid_session(self):
        resp = client.post("/api/export/xml", json={"session_id": "nonexistent"})
        assert resp.status_code == 404
