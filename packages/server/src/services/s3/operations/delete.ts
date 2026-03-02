import { DeleteObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { recordS3FileAccess } from '@/telemetry/metrics';
import { resolveBucketReference } from '@/services/s3/client';
import { S3ServiceError } from '@/services/s3/errors';
import { mapError, metricActor } from '@/services/s3/helpers';
import { normalizeVirtualPath } from '@/services/s3/path';
import { resolvePathTarget } from '@/services/s3/utils/path-resolution';
import type {
  DeleteMultipleInput,
  DeleteMultipleResult,
  DeleteObjectInput,
} from '@/services/s3/types';
import type { FileSystemOperations } from './filesystem';

export class DeleteOperations {
  constructor(
    private readonly clientProvider: (sourceId: string) => S3Client,
    private readonly fileSystemOps: FileSystemOperations
  ) {}

  async deleteObject(input: DeleteObjectInput, actor?: string): Promise<void> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);
    const target = resolveBucketReference(input.bucketName);

    try {
      const client = this.clientProvider(target.sourceId);
      await client.send(
        new DeleteObjectCommand({
          Bucket: target.bucketName,
          Key: input.objectKey,
        })
      );

      recordS3FileAccess(
        {
          operation: 'delete',
          actor: safeActor,
          bucket: target.bucketReference,
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
          bucket: target.bucketReference,
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
        const target = resolvePathTarget(path);
        const normalizedPath = normalizeVirtualPath(path);
        const folderPrefix = target.objectKey.endsWith('/')
          ? target.objectKey
          : `${target.objectKey}/`;
        const client = this.clientProvider(target.sourceId);

        const folderProbe = await client.send(
          new ListObjectsV2Command({
            Bucket: target.bucketName,
            Prefix: folderPrefix,
            MaxKeys: 1,
          })
        );

        const hasFolderContents = (folderProbe.Contents ?? []).length > 0;
        if (hasFolderContents) {
          const folderResult = await this.fileSystemOps.deleteFolder(
            { path: normalizedPath },
            actor
          );
          deletedCount += folderResult.deletedCount;
        } else {
          await this.deleteObject(
            { bucketName: target.bucketReference, objectKey: target.objectKey },
            actor
          );
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
}
