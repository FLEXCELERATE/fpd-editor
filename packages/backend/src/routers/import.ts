/** Import endpoint: accept FPD text or VDI 3682 XML. */

import { FastifyInstance } from 'fastify';
import { FpdService } from '@fpd-editor/core';
import { importSchema } from '../schemas.js';

export async function importRouter(app: FastifyInstance) {
    const service: FpdService = (app as unknown as { fpdService: FpdService }).fpdService;

    app.post('/import', async (request, reply) => {
        const parsed = importSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }

        try {
            const result = service.importFile(parsed.data.content, parsed.data.filename);
            return {
                model: result.model,
                diagram: result.diagram,
                source: result.source,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Processing error';
            return reply.status(422).send({ error: msg });
        }
    });
}
