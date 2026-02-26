import { describe, expect, it } from 'bun:test';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
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

class RenameMockS3Client {
  readonly calls: unknown[] = [];

  async send(command: unknown): Promise<unknown> {
    this.calls.push(command);

    if (command instanceof CopyObjectCommand) {
      return {};
    }

    if (command instanceof DeleteObjectCommand) {
      return {};
    }

    throw new Error('Unexpected command sent to rename mock client');
  }
}

class RenameFolderMockS3Client {
  readonly calls: unknown[] = [];

  async send(command: unknown): Promise<unknown> {
    this.calls.push(command);

    if (command instanceof ListObjectsV2Command) {
      return {
        Contents: [
          { Key: 'folder/sub/file-a.txt' },
          { Key: 'folder/sub/file-b.txt' },
        ],
        IsTruncated: false,
      };
    }

    if (command instanceof CopyObjectCommand) {
      return {};
    }

    if (command instanceof DeleteObjectsCommand) {
      return {};
    }

    throw new Error('Unexpected command sent to rename-folder mock client');
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

describe('S3Service renameItem', () => {
  it('renames a single file via copy + delete', async () => {
    const client = new RenameMockS3Client();
    const service = new S3Service(() => client as never);

    const result = await service.renameItem(
      {
        sourcePath: 'my-bucket/folder/report.txt',
        newName: 'renamed.txt',
      },
      'tester@example.com'
    );

    expect(result.destinationPath).toBe('my-bucket/folder/renamed.txt');
    expect(result.movedObjects).toBe(1);

    const copyCalls = client.calls.filter((call) => call instanceof CopyObjectCommand);
    const deleteCalls = client.calls.filter((call) => call instanceof DeleteObjectCommand);

    expect(copyCalls).toHaveLength(1);
    expect(deleteCalls).toHaveLength(1);
  });

  it('moves a folder via copy + batch delete', async () => {
    const client = new RenameFolderMockS3Client();
    const service = new S3Service(() => client as never);

    const result = await service.renameItem(
      {
        sourcePath: 'my-bucket/folder/sub/',
        destinationPath: 'my-bucket/archive',
      },
      'tester@example.com'
    );

    expect(result.destinationPath).toBe('my-bucket/archive/sub');
    expect(result.movedObjects).toBe(2);

    const listCalls = client.calls.filter((call) => call instanceof ListObjectsV2Command);
    const copyCalls = client.calls.filter((call) => call instanceof CopyObjectCommand);
    const deleteBatchCalls = client.calls.filter((call) => call instanceof DeleteObjectsCommand);

    expect(listCalls).toHaveLength(1);
    expect(copyCalls).toHaveLength(2);
    expect(deleteBatchCalls).toHaveLength(1);
  });

  it('rejects cross-bucket move', async () => {
    const service = new S3Service(() => ({ send: async () => ({}) }) as never);

    await expect(
      service.renameItem(
        {
          sourcePath: 'my-bucket/folder/report.txt',
          destinationPath: 'other-bucket/archive',
        },
        'tester@example.com'
      )
    ).rejects.toMatchObject({ code: 'INVALID_PATH' });
  });
});
