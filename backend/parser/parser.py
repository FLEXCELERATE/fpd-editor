"""Parser that converts a token stream into a ProcessModel."""

from models.fpb_model import (
    Flow,
    FlowType,
    Identification,
    ProcessOperator,
    State,
    StatePlacement,
    StateType,
    TechnicalResource,
    Usage,
)
from models.fpb_model import SystemLimit
from models.process_model import ProcessModel
from parser.lexer import Lexer, Token
from parser.syntax import ELEMENT_KEYWORDS, TokenType


class ParseError(Exception):
    """Error raised during parsing."""

    def __init__(self, message: str, line: int = 0, column: int = 0) -> None:
        self.line = line
        self.column = column
        super().__init__(f"Line {line}, Col {column}: {message}")


# Maps element keywords to StateType values
_STATE_KEYWORD_MAP = {
    "product": StateType.PRODUCT,
    "energy": StateType.ENERGY,
    "information": StateType.INFORMATION,
}

# Maps connection token types to FlowType values
_FLOW_TOKEN_MAP = {
    TokenType.FLOW: FlowType.FLOW,
    TokenType.ALTERNATIVE_FLOW: FlowType.ALTERNATIVE_FLOW,
    TokenType.PARALLEL_FLOW: FlowType.PARALLEL_FLOW,
}


