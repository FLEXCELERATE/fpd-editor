"""Unit tests for lexer, parser, and validator with multi-system support."""

import pytest

from parser.lexer import Lexer, Token
from parser.parser import FpdParser, ParseError
from parser.syntax import TokenType
from parser.validator import validate_connections


# ---------------------------------------------------------------------------
# Lexer token tests
# ---------------------------------------------------------------------------
class TestLexerTokens:
    """Verify that the lexer produces correct tokens for all syntax elements."""

    def _token_types(self, source: str) -> list[tuple[str, str]]:
        tokens = Lexer(source).tokenize()
        return [(t.type.value, t.value) for t in tokens]

    def test_start_end_delimiters(self):
        tokens = self._token_types("@startfpd\n@endfpd")
        assert ("START_FPD", "@startfpd") in tokens
        assert ("END_FPD", "@endfpd") in tokens

    def test_element_keywords(self):
        tokens = self._token_types("product energy information process_operator technical_resource")
        keywords = [v for t, v in tokens if t == "KEYWORD"]
        assert "product" in keywords
        assert "energy" in keywords
        assert "information" in keywords
        assert "process_operator" in keywords
        assert "technical_resource" in keywords

    def test_system_keyword(self):
        tokens = self._token_types('system "Test" { }')
        assert ("KEYWORD", "system") in tokens
        assert ("LBRACE", "{") in tokens
        assert ("RBRACE", "}") in tokens

    def test_string_token(self):
        tokens = self._token_types('"Hello World"')
        assert ("STRING", "Hello World") in tokens

    def test_identifier_token(self):
        tokens = self._token_types("myVar")
        assert ("IDENTIFIER", "myVar") in tokens

    def test_connection_operators(self):
        tokens = self._token_types("--> -.-> ==> <..>")
        types = [t for t, _ in tokens if t not in ("NEWLINE", "EOF")]
        assert "FLOW" in types
        assert "ALTERNATIVE_FLOW" in types
        assert "PARALLEL_FLOW" in types
        assert "USAGE" in types

    def test_comment_token(self):
        tokens = self._token_types("// this is a comment")
        assert any(t == "COMMENT" for t, _ in tokens)

    def test_braces_in_full_source(self):
        source = '@startfpd\nsystem "S" {\n  product p1 "X"\n}\n@endfpd'
        tokens = self._token_types(source)
        assert ("LBRACE", "{") in tokens
        assert ("RBRACE", "}") in tokens


# ---------------------------------------------------------------------------
# Parser: system block tests
# ---------------------------------------------------------------------------
class TestParserSystemBlocks:
    """Verify that system blocks are parsed correctly."""

    def test_single_system_block(self):
        source = """@startfpd
system "Manufacturing" {
  product p1 "Steel"
  process_operator po1 "Cutting"
  p1 --> po1
}
@endfpd"""
        model = FpdParser(source).parse()
        assert len(model.errors) == 0
        assert len(model.system_limits) == 1
        assert model.system_limits[0].label == "Manufacturing"
        assert len(model.states) == 1
        assert model.states[0].system_id == model.system_limits[0].id
        assert len(model.process_operators) == 1
        assert model.process_operators[0].system_id == model.system_limits[0].id
        assert len(model.flows) == 1
        assert model.flows[0].system_id == model.system_limits[0].id

    def test_multiple_system_blocks(self):
        source = """@startfpd
system "System A" {
  product p1 "Input"
  process_operator po1 "Process"
  p1 --> po1
}
system "System B" {
  product p2 "Input B"
  process_operator po2 "Process B"
  p2 --> po2
}
@endfpd"""
        model = FpdParser(source).parse()
        assert len(model.errors) == 0
        assert len(model.system_limits) == 2
        assert model.system_limits[0].label == "System A"
        assert model.system_limits[1].label == "System B"
        # Elements assigned to correct systems
        assert model.states[0].system_id == model.system_limits[0].id
        assert model.states[1].system_id == model.system_limits[1].id

    def test_system_with_all_element_types(self):
        source = """@startfpd
system "Full" {
  product p1 "Material"
  energy e1 "Power"
  information i1 "Signal"
  process_operator po1 "Transform"
  technical_resource tr1 "Machine"
  p1 --> po1
  e1 --> po1
  i1 --> po1
  po1 <..> tr1
}
@endfpd"""
        model = FpdParser(source).parse()
        assert len(model.errors) == 0
        assert len(model.states) == 3
        assert len(model.process_operators) == 1
        assert len(model.technical_resources) == 1
        assert len(model.flows) == 3
        assert len(model.usages) == 1
        sys_id = model.system_limits[0].id
        for s in model.states:
            assert s.system_id == sys_id
        assert model.technical_resources[0].system_id == sys_id
        assert model.usages[0].system_id == sys_id


