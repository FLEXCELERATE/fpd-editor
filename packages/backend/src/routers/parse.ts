/** Parse FPD source text and return the model + diagram layout. */

import { FastifyInstance } from 'fastify';
import { FpdService } from '@fpd-editor/core';

const service = new FpdService();

export async function parseRouter(app: FastifyInstance) {
    app.post<{ Body: { source: string } }>('/parse', async (request, reply) => {
        const { source } = request.body;
        if (!source) {
            return reply.status(400).send({ error: 'Missing "source" field' });
        }

        try {
            const result = service.parse(source);
            return {
                model: result.model,
                diagram: result.diagram,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return reply.status(422).send({ error: msg });
        }
    });
}
