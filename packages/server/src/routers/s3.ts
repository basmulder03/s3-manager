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
  listBuckets: viewProcedure.query(async ({ ctx }) => {
    try {
      return {
        buckets: await s3Service.listBuckets(actorFromContext(ctx)),
      };
    } catch (error) {
      throw mapS3ErrorToTrpc(error);
    }
  }),

  browse: viewProcedure
    .input(
      z.object({
        virtualPath: z.string().default(''),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        return s3Service.browse(input.virtualPath, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  listObjects: viewProcedure
    .input(
      z.object({
        bucketName: z.string().min(1),
        prefix: z.string().optional(),
        maxKeys: z.number().int().positive().max(1000).optional(),
        continuationToken: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        return s3Service.listObjects(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  getObjectMetadata: viewProcedure
    .input(
      z.object({
        bucketName: z.string().min(1),
        objectKey: z.string().min(1),
        expiresInSeconds: z.number().int().positive().max(86400).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        return s3Service.getObjectMetadata(input, actorFromContext(ctx));
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
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.initiateMultipartUpload(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  createMultipartPartUploadUrl: writeProcedure
    .input(
      z.object({
        bucketName: z.string().min(1),
        objectKey: z.string().min(1),
        uploadId: z.string().min(1),
        partNumber: z.number().int().positive(),
        expiresInSeconds: z.number().int().positive().max(86400).optional(),
      })
    )
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
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.completeMultipartUpload(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  abortMultipartUpload: writeProcedure
    .input(
      z.object({
        bucketName: z.string().min(1),
        objectKey: z.string().min(1),
        uploadId: z.string().min(1),
      })
    )
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
    .query(({ input }) => {
      return buildUploadCookbook(input);
    }),

  createFolder: writeProcedure
    .input(
      z.object({
        path: z.string().min(1),
        folderName: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.createFolder(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),

  deleteObject: deleteProcedure
    .input(
      z.object({
        bucketName: z.string().min(1),
        objectKey: z.string().min(1),
      })
    )
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
    .input(
      z.object({
        path: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.deleteFolder(input, actorFromContext(ctx));
      } catch (error) {
        throw mapS3ErrorToTrpc(error);
      }
    }),
});
