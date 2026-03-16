/** Syntax constants and grammar rules for the FPD text language. */

export enum TokenType {
    START_FPD = 'START_FPD',
    END_FPD = 'END_FPD',
    KEYWORD = 'KEYWORD',
    IDENTIFIER = 'IDENTIFIER',
    STRING = 'STRING',
    FLOW = 'FLOW',
    ALTERNATIVE_FLOW = 'ALTERNATIVE_FLOW',
    PARALLEL_FLOW = 'PARALLEL_FLOW',
    USAGE = 'USAGE',
    ANNOTATION = 'ANNOTATION',
    COMMENT = 'COMMENT',
    LBRACE = 'LBRACE',
    RBRACE = 'RBRACE',
    NEWLINE = 'NEWLINE',
    EOF = 'EOF',
}

/** Block delimiters */
export const START_DELIMITER = '@startfpd';
export const END_DELIMITER = '@endfpd';

/** Element keywords */
export const ELEMENT_KEYWORDS: ReadonlySet<string> = new Set([
    'product',
    'energy',
    'information',
    'process_operator',
    'technical_resource',
]);

/** Other keywords */
const OTHER_KEYWORDS: ReadonlySet<string> = new Set([
    'title',
    'system',
]);

/** All keywords */
export const KEYWORDS: ReadonlySet<string> = new Set([
    ...ELEMENT_KEYWORDS,
    ...OTHER_KEYWORDS,
]);

/** Placement annotations for states */
export const PLACEMENT_ANNOTATIONS: ReadonlySet<string> = new Set([
    '@boundary',
    '@boundary-top',
    '@boundary-bottom',
    '@boundary-left',
    '@boundary-right',
    '@internal',
]);

/** Connection operators mapped to token types */
export const CONNECTION_OPERATORS: ReadonlyMap<string, TokenType> = new Map([
    ['-->', TokenType.FLOW],
    ['-.->',TokenType.ALTERNATIVE_FLOW],
    ['==>', TokenType.PARALLEL_FLOW],
    ['<..>', TokenType.USAGE],
]);

/** Sorted by length descending for greedy matching */
export const CONNECTION_OPERATORS_SORTED: readonly string[] =
    [...CONNECTION_OPERATORS.keys()].sort((a, b) => b.length - a.length);
