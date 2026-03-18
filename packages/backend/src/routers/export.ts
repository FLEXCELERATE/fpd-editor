/** Export endpoints: SVG, XML, PDF, text. */

import { FastifyInstance } from 'fastify';
import { FpdService } from '@fpd-editor/core';

const service = new FpdService();

export async function exportRouter(app: FastifyInstance) {
    app.post<{ Body: { source: string } }>('/export/source/svg', async (request, reply) => {
        const { source } = request.body;
        if (!source) return reply.status(400).send({ error: 'Missing "source" field' });

        try {
            const svg = service.exportSvg(source);
            return reply.type('image/svg+xml').send(svg);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return reply.status(422).send({ error: msg });
        }
    });

    app.post<{ Body: { source: string } }>('/export/source/xml', async (request, reply) => {
        const { source } = request.body;
        if (!source) return reply.status(400).send({ error: 'Missing "source" field' });

        try {
            const xml = service.exportXml(source);
            return reply.type('application/xml').send(xml);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return reply.status(422).send({ error: msg });
        }
    });

    app.post<{ Body: { source: string } }>('/export/source/text', async (request, reply) => {
        const { source } = request.body;
        if (!source) return reply.status(400).send({ error: 'Missing "source" field' });

        try {
            const text = service.exportText(source);
            return reply.type('text/plain').send(text);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return reply.status(422).send({ error: msg });
        }
    });

    app.post<{ Body: { source: string } }>('/export/source/pdf', async (request, reply) => {
        const { source } = request.body;
        if (!source) return reply.status(400).send({ error: 'Missing "source" field' });

        try {
            const pdfBytes = await service.exportPdf(source);
            return reply.type('application/pdf').send(Buffer.from(pdfBytes));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return reply.status(422).send({ error: msg });
        }
    });
}
