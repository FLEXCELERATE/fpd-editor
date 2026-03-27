/** TypeScript backend server — replaces the Python FastAPI backend. */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { FpdService } from '@fpd-editor/core';
import { parseRouter } from './routers/parse.js';
import { exportRouter } from './routers/export.js';
import { importRouter } from './routers/import.js';
import { renderRouter } from './routers/render.js';

const PORT = Number(process.env.PORT) || 8741;
const HOST = process.env.HOST || '0.0.0.0';

/** Maximum request body size (1 MB). */
const MAX_BODY_SIZE = 1024 * 1024;

async function main() {
    const app = Fastify({
        logger: true,
        bodyLimit: MAX_BODY_SIZE,
    });

    // Shared service instance for all routers
    const service = new FpdService();
    app.decorate('fpdService', service);

    await app.register(cors, {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    });

    // Global error handler
    app.setErrorHandler((error: Error & { validation?: Array<{ message: string }>; statusCode?: number }, _request, reply) => {
        if (error.validation) {
            return reply.status(400).send({
                error: 'Validation error',
                details: error.validation.map((v: { message: string }) => v.message),
            });
        }

        app.log.error(error);
        const statusCode = error.statusCode ?? 500;
        const message = statusCode >= 500 ? 'Internal server error' : error.message;
        return reply.status(statusCode).send({ error: message });
    });

    // API routes
    await app.register(parseRouter, { prefix: '/api' });
    await app.register(exportRouter, { prefix: '/api' });
    await app.register(importRouter, { prefix: '/api' });
    await app.register(renderRouter, { prefix: '/api' });

    // Health check
    app.get('/api/health', async () => ({ status: 'ok' }));

    // Graceful shutdown
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
        process.on(signal, async () => {
            app.log.info(`Received ${signal}, shutting down...`);
            await app.close();
            process.exit(0);
        });
    }

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`FPD Backend listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
