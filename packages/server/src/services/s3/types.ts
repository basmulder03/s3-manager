export interface S3BucketSummary {
  name: string;
  creationDate: string | null;
}

export interface S3ObjectSummary {
  key: string;
  size: number;
  lastModified: string | null;
  etag: string | null;
}

export interface BrowseItem {
  name: string;
  type: 'directory' | 'file';
  path: string;
  size: number | null;
  lastModified: string | null;
  etag?: string;
}

export interface Breadcrumb {
  name: string;
  path: string;
}

export interface BrowseResult {
  path: string;
  breadcrumbs: Breadcrumb[];
  items: BrowseItem[];
}

export interface ListObjectsInput {
  bucketName: string;
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface ListObjectsResult {
  objects: S3ObjectSummary[];
  isTruncated: boolean;
  keyCount: number;
  nextContinuationToken?: string;
}

export interface ObjectMetadataInput {
  bucketName: string;
  objectKey: string;
  expiresInSeconds?: number;
}

export interface ObjectMetadataResult {
  key: string;
  size: number;
  contentType: string;
  lastModified: string | null;
  etag: string | null;
  downloadUrl: string;
}

export interface ObjectPropertiesInput {
  path: string;
}

export interface ObjectPropertiesResult {
  name: string;
  key: string;
  size: number;
  contentType: string;
  lastModified: string | null;
  etag: string | null;
  storageClass: string;
  metadata: Record<string, string>;
  versionId?: string;
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  expires?: string;
  serverSideEncryption?: string;
}

export interface ObjectTextContentInput {
  path: string;
}

export interface ObjectTextContentResult {
  path: string;
  content: string;
  size: number;
  contentType: string;
  etag: string | null;
  lastModified: string | null;
}

export interface UpdateObjectTextContentInput {
  path: string;
  content: string;
  expectedEtag?: string;
}

export interface UpdateObjectTextContentResult {
  path: string;
  size: number;
  contentType: string;
  etag: string | null;
  lastModified: string | null;
}

export interface UpdateObjectPropertiesInput {
  path: string;
  contentType?: string;
  storageClass?: string;
  cacheControl?: string | null;
  contentDisposition?: string | null;
  contentEncoding?: string | null;
  contentLanguage?: string | null;
  expires?: string | null;
  metadata?: Record<string, string>;
}

export interface PresignedUploadInput {
  bucketName: string;
  objectKey: string;
  contentType?: string;
  expiresInSeconds?: number;
  metadata?: Record<string, string>;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  key: string;
  expiresInSeconds: number;
  requiredHeaders: Record<string, string>;
}

export interface ProxyUploadInput {
  bucketName: string;
  objectKey: string;
  body: Uint8Array | ReadableStream<Uint8Array> | Readable;
  contentLength?: number;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface ProxyUploadResult {
  key: string;
  etag: string | null;
}

export interface InitiateMultipartUploadInput {
  bucketName: string;
  objectKey: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface InitiateMultipartUploadResult {
  uploadId: string;
  key: string;
}

export interface CreateMultipartPartUrlInput {
  bucketName: string;
  objectKey: string;
  uploadId: string;
  partNumber: number;
  expiresInSeconds?: number;
}

export interface CreateMultipartPartUrlResult {
  uploadUrl: string;
  partNumber: number;
  expiresInSeconds: number;
}

export interface CompleteMultipartUploadPart {
  partNumber: number;
  etag: string;
}

export interface CompleteMultipartUploadInput {
  bucketName: string;
  objectKey: string;
  uploadId: string;
  parts: CompleteMultipartUploadPart[];
}

export interface CompleteMultipartUploadResult {
  key: string;
  etag: string | null;
  location: string | null;
}

export interface AbortMultipartUploadInput {
  bucketName: string;
  objectKey: string;
  uploadId: string;
}

export interface DeleteObjectInput {
  bucketName: string;
  objectKey: string;
}

export interface CreateFolderInput {
  path: string;
  folderName: string;
}

export interface CreateFileInput {
  path: string;
  fileName: string;
}

export interface DeleteFolderInput {
  path: string;
}

export interface DeleteFolderResult {
  deletedCount: number;
}

export interface DeleteMultipleInput {
  paths: string[];
}

export interface DeleteMultipleError {
  path: string;
  error: string;
}

export interface DeleteMultipleResult {
  message: string;
  deletedCount: number;
  errors?: DeleteMultipleError[];
}

export interface RenameItemInput {
  sourcePath: string;
  newName?: string;
  destinationPath?: string;
}

export interface RenameItemResult {
  sourcePath: string;
  destinationPath: string;
  movedObjects: number;
}

export interface CopyItemInput {
  sourcePath: string;
  destinationPath: string;
}

export interface CopyItemResult {
  sourcePath: string;
  destinationPath: string;
  copiedObjects: number;
}
import type { Readable } from 'node:stream';
