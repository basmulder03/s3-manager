import type { S3Client } from '@aws-sdk/client-s3';
import { getS3Client } from '@/services/s3/client';
import { FileSystemOperations } from '@/services/s3/operations/filesystem';
import { UploadOperations } from '@/services/s3/operations/upload';
import { MultipartUploadOperations } from '@/services/s3/operations/multipart-upload';
import { DeleteOperations } from '@/services/s3/operations/delete';
import { ListOperations } from '@/services/s3/operations/list';
import { MetadataOperations } from '@/services/s3/operations/metadata';
import { TextContentOperations } from '@/services/s3/operations/text-content';
import { CopyMoveOperations } from '@/services/s3/operations/copy-move';
import type {
  AbortMultipartUploadInput,
  BrowseResult,
  CompleteMultipartUploadInput,
  CompleteMultipartUploadResult,
  CopyItemInput,
  CopyItemResult,
  CreateFileInput,
  CreateFolderInput,
  CreateMultipartPartUrlInput,
  CreateMultipartPartUrlResult,
  DeleteFolderInput,
  DeleteFolderResult,
  DeleteMultipleInput,
  DeleteMultipleResult,
  DeleteObjectInput,
  InitiateMultipartUploadInput,
  InitiateMultipartUploadResult,
  ListObjectsInput,
  ListObjectsResult,
  ObjectMetadataInput,
  ObjectMetadataResult,
  ObjectPropertiesInput,
  ObjectPropertiesResult,
  ObjectTextContentInput,
  ObjectTextContentResult,
  PresignedUploadInput,
  PresignedUploadResult,
  ProxyUploadInput,
  ProxyUploadResult,
  RenameItemInput,
  RenameItemResult,
  S3BucketSummary,
  UpdateObjectPropertiesInput,
  UpdateObjectTextContentInput,
  UpdateObjectTextContentResult,
} from '@/services/s3/types';

/**
 * S3 Service - Main facade for S3 operations
 *
 * This service delegates to specialized operation classes for better
 * code organization and maintainability.
 */
export class S3Service {
  private readonly fileSystemOps: FileSystemOperations;
  private readonly uploadOps: UploadOperations;
  private readonly multipartUploadOps: MultipartUploadOperations;
  private readonly deleteOps: DeleteOperations;
  private readonly listOps: ListOperations;
  private readonly metadataOps: MetadataOperations;
  private readonly textContentOps: TextContentOperations;
  private readonly copyMoveOps: CopyMoveOperations;

  constructor(clientProvider: (sourceId?: string) => S3Client = getS3Client) {
    // Normalize the client provider to ensure it always accepts sourceId
    const normalizedProvider = (sourceId: string) => clientProvider(sourceId);

    // Initialize all operation classes
    this.fileSystemOps = new FileSystemOperations(normalizedProvider);
    this.uploadOps = new UploadOperations(normalizedProvider);
    this.multipartUploadOps = new MultipartUploadOperations(normalizedProvider);
    this.listOps = new ListOperations(normalizedProvider);
    this.metadataOps = new MetadataOperations(normalizedProvider);
    this.textContentOps = new TextContentOperations(normalizedProvider);
    this.copyMoveOps = new CopyMoveOperations(normalizedProvider);

    // DeleteOperations needs access to FileSystemOperations for deleteFolder
    this.deleteOps = new DeleteOperations(normalizedProvider, this.fileSystemOps);
  }

  // ========== List Operations ==========

  async listBuckets(actor?: string): Promise<S3BucketSummary[]> {
    return this.listOps.listBuckets(actor);
  }

  async listObjects(input: ListObjectsInput, actor?: string): Promise<ListObjectsResult> {
    return this.listOps.listObjects(input, actor);
  }

  async browse(virtualPath = '', actor?: string): Promise<BrowseResult> {
    return this.listOps.browse(virtualPath, actor);
  }

  // ========== Metadata Operations ==========

  async getObjectMetadata(
    input: ObjectMetadataInput,
    actor?: string
  ): Promise<ObjectMetadataResult> {
    return this.metadataOps.getObjectMetadata(input, actor);
  }

  async getObjectProperties(
    input: ObjectPropertiesInput,
    actor?: string
  ): Promise<ObjectPropertiesResult> {
    return this.metadataOps.getObjectProperties(input, actor);
  }

  async updateObjectProperties(
    input: UpdateObjectPropertiesInput,
    actor?: string
  ): Promise<ObjectPropertiesResult> {
    return this.metadataOps.updateObjectProperties(input, actor);
  }

  // ========== Text Content Operations ==========

  async getObjectTextContent(
    input: ObjectTextContentInput,
    actor?: string
  ): Promise<ObjectTextContentResult> {
    return this.textContentOps.getObjectTextContent(input, actor);
  }

  async updateObjectTextContent(
    input: UpdateObjectTextContentInput,
    actor?: string
  ): Promise<UpdateObjectTextContentResult> {
    return this.textContentOps.updateObjectTextContent(input, actor);
  }

  // ========== Upload Operations ==========

  async createPresignedUpload(
    input: PresignedUploadInput,
    actor?: string
  ): Promise<PresignedUploadResult> {
    return this.uploadOps.createPresignedUpload(input, actor);
  }

  async uploadObjectViaProxy(input: ProxyUploadInput, actor?: string): Promise<ProxyUploadResult> {
    return this.uploadOps.uploadObjectViaProxy(input, actor);
  }

  // ========== Multipart Upload Operations ==========

  async initiateMultipartUpload(
    input: InitiateMultipartUploadInput,
    actor?: string
  ): Promise<InitiateMultipartUploadResult> {
    return this.multipartUploadOps.initiateMultipartUpload(input, actor);
  }

  async createMultipartPartUploadUrl(
    input: CreateMultipartPartUrlInput,
    actor?: string
  ): Promise<CreateMultipartPartUrlResult> {
    return this.multipartUploadOps.createMultipartPartUploadUrl(input, actor);
  }

  async completeMultipartUpload(
    input: CompleteMultipartUploadInput,
    actor?: string
  ): Promise<CompleteMultipartUploadResult> {
    return this.multipartUploadOps.completeMultipartUpload(input, actor);
  }

  async abortMultipartUpload(input: AbortMultipartUploadInput, actor?: string): Promise<void> {
    return this.multipartUploadOps.abortMultipartUpload(input, actor);
  }

  // ========== Delete Operations ==========

  async deleteObject(input: DeleteObjectInput, actor?: string): Promise<void> {
    return this.deleteOps.deleteObject(input, actor);
  }

  async deleteMultiple(input: DeleteMultipleInput, actor?: string): Promise<DeleteMultipleResult> {
    return this.deleteOps.deleteMultiple(input, actor);
  }

  // ========== File System Operations ==========

  async createFolder(input: CreateFolderInput, actor?: string): Promise<{ path: string }> {
    return this.fileSystemOps.createFolder(input, actor);
  }

  async createFile(input: CreateFileInput, actor?: string): Promise<{ path: string }> {
    return this.fileSystemOps.createFile(input, actor);
  }

  async deleteFolder(input: DeleteFolderInput, actor?: string): Promise<DeleteFolderResult> {
    return this.fileSystemOps.deleteFolder(input, actor);
  }

  // ========== Copy/Move Operations ==========

  async renameItem(input: RenameItemInput, actor?: string): Promise<RenameItemResult> {
    return this.copyMoveOps.renameItem(input, actor);
  }

  async copyItem(input: CopyItemInput, actor?: string): Promise<CopyItemResult> {
    return this.copyMoveOps.copyItem(input, actor);
  }
}
