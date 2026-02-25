import {
  AbortMultipartUploadCommand,
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
import { buildBreadcrumbs, joinObjectKey, normalizeVirtualPath, parseVirtualPath } from '@/services/s3/path';
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
  DeleteObjectInput,
  InitiateMultipartUploadInput,
  InitiateMultipartUploadResult,
  ListObjectsInput,
  ListObjectsResult,
  ObjectMetadataInput,
  ObjectMetadataResult,
  PresignedUploadInput,
  PresignedUploadResult,
  S3BucketSummary,
  S3ObjectSummary,
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

const normalizeMetadataValue = (value: string): string => value.trim();

const buildUploadMetadata = (actor: string, provided?: Record<string, string>): Record<string, string> => {
  const metadata: Record<string, string> = {
    uploaded_by: actor,
    uploaded_at: new Date().toISOString(),
    source: 's3-manager-web',
  };

  if (!provided) {
    return metadata;
  }

  for (const [key, value] of Object.entries(provided)) {
    const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const normalizedValue = normalizeMetadataValue(value);

    if (normalizedKey.length === 0 || normalizedValue.length === 0) {
      continue;
    }

    metadata[`app_${normalizedKey}`] = normalizedValue;
  }

  return metadata;
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

  async getObjectMetadata(input: ObjectMetadataInput, actor?: string): Promise<ObjectMetadataResult> {
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

  async createPresignedUpload(input: PresignedUploadInput, actor?: string): Promise<PresignedUploadResult> {
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
      throw mapError(error, `Failed to create multipart URL for '${input.objectKey}' part ${input.partNumber}`);
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
