/** TypeScript backend server — replaces the Python FastAPI backend. */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { parseRouter } from './routers/parse.js';
import { exportRouter } from './routers/export.js';
import { importRouter } from './routers/import.js';
import { renderRouter } from './routers/render.js';

const PORT = Number(process.env.PORT) || 8741;
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
    const app = Fastify({ logger: true });

    await app.register(cors, {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        credentials: true,
    });

    // API routes
    await app.register(parseRouter, { prefix: '/api' });
    await app.register(exportRouter, { prefix: '/api' });
    await app.register(importRouter, { prefix: '/api' });
    await app.register(renderRouter, { prefix: '/api' });

    // Health check
    app.get('/api/health', async () => ({ status: 'ok' }));

    await app.listen({ port: PORT, host: HOST });
    console.log(`FPD Backend listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
