import { z } from 'zod';
import { booleanString, permissionSchema } from './common.js';

/**
 * Server, application, and infrastructure schemas
 */

export const serverSchema = z.object({
  port: z.coerce.number().int().positive().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
});

export const secretKeySchema = z.string().min(1, 'SECRET_KEY must be set');

export const localDevModeSchema = booleanString;

export const appSchema = z.object({
  name: z.string().default('S3 Manager'),
  version: z.string().default('2.0.0'),
});

export const webSchema = z.object({
  origin: z.string().url().default('http://localhost:5173'),
});

export const httpSchema = z.object({
  trustProxyHeaders: booleanString,
});

export const securitySchema = z.object({
  allowInsecureUpstreams: booleanString,
});

export const rolePermissionsSchema = z.record(z.string(), z.array(permissionSchema)).default({
  'S3-Viewer': ['view'],
  'S3-Editor': ['view', 'write'],
  'S3-Admin': ['view', 'write', 'delete'],
  'S3-Property-Admin': ['view', 'write', 'manage_properties'],
});

export const defaultRoleSchema = z.string().default('S3-Viewer');
