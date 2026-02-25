import { describe, expect, it } from 'bun:test';
import { buildBreadcrumbs, joinObjectKey, normalizeVirtualPath, parseVirtualPath } from './path';
import { S3ServiceError } from './errors';

describe('s3 path helpers', () => {
  it('parses bucket root path', () => {
    expect(parseVirtualPath('my-bucket')).toEqual({
      bucketName: 'my-bucket',
      prefix: '',
    });
  });

  it('parses nested virtual paths with trailing slash', () => {
    expect(parseVirtualPath('/my-bucket/folder/sub/')).toEqual({
      bucketName: 'my-bucket',
      prefix: 'folder/sub/',
    });
  });

  it('throws for empty virtual path', () => {
    expect(() => parseVirtualPath('')).toThrow(S3ServiceError);
  });

  it('builds object keys with prefix', () => {
    expect(joinObjectKey('folder/sub/', 'file.txt')).toBe('folder/sub/file.txt');
  });

  it('normalizes repeated slashes', () => {
    expect(normalizeVirtualPath('///bucket///folder//')).toBe('bucket/folder');
  });

  it('creates breadcrumbs from virtual path', () => {
    expect(buildBreadcrumbs('my-bucket/folder/file.txt')).toEqual([
      { name: 'Home', path: '' },
      { name: 'my-bucket', path: 'my-bucket' },
      { name: 'folder', path: 'my-bucket/folder' },
      { name: 'file.txt', path: 'my-bucket/folder/file.txt' },
    ]);
  });
});
