/** TypeScript backend server — replaces the Python FastAPI backend. */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { FpdService } from '@fpd-editor/core';
import './types.js';
import { parseRouter } from './routers/parse.js';
import { exportRouter } from './routers/export.js';
import { importRouter } from './routers/import.js';
import { renderRouter } from './routers/render.js';

const PORT = Number(process.env.PORT) || 8741;
const HOST = process.env.HOST || '0.0.0.0';

/** Maximum request body size (1 MB). */
const MAX_BODY_SIZE = 1024 * 1024;

/** Hard cap on how long a single request may take (ms). Prevents a pathological
 *  payload from occupying a worker indefinitely. Configurable via env. */
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 30_000;

/**
 * How Fastify should derive the client IP. Behind a reverse proxy this MUST be
 * enabled so rate limiting and logs key off the real client rather than the
 * proxy's socket address. Accepts `true`/`false`, a hop count, or a CIDR/IP list.
 */
function resolveTrustProxy(): boolean | number | string {
    const raw = process.env.TRUST_PROXY;
    if (raw === undefined || raw === 'false') return false;
    if (raw === 'true') return true;
    const asNumber = Number(raw);
    return Number.isNaN(asNumber) ? raw : asNumber;
}

/** Create and configure the Fastify instance (plugins, routers, error handler). */
export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
    const app = Fastify({
        logger: opts.logger ?? true,
        bodyLimit: MAX_BODY_SIZE,
        requestTimeout: REQUEST_TIMEOUT_MS,
        trustProxy: resolveTrustProxy(),
    });

    // Shared service instance for all routers
    const service = new FpdService();
    app.decorate('fpdService', service);

    // CORS
    if (!process.env.CORS_ORIGIN && process.env.NODE_ENV === 'production') {
        throw new Error('CORS_ORIGIN must be set in production');
    }
    // Accept a single origin or a comma-separated allowlist.
    const corsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:5173')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    await app.register(cors, {
        origin: corsOrigin.length === 1 ? corsOrigin[0] : corsOrigin,
    });

    // Rate limiting (health check is exempt so load-balancer probes are never
    // throttled).
    await app.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
        allowList: (req) => req.url === '/api/health',
    });

    // Global error handler
    app.setErrorHandler(
        (
            error: Error & { validation?: Array<{ message: string }>; statusCode?: number },
            _request,
            reply,
        ) => {
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
        },
    );

    // API routes
    await app.register(parseRouter, { prefix: '/api' });
    await app.register(exportRouter, { prefix: '/api' });
    await app.register(importRouter, { prefix: '/api' });
    await app.register(renderRouter, { prefix: '/api' });

    // Health check
    app.get('/api/health', async () => ({ status: 'ok' }));

    return app;
}

async function main() {
    const app = await buildApp();

    // Graceful shutdown
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    let shuttingDown = false;
    for (const signal of signals) {
        process.on(signal, async () => {
            if (shuttingDown) return;
            shuttingDown = true;
            app.log.info(`Received ${signal}, shutting down...`);
            // Force-exit if a blocked/in-flight request keeps close() from resolving.
            const forceExit = setTimeout(() => {
                app.log.error('Shutdown timed out, forcing exit');
                process.exit(1);
            }, 10_000);
            forceExit.unref();
            try {
                await app.close();
                process.exit(0);
            } catch (err) {
                app.log.error(err, 'Error during shutdown');
                process.exit(1);
            }
        });
    }

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`FPD Backend listening on http://${HOST}:${PORT}`);
}

// Only start the server when executed directly (not when imported by tests).
if (!process.env.VITEST) {
    main().catch((err) => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });
}
