/** Import endpoint: accept FPD text or VDI 3682 XML. */

import { FastifyInstance } from 'fastify';
import { FpdService } from '@fpd-editor/core';

const service = new FpdService();

export async function importRouter(app: FastifyInstance) {
    app.post<{ Body: { content: string; filename: string } }>('/import', async (request, reply) => {
        const { content, filename } = request.body;
        if (!content || !filename) {
            return reply.status(400).send({ error: 'Missing "content" or "filename" field' });
        }

        try {
            const result = service.importFile(content, filename);
            return {
                model: result.model,
                diagram: result.diagram,
                source: result.source,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return reply.status(422).send({ error: msg });
        }
    });
}
