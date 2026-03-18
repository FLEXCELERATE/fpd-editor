/** Lexer that tokenizes FPD text into a stream of typed tokens. */

import {
    CONNECTION_OPERATORS,
    CONNECTION_OPERATORS_SORTED,
    END_DELIMITER,
    KEYWORDS,
    PLACEMENT_ANNOTATIONS,
    START_DELIMITER,
    TokenType,
} from './syntax';

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    column: number;
}

export class LexerError extends Error {
    line: number;
    column: number;

    constructor(message: string, line: number, column: number) {
        super(`Line ${line}, Col ${column}: ${message}`);
        this.line = line;
        this.column = column;
    }
}

export class Lexer {
    private source: string;
    private pos = 0;
    private line = 1;
    private column = 1;
    private tokens: Token[] = [];

    constructor(source: string) {
        this.source = source;
    }

    tokenize(): Token[] {
        while (this.pos < this.source.length) {
            this.skipWhitespace();
            if (this.pos >= this.source.length) {
                break;
            }

            const ch = this.source[this.pos];

            if (ch === '\n') {
                this.emit(TokenType.NEWLINE, '\n');
                this.advance();
                continue;
            }

            if (ch === '/' && this.peek(1) === '/') {
                this.readComment();
                continue;
            }

            if (ch === '@') {
                this.readDelimiter();
                continue;
            }

            if (ch === '"') {
                this.readString();
                continue;
            }

            if (ch === '{') {
                this.emit(TokenType.LBRACE, '{');
                this.advance();
                continue;
            }

            if (ch === '}') {
                this.emit(TokenType.RBRACE, '}');
                this.advance();
                continue;
            }

            if (this.tryConnectionOperator()) {
                continue;
            }

            if (this.isAlpha(ch) || ch === '_') {
                this.readWord();
                continue;
            }

            // Skip unknown characters
            this.advance();
        }

        this.tokens.push({ type: TokenType.EOF, value: '', line: this.line, column: this.column });
        return this.tokens;
    }

    private advance(): string {
        const ch = this.source[this.pos];
        this.pos++;
        if (ch === '\n') {
            this.line++;
            this.column = 1;
        } else {
            this.column++;
        }
        return ch;
    }

    private peek(offset: number = 0): string | undefined {
        const idx = this.pos + offset;
        if (idx < this.source.length) {
            return this.source[idx];
        }
        return undefined;
    }

    private emit(tokenType: TokenType, value: string): void {
        this.tokens.push({ type: tokenType, value, line: this.line, column: this.column });
    }

    private skipWhitespace(): void {
        while (this.pos < this.source.length) {
            const ch = this.source[this.pos];
            if (ch === ' ' || ch === '\t' || ch === '\r') {
                this.advance();
            } else {
                break;
            }
        }
    }

    private readComment(): void {
        const startCol = this.column;
        const startLine = this.line;
        this.pos += 2;
        this.column += 2;
        const start = this.pos;
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
            this.pos++;
            this.column++;
        }
        const value = '//' + this.source.substring(start, this.pos);
        this.tokens.push({ type: TokenType.COMMENT, value: value.trim(), line: startLine, column: startCol });
    }

    private readDelimiter(): void {
        const delimiters: [string, TokenType][] = [
            [START_DELIMITER, TokenType.START_FPD],
            [END_DELIMITER, TokenType.END_FPD],
        ];

        for (const [delim, ttype] of delimiters) {
            if (this.source.substring(this.pos, this.pos + delim.length) === delim) {
                this.emit(ttype, delim);
                for (let i = 0; i < delim.length; i++) {
                    this.advance();
                }
                return;
            }
        }

        // Check placement annotations
        for (const annotation of PLACEMENT_ANNOTATIONS) {
            if (this.source.substring(this.pos, this.pos + annotation.length) === annotation) {
                const endPos = this.pos + annotation.length;
                if (endPos >= this.source.length || !this.isAlphaNumeric(this.source[endPos])) {
                    this.emit(TokenType.ANNOTATION, annotation);
                    for (let i = 0; i < annotation.length; i++) {
                        this.advance();
                    }
                    return;
                }
            }
        }

        // Unknown @ token - skip
        this.advance();
    }

    private readString(): void {
        const startCol = this.column;
        const startLine = this.line;
        this.advance(); // skip opening quote
        const start = this.pos;
        while (this.pos < this.source.length && this.source[this.pos] !== '"' && this.source[this.pos] !== '\n') {
            this.pos++;
            this.column++;
        }
        const value = this.source.substring(start, this.pos);
        if (this.pos < this.source.length && this.source[this.pos] === '"') {
            this.pos++;
            this.column++;
        }
        this.tokens.push({ type: TokenType.STRING, value, line: startLine, column: startCol });
    }

    private tryConnectionOperator(): boolean {
        const remaining = this.source.substring(this.pos);
        for (const op of CONNECTION_OPERATORS_SORTED) {
            if (remaining.startsWith(op)) {
                const tokenType = CONNECTION_OPERATORS.get(op)!;
                this.emit(tokenType, op);
                for (let i = 0; i < op.length; i++) {
                    this.advance();
                }
                return true;
            }
        }
        return false;
    }

    private readWord(): void {
        const startCol = this.column;
        const startLine = this.line;
        const start = this.pos;
        while (this.pos < this.source.length && (this.isAlphaNumeric(this.source[this.pos]) || this.source[this.pos] === '_')) {
            this.pos++;
            this.column++;
        }
        const word = this.source.substring(start, this.pos);
        if (KEYWORDS.has(word)) {
            this.tokens.push({ type: TokenType.KEYWORD, value: word, line: startLine, column: startCol });
        } else {
            this.tokens.push({ type: TokenType.IDENTIFIER, value: word, line: startLine, column: startCol });
        }
    }

    private isAlpha(ch: string): boolean {
        return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
    }

    private isAlphaNumeric(ch: string): boolean {
        return this.isAlpha(ch) || (ch >= '0' && ch <= '9');
    }
}
