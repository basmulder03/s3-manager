import { describe, expect, it } from 'bun:test';
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { S3Service } from './service';

type CommandInput = { input: Record<string, unknown> };

class MockS3Client {
  readonly calls: unknown[] = [];

  async send(command: unknown): Promise<unknown> {
    this.calls.push(command);

    if (command instanceof ListObjectsV2Command) {
      const input = (command as CommandInput).input;
      const token = input.ContinuationToken as string | undefined;

      if (!token) {
        return {
          Contents: Array.from({ length: 1000 }, (_, index) => ({ Key: `folder/file-${index}.txt` })),
          IsTruncated: true,
          NextContinuationToken: 'page-2',
        };
      }

      return {
        Contents: Array.from({ length: 120 }, (_, index) => ({ Key: `folder/file-2-${index}.txt` })),
        IsTruncated: false,
      };
    }

    if (command instanceof DeleteObjectsCommand) {
      return {};
    }

    throw new Error('Unexpected command sent to mock client');
  }
}

describe('S3Service deleteFolder', () => {
  it('deletes in batches of 1000', async () => {
    const client = new MockS3Client();
    const service = new S3Service(() => client as never);

    const result = await service.deleteFolder({ path: 'my-bucket/folder' }, 'tester@example.com');

    expect(result.deletedCount).toBe(1120);

    const deleteCalls = client.calls.filter((call) => call instanceof DeleteObjectsCommand) as CommandInput[];
    expect(deleteCalls).toHaveLength(2);

    const firstBatch = deleteCalls[0].input.Delete as { Objects: Array<{ Key: string }> };
    const secondBatch = deleteCalls[1].input.Delete as { Objects: Array<{ Key: string }> };

    expect(firstBatch.Objects).toHaveLength(1000);
    expect(secondBatch.Objects).toHaveLength(120);
  });
});
