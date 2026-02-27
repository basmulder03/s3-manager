import type { UploadHelperOptions, UploadHelperResult } from './contracts';

const DEFAULT_MULTIPART_THRESHOLD_BYTES = 12 * 1024 * 1024;
const DEFAULT_RETRIES_PER_PART = 3;

const runProxyUpload = async (options: UploadHelperOptions): Promise<UploadHelperResult> => {
  if (!options.proxyUpload) {
    throw new Error('Proxy upload is not configured');
  }

  const proxied = await options.proxyUpload({
    bucketName: options.bucketName,
    objectKey: options.objectKey,
    file: options.file,
    contentType: options.contentType ?? options.file.type,
    metadata: options.metadata,
  });

  options.onProgress?.({
    uploadedParts: 1,
    totalParts: 1,
    uploadedBytes: options.file.size,
    totalBytes: options.file.size,
  });

  return {
    strategy: 'proxy',
    key: proxied.key,
    etag: proxied.etag,
    location: proxied.location,
  };
};

const extractEtag = (response: Response): string => {
  const etag = response.headers.get('ETag') ?? response.headers.get('etag');
  if (!etag) {
    throw new Error('Missing ETag response header from S3 upload part');
  }
  return etag;
};

const uploadPartWithRetry = async (params: {
  uploadUrl: string;
  body: Blob;
  retries: number;
}): Promise<string> => {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < params.retries) {
    attempt += 1;

    try {
      const response = await fetch(params.uploadUrl, {
        method: 'PUT',
        body: params.body,
      });

      if (!response.ok) {
        throw new Error(`Part upload failed with status ${response.status}`);
      }

      return extractEtag(response);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Part upload failed after retries');
};

const runDirectUpload = async (options: UploadHelperOptions): Promise<UploadHelperResult> => {
  const presigned = await options.client.createPresignedUpload({
    bucketName: options.bucketName,
    objectKey: options.objectKey,
    contentType: options.contentType ?? options.file.type,
    metadata: options.metadata,
  });

  let response: Response;
  try {
    response = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      headers: presigned.requiredHeaders,
      body: options.file.slice(0, options.file.size),
    });
  } catch (error) {
    if (options.proxyUpload) {
      return runProxyUpload(options);
    }

    throw error;
  }

  if (!response.ok) {
    throw new Error(`Direct upload failed with status ${response.status}`);
  }

  options.onProgress?.({
    uploadedParts: 1,
    totalParts: 1,
    uploadedBytes: options.file.size,
    totalBytes: options.file.size,
  });

  return {
    strategy: 'direct',
    key: presigned.key,
    etag: response.headers.get('ETag') ?? response.headers.get('etag'),
    location: null,
  };
};

const runMultipartUpload = async (
  options: UploadHelperOptions,
  partSizeBytes: number
): Promise<UploadHelperResult> => {
  const init = await options.client.initiateMultipartUpload({
    bucketName: options.bucketName,
    objectKey: options.objectKey,
    contentType: options.contentType ?? options.file.type,
    metadata: options.metadata,
  });

  const retries = Math.max(options.retriesPerPart ?? DEFAULT_RETRIES_PER_PART, 1);
  const totalParts = Math.ceil(options.file.size / partSizeBytes);
  let uploadedBytes = 0;
  const completedParts: Array<{ partNumber: number; etag: string }> = [];

  try {
    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      const start = (partNumber - 1) * partSizeBytes;
      const end = Math.min(start + partSizeBytes, options.file.size);
      const body = options.file.slice(start, end);

      const urlResult = await options.client.createMultipartPartUploadUrl({
        bucketName: options.bucketName,
        objectKey: options.objectKey,
        uploadId: init.uploadId,
        partNumber,
      });

      const etag = await uploadPartWithRetry({
        uploadUrl: urlResult.uploadUrl,
        body,
        retries,
      });

      completedParts.push({ partNumber, etag });
      uploadedBytes += end - start;

      options.onProgress?.({
        uploadedParts: completedParts.length,
        totalParts,
        uploadedBytes,
        totalBytes: options.file.size,
      });
    }

    const completed = await options.client.completeMultipartUpload({
      bucketName: options.bucketName,
      objectKey: options.objectKey,
      uploadId: init.uploadId,
      parts: completedParts,
    });

    return {
      strategy: 'multipart',
      key: completed.key,
      etag: completed.etag,
      location: completed.location,
    };
  } catch (error) {
    await options.client.abortMultipartUpload({
      bucketName: options.bucketName,
      objectKey: options.objectKey,
      uploadId: init.uploadId,
    });

    throw error;
  }
};

export const uploadObjectWithCookbook = async (
  options: UploadHelperOptions
): Promise<UploadHelperResult> => {
  if (options.forceProxyUpload) {
    return runProxyUpload(options);
  }

  const threshold = options.multipartThresholdBytes ?? DEFAULT_MULTIPART_THRESHOLD_BYTES;
  const cookbook = await options.client.uploadCookbook({
    bucketName: options.bucketName,
    objectKey: options.objectKey,
    contentType: options.contentType ?? options.file.type ?? 'application/octet-stream',
    fileSizeBytes: options.file.size,
  });

  if (options.file.size <= threshold) {
    return runDirectUpload(options);
  }

  return runMultipartUpload(options, cookbook.multipartUpload.partSizeBytes);
};
