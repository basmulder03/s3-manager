export class S3ServiceError extends Error {
  readonly code: string;

  readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = 'S3ServiceError';
    this.code = code;
    this.cause = cause;
  }
}

export const isS3ServiceError = (error: unknown): error is S3ServiceError => {
  return error instanceof S3ServiceError;
};
