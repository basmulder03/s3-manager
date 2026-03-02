import type { S3ServiceException } from '@aws-sdk/client-s3';
import { S3ServiceError } from '@/services/s3/errors';

export const toIso = (date: Date | undefined): string | null => (date ? date.toISOString() : null);

export const mapError = (error: unknown, fallbackMessage: string): S3ServiceError => {
  if (error instanceof S3ServiceError) {
    return error;
  }

  if (error instanceof Error && 'name' in error && '$metadata' in error) {
    return new S3ServiceError(fallbackMessage, (error as S3ServiceException).name, error);
  }

  if (error instanceof Error) {
    return new S3ServiceError(fallbackMessage, 'S3_UNKNOWN_ERROR', error);
  }

  return new S3ServiceError(fallbackMessage, 'S3_UNKNOWN_ERROR', error);
};

export const metricActor = (actor: string | undefined): string => {
  return actor && actor.trim().length > 0 ? actor.trim() : 'anonymous';
};

export const toCopySource = (bucketName: string, objectKey: string): string => {
  return `/${bucketName}/${encodeURIComponent(objectKey).replace(/%2F/g, '/')}`;
};

export const normalizeMetadataValue = (value: string): string => value.trim();

export const buildUploadMetadata = (
  actor: string,
  provided?: Record<string, string>
): Record<string, string> => {
  const metadata: Record<string, string> = {
    uploaded_by: actor,
    uploaded_at: new Date().toISOString(),
    source: 's3-manager-web',
  };

  if (!provided) {
    return metadata;
  }

  for (const [key, value] of Object.entries(provided)) {
    const normalizedKey = key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');
    const normalizedValue = normalizeMetadataValue(value);

    if (normalizedKey.length === 0 || normalizedValue.length === 0) {
      continue;
    }

    metadata[`app_${normalizedKey}`] = normalizedValue;
  }

  return metadata;
};

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

export const ensureRenameTarget = (
  sourceKey: string,
  newName?: string,
  destinationPrefix?: string,
  hasDestinationPath = false
): string => {
  if (hasDestinationPath) {
    const normalizedDestinationPrefix = destinationPrefix ?? '';
    const cleanSource = sourceKey.endsWith('/') ? sourceKey.slice(0, -1) : sourceKey;
    const sourceName = cleanSource.split('/').pop();
    if (!sourceName || sourceName.length === 0) {
      throw new S3ServiceError('Unable to resolve source name for move operation', 'INVALID_PATH');
    }

    return sourceKey.endsWith('/')
      ? `${normalizedDestinationPrefix}${sourceName}/`
      : `${normalizedDestinationPrefix}${sourceName}`;
  }

  if (!newName || newName.trim().length === 0) {
    throw new S3ServiceError('Either newName or destinationPath is required', 'INVALID_PATH');
  }

  const normalizedName = newName.trim();
  if (normalizedName.includes('/')) {
    throw new S3ServiceError('newName cannot contain path separators', 'INVALID_PATH');
  }

  const cleanSource = sourceKey.endsWith('/') ? sourceKey.slice(0, -1) : sourceKey;
  const parentParts = cleanSource.split('/').slice(0, -1);
  const parentPrefix = parentParts.length > 0 ? `${parentParts.join('/')}/` : '';

  return sourceKey.endsWith('/')
    ? `${parentPrefix}${normalizedName}/`
    : `${parentPrefix}${normalizedName}`;
};

export const normalizeEtag = (etag: string | null | undefined): string | null => {
  if (!etag) {
    return null;
  }

  return etag.replace(/^"|"$/g, '').trim();
};

export const normalizeMetadataEntries = (
  metadata: Record<string, string>
): Record<string, string> => {
  const normalized: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(metadata)) {
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.trim();
    if (key.length === 0 || value.length === 0) {
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
};

export const resolveOptionalHeaderValue = (
  requested: string | null | undefined,
  existing: string | undefined
): string | undefined => {
  if (requested === undefined) {
    return existing;
  }

  if (requested === null) {
    return undefined;
  }

  const trimmed = requested.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const readBodyAsBytes = async (body: unknown): Promise<Uint8Array> => {
  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof Blob) {
    const arrayBuffer = await body.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  if (typeof body === 'string') {
    return new TextEncoder().encode(body);
  }

  if (body && typeof body === 'object' && 'transformToByteArray' in body) {
    const transformMethod = (body as { transformToByteArray: () => Promise<Uint8Array> })
      .transformToByteArray;
    if (typeof transformMethod === 'function') {
      return await transformMethod.call(body);
    }
  }

  throw new S3ServiceError('Unable to read response body as bytes', 'INVALID_RESPONSE_BODY');
};
