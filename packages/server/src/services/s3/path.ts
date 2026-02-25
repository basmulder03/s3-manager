import { S3ServiceError } from '@/services/s3/errors';
import type { Breadcrumb } from '@/services/s3/types';

const normalizePath = (input: string): string => {
  return input
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/+/g, '/');
};

export const parseVirtualPath = (inputPath: string): { bucketName: string; prefix: string } => {
  const normalized = normalizePath(inputPath);

  if (normalized.length === 0) {
    throw new S3ServiceError('Path must include a bucket name', 'INVALID_PATH');
  }

  const [bucketName, ...rest] = normalized.split('/');
  if (!bucketName || bucketName.length === 0) {
    throw new S3ServiceError('Bucket name is required', 'INVALID_PATH');
  }

  const basePrefix = rest.join('/');
  const prefix = basePrefix.length > 0 && !basePrefix.endsWith('/') ? `${basePrefix}/` : basePrefix;

  return {
    bucketName,
    prefix,
  };
};

export const joinObjectKey = (prefix: string, name: string): string => {
  const cleanName = normalizePath(name);
  if (cleanName.length === 0) {
    throw new S3ServiceError('Name cannot be empty', 'INVALID_PATH');
  }

  if (prefix.length === 0) {
    return cleanName;
  }

  return `${prefix}${cleanName}`;
};

export const buildBreadcrumbs = (virtualPath: string): Breadcrumb[] => {
  const normalized = normalizePath(virtualPath);
  const breadcrumbs: Breadcrumb[] = [{ name: 'Home', path: '' }];

  if (normalized.length === 0) {
    return breadcrumbs;
  }

  const segments = normalized.split('/');
  let current = '';

  for (const segment of segments) {
    current = current.length > 0 ? `${current}/${segment}` : segment;
    breadcrumbs.push({ name: segment, path: current });
  }

  return breadcrumbs;
};

export const normalizeVirtualPath = (inputPath: string): string => normalizePath(inputPath);
