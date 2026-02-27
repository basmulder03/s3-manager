import {
  AbortMultipartUploadCommand,
  CopyObjectCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3ServiceException,
  UploadPartCommand,
  type CompletedPart,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getLogger } from '@/telemetry';
import { recordS3FileAccess } from '@/telemetry/metrics';
import { getS3Client } from '@/services/s3/client';
import { S3ServiceError } from '@/services/s3/errors';
import {
  buildBreadcrumbs,
  joinObjectKey,
  normalizeVirtualPath,
  parseVirtualPath,
} from '@/services/s3/path';
import type {
  AbortMultipartUploadInput,
  BrowseItem,
  BrowseResult,
  CompleteMultipartUploadInput,
  CompleteMultipartUploadResult,
  CreateMultipartPartUrlInput,
  CreateMultipartPartUrlResult,
  CreateFolderInput,
  DeleteFolderInput,
  DeleteFolderResult,
  DeleteMultipleInput,
  DeleteMultipleResult,
  DeleteObjectInput,
  InitiateMultipartUploadInput,
  InitiateMultipartUploadResult,
  ListObjectsInput,
  ListObjectsResult,
  ObjectMetadataInput,
  ObjectMetadataResult,
  ObjectPropertiesInput,
  ObjectPropertiesResult,
  ObjectTextContentInput,
  ObjectTextContentResult,
  ProxyUploadInput,
  ProxyUploadResult,
  PresignedUploadInput,
  PresignedUploadResult,
  RenameItemInput,
  RenameItemResult,
  S3BucketSummary,
  S3ObjectSummary,
  UpdateObjectTextContentInput,
  UpdateObjectTextContentResult,
} from '@/services/s3/types';

const s3Logger = () => getLogger('S3');

const toIso = (date: Date | undefined): string | null => (date ? date.toISOString() : null);

const mapError = (error: unknown, fallbackMessage: string): S3ServiceError => {
  if (error instanceof S3ServiceError) {
    return error;
  }

  if (error instanceof S3ServiceException) {
    return new S3ServiceError(fallbackMessage, error.name, error);
  }

  if (error instanceof Error) {
    return new S3ServiceError(fallbackMessage, 'S3_UNKNOWN_ERROR', error);
  }

  return new S3ServiceError(fallbackMessage, 'S3_UNKNOWN_ERROR', error);
};

const metricActor = (actor: string | undefined): string => {
  return actor && actor.trim().length > 0 ? actor.trim() : 'anonymous';
};

const toCopySource = (bucketName: string, objectKey: string): string => {
  return `/${bucketName}/${encodeURIComponent(objectKey).replace(/%2F/g, '/')}`;
};

const ensureRenameTarget = (
  sourceKey: string,
  newName?: string,
  destinationPrefix?: string
): string => {
  if (destinationPrefix && destinationPrefix.length > 0) {
    const cleanSource = sourceKey.endsWith('/') ? sourceKey.slice(0, -1) : sourceKey;
    const sourceName = cleanSource.split('/').pop();
    if (!sourceName || sourceName.length === 0) {
      throw new S3ServiceError('Unable to resolve source name for move operation', 'INVALID_PATH');
    }

    return sourceKey.endsWith('/')
      ? `${destinationPrefix}${sourceName}/`
      : `${destinationPrefix}${sourceName}`;
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

const normalizeMetadataValue = (value: string): string => value.trim();

const buildUploadMetadata = (
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

const parsePathToBucketAndKey = (path: string): { bucketName: string; objectKey: string } => {
  const normalizedPath = normalizeVirtualPath(path);
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

const MAX_TEXT_OBJECT_BYTES = 1024 * 1024;

const TEXT_CONTENT_TYPE_MARKERS = [
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/x-yaml',
  'application/yaml',
  'application/x-sh',
  'application/x-httpd-php',
];

const TEXT_EXTENSION_ALLOWLIST = new Set([
  '.txt',
  '.md',
  '.json',
  '.yaml',
  '.yml',
  '.csv',
  '.log',
  '.xml',
  '.html',
  '.css',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
]);

const textDecoder = new TextDecoder('utf-8', { fatal: true });

const normalizeEtag = (etag: string | null | undefined): string | null => {
  if (!etag) {
    return null;
  }

  return etag.replace(/^"|"$/g, '').trim();
};

const hasAllowedTextExtension = (objectKey: string): boolean => {
  const fileName = objectKey.split('/').pop() ?? objectKey;
  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex <= 0) {
    return false;
  }

  return TEXT_EXTENSION_ALLOWLIST.has(fileName.slice(extensionIndex).toLowerCase());
};

const isTextContentType = (contentType: string | null | undefined): boolean => {
  if (!contentType || contentType.trim().length === 0) {
    return false;
  }

  const normalized = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (normalized.startsWith('text/')) {
    return true;
  }

  return TEXT_CONTENT_TYPE_MARKERS.some((marker) => normalized === marker);
};

const canReadOrWriteAsText = (
  objectKey: string,
  contentType: string | null | undefined
): boolean => {
  return hasAllowedTextExtension(objectKey) || isTextContentType(contentType);
};

const readBodyAsBytes = async (body: unknown): Promise<Uint8Array> => {
  if (!body) {
    return new Uint8Array();
  }

  const candidate = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    transformToString?: (encoding?: string) => Promise<string>;
  };

  if (typeof candidate.transformToByteArray === 'function') {
    return candidate.transformToByteArray();
  }

  if (typeof candidate.transformToString === 'function') {
    const text = await candidate.transformToString('utf-8');
    return new TextEncoder().encode(text);
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value) {
        chunks.push(value);
        totalLength += value.byteLength;
      }
    }

    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return merged;
  }

  throw new S3ServiceError('Unable to read object body as bytes', 'S3_UNKNOWN_ERROR');
};

