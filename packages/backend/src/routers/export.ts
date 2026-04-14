/** Export endpoints: SVG, XML, PDF, text. */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sourceSchema } from '../schemas.js';
import '../types.js';

/** Helper that validates the source field and delegates to a handler. */
function withSourceValidation(
    handler: (source: string, reply: FastifyReply) => unknown | Promise<unknown>
) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        const parsed = sourceSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }
        try {
            return await handler(parsed.data.source, reply);
        } catch (err) {
            request.log.error(err);
            return reply.status(422).send({ error: 'Processing error' });
        }
    };
}

export async function exportRouter(app: FastifyInstance) {
    const service = app.fpdService;

    app.post('/export/source/svg', withSourceValidation((source, reply) => {
        const svg = service.exportSvg(source);
        return reply.type('image/svg+xml').send(svg);
    }));

    app.post('/export/source/xml', withSourceValidation((source, reply) => {
        const xml = service.exportXml(source);
        return reply.type('application/xml').send(xml);
    }));

    app.post('/export/source/text', withSourceValidation((source, reply) => {
        const text = service.exportText(source);
        return reply.type('text/plain').send(text);
    }));

    app.post('/export/source/pdf', withSourceValidation(async (source, reply) => {
        const pdfBytes = await service.exportPdf(source);
        return reply.type('application/pdf').send(Buffer.from(pdfBytes));
    }));
}
