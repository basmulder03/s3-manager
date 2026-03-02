/**
 * Path manipulation utilities for virtual S3 paths
 */

/**
 * Normalizes a virtual path by removing leading/trailing slashes
 * @param value - The path to normalize
 * @returns Normalized path
 */
export const normalizeVirtualPath = (value: string): string =>
  value.trim().replace(/^\/+/, '').replace(/\/+$/, '');

/**
 * Extracts the bucket name from a virtual path
 * @param path - The virtual path (e.g., "my-bucket/folder/file.txt")
 * @returns The bucket name (e.g., "my-bucket"), or empty string if no bucket
 */
export const getBucketNameFromPath = (path: string): string => {
  const normalized = normalizeVirtualPath(path);
  if (!normalized) {
    return '';
  }

  const [bucketName = ''] = normalized.split('/');
  return bucketName;
};
