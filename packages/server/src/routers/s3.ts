import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { S3Service } from '../services/s3/service';
import { isS3ServiceError } from '../services/s3/errors';

const s3Service = new S3Service();

const toTrpcError = (error: unknown): TRPCError => {
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
  listBuckets: publicProcedure.query(async ({ ctx }) => {
    try {
      return {
        buckets: await s3Service.listBuckets(actorFromContext(ctx)),
      };
    } catch (error) {
      throw toTrpcError(error);
    }
  }),

  browse: publicProcedure
    .input(
      z.object({
        virtualPath: z.string().default(''),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        return s3Service.browse(input.virtualPath, actorFromContext(ctx));
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  listObjects: publicProcedure
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
        throw toTrpcError(error);
      }
    }),

  getObjectMetadata: publicProcedure
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
        throw toTrpcError(error);
      }
    }),

  createPresignedUpload: publicProcedure
    .input(
      z.object({
        bucketName: z.string().min(1),
        objectKey: z.string().min(1),
        contentType: z.string().optional(),
        expiresInSeconds: z.number().int().positive().max(86400).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.createPresignedUpload(input, actorFromContext(ctx));
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  createFolder: publicProcedure
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
        throw toTrpcError(error);
      }
    }),

  deleteObject: publicProcedure
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
        throw toTrpcError(error);
      }
    }),

  deleteFolder: publicProcedure
    .input(
      z.object({
        path: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return s3Service.deleteFolder(input, actorFromContext(ctx));
      } catch (error) {
        throw toTrpcError(error);
      }
    }),
});
