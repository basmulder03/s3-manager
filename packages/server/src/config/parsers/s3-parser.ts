import { optionalEnv, parseBooleanEnv } from './env-helpers.js';

/**
 * Mutable S3 source type used during parsing
 */
type MutableS3Source = {
  id?: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  region?: string;
  useSsl?: string;
  verifySsl?: string;
};

/**
 * Parses S3 source configurations from environment variables
 *
 * Expected format:
 * - S3_SOURCE_0_ENDPOINT
 * - S3_SOURCE_0_ACCESS_KEY
 * - S3_SOURCE_0_SECRET_KEY
 * - S3_SOURCE_0_REGION (optional)
 * - S3_SOURCE_0_ID (optional)
 * - S3_SOURCE_0_USE_SSL (optional)
 * - S3_SOURCE_0_VERIFY_SSL (optional)
 *
 * @returns Array of S3 source configurations or undefined if none found
 */
export const parseS3SourcesEnv = (): unknown => {
  const sourceByIndex = new Map<number, MutableS3Source>();

  for (const [envName, envValue] of Object.entries(process.env)) {
    const match = envName.match(
      /^S3_SOURCE_(\d+)_(ID|ENDPOINT|ACCESS_KEY|SECRET_KEY|REGION|USE_SSL|VERIFY_SSL)$/
    );
    if (!match) {
      continue;
    }

    const index = Number(match[1]);
    const field = match[2];
    const source = sourceByIndex.get(index) ?? {};

    if (field === 'ID') {
      source.id = envValue;
    } else if (field === 'ENDPOINT') {
      source.endpoint = envValue;
    } else if (field === 'ACCESS_KEY') {
      source.accessKey = envValue;
    } else if (field === 'SECRET_KEY') {
      source.secretKey = envValue;
    } else if (field === 'REGION') {
      source.region = envValue;
    } else if (field === 'USE_SSL') {
      source.useSsl = envValue;
    } else if (field === 'VERIFY_SSL') {
      source.verifySsl = envValue;
    }

    sourceByIndex.set(index, source);
  }

  if (sourceByIndex.size === 0) {
    return undefined;
  }

  const sortedIndexes = [...sourceByIndex.keys()].sort((a, b) => a - b);

  return sortedIndexes.map((index) => {
    const source = sourceByIndex.get(index)!;
    const endpoint = optionalEnv(source.endpoint);
    const accessKey = optionalEnv(source.accessKey);
    const secretKey = optionalEnv(source.secretKey);

    if (!endpoint || !accessKey || !secretKey) {
      throw new Error(
        `S3 source ${index} is missing required values. Set S3_SOURCE_${index}_ENDPOINT, S3_SOURCE_${index}_ACCESS_KEY, and S3_SOURCE_${index}_SECRET_KEY`
      );
    }

    return {
      id: optionalEnv(source.id) ?? `source${index}`,
      endpoint,
      accessKey,
      secretKey,
      region: optionalEnv(source.region) ?? 'us-east-1',
      useSsl: parseBooleanEnv(source.useSsl, `S3_SOURCE_${index}_USE_SSL`, false),
      verifySsl: parseBooleanEnv(source.verifySsl, `S3_SOURCE_${index}_VERIFY_SSL`, false),
    };
  });
};
