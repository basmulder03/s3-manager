export const MIN_MULTIPART_SIZE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_MULTIPART_SIZE_BYTES = 8 * 1024 * 1024;

export interface UploadCookbookInput {
  bucketName: string;
  objectKey: string;
  contentType: string;
  fileSizeBytes?: number;
  preferredPartSizeBytes?: number;
}

export interface UploadCookbookResponse {
  directUpload: {
    purpose: string;
    trpcProcedure: 's3.createPresignedUpload';
    request: {
      bucketName: string;
      objectKey: string;
      contentType: string;
      metadata: Record<string, string>;
    };
    responseFields: string[];
    browserRequest: {
      method: 'PUT';
      url: 'uploadUrl';
      headersSource: 'requiredHeaders';
      body: 'file/blob';
    };
    successCriteria: string[];
  };
  multipartUpload: {
    purpose: string;
    partSizeBytes: number;
    estimatedPartCount: number | null;
    sequence: Array<
      | {
          step: 1 | 2 | 4 | 5;
          trpcProcedure:
            | 's3.initiateMultipartUpload'
            | 's3.createMultipartPartUploadUrl'
            | 's3.completeMultipartUpload'
            | 's3.abortMultipartUpload';
          request?: Record<string, unknown>;
          expect?: string[];
          when?: string;
        }
      | {
          step: 3;
          action: string;
        }
    >;
    constraints: string[];
  };
}

export interface PresignedUploadContract {
  uploadUrl: string;
  key: string;
  expiresInSeconds: number;
  requiredHeaders: Record<string, string>;
}

export interface CompleteMultipartUploadContract {
  key: string;
  etag: string | null;
  location: string | null;
}

export interface BrowserFileLike {
  readonly size: number;
  readonly type?: string;
  slice(start: number, end: number): Blob;
}

export interface UploadClientProcedures {
  uploadCookbook(input: UploadCookbookInput): Promise<UploadCookbookResponse>;
  createPresignedUpload(input: {
    bucketName: string;
    objectKey: string;
    contentType?: string;
    metadata?: Record<string, string>;
    expiresInSeconds?: number;
  }): Promise<PresignedUploadContract>;
  initiateMultipartUpload(input: {
    bucketName: string;
    objectKey: string;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<{ uploadId: string; key: string }>;
  createMultipartPartUploadUrl(input: {
    bucketName: string;
    objectKey: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds?: number;
  }): Promise<{ uploadUrl: string; partNumber: number; expiresInSeconds: number }>;
  completeMultipartUpload(input: {
    bucketName: string;
    objectKey: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  }): Promise<CompleteMultipartUploadContract>;
  abortMultipartUpload(input: {
    bucketName: string;
    objectKey: string;
    uploadId: string;
  }): Promise<{ success: boolean }>;
}

export interface UploadProgressEvent {
  uploadedParts: number;
  totalParts: number;
  uploadedBytes: number;
  totalBytes: number;
}

export interface UploadHelperOptions {
  client: UploadClientProcedures;
  bucketName: string;
  objectKey: string;
  file: BrowserFileLike;
  contentType?: string;
  metadata?: Record<string, string>;
  forceProxyUpload?: boolean;
  proxyUpload?: (input: {
    bucketName: string;
    objectKey: string;
    file: BrowserFileLike;
    contentType?: string;
    metadata?: Record<string, string>;
  }) => Promise<{ key: string; etag: string | null; location: string | null }>;
  multipartThresholdBytes?: number;
  retriesPerPart?: number;
  onProgress?: (event: UploadProgressEvent) => void;
}

export interface UploadHelperResult {
  strategy: 'direct' | 'multipart' | 'proxy';
  key: string;
  etag: string | null;
  location: string | null;
}
