import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { recordS3FileAccess } from '@/telemetry/metrics';
import { resolveBucketReference } from '@/services/s3/client';
import { S3ServiceError } from '@/services/s3/errors';
import { ensureRenameTarget, mapError, metricActor, toCopySource } from '@/services/s3/helpers';
import { normalizeVirtualPath } from '@/services/s3/path';
import type {
  CopyItemInput,
  CopyItemResult,
  RenameItemInput,
  RenameItemResult,
} from '@/services/s3/types';

export class CopyMoveOperations {
  constructor(private readonly clientProvider: (sourceId: string) => S3Client) {}

  async renameItem(input: RenameItemInput, actor?: string): Promise<RenameItemResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const normalizedSourcePath = normalizeVirtualPath(input.sourcePath);
      const [sourceBucketReference, ...sourceParts] = normalizedSourcePath.split('/');
      if (
        !sourceBucketReference ||
        sourceBucketReference.length === 0 ||
        sourceParts.length === 0
      ) {
        throw new S3ServiceError('sourcePath must include bucket and key', 'INVALID_PATH');
      }
      const sourceBucket = resolveBucketReference(sourceBucketReference);

      const sourceKeyRaw = sourceParts.join('/');
      const client = this.clientProvider(sourceBucket.sourceId);
      const sourcePrefix = (() => {
        if (input.sourcePath.trim().endsWith('/')) {
          return `${sourceKeyRaw.replace(/\/+$/, '')}/`;
        }

        if (sourceKeyRaw.length === 0) {
          return sourceKeyRaw;
        }

        return sourceKeyRaw;
      })();

      if (sourcePrefix.length === 0) {
        throw new S3ServiceError('Renaming bucket roots is not supported', 'INVALID_PATH');
      }

      const destinationBase = (() => {
        if (!input.destinationPath) {
          return null;
        }

        const normalizedDestinationPath = normalizeVirtualPath(input.destinationPath);
        const [destinationBucketReference, ...destinationParts] =
          normalizedDestinationPath.split('/');
        if (!destinationBucketReference || destinationBucketReference.length === 0) {
          throw new S3ServiceError('destinationPath must include bucket name', 'INVALID_PATH');
        }
        const destinationBucket = resolveBucketReference(destinationBucketReference);

        const destinationPrefixRaw = destinationParts.join('/');
        const destinationPrefix =
          destinationPrefixRaw.length > 0 ? `${destinationPrefixRaw.replace(/\/+$/, '')}/` : '';

        return {
          sourceId: destinationBucket.sourceId,
          bucketName: destinationBucket.bucketName,
          bucketReference: destinationBucket.bucketReference,
          prefix: destinationPrefix,
        };
      })();

      const destinationSourceId = destinationBase?.sourceId ?? sourceBucket.sourceId;
      const destinationBucketName = destinationBase?.bucketName ?? sourceBucket.bucketName;
      const destinationBucketReference =
        destinationBase?.bucketReference ?? sourceBucket.bucketReference;
      const destinationClient =
        destinationSourceId === sourceBucket.sourceId
          ? client
          : this.clientProvider(destinationSourceId);

      const copyObjectToDestination = async (sourceKey: string, destinationKey: string) => {
        if (destinationSourceId === sourceBucket.sourceId) {
          await destinationClient.send(
            new CopyObjectCommand({
              Bucket: destinationBucketName,
              CopySource: toCopySource(sourceBucket.bucketName, sourceKey),
              Key: destinationKey,
            })
          );
          return;
        }

        const [sourceHeadResponse, sourceObjectResponse] = await Promise.all([
          client.send(
            new HeadObjectCommand({
              Bucket: sourceBucket.bucketName,
              Key: sourceKey,
            })
          ),
          client.send(
            new GetObjectCommand({
              Bucket: sourceBucket.bucketName,
              Key: sourceKey,
            })
          ),
        ]);

        const sourceBody = sourceObjectResponse.Body;
        if (!sourceBody) {
          throw new S3ServiceError('Source object body is missing', 'NoSuchKey');
        }

        await destinationClient.send(
          new PutObjectCommand({
            Bucket: destinationBucketName,
            Key: destinationKey,
            Body: sourceBody,
            ContentLength: sourceHeadResponse.ContentLength,
            ContentType: sourceHeadResponse.ContentType,
            CacheControl: sourceHeadResponse.CacheControl,
            ContentDisposition: sourceHeadResponse.ContentDisposition,
            ContentEncoding: sourceHeadResponse.ContentEncoding,
            ContentLanguage: sourceHeadResponse.ContentLanguage,
            Expires: sourceHeadResponse.Expires,
            Metadata: sourceHeadResponse.Metadata,
            StorageClass: sourceHeadResponse.StorageClass,
          })
        );
      };