class FpbParser:
    """Parser that converts FPB text into a ProcessModel."""

    def __init__(self, source: str) -> None:
        self.source = source
        self.tokens: list[Token] = []
        self.pos = 0
        self.model = ProcessModel()
        self._element_ids: dict[str, str] = {}  # id -> element type keyword
        self._flow_counter = 0
        self._usage_counter = 0
        self._current_system_id: str | None = None
        self._system_counter = 0

    def parse(self) -> ProcessModel:
        """Parse the source text and return a ProcessModel."""
        self.tokens = Lexer(self.source).tokenize()
        self.pos = 0

        self._skip_trivial()
        self._expect(TokenType.START_FPB)
        self._skip_trivial()

        while not self._check(TokenType.END_FPB) and not self._check(TokenType.EOF):
            self._parse_statement()
            self._skip_trivial()

        if self._check(TokenType.END_FPB):
            self._advance()
        else:
            self.model.errors.append("Missing @endfpb delimiter")

        return self.model

    # -- Statement dispatch --

    def _parse_statement(self) -> None:
        """Parse a single statement."""
        token = self._current()

        if token.type == TokenType.COMMENT:
            self._advance()
            return

        if token.type == TokenType.KEYWORD:
            if token.value == "title":
                self._parse_title()
            elif token.value == "system":
                self._parse_system_block()
            elif token.value in ELEMENT_KEYWORDS:
                self._parse_element_decl()
            else:
                self.model.errors.append(
                    f"Line {token.line}: Unknown keyword '{token.value}'"
                )
                self._advance()
            return

        if token.type == TokenType.IDENTIFIER:
            self._parse_connection()
            return

        # Skip unexpected tokens
        self._advance()

    # -- Title --

    def _parse_title(self) -> None:
        """Parse: title STRING"""
        if self._current_system_id is not None:
            self.model.errors.append(
                f"Line {self._current().line}: title cannot be used inside a system block"
            )
            self._advance()
            return
        self._advance()  # consume 'title'
        if self._check(TokenType.STRING):
            self.model.title = self._current().value
            self._advance()
        else:
            self.model.errors.append(
                f"Line {self._current().line}: Expected string after 'title'"
            )

    # -- System blocks --

    def _parse_system_block(self) -> None:
        """Parse: system STRING { Statement* }"""
        system_token = self._current()
        self._advance()  # consume 'system'

        if not self._check(TokenType.STRING):
            self.model.errors.append(
                f"Line {system_token.line}: Expected string after 'system'"
            )
            return

        system_name = self._current().value
        self._advance()

        if not self._check(TokenType.LBRACE):
            self.model.errors.append(
                f"Line {system_token.line}: Expected '{{' after system name"
            )
            return
        self._advance()  # consume '{'

        self._system_counter += 1
        system_id = f"system_{self._system_counter}"

        ident = Identification(unique_ident=system_id, long_name=system_name)
        self.model.system_limits.append(
            SystemLimit(
                id=system_id,
                identification=ident,
                label=system_name,
                line_number=system_token.line,
            )
        )

        self._current_system_id = system_id
        self._skip_trivial()

        while not self._check(TokenType.RBRACE) and not self._check(TokenType.EOF) and not self._check(TokenType.END_FPB):
            self._parse_statement()
            self._skip_trivial()

        if self._check(TokenType.RBRACE):
            self._advance()
        else:
            self.model.errors.append(
                f"Line {system_token.line}: Missing '}}' for system '{system_name}'"
            )

        self._current_system_id = None

    # -- Element declarations --

    def _parse_element_decl(self) -> None:
        """Parse: element_type IDENTIFIER STRING? ANNOTATION?"""
        keyword_token = self._current()
        keyword = keyword_token.value
        self._advance()  # consume keyword

        if not self._check(TokenType.IDENTIFIER):
            self.model.errors.append(
                f"Line {keyword_token.line}: Expected identifier after '{keyword}'"
            )
            return

        elem_id = self._current().value
        self._advance()

        # Check for duplicate ID
        if elem_id in self._element_ids:
            self.model.errors.append(
                f"Line {keyword_token.line}: Duplicate element ID '{elem_id}'"
            )
            return

        # Optional label
        label = elem_id
        if self._check(TokenType.STRING):
            label = self._current().value
            self._advance()

        # Optional placement annotation
        placement = None
        if self._check(TokenType.ANNOTATION):
            annotation_value = self._current().value
            self._advance()
            if keyword in _STATE_KEYWORD_MAP:
                _ANNOTATION_MAP = {
                    "@boundary": StatePlacement.BOUNDARY,
                    "@boundary-top": StatePlacement.BOUNDARY_TOP,
                    "@boundary-bottom": StatePlacement.BOUNDARY_BOTTOM,
                    "@boundary-left": StatePlacement.BOUNDARY_LEFT,
                    "@boundary-right": StatePlacement.BOUNDARY_RIGHT,
                    "@internal": StatePlacement.INTERNAL,
                }
                placement = _ANNOTATION_MAP.get(annotation_value)
            else:
                self.model.warnings.append(
                    f"Line {keyword_token.line}: Placement annotation "
                    f"'{annotation_value}' ignored on '{keyword}' "
                    f"(only valid on state elements)"
                )

        ident = Identification(unique_ident=elem_id, long_name=label)
        self._element_ids[elem_id] = keyword

        if keyword in _STATE_KEYWORD_MAP:
            self.model.states.append(
                State(
                    id=elem_id,
                    state_type=_STATE_KEYWORD_MAP[keyword],
                    identification=ident,
                    label=label,
                    placement=placement,
                    line_number=keyword_token.line,
                    system_id=self._current_system_id,
                )
            )
        elif keyword == "process_operator":
            self.model.process_operators.append(
                ProcessOperator(
                    id=elem_id,
                    identification=ident,
                    label=label,
                    line_number=keyword_token.line,
                    system_id=self._current_system_id,
                )
            )
        elif keyword == "technical_resource":
            self.model.technical_resources.append(
                TechnicalResource(
                    id=elem_id,
                    identification=ident,
                    label=label,
                    line_number=keyword_token.line,
                    system_id=self._current_system_id,
                )
            )

    # -- Connections --

    def _parse_connection(self) -> None:
        """Parse: IDENTIFIER connector IDENTIFIER"""
        source_token = self._current()
        source_id = source_token.value
        self._advance()

        token = self._current()
        if token.type == TokenType.USAGE:
            self._advance()
            if not self._check(TokenType.IDENTIFIER):
                self.model.errors.append(
                    f"Line {source_token.line}: Expected identifier after connection operator"
                )
                return
            target_id = self._current().value
            self._advance()

            if source_id not in self._element_ids:
                self.model.errors.append(
                    f"Line {source_token.line}: Element '{source_id}' is not defined"
                )
                return
            if target_id not in self._element_ids:
                self.model.errors.append(
                    f"Line {source_token.line}: Element '{target_id}' is not defined"
                )
                return

            self._usage_counter += 1
            self.model.usages.append(
                Usage(
                    id=f"usage_{self._usage_counter}",
                    process_operator_ref=source_id,
                    technical_resource_ref=target_id,
                    line_number=source_token.line,
                    system_id=self._current_system_id,
                )
            )

        elif token.type in _FLOW_TOKEN_MAP:
            flow_type = _FLOW_TOKEN_MAP[token.type]
            self._advance()

            if not self._check(TokenType.IDENTIFIER):
                self.model.errors.append(
                    f"Line {source_token.line}: Expected identifier after connection operator"
                )
                return
            target_id = self._current().value
            self._advance()

            if source_id not in self._element_ids:
                self.model.errors.append(
                    f"Line {source_token.line}: Element '{source_id}' is not defined"
                )
                return
            if target_id not in self._element_ids:
                self.model.errors.append(
                    f"Line {source_token.line}: Element '{target_id}' is not defined"
                )
                return

            self._flow_counter += 1
            self.model.flows.append(
                Flow(
                    id=f"flow_{self._flow_counter}",
                    source_ref=source_id,
                    target_ref=target_id,
                    flow_type=flow_type,
                    line_number=source_token.line,
                    system_id=self._current_system_id,
                )
            )

        else:
            self.model.errors.append(
                f"Line {source_token.line}: Expected connection operator after '{source_id}'"
            )

    # -- Token helpers --

    def _current(self) -> Token:
        """Return the current token."""
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return Token(TokenType.EOF, "", 0, 0)

    def _check(self, token_type: TokenType) -> bool:
        """Check if current token matches the given type."""
        return self._current().type == token_type

    def _advance(self) -> Token:
        """Advance to next token and return the consumed one."""
        token = self._current()
        if self.pos < len(self.tokens):
            self.pos += 1
        return token

    def _expect(self, token_type: TokenType) -> Token:
        """Consume a token of the expected type or record an error."""
        if self._check(token_type):
            return self._advance()
        token = self._current()
        self.model.errors.append(
            f"Line {token.line}: Expected {token_type.value}, got {token.type.value}"
        )
        return token

    def _skip_trivial(self) -> None:
        """Skip newlines and comments."""
        while self._current().type in (TokenType.NEWLINE, TokenType.COMMENT):
            self._advance()
