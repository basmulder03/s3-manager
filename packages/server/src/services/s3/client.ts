import { S3Client } from '@aws-sdk/client-s3';
import { config } from '@/config';

const clientsBySource = new Map<string, S3Client>();

const SOURCE_BUCKET_DELIMITER = ':';

export interface S3ResolvedBucketTarget {
  sourceId: string;
  bucketName: string;
  bucketReference: string;
}

export const listS3SourceIds = (): string[] => {
  return config.s3.sources.map((source) => source.id);
};

export const toBucketReference = (sourceId: string, bucketName: string): string => {
  if (config.s3.sources.length <= 1) {
    return bucketName;
  }

  return `${sourceId}${SOURCE_BUCKET_DELIMITER}${bucketName}`;
};

export const resolveBucketReference = (bucketReference: string): S3ResolvedBucketTarget => {
  const trimmed = bucketReference.trim();
  if (trimmed.length === 0) {
    throw new Error('Bucket reference must not be empty');
  }

  const delimiterIndex = trimmed.indexOf(SOURCE_BUCKET_DELIMITER);
  if (delimiterIndex > 0) {
    const sourceId = trimmed.slice(0, delimiterIndex);
    const bucketName = trimmed.slice(delimiterIndex + SOURCE_BUCKET_DELIMITER.length);
    if (bucketName.length === 0) {
      throw new Error('Bucket name must not be empty');
    }

    if (config.s3.sources.some((source) => source.id === sourceId)) {
      return {
        sourceId,
        bucketName,
        bucketReference: toBucketReference(sourceId, bucketName),
      };
    }
  }

  const defaultSourceId = config.s3.defaultSourceId;
  return {
    sourceId: defaultSourceId,
    bucketName: trimmed,
    bucketReference: toBucketReference(defaultSourceId, trimmed),
  };
};

export const getS3Client = (sourceId = config.s3.defaultSourceId): S3Client => {
  const existing = clientsBySource.get(sourceId);
  if (existing) {
    return existing;
  }

  const source = config.s3.sources.find((candidate) => candidate.id === sourceId);
  if (!source) {
    throw new Error(`Unknown S3 source '${sourceId}'`);
  }

  const client = new S3Client({
    region: source.region,
    endpoint: source.endpoint,
    credentials: {
      accessKeyId: source.accessKey,
      secretAccessKey: source.secretKey,
    },
    forcePathStyle: true,
    tls: source.useSsl,
  });

  clientsBySource.set(sourceId, client);
  return client;
};
