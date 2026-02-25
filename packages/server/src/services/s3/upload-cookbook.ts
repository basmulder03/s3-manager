import {
  DEFAULT_MULTIPART_SIZE_BYTES,
  MIN_MULTIPART_SIZE_BYTES,
  type UploadCookbookInput,
  type UploadCookbookResponse,
} from '../../shared/upload/contracts';

export const buildUploadCookbook = (input: UploadCookbookInput): UploadCookbookResponse => {
  const resolvedPartSize = Math.max(input.preferredPartSizeBytes ?? DEFAULT_MULTIPART_SIZE_BYTES, MIN_MULTIPART_SIZE_BYTES);

  const estimatedPartCount = input.fileSizeBytes ? Math.ceil(input.fileSizeBytes / resolvedPartSize) : null;

  return {
    directUpload: {
      purpose: 'Small files and simple browser upload flow',
      trpcProcedure: 's3.createPresignedUpload',
      request: {
        bucketName: input.bucketName,
        objectKey: input.objectKey,
        contentType: input.contentType,
        metadata: {
          original_filename: 'file.bin',
          feature: 'upload-ui',
        },
      },
      responseFields: ['uploadUrl', 'requiredHeaders', 'expiresInSeconds', 'key'],
      browserRequest: {
        method: 'PUT',
        url: 'uploadUrl',
        headersSource: 'requiredHeaders',
        body: 'file/blob',
      },
      successCriteria: ['HTTP 200 from S3', 'Optional follow-up with s3.getObjectMetadata'],
    },
    multipartUpload: {
      purpose: 'Large files and resilient uploads with retries per part',
      partSizeBytes: resolvedPartSize,
      estimatedPartCount,
      sequence: [
        {
          step: 1,
          trpcProcedure: 's3.initiateMultipartUpload',
          request: {
            bucketName: input.bucketName,
            objectKey: input.objectKey,
            contentType: input.contentType,
            metadata: {
              original_filename: 'file.bin',
              feature: 'upload-ui',
            },
          },
          expect: ['uploadId', 'key'],
        },
        {
          step: 2,
          trpcProcedure: 's3.createMultipartPartUploadUrl',
          request: {
            bucketName: input.bucketName,
            objectKey: input.objectKey,
            uploadId: 'from-step-1',
            partNumber: 1,
            expiresInSeconds: 900,
          },
          expect: ['uploadUrl', 'partNumber'],
        },
        {
          step: 3,
          action: 'Browser uploads each part via PUT to uploadUrl and captures ETag from each response header',
        },
        {
          step: 4,
          trpcProcedure: 's3.completeMultipartUpload',
          request: {
            bucketName: input.bucketName,
            objectKey: input.objectKey,
            uploadId: 'from-step-1',
            parts: [
              {
                partNumber: 1,
                etag: 'etag-from-part-1',
              },
            ],
          },
          expect: ['key', 'etag', 'location'],
        },
        {
          step: 5,
          trpcProcedure: 's3.abortMultipartUpload',
          when: 'Only on cancel or unrecoverable failure',
        },
      ],
      constraints: [
        'Part numbers must be sequentially unique and positive integers',
        `Each part should be at least ${MIN_MULTIPART_SIZE_BYTES} bytes except the last part`,
        'Use retry per failed part without restarting the full upload',
      ],
    },
  };
};
