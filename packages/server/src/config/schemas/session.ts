import { z } from 'zod';
import { booleanString } from './common.js';

/**
 * Session management schemas
 */

export const sessionSchema = z.object({
  cookieSecure: booleanString,
  cookieHttpOnly: z.boolean().default(true),
  cookieSameSite: z.enum(['Strict', 'Lax', 'None']).default('Lax'),
  lifetime: z.coerce.number().int().positive().default(3600), // 1 hour in seconds
});
