/** Render endpoint: return SVG from FPD source. */

import { FastifyInstance } from 'fastify';
import { FpdService } from '@fpd-editor/core';
import { sourceSchema } from '../schemas.js';

export async function renderRouter(app: FastifyInstance) {
    const service: FpdService = (app as unknown as { fpdService: FpdService }).fpdService;

    app.post('/render/svg', async (request, reply) => {
        const parsed = sourceSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }

        try {
            const svg = service.renderSvg(parsed.data.source);
            return reply.type('image/svg+xml').send(svg);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Processing error';
            return reply.status(422).send({ error: msg });
        }
    });
}