export class S3Service {
  constructor(private readonly clientProvider: () => S3Client = getS3Client) {}

  async listBuckets(actor?: string): Promise<S3BucketSummary[]> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const client = this.clientProvider();
      const response = await client.send(new ListBucketsCommand({}));
      const buckets = (response.Buckets ?? []).map<S3BucketSummary>((bucket) => ({
        name: bucket.Name ?? '',
        creationDate: toIso(bucket.CreationDate),
      }));

      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: '*',
          objectKey: '*',
          result: 'success',
        },
        Date.now() - startedAt
      );

      return buckets.filter((bucket) => bucket.name.length > 0);
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: '*',
          objectKey: '*',
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, 'Failed to list buckets');
    }
  }

  async listObjects(input: ListObjectsInput, actor?: string): Promise<ListObjectsResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const client = this.clientProvider();
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: input.bucketName,
          Prefix: input.prefix ?? '',
          MaxKeys: input.maxKeys ?? 1000,
          ContinuationToken: input.continuationToken,
        })
      );

      const objects = (response.Contents ?? []).map<S3ObjectSummary>((item) => ({
        key: item.Key ?? '',
        size: item.Size ?? 0,
        lastModified: toIso(item.LastModified),
        etag: item.ETag ?? null,
      }));

      const result: ListObjectsResult = {
        objects: objects.filter((item) => item.key.length > 0),
        isTruncated: response.IsTruncated ?? false,
        keyCount: response.KeyCount ?? 0,
      };

      if (response.NextContinuationToken) {
        result.nextContinuationToken = response.NextContinuationToken;
      }

      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.prefix ?? '*',
          result: 'success',
        },
        Date.now() - startedAt
      );

      return result;
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.prefix ?? '*',
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to list objects for bucket '${input.bucketName}'`);
    }
  }

  async getObjectMetadata(
    input: ObjectMetadataInput,
    actor?: string
  ): Promise<ObjectMetadataResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const client = this.clientProvider();
      const headResponse = await client.send(
        new HeadObjectCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
        })
      );

      const expiresInSeconds = input.expiresInSeconds ?? 3600;
      const downloadUrl = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
        }),
        {
          expiresIn: expiresInSeconds,
        }
      );

      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        key: input.objectKey,
        size: headResponse.ContentLength ?? 0,
        contentType: headResponse.ContentType ?? 'application/octet-stream',
        lastModified: toIso(headResponse.LastModified),
        etag: headResponse.ETag ?? null,
        downloadUrl,
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to fetch object metadata for '${input.objectKey}'`);
    }
  }

  async getObjectProperties(
    input: ObjectPropertiesInput,
    actor?: string
  ): Promise<ObjectPropertiesResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const { bucketName, objectKey } = parsePathToBucketAndKey(input.path);
      const client = this.clientProvider();
      const headResponse = await client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
        })
      );

      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: bucketName,
          objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        name: objectKey.split('/').pop() ?? objectKey,
        key: objectKey,
        size: headResponse.ContentLength ?? 0,
        contentType: headResponse.ContentType ?? 'application/octet-stream',
        lastModified: toIso(headResponse.LastModified),
        etag: headResponse.ETag ? headResponse.ETag.replace(/^"|"$/g, '') : null,
        storageClass: headResponse.StorageClass ?? 'STANDARD',
        metadata: headResponse.Metadata ?? {},
        ...(headResponse.VersionId ? { versionId: headResponse.VersionId } : {}),
        ...(headResponse.CacheControl ? { cacheControl: headResponse.CacheControl } : {}),
        ...(headResponse.ContentDisposition
          ? { contentDisposition: headResponse.ContentDisposition }
          : {}),
        ...(headResponse.ContentEncoding ? { contentEncoding: headResponse.ContentEncoding } : {}),
        ...(headResponse.ContentLanguage ? { contentLanguage: headResponse.ContentLanguage } : {}),
        ...(headResponse.Expires ? { expires: headResponse.Expires.toISOString() } : {}),
        ...(headResponse.ServerSideEncryption
          ? { serverSideEncryption: headResponse.ServerSideEncryption }
          : {}),
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: '*',
          objectKey: input.path,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to fetch object properties for '${input.path}'`);
    }
  }

  async getObjectTextContent(
    input: ObjectTextContentInput,
    actor?: string
  ): Promise<ObjectTextContentResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const { bucketName, objectKey } = parsePathToBucketAndKey(input.path);
      const client = this.clientProvider();
      const headResponse = await client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
        })
      );

      const size = headResponse.ContentLength ?? 0;
      const contentType = headResponse.ContentType ?? 'application/octet-stream';
      if (!canReadOrWriteAsText(objectKey, contentType)) {
        throw new S3ServiceError('This file type cannot be viewed as text', 'ValidationError');
      }

      if (size > MAX_TEXT_OBJECT_BYTES) {
        throw new S3ServiceError(
          `Text preview is limited to ${MAX_TEXT_OBJECT_BYTES} bytes`,
          'ValidationError'
        );
      }

      const objectResponse = await client.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
        })
      );

      const bytes = await readBodyAsBytes(objectResponse.Body);
      let content = '';
      try {
        content = textDecoder.decode(bytes);
      } catch {
        throw new S3ServiceError('Object is not valid UTF-8 text', 'ValidationError');
      }

      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: bucketName,
          objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        path: input.path,
        content,
        size,
        contentType,
        etag: normalizeEtag(headResponse.ETag),
        lastModified: toIso(headResponse.LastModified),
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: '*',
          objectKey: input.path,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to fetch text content for '${input.path}'`);
    }
  }

  async updateObjectTextContent(
    input: UpdateObjectTextContentInput,
    actor?: string
  ): Promise<UpdateObjectTextContentResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const { bucketName, objectKey } = parsePathToBucketAndKey(input.path);
      const client = this.clientProvider();
      const headResponse = await client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
        })
      );

      const existingContentType = headResponse.ContentType ?? 'application/octet-stream';
      if (!canReadOrWriteAsText(objectKey, existingContentType)) {
        throw new S3ServiceError('This file type cannot be edited as text', 'ValidationError');
      }

      const currentEtag = normalizeEtag(headResponse.ETag);
      const expectedEtag = normalizeEtag(input.expectedEtag);
      if (expectedEtag && currentEtag && expectedEtag !== currentEtag) {
        throw new S3ServiceError('File changed since it was opened', 'ETAG_MISMATCH');
      }

      const body = new TextEncoder().encode(input.content);
      if (body.byteLength > MAX_TEXT_OBJECT_BYTES) {
        throw new S3ServiceError(
          `Text editing is limited to ${MAX_TEXT_OBJECT_BYTES} bytes`,
          'ValidationError'
        );
      }

      const putResponse = await client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
          Body: body,
          ContentType: existingContentType,
          Metadata: headResponse.Metadata,
        })
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: bucketName,
          objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        path: input.path,
        size: body.byteLength,
        contentType: existingContentType,
        etag: normalizeEtag(putResponse.ETag),
        lastModified: new Date().toISOString(),
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: '*',
          objectKey: input.path,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to update text content for '${input.path}'`);
    }
  }

  async createPresignedUpload(
    input: PresignedUploadInput,
    actor?: string
  ): Promise<PresignedUploadResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const client = this.clientProvider();
      const expiresInSeconds = input.expiresInSeconds ?? 900;
      const metadata = buildUploadMetadata(safeActor, input.metadata);
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
          ContentType: input.contentType,
          Metadata: metadata,
        }),
        {
          expiresIn: expiresInSeconds,
        }
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        uploadUrl,
        key: input.objectKey,
        expiresInSeconds,
        requiredHeaders: {
          ...(input.contentType ? { 'Content-Type': input.contentType } : {}),
          ...Object.fromEntries(
            Object.entries(metadata).map(([key, value]) => [`x-amz-meta-${key}`, value])
          ),
        },
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to generate upload URL for '${input.objectKey}'`);
    }
  }

  async uploadObjectViaProxy(input: ProxyUploadInput, actor?: string): Promise<ProxyUploadResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const client = this.clientProvider();
      const metadata = buildUploadMetadata(safeActor, input.metadata);
      const result = await client.send(
        new PutObjectCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
          Body: input.body,
          ContentType: input.contentType,
          Metadata: metadata,
        })
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        key: input.objectKey,
        etag: result.ETag ?? null,
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to proxy upload for '${input.objectKey}'`);
    }
  }

  async deleteObject(input: DeleteObjectInput, actor?: string): Promise<void> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const client = this.clientProvider();
      await client.send(
        new DeleteObjectCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
        })
      );

      recordS3FileAccess(
        {
          operation: 'delete',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'delete',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to delete object '${input.objectKey}'`);
    }
  }

  async deleteMultiple(input: DeleteMultipleInput, actor?: string): Promise<DeleteMultipleResult> {
    if (input.paths.length === 0) {
      throw new S3ServiceError('No paths provided', 'INVALID_PATH');
    }

    const errors: Array<{ path: string; error: string }> = [];
    let deletedCount = 0;

    for (const path of input.paths) {
      try {
        const { bucketName, objectKey } = parsePathToBucketAndKey(path);
        const normalizedPath = normalizeVirtualPath(path);
        const folderPrefix = objectKey.endsWith('/') ? objectKey : `${objectKey}/`;
        const client = this.clientProvider();

        const folderProbe = await client.send(
          new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: folderPrefix,
            MaxKeys: 1,
          })
        );

        const hasFolderContents = (folderProbe.Contents ?? []).length > 0;
        if (hasFolderContents) {
          const folderResult = await this.deleteFolder({ path: normalizedPath }, actor);
          deletedCount += folderResult.deletedCount;
        } else {
          await this.deleteObject({ bucketName, objectKey }, actor);
          deletedCount += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown delete error';
        errors.push({ path, error: message });
      }
    }

    return {
      message: `Deleted ${deletedCount} item(s)`,
      deletedCount,
      ...(errors.length > 0 ? { errors } : {}),
    };
  }

  async browse(virtualPath = '', actor?: string): Promise<BrowseResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const normalizedPath = normalizeVirtualPath(virtualPath);
      if (normalizedPath.length === 0) {
        const buckets = await this.listBuckets(actor);
        const items: BrowseItem[] = buckets.map((bucket) => ({
          name: bucket.name,
          type: 'directory',
          path: bucket.name,
          size: null,
          lastModified: bucket.creationDate,
        }));

        return {
          path: '/',
          breadcrumbs: [{ name: 'Home', path: '' }],
          items,
        };
      }

      const { bucketName, prefix } = parseVirtualPath(normalizedPath);
      const client = this.clientProvider();
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          Delimiter: '/',
        })
      );

      const directories = (response.CommonPrefixes ?? []).flatMap<BrowseItem>((commonPrefix) => {
        const folderPrefix = commonPrefix.Prefix;
        if (!folderPrefix) {
          return [];
        }

        const name = folderPrefix.slice(prefix.length).replace(/\/$/, '');
        if (name.length === 0) {
          return [];
        }

        return [
          {
            name,
            type: 'directory',
            path: `${bucketName}/${folderPrefix.replace(/\/$/, '')}`,
            size: null,
            lastModified: null,
          },
        ];
      });

      const files = (response.Contents ?? []).flatMap<BrowseItem>((item) => {
        const key = item.Key;
        if (!key || key === prefix) {
          return [];
        }

        const name = key.slice(prefix.length);
        if (name.length === 0 || name.includes('/')) {
          return [];
        }

        return [
          {
            name,
            type: 'file',
            path: `${bucketName}/${key}`,
            size: item.Size ?? 0,
            lastModified: toIso(item.LastModified),
            etag: item.ETag,
          },
        ];
      });

      const items = [...directories, ...files].sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === 'directory' ? -1 : 1;
        }
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      });

      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: bucketName,
          objectKey: prefix || '*',
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        path: `/${normalizedPath}`,
        breadcrumbs: buildBreadcrumbs(normalizedPath),
        items,
      };
    } catch (error) {
      s3Logger().error({ err: error, virtualPath }, 'Failed to browse virtual path');
      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: '*',
          objectKey: virtualPath || '*',
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, 'Failed to browse files');
    }
  }

  async createFolder(input: CreateFolderInput, actor?: string): Promise<{ path: string }> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const { bucketName, prefix } = parseVirtualPath(input.path);
      const folderKey = `${joinObjectKey(prefix, input.folderName)}/`;

      const client = this.clientProvider();
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: folderKey,
          Body: '',
        })
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: bucketName,
          objectKey: folderKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        path: `${bucketName}/${folderKey}`,
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: '*',
          objectKey: input.path,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, 'Failed to create folder');
    }
  }

  async deleteFolder(input: DeleteFolderInput, actor?: string): Promise<DeleteFolderResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const { bucketName, prefix } = parseVirtualPath(input.path);
      if (!prefix || prefix.length === 0) {
        throw new S3ServiceError('Cannot delete bucket root with deleteFolder', 'INVALID_PATH');
      }

      const client = this.clientProvider();
      let continuationToken: string | undefined;
      const keysToDelete: Array<{ Key: string }> = [];

      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        );

        for (const item of response.Contents ?? []) {
          if (item.Key) {
            keysToDelete.push({ Key: item.Key });
          }
        }

        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (continuationToken);

      if (keysToDelete.length === 0) {
        return { deletedCount: 0 };
      }

      let deletedCount = 0;
      for (let i = 0; i < keysToDelete.length; i += 1000) {
        const batch = keysToDelete.slice(i, i + 1000);
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: batch,
            },
          })
        );
        deletedCount += batch.length;
      }

      recordS3FileAccess(
        {
          operation: 'delete',
          actor: safeActor,
          bucket: bucketName,
          objectKey: prefix,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return { deletedCount };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'delete',
          actor: safeActor,
          bucket: '*',
          objectKey: input.path,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, 'Failed to delete folder');
    }
  }

  async renameItem(input: RenameItemInput, actor?: string): Promise<RenameItemResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const normalizedSourcePath = normalizeVirtualPath(input.sourcePath);
      const [sourceBucket, ...sourceParts] = normalizedSourcePath.split('/');
      if (!sourceBucket || sourceBucket.length === 0 || sourceParts.length === 0) {
        throw new S3ServiceError('sourcePath must include bucket and key', 'INVALID_PATH');
      }

      const sourceKeyRaw = sourceParts.join('/');
      const sourcePrefix = input.sourcePath.trim().endsWith('/')
        ? `${sourceKeyRaw.replace(/\/+$/, '')}/`
        : sourceKeyRaw;

      if (sourcePrefix.length === 0) {
        throw new S3ServiceError('Renaming bucket roots is not supported', 'INVALID_PATH');
      }

      const destinationBase = (() => {
        if (!input.destinationPath) {
          return null;
        }

        const normalizedDestinationPath = normalizeVirtualPath(input.destinationPath);
        const [destinationBucket, ...destinationParts] = normalizedDestinationPath.split('/');
        if (!destinationBucket || destinationBucket.length === 0) {
          throw new S3ServiceError('destinationPath must include bucket name', 'INVALID_PATH');
        }

        const destinationPrefixRaw = destinationParts.join('/');
        const destinationPrefix =
          destinationPrefixRaw.length > 0 ? `${destinationPrefixRaw.replace(/\/+$/, '')}/` : '';

        return {
          bucketName: destinationBucket,
          prefix: destinationPrefix,
        };
      })();

      if (destinationBase && destinationBase.bucketName !== sourceBucket) {
        throw new S3ServiceError('Cross-bucket move is not supported', 'INVALID_PATH');
      }

      const targetKey = ensureRenameTarget(sourcePrefix, input.newName, destinationBase?.prefix);
      if (targetKey === sourcePrefix) {
        throw new S3ServiceError('Source and destination are identical', 'INVALID_PATH');
      }

      const client = this.clientProvider();

      if (sourcePrefix.endsWith('/')) {
        let continuationToken: string | undefined;
        const sourceKeys: string[] = [];

        do {
          const response = await client.send(
            new ListObjectsV2Command({
              Bucket: sourceBucket,
              Prefix: sourcePrefix,
              ContinuationToken: continuationToken,
            })
          );

          for (const item of response.Contents ?? []) {
            if (item.Key) {
              sourceKeys.push(item.Key);
            }
          }

          continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
        } while (continuationToken);

        if (sourceKeys.length === 0) {
          throw new S3ServiceError('Source folder is empty or not found', 'NoSuchKey');
        }

        for (const sourceKey of sourceKeys) {
          const suffix = sourceKey.slice(sourcePrefix.length);
          const destinationKey = `${targetKey}${suffix}`;

          await client.send(
            new CopyObjectCommand({
              Bucket: sourceBucket,
              CopySource: toCopySource(sourceBucket, sourceKey),
              Key: destinationKey,
            })
          );
        }

        for (let i = 0; i < sourceKeys.length; i += 1000) {
          const batch = sourceKeys.slice(i, i + 1000).map((Key) => ({ Key }));
          await client.send(
            new DeleteObjectsCommand({
              Bucket: sourceBucket,
              Delete: { Objects: batch },
            })
          );
        }

        recordS3FileAccess(
          {
            operation: 'write',
            actor: safeActor,
            bucket: sourceBucket,
            objectKey: sourcePrefix,
            result: 'success',
          },
          Date.now() - startedAt
        );

        return {
          sourcePath: input.sourcePath,
          destinationPath: `${sourceBucket}/${targetKey.replace(/\/$/, '')}`,
          movedObjects: sourceKeys.length,
        };
      }

      await client.send(
        new CopyObjectCommand({
          Bucket: sourceBucket,
          CopySource: toCopySource(sourceBucket, sourcePrefix),
          Key: targetKey,
        })
      );

      await client.send(
        new DeleteObjectCommand({
          Bucket: sourceBucket,
          Key: sourcePrefix,
        })
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: sourceBucket,
          objectKey: sourcePrefix,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        sourcePath: input.sourcePath,
        destinationPath: `${sourceBucket}/${targetKey}`,
        movedObjects: 1,
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: '*',
          objectKey: input.sourcePath,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, 'Failed to rename/move item');
    }
  }

  async initiateMultipartUpload(
    input: InitiateMultipartUploadInput,
    actor?: string
  ): Promise<InitiateMultipartUploadResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const client = this.clientProvider();
      const metadata = buildUploadMetadata(safeActor, input.metadata);
      const response = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
          ContentType: input.contentType,
          Metadata: metadata,
        })
      );

      if (!response.UploadId) {
        throw new S3ServiceError('S3 did not return an uploadId', 'MULTIPART_INIT_FAILED');
      }

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        uploadId: response.UploadId,
        key: input.objectKey,
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to start multipart upload for '${input.objectKey}'`);
    }
  }

  async createMultipartPartUploadUrl(
    input: CreateMultipartPartUrlInput,
    actor?: string
  ): Promise<CreateMultipartPartUrlResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const client = this.clientProvider();
      const expiresInSeconds = input.expiresInSeconds ?? 900;
      const uploadUrl = await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
          UploadId: input.uploadId,
          PartNumber: input.partNumber,
        }),
        {
          expiresIn: expiresInSeconds,
        }
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        uploadUrl,
        partNumber: input.partNumber,
        expiresInSeconds,
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(
        error,
        `Failed to create multipart URL for '${input.objectKey}' part ${input.partNumber}`
      );
    }
  }

  async completeMultipartUpload(
    input: CompleteMultipartUploadInput,
    actor?: string
  ): Promise<CompleteMultipartUploadResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const client = this.clientProvider();
      const parts: CompletedPart[] = input.parts
        .map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        }))
        .sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0));

      const response = await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
          UploadId: input.uploadId,
          MultipartUpload: {
            Parts: parts,
          },
        })
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        key: input.objectKey,
        etag: response.ETag ?? null,
        location: response.Location ?? null,
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to complete multipart upload for '${input.objectKey}'`);
    }
  }

  async abortMultipartUpload(input: AbortMultipartUploadInput, actor?: string): Promise<void> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const client = this.clientProvider();
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
          UploadId: input.uploadId,
        })
      );

      recordS3FileAccess(
        {
          operation: 'delete',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'delete',
          actor: safeActor,
          bucket: input.bucketName,
          objectKey: input.objectKey,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to abort multipart upload for '${input.objectKey}'`);
    }
  }
}
