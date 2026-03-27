/** Zod schemas for request validation. */

import { z } from 'zod/v4';

/** Schema for endpoints that accept FPD source text. */
export const sourceSchema = z.object({
    source: z.string().trim().min(1, 'Field "source" must not be empty'),
});

/** Schema for the import endpoint. */
export const importSchema = z.object({
    content: z.string().trim().min(1, 'Field "content" must not be empty'),
    filename: z.string().trim().min(1, 'Field "filename" must not be empty'),
});

export type SourceInput = z.infer<typeof sourceSchema>;
export type ImportInput = z.infer<typeof importSchema>;