# ---------------------------------------------------------------------------
# Parser: backward compatibility
# ---------------------------------------------------------------------------
class TestBackwardCompatibility:
    """Verify that documents without system blocks still work."""

    def test_no_system_blocks(self):
        source = """@startfpd
title "Legacy"
product p1 "Input"
process_operator po1 "Work"
p1 --> po1
@endfpd"""
        model = FpdParser(source).parse()
        assert len(model.errors) == 0
        assert len(model.system_limits) == 0
        assert model.title == "Legacy"
        assert len(model.states) == 1
        assert model.states[0].system_id is None
        assert len(model.process_operators) == 1
        assert model.process_operators[0].system_id is None
        assert len(model.flows) == 1
        assert model.flows[0].system_id is None

    def test_empty_document(self):
        source = "@startfpd\n@endfpd"
        model = FpdParser(source).parse()
        assert len(model.errors) == 0
        assert len(model.system_limits) == 0
        assert len(model.states) == 0

    def test_title_outside_system(self):
        source = """@startfpd
title "My Process"
system "S1" {
  product p1 "X"
}
@endfpd"""
        model = FpdParser(source).parse()
        assert len(model.errors) == 0
        assert model.title == "My Process"


# ---------------------------------------------------------------------------
# Parser: empty system blocks
# ---------------------------------------------------------------------------
class TestEmptySystemBlocks:
    """Verify that empty system blocks are handled."""

    def test_empty_system_block(self):
        source = """@startfpd
system "Empty" {
}
@endfpd"""
        model = FpdParser(source).parse()
        assert len(model.errors) == 0
        assert len(model.system_limits) == 1
        assert model.system_limits[0].label == "Empty"
        assert len(model.states) == 0

    def test_multiple_empty_systems(self):
        source = """@startfpd
system "A" {
}
system "B" {
}
@endfpd"""
        model = FpdParser(source).parse()
        assert len(model.errors) == 0
        assert len(model.system_limits) == 2


# ---------------------------------------------------------------------------
# Parser: title inside system error
# ---------------------------------------------------------------------------
class TestTitleInsideSystemError:
    """Verify that title inside a system block produces an error."""

    def test_title_inside_system_block(self):
        source = """@startfpd
system "S1" {
  title "Bad Title"
}
@endfpd"""
        model = FpdParser(source).parse()
        assert len(model.errors) == 1
        assert "title cannot be used inside a system block" in model.errors[0]

    def test_title_not_set_when_inside_system(self):
        source = """@startfpd
system "S1" {
  title "Bad Title"
}
@endfpd"""
        model = FpdParser(source).parse()
        assert model.title == "Untitled Process"


# ---------------------------------------------------------------------------
# Parser: error cases
# ---------------------------------------------------------------------------
class TestParserErrors:
    """Verify parser error handling."""

    def test_missing_system_name(self):
        source = """@startfpd
system {
}
@endfpd"""
        model = FpdParser(source).parse()
        assert any("Expected string after 'system'" in e for e in model.errors)

    def test_missing_opening_brace(self):
        source = """@startfpd
system "Test"
  product p1 "X"
}
@endfpd"""
        model = FpdParser(source).parse()
        assert any("Expected '{'" in e for e in model.errors)

    def test_missing_closing_brace(self):
        source = """@startfpd
system "Test" {
  product p1 "X"
@endfpd"""
        model = FpdParser(source).parse()
        assert any("Missing '}'" in e for e in model.errors)

    def test_duplicate_element_id(self):
        source = """@startfpd
product p1 "A"
product p1 "B"
@endfpd"""
        model = FpdParser(source).parse()
        assert any("Duplicate element ID 'p1'" in e for e in model.errors)