      let resolvedSourcePrefix = sourcePrefix;
      if (!resolvedSourcePrefix.endsWith('/')) {
        const sourceLookup = await client.send(
          new ListObjectsV2Command({
            Bucket: sourceBucket.bucketName,
            Prefix: resolvedSourcePrefix,
            Delimiter: '/',
            MaxKeys: 2,
          })
        );
        const folderPrefix = `${resolvedSourcePrefix.replace(/\/+$/, '')}/`;
        const hasExactObject = (sourceLookup.Contents ?? []).some(
          (item) => item.Key === resolvedSourcePrefix
        );
        const hasFolderContents = (sourceLookup.CommonPrefixes ?? []).some(
          (commonPrefix) => commonPrefix.Prefix === folderPrefix
        );

        if (!hasExactObject && hasFolderContents) {
          resolvedSourcePrefix = folderPrefix;
        }
      }

      const targetKey = ensureRenameTarget(
        resolvedSourcePrefix,
        input.newName,
        destinationBase?.prefix,
        destinationBase !== null
      );
      if (targetKey === resolvedSourcePrefix) {
        throw new S3ServiceError('Source and destination are identical', 'INVALID_PATH');
      }

      if (resolvedSourcePrefix.endsWith('/')) {
        let continuationToken: string | undefined;
        const sourceKeys: string[] = [];

        do {
          const response = await client.send(
            new ListObjectsV2Command({
              Bucket: sourceBucket.bucketName,
              Prefix: resolvedSourcePrefix,
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
          const suffix = sourceKey.slice(resolvedSourcePrefix.length);
          const destinationKey = `${targetKey}${suffix}`;

          await copyObjectToDestination(sourceKey, destinationKey);
        }

        for (let i = 0; i < sourceKeys.length; i += 1000) {
          const batch = sourceKeys.slice(i, i + 1000).map((Key) => ({ Key }));
          await client.send(
            new DeleteObjectsCommand({
              Bucket: sourceBucket.bucketName,
              Delete: { Objects: batch },
            })
          );
        }

        recordS3FileAccess(
          {
            operation: 'write',
            actor: safeActor,
            bucket: destinationBucketReference,
            objectKey: resolvedSourcePrefix,
            result: 'success',
          },
          Date.now() - startedAt
        );

        return {
          sourcePath: input.sourcePath,
          destinationPath: `${destinationBucketReference}/${targetKey.replace(/\/$/, '')}`,
          movedObjects: sourceKeys.length,
        };
      }

      await copyObjectToDestination(resolvedSourcePrefix, targetKey);

      await client.send(
        new DeleteObjectCommand({
          Bucket: sourceBucket.bucketName,
          Key: resolvedSourcePrefix,
        })
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: destinationBucketReference,
          objectKey: resolvedSourcePrefix,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        sourcePath: input.sourcePath,
        destinationPath: `${destinationBucketReference}/${targetKey}`,
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

  async copyItem(input: CopyItemInput, actor?: string): Promise<CopyItemResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const normalizedSourcePath = normalizeVirtualPath(input.sourcePath);
      const [sourceBucketReference, ...sourceParts] = normalizedSourcePath.split('/');
      if (
        !sourceBucketReference ||
        sourceBucketReference.length === 0 ||
        sourceParts.length === 0
      ) {
        throw new S3ServiceError('sourcePath must include bucket and key', 'INVALID_PATH');
      }
      const sourceBucket = resolveBucketReference(sourceBucketReference);

      const sourceKeyRaw = sourceParts.join('/');
      const client = this.clientProvider(sourceBucket.sourceId);
      const sourcePrefix = (() => {
        if (input.sourcePath.trim().endsWith('/')) {
          return `${sourceKeyRaw.replace(/\/+$/, '')}/`;
        }

        if (sourceKeyRaw.length === 0) {
          return sourceKeyRaw;
        }

        return sourceKeyRaw;
      })();

      if (sourcePrefix.length === 0) {
        throw new S3ServiceError('Copying bucket roots is not supported', 'INVALID_PATH');
      }

      const normalizedDestinationPath = normalizeVirtualPath(input.destinationPath);
      const [destinationBucketReference, ...destinationParts] =
        normalizedDestinationPath.split('/');
      if (!destinationBucketReference || destinationBucketReference.length === 0) {
        throw new S3ServiceError('destinationPath must include bucket name', 'INVALID_PATH');
      }
      const destinationBucket = resolveBucketReference(destinationBucketReference);

      const destinationPrefixRaw = destinationParts.join('/');
      const destinationPrefix =
        destinationPrefixRaw.length > 0 ? `${destinationPrefixRaw.replace(/\/+$/, '')}/` : '';

      const destinationSourceId = destinationBucket.sourceId;
      const destinationBucketName = destinationBucket.bucketName;
      const destinationBucketRef = destinationBucket.bucketReference;
      const destinationClient =
        destinationSourceId === sourceBucket.sourceId
          ? client
          : this.clientProvider(destinationSourceId);

      const copyObjectToDestination = async (sourceKey: string, destinationKey: string) => {
        if (destinationSourceId === sourceBucket.sourceId) {
          await destinationClient.send(
            new CopyObjectCommand({
              Bucket: destinationBucketName,
              CopySource: toCopySource(sourceBucket.bucketName, sourceKey),
              Key: destinationKey,
            })
          );
          return;
        }

        const [sourceHeadResponse, sourceObjectResponse] = await Promise.all([
          client.send(
            new HeadObjectCommand({
              Bucket: sourceBucket.bucketName,
              Key: sourceKey,
            })
          ),
          client.send(
            new GetObjectCommand({
              Bucket: sourceBucket.bucketName,
              Key: sourceKey,
            })
          ),
        ]);

        const sourceBody = sourceObjectResponse.Body;
        if (!sourceBody) {
          throw new S3ServiceError('Source object body is missing', 'NoSuchKey');
        }

        await destinationClient.send(
          new PutObjectCommand({
            Bucket: destinationBucketName,
            Key: destinationKey,
            Body: sourceBody,
            ContentLength: sourceHeadResponse.ContentLength,
            ContentType: sourceHeadResponse.ContentType,
            CacheControl: sourceHeadResponse.CacheControl,
            ContentDisposition: sourceHeadResponse.ContentDisposition,
            ContentEncoding: sourceHeadResponse.ContentEncoding,
            ContentLanguage: sourceHeadResponse.ContentLanguage,
            Expires: sourceHeadResponse.Expires,
            Metadata: sourceHeadResponse.Metadata,
            StorageClass: sourceHeadResponse.StorageClass,
          })
        );
      };

      let resolvedSourcePrefix = sourcePrefix;
      if (!resolvedSourcePrefix.endsWith('/')) {
        const sourceLookup = await client.send(
          new ListObjectsV2Command({
            Bucket: sourceBucket.bucketName,
            Prefix: resolvedSourcePrefix,
            Delimiter: '/',
            MaxKeys: 2,
          })
        );
        const folderPrefix = `${resolvedSourcePrefix.replace(/\/+$/, '')}/`;
        const hasExactObject = (sourceLookup.Contents ?? []).some(
          (item) => item.Key === resolvedSourcePrefix
        );
        const hasFolderContents = (sourceLookup.CommonPrefixes ?? []).some(
          (commonPrefix) => commonPrefix.Prefix === folderPrefix
        );

        if (!hasExactObject && hasFolderContents) {
          resolvedSourcePrefix = folderPrefix;
        }
      }

      const targetKey = ensureRenameTarget(
        resolvedSourcePrefix,
        undefined,
        destinationPrefix,
        true
      );
      if (
        targetKey === resolvedSourcePrefix &&
        destinationBucket.sourceId === sourceBucket.sourceId &&
        destinationBucket.bucketName === sourceBucket.bucketName
      ) {
        throw new S3ServiceError('Source and destination are identical', 'INVALID_PATH');
      }

      if (resolvedSourcePrefix.endsWith('/')) {
        let continuationToken: string | undefined;
        const sourceKeys: string[] = [];

        do {
          const response = await client.send(
            new ListObjectsV2Command({
              Bucket: sourceBucket.bucketName,
              Prefix: resolvedSourcePrefix,
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
          const suffix = sourceKey.slice(resolvedSourcePrefix.length);
          const destinationKey = `${targetKey}${suffix}`;

          await copyObjectToDestination(sourceKey, destinationKey);
        }

        recordS3FileAccess(
          {
            operation: 'write',
            actor: safeActor,
            bucket: destinationBucketRef,
            objectKey: resolvedSourcePrefix,
            result: 'success',
          },
          Date.now() - startedAt
        );

        return {
          sourcePath: input.sourcePath,
          destinationPath: `${destinationBucketRef}/${targetKey.replace(/\/$/, '')}`,
          copiedObjects: sourceKeys.length,
        };
      }

      await copyObjectToDestination(resolvedSourcePrefix, targetKey);

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: destinationBucketRef,
          objectKey: resolvedSourcePrefix,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        sourcePath: input.sourcePath,
        destinationPath: `${destinationBucketRef}/${targetKey}`,
        copiedObjects: 1,
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
      throw mapError(error, 'Failed to copy item');
    }
  }
}
