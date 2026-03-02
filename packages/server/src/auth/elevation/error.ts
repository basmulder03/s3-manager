export class ElevationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ElevationError';
    this.status = status;
  }
}

export const isElevationError = (error: unknown): error is ElevationError => {
  return error instanceof ElevationError;
};
