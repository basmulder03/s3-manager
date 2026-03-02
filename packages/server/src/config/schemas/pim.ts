import { z } from 'zod';
import { booleanString, permissionSchema } from './common.js';

/**
 * Privileged Identity Management (PIM) schemas
 */

export const pimAzureSchema = z.object({
  assignmentScheduleRequestApi: z
    .string()
    .url()
    .default(
      'https://graph.microsoft.com/v1.0/identityGovernance/privilegedAccess/group/assignmentScheduleRequests'
    ),
  eligibilityScheduleApi: z
    .string()
    .url()
    .default(
      'https://graph.microsoft.com/v1.0/identityGovernance/privilegedAccess/group/eligibilityScheduleInstances'
    ),
});

export const pimGoogleSchema = z.object({
  membershipsApiBase: z.string().url().default('https://cloudidentity.googleapis.com/v1/groups'),
  operationsApiBase: z.string().url().default('https://cloudidentity.googleapis.com/v1'),
});

export const elevationEntitlementSchema = z.object({
  key: z.string().trim().min(1),
  provider: z.enum(['azure', 'google']),
  target: z.string().trim().min(1),
  permissions: z.array(permissionSchema).min(1),
  maxDurationMinutes: z.coerce.number().int().positive().max(1440).default(60),
  requireJustification: z.coerce.boolean().default(false),
});

export const pimSchema = z.object({
  enabled: booleanString,
  devMockEnabled: booleanString,
  rateLimitWindowMs: z.coerce.number().int().positive().default(60000),
  rateLimitMaxRequests: z.coerce.number().int().positive().default(8),
  azure: pimAzureSchema,
  google: pimGoogleSchema,
  entitlements: z
    .array(elevationEntitlementSchema)
    .default([])
    .transform((entitlements) => {
      const keys = new Set<string>();
      for (const entry of entitlements) {
        if (keys.has(entry.key)) {
          throw new Error(`Duplicate elevation entitlement key '${entry.key}'`);
        }
        keys.add(entry.key);
      }

      return entitlements;
    }),
});
