import { z } from 'zod';

/**
 * Common schemas used across configuration modules
 */

export const permissionSchema = z.enum(['view', 'write', 'delete', 'manage_properties']);

export const booleanString = z
  .string()
  .default('false')
  .transform((val) => val.toLowerCase() === 'true');

export const trueBooleanString = z
  .string()
  .default('true')
  .transform((val) => val.toLowerCase() === 'true');
