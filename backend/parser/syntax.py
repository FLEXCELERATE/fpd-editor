"""Syntax constants and grammar rules for the FPB text language."""

from enum import Enum


class TokenType(str, Enum):
    """Token types produced by the FPB lexer."""
    START_FPB = "START_FPB"
    END_FPB = "END_FPB"
    KEYWORD = "KEYWORD"
    IDENTIFIER = "IDENTIFIER"
    STRING = "STRING"
    FLOW = "FLOW"
    ALTERNATIVE_FLOW = "ALTERNATIVE_FLOW"
    PARALLEL_FLOW = "PARALLEL_FLOW"
    USAGE = "USAGE"
    ANNOTATION = "ANNOTATION"
    COMMENT = "COMMENT"
    LBRACE = "LBRACE"
    RBRACE = "RBRACE"
    NEWLINE = "NEWLINE"
    EOF = "EOF"


# Block delimiters
START_DELIMITER = "@startfpb"
END_DELIMITER = "@endfpb"

# Element keywords
ELEMENT_KEYWORDS = frozenset({
    "product",
    "energy",
    "information",
    "process_operator",
    "technical_resource",
})

# Other keywords
OTHER_KEYWORDS = frozenset({
    "title",
    "system",
})

# All keywords
KEYWORDS = ELEMENT_KEYWORDS | OTHER_KEYWORDS

# Placement annotations for states
PLACEMENT_ANNOTATIONS = frozenset({
    "@boundary",
    "@boundary-top",
    "@boundary-bottom",
    "@boundary-left",
    "@boundary-right",
    "@internal",
})

# Connection operators mapped to token types
CONNECTION_OPERATORS = {
    "-->": TokenType.FLOW,
    "-.->": TokenType.ALTERNATIVE_FLOW,
    "==>": TokenType.PARALLEL_FLOW,
    "<..>": TokenType.USAGE,
}

# Sorted by length descending for greedy matching
CONNECTION_OPERATORS_SORTED = sorted(
    CONNECTION_OPERATORS.keys(), key=len, reverse=True
)
