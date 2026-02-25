import { S3Client } from '@aws-sdk/client-s3';
import { config } from '@/config';

let s3Client: S3Client | null = null;

export const getS3Client = (): S3Client => {
  if (s3Client) {
    return s3Client;
  }

  s3Client = new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint,
    credentials: {
      accessKeyId: config.s3.accessKey,
      secretAccessKey: config.s3.secretKey,
    },
    forcePathStyle: true,
    tls: config.s3.useSsl,
  });

  return s3Client;
};
