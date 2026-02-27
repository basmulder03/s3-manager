import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { deleteProcedure, router, viewProcedure, writeProcedure } from '@/trpc';
import { S3Service } from '@/services/s3/service';
import { isS3ServiceError } from '@/services/s3/errors';
import { buildUploadCookbook } from '@/services/s3/upload-cookbook';

const s3Service = new S3Service();

export const mapS3ErrorToTrpc = (error: unknown): TRPCError => {
  if (isS3ServiceError(error)) {
    if (error.code === 'NoSuchBucket' || error.code === 'NoSuchKey') {
      return new TRPCError({
        code: 'NOT_FOUND',
        message: error.message,
        cause: error,
      });
    }

    if (error.code === 'INVALID_PATH' || error.code === 'ValidationError') {
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: error.message,
        cause: error,
      });
    }

    if (error.code === 'ETAG_MISMATCH') {
      return new TRPCError({
        code: 'CONFLICT',
        message: error.message,
        cause: error,
      });
    }

    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
      cause: error,
    });
  }

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Unexpected S3 operation error',
    cause: error,
  });
};

const actorFromContext = (ctx: { actor: string }): string => ctx.actor;

export const s3Router = router({
  listBuckets: viewProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/s3/buckets',
        tags: ['s3'],
        summary: 'List buckets',
        protect: true,
      },
    })
    .input(z.object({}))
    .output(z.any())
    .query(async ({ ctx }) => {
      try {
        return {
          buckets: await s3Service.listBuckets(actorFromContext(ctx)),
        };
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  browse: viewProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/s3/browse',
        tags: ['s3'],
        summary: 'Browse virtual S3 path',
        protect: true,
      },
    })
    .input(
      z.object({
        virtualPath: z.string().default(''),
      })
    )
    .output(z.any())
    .query(async ({ input, ctx }) => {
      try {
        return s3Service.browse(input.virtualPath, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  listObjects: viewProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/s3/objects',
        tags: ['s3'],
        summary: 'List objects in bucket',
        protect: true,
      },
    })
    .input(
      z.object({
        bucketName: z.string().min(1),
        prefix: z.string().optional(),
        maxKeys: z.number().int().positive().max(1000).optional(),
        continuationToken: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ input, ctx }) => {
      try {
        return s3Service.listObjects(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  getObjectMetadata: viewProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/s3/object/metadata',
        tags: ['s3'],
        summary: 'Get object metadata and download URL',
        protect: true,
      },
    })
    .input(
      z.object({
        bucketName: z.string().min(1),
        objectKey: z.string().min(1),
        expiresInSeconds: z.number().int().positive().max(86400).optional(),
      })
    )
    .output(z.any())
    .query(async ({ input, ctx }) => {
      try {
        return s3Service.getObjectMetadata(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  getProperties: viewProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/s3/object/properties',
        tags: ['s3'],
        summary: 'Get object properties',
        protect: true,
      },
    })
    .input(
      z.object({
        path: z.string().min(1),
      })
    )
    .output(z.any())
    .query(async ({ input, ctx }) => {
      try {
        return s3Service.getObjectProperties(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  updateProperties: writeProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/s3/object/properties',
        tags: ['s3'],
        summary: 'Update object properties',
        protect: true,
      },
    })
    .input(
      z.object({
        path: z.string().min(1),
        contentType: z.string().min(1).optional(),
        storageClass: z.string().min(1).optional(),
        cacheControl: z.string().nullable().optional(),
        contentDisposition: z.string().nullable().optional(),
        contentEncoding: z.string().nullable().optional(),
        contentLanguage: z.string().nullable().optional(),
        expires: z.string().nullable().optional(),
        metadata: z.record(z.string(), z.string()).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      if (!ctx.permissions.includes('manage_properties')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: "Missing 'manage_properties' permission",
        });
      }

      try {
        return s3Service.updateObjectProperties(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  getObjectTextContent: viewProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/s3/object/text',
        tags: ['s3'],
        summary: 'Get object text content',
        protect: true,
      },
    })
    .input(
      z.object({
        path: z.string().min(1),
      })
    )
    .output(z.any())
    .query(async ({ input, ctx }) => {
      try {
        return s3Service.getObjectTextContent(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  updateObjectTextContent: writeProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/s3/object/text',
        tags: ['s3'],
        summary: 'Update object text content',
        protect: true,
      },
    })
    .input(
      z.object({
        path: z.string().min(1),
        content: z.string(),
        expectedEtag: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.updateObjectTextContent(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  createPresignedUpload: writeProcedure
    .input(
      z.object({
        bucketName: z.string().min(1),
        objectKey: z.string().min(1),
        contentType: z.string().optional(),
        expiresInSeconds: z.number().int().positive().max(86400).optional(),
        metadata: z.record(z.string(), z.string()).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.createPresignedUpload(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  initiateMultipartUpload: writeProcedure
    .input(
      z.object({
        bucketName: z.string().min(1),
        objectKey: z.string().min(1),
        contentType: z.string().optional(),
        metadata: z.record(z.string(), z.string()).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.initiateMultipartUpload(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  createMultipartPartUploadUrl: writeProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/s3/upload/multipart/part-url',
        tags: ['s3'],
        summary: 'Create multipart part upload URL',
        protect: true,
      },
    })
    .input(
      z.object({
        bucketName: z.string().min(1),
        objectKey: z.string().min(1),
        uploadId: z.string().min(1),
        partNumber: z.number().int().positive(),
        expiresInSeconds: z.number().int().positive().max(86400).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.createMultipartPartUploadUrl(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  completeMultipartUpload: writeProcedure
    .input(
      z.object({
        bucketName: z.string().min(1),
        objectKey: z.string().min(1),
        uploadId: z.string().min(1),
        parts: z.array(
          z.object({
            partNumber: z.number().int().positive(),
            etag: z.string().min(1),
          })
        ),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.completeMultipartUpload(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  abortMultipartUpload: writeProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/s3/upload/multipart/abort',
        tags: ['s3'],
        summary: 'Abort multipart upload',
        protect: true,
      },
    })
    .input(
      z.object({
        bucketName: z.string().min(1),
        objectKey: z.string().min(1),
        uploadId: z.string().min(1),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      try {
        await s3Service.abortMultipartUpload(input, actorFromContext(ctx));
        return {
          success: true,
        };
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  uploadCookbook: viewProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/s3/upload/cookbook',
        tags: ['s3'],
        summary: 'Get upload strategy cookbook',
        protect: true,
      },
    })
    .input(
      z
        .object({
          bucketName: z.string().min(1).default('my-bucket'),
          objectKey: z.string().min(1).default('folder/file.bin'),
          contentType: z.string().default('application/octet-stream'),
          fileSizeBytes: z.number().int().positive().optional(),
          preferredPartSizeBytes: z.number().int().positive().optional(),
        })
        .default({})
    )
    .output(z.any())
    .query(({ input }) => {
      return buildUploadCookbook(input);
    }),

  createFolder: writeProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/s3/folder/create',
        tags: ['s3'],
        summary: 'Create folder marker',
        protect: true,
      },
    })
    .input(
      z.object({
        path: z.string().min(1),
        folderName: z.string().min(1),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.createFolder(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  renameItem: writeProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/s3/item/rename',
        tags: ['s3'],
        summary: 'Rename or move item',
        protect: true,
      },
    })
    .input(
      z
        .object({
          sourcePath: z.string().min(1),
          newName: z.string().min(1).optional(),
          destinationPath: z.string().min(1).optional(),
        })
        .refine((value) => value.newName || value.destinationPath, {
          message: 'Either newName or destinationPath is required',
        })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.renameItem(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  deleteObject: deleteProcedure
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/s3/object',
        tags: ['s3'],
        summary: 'Delete object',
        protect: true,
      },
    })
    .input(
      z.object({
        bucketName: z.string().min(1),
        objectKey: z.string().min(1),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      try {
        await s3Service.deleteObject(input, actorFromContext(ctx));
        return {
          success: true,
        };
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  deleteFolder: deleteProcedure
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/s3/folder',
        tags: ['s3'],
        summary: 'Delete folder recursively',
        protect: true,
      },
    })
    .input(
      z.object({
        path: z.string().min(1),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.deleteFolder(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  deleteMultiple: deleteProcedure
    .input(
      z.object({
        paths: z.array(z.string().min(1)).min(1),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.deleteMultiple(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),
});
