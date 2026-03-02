import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  StorageClass,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { recordS3FileAccess } from '@/telemetry/metrics';
import { resolveBucketReference } from '@/services/s3/client';
import { S3ServiceError } from '@/services/s3/errors';
import {
  mapError,
  metricActor,
  normalizeMetadataEntries,
  resolveOptionalHeaderValue,
  toCopySource,
  toIso,
} from '@/services/s3/helpers';
import { resolvePathTarget } from '@/services/s3/utils/path-resolution';
import type {
  ObjectMetadataInput,
  ObjectMetadataResult,
  ObjectPropertiesInput,
  ObjectPropertiesResult,
  UpdateObjectPropertiesInput,
} from '@/services/s3/types';

export class MetadataOperations {
  constructor(private readonly clientProvider: (sourceId: string) => S3Client) {}

  async getObjectMetadata(
    input: ObjectMetadataInput,
    actor?: string
  ): Promise<ObjectMetadataResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);
    const target = resolveBucketReference(input.bucketName);

    try {
      const client = this.clientProvider(target.sourceId);
      const headResponse = await client.send(
        new HeadObjectCommand({
          Bucket: target.bucketName,
          Key: input.objectKey,
        })
      );

      const expiresInSeconds = input.expiresInSeconds ?? 3600;
      const downloadUrl = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: target.bucketName,
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
          bucket: target.bucketReference,
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
          bucket: target.bucketReference,
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
      const target = resolvePathTarget(input.path);
      const client = this.clientProvider(target.sourceId);
      const headResponse = await client.send(
        new HeadObjectCommand({
          Bucket: target.bucketName,
          Key: target.objectKey,
        })
      );

      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: target.bucketReference,
          objectKey: target.objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        name: target.objectKey.split('/').pop() ?? target.objectKey,
        key: target.objectKey,
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

  async updateObjectProperties(
    input: UpdateObjectPropertiesInput,
    actor?: string
  ): Promise<ObjectPropertiesResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const target = resolvePathTarget(input.path);
      const client = this.clientProvider(target.sourceId);
      const current = await client.send(
        new HeadObjectCommand({
          Bucket: target.bucketName,
          Key: target.objectKey,
        })
      );

      const metadata =
        input.metadata === undefined
          ? (current.Metadata ?? {})
          : normalizeMetadataEntries(input.metadata);

      const requestedExpires = input.expires;
      let expires: Date | undefined;
      if (requestedExpires === undefined) {
        expires = current.Expires;
      } else if (requestedExpires !== null) {
        const parsed = new Date(requestedExpires);
        if (Number.isNaN(parsed.getTime())) {
          throw new S3ServiceError('expires must be a valid ISO datetime', 'ValidationError');
        }
        expires = parsed;
      }

      const contentType =
        input.contentType?.trim() || current.ContentType || 'application/octet-stream';
      const storageClass = input.storageClass?.trim() || current.StorageClass;
      if (storageClass && !Object.values(StorageClass).includes(storageClass as StorageClass)) {
        throw new S3ServiceError('storageClass is not valid', 'ValidationError');
      }
      const cacheControl = resolveOptionalHeaderValue(input.cacheControl, current.CacheControl);
      const contentDisposition = resolveOptionalHeaderValue(
        input.contentDisposition,
        current.ContentDisposition
      );
      const contentEncoding = resolveOptionalHeaderValue(
        input.contentEncoding,
        current.ContentEncoding
      );
      const contentLanguage = resolveOptionalHeaderValue(
        input.contentLanguage,
        current.ContentLanguage
      );

      await client.send(
        new CopyObjectCommand({
          Bucket: target.bucketName,
          CopySource: toCopySource(target.bucketName, target.objectKey),
          Key: target.objectKey,
          MetadataDirective: 'REPLACE',
          Metadata: metadata,
          ContentType: contentType,
          ...(storageClass ? { StorageClass: storageClass as StorageClass } : {}),
          ...(cacheControl ? { CacheControl: cacheControl } : {}),
          ...(contentDisposition ? { ContentDisposition: contentDisposition } : {}),
          ...(contentEncoding ? { ContentEncoding: contentEncoding } : {}),
          ...(contentLanguage ? { ContentLanguage: contentLanguage } : {}),
          ...(expires ? { Expires: expires } : {}),
        })
      );

      const updated = await client.send(
        new HeadObjectCommand({
          Bucket: target.bucketName,
          Key: target.objectKey,
        })
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: target.bucketReference,
          objectKey: target.objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        name: target.objectKey.split('/').pop() ?? target.objectKey,
        key: target.objectKey,
        size: updated.ContentLength ?? 0,
        contentType: updated.ContentType ?? 'application/octet-stream',
        lastModified: toIso(updated.LastModified),
        etag: updated.ETag ? updated.ETag.replace(/^"|"$/g, '') : null,
        storageClass: updated.StorageClass ?? 'STANDARD',
        metadata: updated.Metadata ?? {},
        ...(updated.VersionId ? { versionId: updated.VersionId } : {}),
        ...(updated.CacheControl ? { cacheControl: updated.CacheControl } : {}),
        ...(updated.ContentDisposition ? { contentDisposition: updated.ContentDisposition } : {}),
        ...(updated.ContentEncoding ? { contentEncoding: updated.ContentEncoding } : {}),
        ...(updated.ContentLanguage ? { contentLanguage: updated.ContentLanguage } : {}),
        ...(updated.Expires ? { expires: updated.Expires.toISOString() } : {}),
        ...(updated.ServerSideEncryption
          ? { serverSideEncryption: updated.ServerSideEncryption }
          : {}),
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
      throw mapError(error, `Failed to update object properties for '${input.path}'`);
    }
  }
}
