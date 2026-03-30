import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../server.js';

/** Minimal valid FPD source for testing. */
const VALID_SOURCE = '@startfpd\ntitle "Test"\n@endfpd';

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
            payload: { source: VALID_SOURCE },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveProperty('model');
        expect(body).toHaveProperty('diagram');
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
    it('returns 200 with SVG string for valid source', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/render/svg',
            payload: { source: VALID_SOURCE },
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('image/svg+xml');
        expect(res.body).toContain('<svg');
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
    it('returns 200 with text for valid source', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/export/source/text',
            payload: { source: VALID_SOURCE },
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/plain');
        expect(res.body).toBeTruthy();
    });
});

describe('POST /api/export/source/svg', () => {
    it('returns 200 with SVG for valid source', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/export/source/svg',
            payload: { source: VALID_SOURCE },
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('image/svg+xml');
        expect(res.body).toContain('<svg');
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

    it('POST /api/import returns 400 when filename is missing', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/import',
            payload: { content: VALID_FPD_CONTENT },
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
