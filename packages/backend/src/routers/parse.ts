/** Parse FPD source text and return the model + diagram layout. */

import { FastifyInstance } from 'fastify';
import { sourceSchema } from '../schemas.js';
import '../types.js';

export async function parseRouter(app: FastifyInstance) {
    const service = app.fpdService;

    app.post('/parse', async (request, reply) => {
        const parsed = sourceSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }

        try {
            const result = service.parse(parsed.data.source);
            return { model: result.model, diagram: result.diagram };
        } catch (err) {
            app.log.error(err);
            return reply.status(422).send({ error: 'Processing error' });
        }
    });
}
