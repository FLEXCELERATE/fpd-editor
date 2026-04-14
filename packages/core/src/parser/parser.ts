/** Parser that converts a token stream into a ProcessModel. */

import {
    Flow,
    FlowType,
    Identification,
    ProcessOperator,
    State,
    StatePlacement,
    SystemLimit,
    TechnicalResource,
    Usage,
} from '../models/fpdModel';
import { STATE_TYPE_MAP as STATE_KEYWORD_MAP } from '../models/constants';
import { ProcessModel, createProcessModel } from '../models/processModel';
import { Lexer, Token } from './lexer';
import { ELEMENT_KEYWORDS, TokenType } from './syntax';

export class ParseError extends Error {
    line: number;
    column: number;

    constructor(message: string, line: number = 0, column: number = 0) {
        super(`Line ${line}, Col ${column}: ${message}`);
        this.line = line;
        this.column = column;
    }
}

/** Maps connection token types to FlowType values */
const FLOW_TOKEN_MAP: ReadonlyMap<TokenType, FlowType> = new Map([
    [TokenType.FLOW, 'flow'],
    [TokenType.ALTERNATIVE_FLOW, 'alternativeFlow'],
    [TokenType.PARALLEL_FLOW, 'parallelFlow'],
]);

/** Maps annotation strings to StatePlacement values */
const ANNOTATION_MAP: Record<string, StatePlacement> = {
    '@boundary': 'boundary',
    '@boundary-top': 'boundary-top',
    '@boundary-bottom': 'boundary-bottom',
    '@boundary-left': 'boundary-left',
    '@boundary-right': 'boundary-right',
    '@internal': 'internal',
};

export class FpdParser {
    private source: string;
    private tokens: Token[] = [];
    private pos = 0;
    private model: ProcessModel = createProcessModel();
    private elementIds: Map<string, string> = new Map(); // id -> element type keyword
    private flowCounter = 0;
    private usageCounter = 0;
    private currentSystemId: string | null = null;
    private systemCounter = 0;

    constructor(source: string) {
        this.source = source;
    }

    parse(): ProcessModel {
        this.tokens = new Lexer(this.source).tokenize();
        this.pos = 0;

        this.skipTrivial();
        this.expect(TokenType.START_FPD);
        this.skipTrivial();

        while (!this.check(TokenType.END_FPD) && !this.check(TokenType.EOF)) {
            this.parseStatement();
            this.skipTrivial();
        }

        if (this.check(TokenType.END_FPD)) {
            this.advance();
        } else {
            this.model.errors.push('Missing @endfpd delimiter');
        }

        return this.model;
    }

    // -- Statement dispatch --

    private parseStatement(): void {
        const token = this.current();

        if (token.type === TokenType.COMMENT) {
            this.advance();
            return;
        }

        if (token.type === TokenType.KEYWORD) {
            if (token.value === 'title') {
                this.parseTitle();
            } else if (token.value === 'system') {
                this.parseSystemBlock();
            } else if (ELEMENT_KEYWORDS.has(token.value)) {
                this.parseElementDecl();
            } else {
                this.model.errors.push(`Line ${token.line}: Unknown keyword '${token.value}'`);
                this.advance();
            }
            return;
        }

        if (token.type === TokenType.IDENTIFIER) {
            this.parseConnection();
            return;
        }

        // Skip unexpected tokens
        this.advance();
    }

    // -- Title --

    private parseTitle(): void {
        if (this.currentSystemId !== null) {
            this.model.errors.push(
                `Line ${this.current().line}: title cannot be used inside a system block`,
            );
            this.advance();
            return;
        }
        this.advance(); // consume 'title'
        if (this.check(TokenType.STRING)) {
            this.model.title = this.current().value;
            this.advance();
        } else {
            this.model.errors.push(`Line ${this.current().line}: Expected string after 'title'`);
        }
    }

    // -- System blocks --

    private parseSystemBlock(): void {
        const systemToken = this.current();
        this.advance(); // consume 'system'

        if (!this.check(TokenType.STRING)) {
            this.model.errors.push(`Line ${systemToken.line}: Expected string after 'system'`);
            return;
        }

        const systemName = this.current().value;
        this.advance();

        if (!this.check(TokenType.LBRACE)) {
            this.model.errors.push(`Line ${systemToken.line}: Expected '{' after system name`);
            return;
        }
        this.advance(); // consume '{'

        this.systemCounter++;
        const systemId = `system_${this.systemCounter}`;

        const ident: Identification = { uniqueIdent: systemId, longName: systemName };
        this.model.systemLimits.push({
            id: systemId,
            identification: ident,
            label: systemName,
            lineNumber: systemToken.line,
        } as SystemLimit);

        this.currentSystemId = systemId;
        this.skipTrivial();

        while (
            !this.check(TokenType.RBRACE) &&
            !this.check(TokenType.EOF) &&
            !this.check(TokenType.END_FPD)
        ) {
            this.parseStatement();
            this.skipTrivial();
        }

        if (this.check(TokenType.RBRACE)) {
            this.advance();
        } else {
            this.model.errors.push(
                `Line ${systemToken.line}: Missing '}' for system '${systemName}'`,
            );
        }

        this.currentSystemId = null;
    }

    // -- Element declarations --

