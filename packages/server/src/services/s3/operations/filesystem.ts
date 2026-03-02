import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { recordS3FileAccess } from '@/telemetry/metrics';
import { resolveBucketReference } from '@/services/s3/client';
import { S3ServiceError } from '@/services/s3/errors';
import { mapError, metricActor } from '@/services/s3/helpers';
import { joinObjectKey, parseVirtualPath } from '@/services/s3/path';
import type {
  CreateFileInput,
  CreateFolderInput,
  DeleteFolderInput,
  DeleteFolderResult,
} from '@/services/s3/types';

export class FileSystemOperations {
  constructor(private readonly clientProvider: (sourceId: string) => S3Client) {}

  async createFolder(input: CreateFolderInput, actor?: string): Promise<{ path: string }> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const { bucketName, prefix } = parseVirtualPath(input.path);
      const target = resolveBucketReference(bucketName);
      const folderKey = `${joinObjectKey(prefix, input.folderName)}/`;

      const client = this.clientProvider(target.sourceId);
      await client.send(
        new PutObjectCommand({
          Bucket: target.bucketName,
          Key: folderKey,
          Body: '',
        })
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: target.bucketReference,
          objectKey: folderKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        path: `${target.bucketReference}/${folderKey}`,
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

  async createFile(input: CreateFileInput, actor?: string): Promise<{ path: string }> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const { bucketName, prefix } = parseVirtualPath(input.path);
      const target = resolveBucketReference(bucketName);
      const objectKey = joinObjectKey(prefix, input.fileName);

      const client = this.clientProvider(target.sourceId);
      await client.send(
        new PutObjectCommand({
          Bucket: target.bucketName,
          Key: objectKey,
          Body: '',
        })
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: target.bucketReference,
          objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        path: `${target.bucketReference}/${objectKey}`,
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
      throw mapError(error, 'Failed to create file');
    }
  }

  async deleteFolder(input: DeleteFolderInput, actor?: string): Promise<DeleteFolderResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const { bucketName, prefix } = parseVirtualPath(input.path);
      const target = resolveBucketReference(bucketName);
      if (!prefix || prefix.length === 0) {
        throw new S3ServiceError('Cannot delete bucket root with deleteFolder', 'INVALID_PATH');
      }

      const client = this.clientProvider(target.sourceId);
      let continuationToken: string | undefined;
      const keysToDelete: Array<{ Key: string }> = [];

      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: target.bucketName,
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
            Bucket: target.bucketName,
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
          bucket: target.bucketReference,
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
}