# ---------------------------------------------------------------------------
# Validator: cross-system validation
# ---------------------------------------------------------------------------
class TestCrossSystemValidation:
    """Verify cross-system connection rules."""

    def _make_ident(self, uid, name=None):
        from models.fpd_model import Identification
        return Identification(unique_ident=uid, long_name=name or uid)

    def test_cross_system_state_to_state_valid(self):
        """State -> State across systems (outside system blocks) is allowed."""
        from models.process_model import ProcessModel
        from models.fpd_model import Flow, FlowType, State, StateType, SystemLimit

        model = ProcessModel(
            system_limits=[
                SystemLimit(id="sys_1", identification=self._make_ident("sys_1", "A"), label="A"),
                SystemLimit(id="sys_2", identification=self._make_ident("sys_2", "B"), label="B"),
            ],
            states=[
                State(id="p1", state_type=StateType.PRODUCT, identification=self._make_ident("p1", "Output"), label="Output", system_id="sys_1"),
                State(id="p2", state_type=StateType.PRODUCT, identification=self._make_ident("p2", "Input"), label="Input", system_id="sys_2"),
            ],
            flows=[
                Flow(id="flow_1", source_ref="p1", target_ref="p2", flow_type=FlowType.FLOW, system_id=None),
            ],
        )
        errors = validate_connections(model)
        assert len(errors) == 0

    def test_state_to_state_same_system_invalid(self):
        """State -> State within the same system is not allowed."""
        from models.process_model import ProcessModel
        from models.fpd_model import Flow, FlowType, State, StateType, SystemLimit

        model = ProcessModel(
            system_limits=[
                SystemLimit(id="sys_1", identification=self._make_ident("sys_1", "A"), label="A"),
            ],
            states=[
                State(id="p1", state_type=StateType.PRODUCT, identification=self._make_ident("p1"), label="P1", system_id="sys_1"),
                State(id="p2", state_type=StateType.PRODUCT, identification=self._make_ident("p2"), label="P2", system_id="sys_1"),
            ],
            flows=[
                Flow(id="flow_1", source_ref="p1", target_ref="p2", flow_type=FlowType.FLOW, system_id=None),
            ],
        )
        errors = validate_connections(model)
        assert any("State -> State" in e for e in errors)

    def test_state_to_state_inside_system_block_invalid(self):
        """State -> State inside a system block (system_id set) is not allowed."""
        from models.process_model import ProcessModel
        from models.fpd_model import Flow, FlowType, State, StateType, SystemLimit

        model = ProcessModel(
            system_limits=[
                SystemLimit(id="sys_1", identification=self._make_ident("sys_1", "A"), label="A"),
                SystemLimit(id="sys_2", identification=self._make_ident("sys_2", "B"), label="B"),
            ],
            states=[
                State(id="p1", state_type=StateType.PRODUCT, identification=self._make_ident("p1"), label="P1", system_id="sys_1"),
                State(id="p2", state_type=StateType.PRODUCT, identification=self._make_ident("p2"), label="P2", system_id="sys_2"),
            ],
            flows=[
                Flow(id="flow_1", source_ref="p1", target_ref="p2", flow_type=FlowType.FLOW, system_id="sys_1"),
            ],
        )
        errors = validate_connections(model)
        assert any("State -> State" in e for e in errors)

    def test_cross_system_state_to_po_error(self):
        """State -> ProcessOperator across systems should produce an error."""
        from models.process_model import ProcessModel
        from models.fpd_model import Flow, FlowType, ProcessOperator, State, StateType, SystemLimit

        model = ProcessModel(
            system_limits=[
                SystemLimit(id="sys_1", identification=self._make_ident("sys_1", "A"), label="A"),
                SystemLimit(id="sys_2", identification=self._make_ident("sys_2", "B"), label="B"),
            ],
            states=[
                State(id="p1", state_type=StateType.PRODUCT, identification=self._make_ident("p1", "Input"), label="Input", system_id="sys_1"),
            ],
            process_operators=[
                ProcessOperator(id="po1", identification=self._make_ident("po1", "Work"), label="Work", system_id="sys_2"),
            ],
            flows=[
                Flow(id="flow_1", source_ref="p1", target_ref="po1", flow_type=FlowType.FLOW),
            ],
        )
        errors = validate_connections(model)
        assert any("cross-system reference" in e for e in errors)

    def test_same_system_flow_valid(self):
        """State -> PO within the same system is valid."""
        from models.process_model import ProcessModel
        from models.fpd_model import Flow, FlowType, ProcessOperator, State, StateType, SystemLimit

        model = ProcessModel(
            system_limits=[SystemLimit(id="sys_1", identification=self._make_ident("sys_1", "A"), label="A")],
            states=[
                State(id="p1", state_type=StateType.PRODUCT, identification=self._make_ident("p1", "Input"), label="Input", system_id="sys_1"),
            ],
            process_operators=[
                ProcessOperator(id="po1", identification=self._make_ident("po1", "Work"), label="Work", system_id="sys_1"),
            ],
            flows=[
                Flow(id="flow_1", source_ref="p1", target_ref="po1", flow_type=FlowType.FLOW),
            ],
        )
        errors = validate_connections(model)
        assert len(errors) == 0

    def test_cross_system_usage_error(self):
        """Usage across systems should produce an error."""
        from models.process_model import ProcessModel
        from models.fpd_model import ProcessOperator, SystemLimit, TechnicalResource, Usage

        model = ProcessModel(
            system_limits=[
                SystemLimit(id="sys_1", identification=self._make_ident("sys_1", "A"), label="A"),
                SystemLimit(id="sys_2", identification=self._make_ident("sys_2", "B"), label="B"),
            ],
            process_operators=[
                ProcessOperator(id="po1", identification=self._make_ident("po1", "Work"), label="Work", system_id="sys_1"),
            ],
            technical_resources=[
                TechnicalResource(id="tr1", identification=self._make_ident("tr1", "Machine"), label="Machine", system_id="sys_2"),
            ],
            usages=[
                Usage(id="usage_1", process_operator_ref="po1", technical_resource_ref="tr1"),
            ],
        )
        errors = validate_connections(model)
        assert any("cross-system reference" in e for e in errors)

    def test_no_system_elements_valid(self):
        """Elements without system_id (backward compat) should validate fine."""
        from models.process_model import ProcessModel
        from models.fpd_model import Flow, FlowType, State, StateType, ProcessOperator

        model = ProcessModel(
            states=[
                State(id="p1", state_type=StateType.PRODUCT, identification=self._make_ident("p1", "Input"), label="Input"),
            ],
            process_operators=[
                ProcessOperator(id="po1", identification=self._make_ident("po1", "Work"), label="Work"),
            ],
            flows=[
                Flow(id="flow_1", source_ref="p1", target_ref="po1", flow_type=FlowType.FLOW),
            ],
        )
        errors = validate_connections(model)
        assert len(errors) == 0
