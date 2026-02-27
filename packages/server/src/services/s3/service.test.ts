import { describe, expect, it } from 'bun:test';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
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
          Contents: Array.from({ length: 1000 }, (_, index) => ({
            Key: `folder/file-${index}.txt`,
          })),
          IsTruncated: true,
          NextContinuationToken: 'page-2',
        };
      }

      return {
        Contents: Array.from({ length: 120 }, (_, index) => ({
          Key: `folder/file-2-${index}.txt`,
        })),
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
        Contents: [{ Key: 'folder/sub/file-a.txt' }, { Key: 'folder/sub/file-b.txt' }],
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

class PropertiesMockS3Client {
  async send(command: unknown): Promise<unknown> {
    if (command instanceof HeadObjectCommand) {
      return {
        ContentLength: 42,
        ContentType: 'text/plain',
        LastModified: new Date('2026-01-01T10:00:00.000Z'),
        ETag: '"abc123"',
        StorageClass: 'STANDARD',
        Metadata: { owner: 'alice' },
        CacheControl: 'no-cache',
      };
    }

    throw new Error('Unexpected command sent to properties mock client');
  }
}

class UpdatePropertiesMockS3Client {
  readonly calls: unknown[] = [];
  private readonly responses = [
    {
      ContentLength: 42,
      ContentType: 'text/plain',
      LastModified: new Date('2026-01-01T10:00:00.000Z'),
      ETag: '"abc123"',
      StorageClass: 'STANDARD',
      Metadata: { owner: 'alice' },
      CacheControl: 'no-cache',
    },
    {
      ContentLength: 42,
      ContentType: 'application/json',
      LastModified: new Date('2026-01-01T10:01:00.000Z'),
      ETag: '"def456"',
      StorageClass: 'STANDARD_IA',
      Metadata: { owner: 'alice', environment: 'prod' },
      CacheControl: 'max-age=3600',
      ContentLanguage: 'en-US',
      Expires: new Date('2026-02-01T00:00:00.000Z'),
    },
  ];

  async send(command: unknown): Promise<unknown> {
    this.calls.push(command);

    if (command instanceof HeadObjectCommand) {
      const response = this.responses.shift();
      if (!response) {
        throw new Error('Unexpected extra HeadObjectCommand');
      }
      return response;
    }

    if (command instanceof CopyObjectCommand) {
      return {};
    }

    throw new Error('Unexpected command sent to update-properties mock client');
  }
}

class DeleteMultipleMockS3Client {
  async send(command: unknown): Promise<unknown> {
    if (command instanceof ListObjectsV2Command) {
      const input = (command as CommandInput).input;
      const prefix = input.Prefix as string | undefined;

      if (prefix === 'folder/') {
        return {
          Contents: [{ Key: 'folder/a.txt' }, { Key: 'folder/b.txt' }],
          IsTruncated: false,
        };
      }

      return {
        Contents: [],
        IsTruncated: false,
      };
    }

    if (command instanceof DeleteObjectsCommand) {
      return {};
    }

    if (command instanceof DeleteObjectCommand) {
      const input = (command as CommandInput).input;
      if (input.Key === 'broken.txt') {
        throw new Error('forced delete failure');
      }
      return {};
    }

    throw new Error('Unexpected command sent to delete-multiple mock client');
  }
}

describe('S3Service deleteFolder', () => {
  it('deletes in batches of 1000', async () => {
    const client = new MockS3Client();
    const service = new S3Service(() => client as never);

    const result = await service.deleteFolder({ path: 'my-bucket/folder' }, 'tester@example.com');

    expect(result.deletedCount).toBe(1120);

    const deleteCalls = client.calls.filter(
      (call) => call instanceof DeleteObjectsCommand
    ) as CommandInput[];
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

describe('S3Service getObjectProperties', () => {
  it('returns rich object properties metadata', async () => {
    const service = new S3Service(() => new PropertiesMockS3Client() as never);

    const result = await service.getObjectProperties(
      { path: 'my-bucket/folder/report.txt' },
      'tester@example.com'
    );

    expect(result.name).toBe('report.txt');
    expect(result.key).toBe('folder/report.txt');
    expect(result.size).toBe(42);
    expect(result.contentType).toBe('text/plain');
    expect(result.etag).toBe('abc123');
    expect(result.metadata.owner).toBe('alice');
    expect(result.cacheControl).toBe('no-cache');
  });
});

describe('S3Service updateObjectProperties', () => {
  it('updates mutable object properties via copy-to-self', async () => {
    const client = new UpdatePropertiesMockS3Client();
    const service = new S3Service(() => client as never);

    const result = await service.updateObjectProperties(
      {
        path: 'my-bucket/folder/report.txt',
        contentType: 'application/json',
        storageClass: 'STANDARD_IA',
        cacheControl: 'max-age=3600',
        contentLanguage: 'en-US',
        expires: '2026-02-01T00:00:00.000Z',
        metadata: { owner: 'alice', environment: 'prod' },
      },
      'tester@example.com'
    );

    expect(result.contentType).toBe('application/json');
    expect(result.storageClass).toBe('STANDARD_IA');
    expect(result.cacheControl).toBe('max-age=3600');
    expect(result.contentLanguage).toBe('en-US');
    expect(result.metadata.environment).toBe('prod');

    const copyCall = client.calls.find((call) => call instanceof CopyObjectCommand) as CommandInput;
    expect(copyCall).toBeTruthy();
    expect(copyCall.input.MetadataDirective).toBe('REPLACE');
    expect(copyCall.input.ContentType).toBe('application/json');
  });
});

describe('S3Service deleteMultiple', () => {
  it('deletes files and folders and reports per-path failures', async () => {
    const service = new S3Service(() => new DeleteMultipleMockS3Client() as never);

    const result = await service.deleteMultiple(
      {
        paths: ['my-bucket/folder', 'my-bucket/file.txt', 'my-bucket/broken.txt', 'my-bucket'],
      },
      'tester@example.com'
    );

    expect(result.deletedCount).toBe(3);
    expect(result.message).toBe('Deleted 3 item(s)');
    expect(result.errors?.length).toBe(2);
    expect(result.errors?.some((entry) => entry.path === 'my-bucket/broken.txt')).toBeTrue();
    expect(result.errors?.some((entry) => entry.path === 'my-bucket')).toBeTrue();
  });
});
