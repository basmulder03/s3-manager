import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  type CompletedPart,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { recordS3FileAccess } from '@/telemetry/metrics';
import { resolveBucketReference } from '@/services/s3/client';
import { S3ServiceError } from '@/services/s3/errors';
import { mapError, metricActor, buildUploadMetadata } from '@/services/s3/helpers';
import type {
  AbortMultipartUploadInput,
  CompleteMultipartUploadInput,
  CompleteMultipartUploadResult,
  CreateMultipartPartUrlInput,
  CreateMultipartPartUrlResult,
  InitiateMultipartUploadInput,
  InitiateMultipartUploadResult,
} from '@/services/s3/types';

export class MultipartUploadOperations {
  constructor(private readonly clientProvider: (sourceId: string) => S3Client) {}

  async initiateMultipartUpload(
    input: InitiateMultipartUploadInput,
    actor?: string
  ): Promise<InitiateMultipartUploadResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);
    const target = resolveBucketReference(input.bucketName);

    try {
      const client = this.clientProvider(target.sourceId);
      const metadata = buildUploadMetadata(safeActor, input.metadata);
      const response = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: target.bucketName,
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
          bucket: target.bucketReference,
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
          bucket: target.bucketReference,
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
    const target = resolveBucketReference(input.bucketName);

    try {
      const client = this.clientProvider(target.sourceId);
      const expiresInSeconds = input.expiresInSeconds ?? 900;
      const uploadUrl = await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: target.bucketName,
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
          bucket: target.bucketReference,
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
          bucket: target.bucketReference,
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
    const target = resolveBucketReference(input.bucketName);

    try {
      const client = this.clientProvider(target.sourceId);
      const parts: CompletedPart[] = input.parts
        .map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        }))
        .sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0));

      const response = await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: target.bucketName,
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
          bucket: target.bucketReference,
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
          bucket: target.bucketReference,
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
    const target = resolveBucketReference(input.bucketName);

    try {
      const client = this.clientProvider(target.sourceId);
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: target.bucketName,
          Key: input.objectKey,
          UploadId: input.uploadId,
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
      throw mapError(error, `Failed to abort multipart upload for '${input.objectKey}'`);
    }
  }
}