    private parseElementDecl(): void {
        const keywordToken = this.current();
        const keyword = keywordToken.value;
        this.advance(); // consume keyword

        if (!this.check(TokenType.IDENTIFIER)) {
            this.model.errors.push(
                `Line ${keywordToken.line}: Expected identifier after '${keyword}'`,
            );
            return;
        }

        const elemId = this.current().value;
        this.advance();

        // Check for duplicate ID
        if (this.elementIds.has(elemId)) {
            this.model.errors.push(`Line ${keywordToken.line}: Duplicate element ID '${elemId}'`);
            return;
        }

        // Optional label
        let label = elemId;
        if (this.check(TokenType.STRING)) {
            label = this.current().value;
            this.advance();
        }

        // Optional placement annotation
        let placement: StatePlacement | undefined;
        if (this.check(TokenType.ANNOTATION)) {
            const annotationValue = this.current().value;
            this.advance();
            if (keyword in STATE_KEYWORD_MAP) {
                placement = ANNOTATION_MAP[annotationValue];
            } else {
                this.model.warnings.push(
                    `Line ${keywordToken.line}: Placement annotation ` +
                        `'${annotationValue}' ignored on '${keyword}' ` +
                        `(only valid on state elements)`,
                );
            }
        }

        const ident: Identification = { uniqueIdent: elemId, longName: label };
        this.elementIds.set(elemId, keyword);

        if (keyword in STATE_KEYWORD_MAP) {
            this.model.states.push({
                id: elemId,
                stateType: STATE_KEYWORD_MAP[keyword],
                identification: ident,
                label,
                placement,
                lineNumber: keywordToken.line,
                systemId: this.currentSystemId ?? undefined,
            } as State);
        } else if (keyword === 'process_operator') {
            this.model.processOperators.push({
                id: elemId,
                identification: ident,
                label,
                lineNumber: keywordToken.line,
                systemId: this.currentSystemId ?? undefined,
            } as ProcessOperator);
        } else if (keyword === 'technical_resource') {
            this.model.technicalResources.push({
                id: elemId,
                identification: ident,
                label,
                lineNumber: keywordToken.line,
                systemId: this.currentSystemId ?? undefined,
            } as TechnicalResource);
        }
    }

    // -- Connections --

    private parseConnection(): void {
        const sourceToken = this.current();
        const sourceId = sourceToken.value;
        this.advance();

        const token = this.current();
        if (token.type === TokenType.USAGE) {
            this.advance();
            if (!this.check(TokenType.IDENTIFIER)) {
                this.model.errors.push(
                    `Line ${sourceToken.line}: Expected identifier after connection operator`,
                );
                return;
            }
            const targetId = this.current().value;
            this.advance();

            if (!this.elementIds.has(sourceId)) {
                this.model.errors.push(
                    `Line ${sourceToken.line}: Element '${sourceId}' is not defined`,
                );
                return;
            }
            if (!this.elementIds.has(targetId)) {
                this.model.errors.push(
                    `Line ${sourceToken.line}: Element '${targetId}' is not defined`,
                );
                return;
            }

            this.usageCounter++;
            this.model.usages.push({
                id: `usage_${this.usageCounter}`,
                processOperatorRef: sourceId,
                technicalResourceRef: targetId,
                lineNumber: sourceToken.line,
                systemId: this.currentSystemId ?? undefined,
            } as Usage);
        } else if (FLOW_TOKEN_MAP.has(token.type)) {
            const flowType = FLOW_TOKEN_MAP.get(token.type)!;
            this.advance();

            if (!this.check(TokenType.IDENTIFIER)) {
                this.model.errors.push(
                    `Line ${sourceToken.line}: Expected identifier after connection operator`,
                );
                return;
            }
            const targetId = this.current().value;
            this.advance();

            if (!this.elementIds.has(sourceId)) {
                this.model.errors.push(
                    `Line ${sourceToken.line}: Element '${sourceId}' is not defined`,
                );
                return;
            }
            if (!this.elementIds.has(targetId)) {
                this.model.errors.push(
                    `Line ${sourceToken.line}: Element '${targetId}' is not defined`,
                );
                return;
            }

            this.flowCounter++;
            this.model.flows.push({
                id: `flow_${this.flowCounter}`,
                sourceRef: sourceId,
                targetRef: targetId,
                flowType,
                lineNumber: sourceToken.line,
                systemId: this.currentSystemId ?? undefined,
            } as Flow);
        } else {
            this.model.errors.push(
                `Line ${sourceToken.line}: Expected connection operator after '${sourceId}'`,
            );
        }
    }

    // -- Token helpers --

    private current(): Token {
        if (this.pos < this.tokens.length) {
            return this.tokens[this.pos];
        }
        return { type: TokenType.EOF, value: '', line: 0, column: 0 };
    }

    private check(tokenType: TokenType): boolean {
        return this.current().type === tokenType;
    }

    private advance(): Token {
        const token = this.current();
        if (this.pos < this.tokens.length) {
            this.pos++;
        }
        return token;
    }

    private expect(tokenType: TokenType): Token {
        if (this.check(tokenType)) {
            return this.advance();
        }
        const token = this.current();
        this.model.errors.push(`Line ${token.line}: Expected ${tokenType}, got ${token.type}`);
        return token;
    }

    private skipTrivial(): void {
        while (
            this.current().type === TokenType.NEWLINE ||
            this.current().type === TokenType.COMMENT
        ) {
            this.advance();
        }
    }
}
