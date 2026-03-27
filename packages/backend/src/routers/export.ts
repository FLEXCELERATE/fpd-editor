/** Export endpoints: SVG, XML, PDF, text. */

import { FastifyInstance } from 'fastify';
import { FpdService } from '@fpd-editor/core';
import { sourceSchema } from '../schemas.js';

export async function exportRouter(app: FastifyInstance) {
    const service: FpdService = (app as unknown as { fpdService: FpdService }).fpdService;

    app.post('/export/source/svg', async (request, reply) => {
        const parsed = sourceSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }

        try {
            const svg = service.exportSvg(parsed.data.source);
            return reply.type('image/svg+xml').send(svg);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Processing error';
            return reply.status(422).send({ error: msg });
        }
    });

    app.post('/export/source/xml', async (request, reply) => {
        const parsed = sourceSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }

        try {
            const xml = service.exportXml(parsed.data.source);
            return reply.type('application/xml').send(xml);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Processing error';
            return reply.status(422).send({ error: msg });
        }
    });

    app.post('/export/source/text', async (request, reply) => {
        const parsed = sourceSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }

        try {
            const text = service.exportText(parsed.data.source);
            return reply.type('text/plain').send(text);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Processing error';
            return reply.status(422).send({ error: msg });
        }
    });

    app.post('/export/source/pdf', async (request, reply) => {
        const parsed = sourceSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }

        try {
            const pdfBytes = await service.exportPdf(parsed.data.source);
            return reply.type('application/pdf').send(Buffer.from(pdfBytes));
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Processing error';
            return reply.status(422).send({ error: msg });
        }
    });
}
