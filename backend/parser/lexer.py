"""Lexer that tokenizes FPB text into a stream of typed tokens."""

from dataclasses import dataclass
from typing import Optional

from parser.syntax import (
    CONNECTION_OPERATORS_SORTED,
    CONNECTION_OPERATORS,
    END_DELIMITER,
    KEYWORDS,
    PLACEMENT_ANNOTATIONS,
    START_DELIMITER,
    TokenType,
)


@dataclass
class Token:
    """A single token produced by the lexer."""
    type: TokenType
    value: str
    line: int
    column: int


class LexerError(Exception):
    """Error raised during lexical analysis."""

    def __init__(self, message: str, line: int, column: int) -> None:
        self.line = line
        self.column = column
        super().__init__(f"Line {line}, Col {column}: {message}")


class Lexer:
    """Tokenizer for FPB text syntax."""

    def __init__(self, source: str) -> None:
        self.source = source
        self.pos = 0
        self.line = 1
        self.column = 1
        self.tokens: list[Token] = []

    def tokenize(self) -> list[Token]:
        """Tokenize the entire source into a list of tokens."""
        while self.pos < len(self.source):
            self._skip_whitespace()
            if self.pos >= len(self.source):
                break

            ch = self.source[self.pos]

            if ch == "\n":
                self._emit(TokenType.NEWLINE, "\n")
                self._advance()
                continue

            if ch == "/" and self._peek(1) == "/":
                self._read_comment()
                continue

            if ch == "@":
                self._read_delimiter()
                continue

            if ch == '"':
                self._read_string()
                continue

            if ch == "{":
                self._emit(TokenType.LBRACE, "{")
                self._advance()
                continue

            if ch == "}":
                self._emit(TokenType.RBRACE, "}")
                self._advance()
                continue

            # Try connection operators
            if self._try_connection_operator():
                continue

            # Identifier or keyword
            if ch.isalpha() or ch == "_":
                self._read_word()
                continue

            # Skip unknown characters
            self._advance()

        self.tokens.append(Token(TokenType.EOF, "", self.line, self.column))
        return self.tokens

    def _advance(self) -> str:
        """Advance position by one character and return it."""
        ch = self.source[self.pos]
        self.pos += 1
        if ch == "\n":
            self.line += 1
            self.column = 1
        else:
            self.column += 1
        return ch

    def _peek(self, offset: int = 0) -> Optional[str]:
        """Peek at a character at current position + offset."""
        idx = self.pos + offset
        if idx < len(self.source):
            return self.source[idx]
        return None

    def _emit(self, token_type: TokenType, value: str) -> None:
        """Add a token to the output list."""
        self.tokens.append(Token(token_type, value, self.line, self.column))

    def _skip_whitespace(self) -> None:
        """Skip spaces and tabs (not newlines)."""
        while self.pos < len(self.source) and self.source[self.pos] in (" ", "\t", "\r"):
            self._advance()

    def _read_comment(self) -> None:
        """Read a // comment to end of line."""
        start_col = self.column
        start_line = self.line
        self.pos += 2
        self.column += 2
        start = self.pos
        while self.pos < len(self.source) and self.source[self.pos] != "\n":
            self.pos += 1
            self.column += 1
        value = "//" + self.source[start:self.pos]
        self.tokens.append(Token(TokenType.COMMENT, value.strip(), start_line, start_col))

    def _read_delimiter(self) -> None:
        """Read @startfpb, @endfpb delimiter or @annotation token."""
        start_col = self.column
        for delim, ttype in [(START_DELIMITER, TokenType.START_FPB), (END_DELIMITER, TokenType.END_FPB)]:
            if self.source[self.pos:self.pos + len(delim)] == delim:
                self._emit(ttype, delim)
                for _ in range(len(delim)):
                    self._advance()
                return
        # Check placement annotations
        for annotation in PLACEMENT_ANNOTATIONS:
            if self.source[self.pos:self.pos + len(annotation)] == annotation:
                end_pos = self.pos + len(annotation)
                if end_pos >= len(self.source) or not self.source[end_pos].isalnum():
                    self._emit(TokenType.ANNOTATION, annotation)
                    for _ in range(len(annotation)):
                        self._advance()
                    return
        # Unknown @ token - skip
        self._advance()

    def _read_string(self) -> None:
        """Read a double-quoted string literal."""
        start_col = self.column
        start_line = self.line
        self._advance()  # skip opening quote
        start = self.pos
        while self.pos < len(self.source) and self.source[self.pos] != '"' and self.source[self.pos] != "\n":
            self.pos += 1
            self.column += 1
        value = self.source[start:self.pos]
        if self.pos < len(self.source) and self.source[self.pos] == '"':
            self.pos += 1
            self.column += 1
        self.tokens.append(Token(TokenType.STRING, value, start_line, start_col))

    def _try_connection_operator(self) -> bool:
        """Try to match a connection operator at current position."""
        remaining = self.source[self.pos:]
        for op in CONNECTION_OPERATORS_SORTED:
            if remaining.startswith(op):
                token_type = CONNECTION_OPERATORS[op]
                self._emit(token_type, op)
                for _ in range(len(op)):
                    self._advance()
                return True
        return False

    def _read_word(self) -> None:
        """Read an identifier or keyword."""
        start_col = self.column
        start_line = self.line
        start = self.pos
        while self.pos < len(self.source) and (self.source[self.pos].isalnum() or self.source[self.pos] == "_"):
            self.pos += 1
            self.column += 1
        word = self.source[start:self.pos]
        if word in KEYWORDS:
            self.tokens.append(Token(TokenType.KEYWORD, word, start_line, start_col))
        else:
            self.tokens.append(Token(TokenType.IDENTIFIER, word, start_line, start_col))
