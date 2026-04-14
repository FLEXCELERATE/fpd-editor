import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../server.js';

/** Minimal valid FPD source for testing. */
const VALID_SOURCE = '@startfpd\ntitle "Test"\n@endfpd';

/** A richer FPD source that produces elements, flows, and usages. */
const RICH_SOURCE = [
    '@startfpd',
    'title "Integration"',
    'product p1 "Raw"',
    'process_operator po1 "Cut"',
    'technical_resource tr1 "Laser"',
    'product p2 "Done"',
    'p1 --> po1',
    'po1 --> p2',
    'po1 <..> tr1',
    '@endfpd',
].join('\n');

/** FPD source with deliberate syntax errors (unknown keyword). */
const INVALID_SYNTAX_SOURCE = '@startfpd\nfoobar baz\n@endfpd';

/** Valid FPD content for import (plain text format). */
const VALID_FPD_CONTENT = '@startfpd\ntitle "Imported"\n@endfpd';

let app: FastifyInstance;

beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

describe('GET /api/health', () => {
    it('returns 200 with status ok', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/health' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ status: 'ok' });
    });
});

describe('POST /api/parse', () => {
    it('returns 200 with model and diagram for valid source', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/parse',
            payload: { source: RICH_SOURCE },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();

        // Model structure
        expect(body.model.title).toBe('Integration');
        expect(body.model.states.length).toBeGreaterThanOrEqual(2);
        expect(body.model.processOperators).toHaveLength(1);
        expect(body.model.technicalResources).toHaveLength(1);
        expect(body.model.flows.length).toBeGreaterThanOrEqual(2);
        expect(body.model.usages).toHaveLength(1);
        expect(body.model.errors).toHaveLength(0);

        // Diagram layout
        expect(body.diagram.elements.length).toBeGreaterThanOrEqual(4);
        expect(body.diagram.connections.length).toBeGreaterThanOrEqual(3);
    });

    it('returns 200 with errors array for syntactically invalid FPD', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/parse',
            payload: { source: INVALID_SYNTAX_SOURCE },
        });
        // Parser is error-tolerant: returns 200 with errors in the model
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.model.errors.length).toBeGreaterThan(0);
    });

    it('returns 400 for empty body', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/parse',
            payload: {},
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toHaveProperty('error');
    });

    it('returns 400 for empty source', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/parse',
            payload: { source: '' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toHaveProperty('error');
    });
});

describe('POST /api/render/svg', () => {
    it('returns 200 with well-formed SVG for valid source', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/render/svg',
            payload: { source: RICH_SOURCE },
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('image/svg+xml');
        expect(res.body).toContain('<svg');
        expect(res.body).toContain('</svg>');
        // SVG should contain rendered element labels
        expect(res.body).toContain('Cut');
    });
});

describe('POST /api/export/source/xml', () => {
    it('returns 200 with XML for valid source', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/export/source/xml',
            payload: { source: VALID_SOURCE },
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('application/xml');
        expect(res.body).toContain('<?xml');
    });
});

describe('POST /api/export/source/text', () => {
    it('returns 200 with reconstructed FPD text for valid source', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/export/source/text',
            payload: { source: RICH_SOURCE },
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/plain');
        // Exported text must contain FPD delimiters and declared elements
        expect(res.body).toContain('@startfpd');
        expect(res.body).toContain('@endfpd');
        expect(res.body).toContain('po1');
    });
});

describe('POST /api/export/source/svg', () => {
    it('returns 200 with well-formed SVG for valid source', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/export/source/svg',
            payload: { source: RICH_SOURCE },
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('image/svg+xml');
        expect(res.body).toContain('<svg');
        expect(res.body).toContain('</svg>');
    });
});

describe('POST /api/import', () => {
    it('returns 200 with source and model for valid FPD content', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/import',
            payload: { content: VALID_FPD_CONTENT, filename: 'test.fpd' },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveProperty('source');
        expect(body).toHaveProperty('model');
    });

    it('imports XML via .xml filename (round-trip)', async () => {
        // First export the rich source to XML
        const xmlRes = await app.inject({
            method: 'POST',
            url: '/api/export/source/xml',
            payload: { source: RICH_SOURCE },
        });
        expect(xmlRes.statusCode).toBe(200);
        const xmlContent = xmlRes.body;

        // Then import the XML back
        const importRes = await app.inject({
            method: 'POST',
            url: '/api/import',
            payload: { content: xmlContent, filename: 'roundtrip.xml' },
        });
        expect(importRes.statusCode).toBe(200);
        const body = importRes.json();
        expect(body.model.processOperators.length).toBeGreaterThanOrEqual(1);
        expect(body.model.states.length).toBeGreaterThanOrEqual(2);
        expect(body.source).toContain('@startfpd');
    });

    it('returns 422 for undetectable file format', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/import',
            payload: { content: 'random garbage', filename: 'data.csv' },
        });
        expect(res.statusCode).toBe(422);
        expect(res.json()).toHaveProperty('error');
    });

    it('returns 400 when content is missing', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/import',
            payload: { filename: 'test.fpd' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toHaveProperty('error');
    });

    it('returns 400 when filename is missing', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/import',
            payload: { content: VALID_FPD_CONTENT },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toHaveProperty('error');
    });
});

describe('POST /api/export/source/pdf', () => {
    it('returns PDF for valid source', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/export/source/pdf',
            payload: { source: VALID_SOURCE },
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('application/pdf');
        expect(res.rawPayload.length).toBeGreaterThan(0);
    });
});

describe('Validation edge cases', () => {
    it('POST /api/parse returns 400 for whitespace-only source', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/parse',
            payload: { source: '   \n\t  ' },
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /api/parse returns 400 for wrong field name', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/parse',
            payload: { wrongField: VALID_SOURCE },
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /api/parse rejects oversized source', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/parse',
            payload: { source: 'x'.repeat(600_000) },
        });
        expect(res.statusCode).toBe(400);
    });
});
