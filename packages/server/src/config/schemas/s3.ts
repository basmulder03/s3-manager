import { z } from 'zod';

/**
 * S3 configuration schemas
 */

export const s3SourceSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'S3 source id must be alphanumeric, dash, or underscore'),
  endpoint: z.string().url(),
  accessKey: z.string().min(1, 'S3 source accessKey must be set'),
  secretKey: z.string().min(1, 'S3 source secretKey must be set'),
  region: z.string().default('us-east-1'),
  useSsl: z.coerce.boolean().default(false),
  verifySsl: z.coerce.boolean().default(false),
});

export const s3ConfigSchema = z
  .object({
    sources: z
      .array(s3SourceSchema)
      .min(
        1,
        'Define at least one S3 source using S3_SOURCE_0_ENDPOINT, S3_SOURCE_0_ACCESS_KEY, and S3_SOURCE_0_SECRET_KEY'
      ),
  })
  .transform((value) => {
    const sources = value.sources;

    const uniqueIds = new Set<string>();
    for (const source of sources) {
      if (uniqueIds.has(source.id)) {
        throw new Error(`Duplicate S3 source id '${source.id}' in S3_SOURCE_<n>_ID values`);
      }
      uniqueIds.add(source.id);
    }

    const primary = sources[0]!;
    return {
      defaultSourceId: primary.id,
      sources,
    };
  });
