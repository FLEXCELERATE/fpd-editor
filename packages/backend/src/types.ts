/** Fastify type augmentation for decorated properties. */

import { FpdService } from '@fpd-editor/core';

declare module 'fastify' {
    interface FastifyInstance {
        fpdService: FpdService;
    }
}
