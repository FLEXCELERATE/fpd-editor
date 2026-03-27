import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer';
import { TokenType } from '../syntax';

describe('Lexer', () => {
    it('returns only EOF token for empty source', () => {
        const tokens = new Lexer('').tokenize();
        expect(tokens).toHaveLength(1);
        expect(tokens[0].type).toBe(TokenType.EOF);
    });

    it('tokenizes minimal valid FPD (@startfpd / @endfpd)', () => {
        const tokens = new Lexer('@startfpd\n@endfpd').tokenize();
        const types = tokens.map(t => t.type);
        expect(types).toContain(TokenType.START_FPD);
        expect(types).toContain(TokenType.END_FPD);
        expect(types[types.length - 1]).toBe(TokenType.EOF);
    });

    it('tokenizes all element keywords as KEYWORD', () => {
        const keywords = ['product', 'energy', 'information', 'process_operator', 'technical_resource', 'title', 'system'];
        for (const kw of keywords) {
            const tokens = new Lexer(kw).tokenize();
            const kwToken = tokens.find(t => t.value === kw);
            expect(kwToken, `Expected '${kw}' to produce a token`).toBeDefined();
            expect(kwToken!.type).toBe(TokenType.KEYWORD);
        }
    });

    it('tokenizes identifiers (alphanumeric + underscore)', () => {
        const tokens = new Lexer('my_var1 anotherVar').tokenize();
        const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
        expect(ids).toHaveLength(2);
        expect(ids[0].value).toBe('my_var1');
        expect(ids[1].value).toBe('anotherVar');
    });

    it('tokenizes string literals with quotes', () => {
        const tokens = new Lexer('"hello world"').tokenize();
        const str = tokens.find(t => t.type === TokenType.STRING);
        expect(str).toBeDefined();
        expect(str!.value).toBe('hello world');
    });

    it('tokenizes flow operator -->', () => {
        const tokens = new Lexer('-->').tokenize();
        const op = tokens.find(t => t.type === TokenType.FLOW);
        expect(op).toBeDefined();
        expect(op!.value).toBe('-->');
    });

    it('tokenizes alternative flow operator -.->', () => {
        const tokens = new Lexer('-.->').tokenize();
        const op = tokens.find(t => t.type === TokenType.ALTERNATIVE_FLOW);
        expect(op).toBeDefined();
        expect(op!.value).toBe('-.->');
    });

    it('tokenizes parallel flow operator ==>', () => {
        const tokens = new Lexer('==>').tokenize();
        const op = tokens.find(t => t.type === TokenType.PARALLEL_FLOW);
        expect(op).toBeDefined();
        expect(op!.value).toBe('==>');
    });

    it('tokenizes usage operator <..>', () => {
        const tokens = new Lexer('<..>').tokenize();
        const op = tokens.find(t => t.type === TokenType.USAGE);
        expect(op).toBeDefined();
        expect(op!.value).toBe('<..>');
    });

    it('tokenizes comments (// style)', () => {
        const tokens = new Lexer('// this is a comment').tokenize();
        const comment = tokens.find(t => t.type === TokenType.COMMENT);
        expect(comment).toBeDefined();
        expect(comment!.value).toBe('// this is a comment');
    });

    it('tokenizes @boundary annotation', () => {
        const tokens = new Lexer('@boundary').tokenize();
        const annToken = tokens.find(t => t.type === TokenType.ANNOTATION);
        expect(annToken).toBeDefined();
        expect(annToken!.value).toBe('@boundary');
    });

    it('tokenizes @internal annotation', () => {
        const tokens = new Lexer('@internal').tokenize();
        const annToken = tokens.find(t => t.type === TokenType.ANNOTATION);
        expect(annToken).toBeDefined();
        expect(annToken!.value).toBe('@internal');
    });

    it('tokenizes system blocks with { }', () => {
        const tokens = new Lexer('{ }').tokenize();
        expect(tokens.find(t => t.type === TokenType.LBRACE)).toBeDefined();
        expect(tokens.find(t => t.type === TokenType.RBRACE)).toBeDefined();
    });

    it('tracks line and column correctly', () => {
        const tokens = new Lexer('abc\ndef').tokenize();
        const abc = tokens.find(t => t.value === 'abc');
        const def = tokens.find(t => t.value === 'def');
        expect(abc!.line).toBe(1);
        expect(abc!.column).toBe(1);
        expect(def!.line).toBe(2);
        expect(def!.column).toBe(1);
    });

    it('silently skips unknown characters', () => {
        const tokens = new Lexer('abc $ def').tokenize();
        const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
        expect(ids).toHaveLength(2);
        expect(ids[0].value).toBe('abc');
        expect(ids[1].value).toBe('def');
    });

    it('increments line counter on newlines', () => {
        const tokens = new Lexer('\n\nabc').tokenize();
        const abc = tokens.find(t => t.value === 'abc');
        expect(abc!.line).toBe(3);
    });

    it('should tokenize Unicode identifiers', () => {
        const tokens = new Lexer('@startfpd\nproduct café "Café"\n@endfpd').tokenize();
        const idToken = tokens.find(t => t.type === TokenType.IDENTIFIER && t.value === 'café');
        expect(idToken).toBeDefined();
    });

    it('handles unterminated strings (no closing quote before newline)', () => {
        const tokens = new Lexer('"unterminated\nabc').tokenize();
        const str = tokens.find(t => t.type === TokenType.STRING);
        expect(str).toBeDefined();
        expect(str!.value).toBe('unterminated');
        // The lexer should still continue and tokenize subsequent content
        const abc = tokens.find(t => t.value === 'abc');
        expect(abc).toBeDefined();
    });
});
