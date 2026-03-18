/** Render endpoint: return SVG from FPD source. */

import { FastifyInstance } from 'fastify';
import { FpdService } from '@fpd-editor/core';

const service = new FpdService();

export async function renderRouter(app: FastifyInstance) {
    app.post<{ Body: { source: string } }>('/render/svg', async (request, reply) => {
        const { source } = request.body;
        if (!source) return reply.status(400).send({ error: 'Missing "source" field' });

        try {
            const svg = service.renderSvg(source);
            return reply.type('image/svg+xml').send(svg);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return reply.status(422).send({ error: msg });
        }
    });
}
