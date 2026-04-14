/** Render endpoint: return SVG from FPD source. */

import { FastifyInstance } from 'fastify';
import { sourceSchema } from '../schemas.js';
import '../types.js';

export async function renderRouter(app: FastifyInstance) {
    const service = app.fpdService;

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
