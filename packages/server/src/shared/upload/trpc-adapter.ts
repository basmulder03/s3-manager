import type { UploadClientProcedures } from './contracts';

export interface S3UploadTrpcLikeClient {
  s3: {
    uploadCookbook: {
      query(input: Parameters<UploadClientProcedures['uploadCookbook']>[0]): ReturnType<UploadClientProcedures['uploadCookbook']>;
    };
    createPresignedUpload: {
      mutate(
        input: Parameters<UploadClientProcedures['createPresignedUpload']>[0]
      ): ReturnType<UploadClientProcedures['createPresignedUpload']>;
    };
    initiateMultipartUpload: {
      mutate(
        input: Parameters<UploadClientProcedures['initiateMultipartUpload']>[0]
      ): ReturnType<UploadClientProcedures['initiateMultipartUpload']>;
    };
    createMultipartPartUploadUrl: {
      mutate(
        input: Parameters<UploadClientProcedures['createMultipartPartUploadUrl']>[0]
      ): ReturnType<UploadClientProcedures['createMultipartPartUploadUrl']>;
    };
    completeMultipartUpload: {
      mutate(
        input: Parameters<UploadClientProcedures['completeMultipartUpload']>[0]
      ): ReturnType<UploadClientProcedures['completeMultipartUpload']>;
    };
    abortMultipartUpload: {
      mutate(
        input: Parameters<UploadClientProcedures['abortMultipartUpload']>[0]
      ): ReturnType<UploadClientProcedures['abortMultipartUpload']>;
    };
  };
}

export const createUploadProceduresFromTrpc = (client: S3UploadTrpcLikeClient): UploadClientProcedures => {
  return {
    uploadCookbook: (input) => client.s3.uploadCookbook.query(input),
    createPresignedUpload: (input) => client.s3.createPresignedUpload.mutate(input),
    initiateMultipartUpload: (input) => client.s3.initiateMultipartUpload.mutate(input),
    createMultipartPartUploadUrl: (input) => client.s3.createMultipartPartUploadUrl.mutate(input),
    completeMultipartUpload: (input) => client.s3.completeMultipartUpload.mutate(input),
    abortMultipartUpload: (input) => client.s3.abortMultipartUpload.mutate(input),
  };
};
