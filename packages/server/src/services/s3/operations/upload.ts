import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { recordS3FileAccess } from '@/telemetry/metrics';
import { resolveBucketReference } from '@/services/s3/client';
import { mapError, metricActor, buildUploadMetadata } from '@/services/s3/helpers';
import type {
  PresignedUploadInput,
  PresignedUploadResult,
  ProxyUploadInput,
  ProxyUploadResult,
} from '@/services/s3/types';

export class UploadOperations {
  constructor(private readonly clientProvider: (sourceId: string) => S3Client) {}

  async createPresignedUpload(
    input: PresignedUploadInput,
    actor?: string
  ): Promise<PresignedUploadResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);
    const target = resolveBucketReference(input.bucketName);

    try {
      const client = this.clientProvider(target.sourceId);
      const expiresInSeconds = input.expiresInSeconds ?? 900;
      const metadata = buildUploadMetadata(safeActor, input.metadata);
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: target.bucketName,
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
          bucket: target.bucketReference,
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
          bucket: target.bucketReference,
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
    const target = resolveBucketReference(input.bucketName);

    try {
      const client = this.clientProvider(target.sourceId);
      const metadata = buildUploadMetadata(safeActor, input.metadata);
      const result = await client.send(
        new PutObjectCommand({
          Bucket: target.bucketName,
          Key: input.objectKey,
          Body: input.body,
          ...(input.contentLength ? { ContentLength: input.contentLength } : {}),
          ContentType: input.contentType,
          Metadata: metadata,
        })
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: target.bucketReference,
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
          bucket: target.bucketReference,
          objectKey: input.objectKey,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to proxy upload for '${input.objectKey}'`);
    }
  }
}
