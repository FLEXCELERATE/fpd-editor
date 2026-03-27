/** Parse FPD source text and return the model + diagram layout. */

import { FastifyInstance } from 'fastify';
import { FpdService } from '@fpd-editor/core';
import { sourceSchema } from '../schemas.js';

export async function parseRouter(app: FastifyInstance) {
    const service: FpdService = (app as unknown as { fpdService: FpdService }).fpdService;

    app.post('/parse', async (request, reply) => {
        const parsed = sourceSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }

        try {
            const result = service.parse(parsed.data.source);
            return { model: result.model, diagram: result.diagram };
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Processing error';
            return reply.status(422).send({ error: msg });
        }
    });
}
