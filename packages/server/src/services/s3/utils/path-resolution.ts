import { S3ServiceError } from '@/services/s3/errors';
import { resolveBucketReference } from '@/services/s3/client';

/**
 * Parse a path string into bucket name and object key components
 */
export const parsePathToBucketAndKey = (
  path: string
): { bucketName: string; objectKey: string } => {
  const normalizedPath = path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  const [bucketName, ...parts] = normalizedPath.split('/');

  if (!bucketName || bucketName.length === 0) {
    throw new S3ServiceError('Path must include bucket name', 'INVALID_PATH');
  }

  const objectKey = parts.join('/');
  if (!objectKey || objectKey.length === 0) {
    throw new S3ServiceError('Path must include object key', 'INVALID_PATH');
  }

  return {
    bucketName,
    objectKey,
  };
};

/**
 * Resolve a path to its source ID, bucket name, bucket reference, and object key
 */
export const resolvePathTarget = (
  path: string
): { sourceId: string; bucketName: string; bucketReference: string; objectKey: string } => {
  const { bucketName, objectKey } = parsePathToBucketAndKey(path);
  const resolved = resolveBucketReference(bucketName);

  return {
    sourceId: resolved.sourceId,
    bucketName: resolved.bucketName,
    bucketReference: resolved.bucketReference,
    objectKey,
  };
};
