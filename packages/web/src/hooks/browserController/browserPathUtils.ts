import type { BrowseItem } from '@server/services/s3/types';

/**
 * Split an object path into bucket name and object key
 * @example
 * splitObjectPath('my-bucket/folder/file.txt')
 * // => { bucketName: 'my-bucket', objectKey: 'folder/file.txt' }
 */
export const splitObjectPath = (path: string): { bucketName: string; objectKey: string } => {
  const [bucketName, ...parts] = path.split('/');
  return {
    bucketName: bucketName ?? '',
    objectKey: parts.join('/'),
  };
};

/**
 * Resolve a destination path for move operations, handling special cases:
 * - '/' or '\' resolves to bucket root
 * - Relative paths are resolved relative to source bucket
 * - Absolute paths (containing '/') are used as-is
 */
export const resolveMoveDestinationPath = (
  sourcePath: string,
  rawDestinationPath: string
): string => {
  const sourceBucketReference = sourcePath.split('/')[0] ?? '';
  const trimmedDestinationPath = rawDestinationPath.trim();
  if (
    (trimmedDestinationPath === '/' || trimmedDestinationPath === '\\') &&
    sourceBucketReference
  ) {
    return sourceBucketReference;
  }

  const destinationPath = rawDestinationPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!destinationPath) {
    return '';
  }

  if (!sourceBucketReference) {
    return destinationPath;
  }

  if (destinationPath.includes('/')) {
    return destinationPath;
  }

  if (destinationPath.includes(':') || destinationPath === sourceBucketReference) {
    return destinationPath;
  }

  return `${sourceBucketReference}/${destinationPath}`;
};

/**
 * Check if a path refers to a bucket root (no '/' in path)
 */
export const isBucketRootPath = (path: string): boolean => {
  return !path.includes('/');
};

/**
 * Check if an item is a bucket root directory
 */
export const isBucketRootDirectory = (item: BrowseItem): boolean => {
  return item.type === 'directory' && isBucketRootPath(item.path);
};

/**
 * Get all ancestor directories for a given path
 * @example
 * getAncestorDirectories('bucket/folder/subfolder')
 * // => ['', 'bucket', 'bucket/folder', 'bucket/folder/subfolder']
 */
export const getAncestorDirectories = (directoryPath: string): string[] => {
  const normalized = directoryPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) {
    return [''];
  }

  const segments = normalized.split('/');
  const ancestors = [''];
  for (let index = 0; index < segments.length; index += 1) {
    ancestors.push(segments.slice(0, index + 1).join('/'));
  }
  return ancestors;
};

/**
 * Get the parent directory path for a given path
 * @example
 * getParentDirectoryPath('bucket/folder/file.txt')
 * // => 'bucket/folder'
 */
export const getParentDirectoryPath = (path: string): string => {
  const normalized = path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }

  const parts = normalized.split('/');
  return parts.slice(0, -1).join('/');
};

/**
 * Parse an expires value as ISO date string
 * Returns null if the value is empty or invalid
 */
export const parseExpiresAsIso = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};
