import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const BUCKET_NAME = process.env.E2E_S3_BUCKET ?? 'my-bucket';
const S3_ENDPOINT = process.env.E2E_S3_ENDPOINT ?? 'http://127.0.0.1:4566';
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

const s3Client = new S3Client({
  endpoint: S3_ENDPOINT,
  forcePathStyle: true,
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
});

const uniquePrefix = (label: string): string => {
  return `e2e/${label}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const ensureBucket = async (): Promise<void> => {
  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
  } catch (error) {
    if (error instanceof Error && /BucketAlready/.test(error.message)) {
      return;
    }
    throw error;
  }
};

const seedPrefix = async (prefix: string): Promise<void> => {
  const keys = [`${prefix}/report.txt`, `${prefix}/docs/readme.md`, `${prefix}/archive/old.log`];

  for (const key of keys) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: `seed:${key}`,
        ContentType: 'text/plain',
      })
    );
  }
};

const cleanupPrefix = async (prefix: string): Promise<void> => {
  let continuationToken: string | undefined;
  const allKeys: Array<{ Key: string }> = [];

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: `${prefix}/`,
        ContinuationToken: continuationToken,
      })
    );

    for (const item of response.Contents ?? []) {
      if (item.Key) {
        allKeys.push({ Key: item.Key });
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  if (allKeys.length > 0) {
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: {
          Objects: allKeys,
        },
      })
    );
  }
};

const openBrowserPath = async (path: string, page: Page): Promise<void> => {
  await page.goto('/browser');
  await page.getByPlaceholder('Path example: my-bucket/folder').fill(path);
  await page.getByRole('button', { name: 'Refresh' }).click();
};

test.describe('Web smoke', () => {
  test.beforeAll(async () => {
    await ensureBucket();
  });

  test('browses a seeded path and creates a folder', async ({ page }) => {
    const prefix = uniquePrefix('create-folder');
    await seedPrefix(prefix);

    try {
      await openBrowserPath(`${BUCKET_NAME}/${prefix}`, page);

      await expect(page.getByText('report.txt')).toBeVisible();

      const newFolderName = `created-${Date.now()}`;
      await page.getByPlaceholder('New folder name').fill(newFolderName);
      await page.getByRole('button', { name: 'Create Folder' }).click();

      await expect(page.getByText('Folder created successfully.')).toBeVisible();
      await expect(page.getByText(newFolderName)).toBeVisible();
    } finally {
      await cleanupPrefix(prefix);
    }
  });

  test('renames and moves a file and opens grouped context menu', async ({ page }) => {
    const prefix = uniquePrefix('rename-move');
    await seedPrefix(prefix);

    try {
      await openBrowserPath(`${BUCKET_NAME}/${prefix}`, page);

      const reportRow = page.locator('li', { hasText: 'report.txt' }).first();

      page.once('dialog', async (dialog) => {
        await dialog.accept('renamed.txt');
      });
      await reportRow.getByRole('button', { name: 'Rename' }).click();

      await expect(page.getByText('Item renamed successfully.')).toBeVisible();
      await expect(page.getByText('renamed.txt')).toBeVisible();

      const renamedRow = page.locator('li', { hasText: 'renamed.txt' }).first();
      await renamedRow.getByText('renamed.txt').click({ button: 'right' });

      await expect(page.getByText('Quick Actions')).toBeVisible();
      await expect(page.getByText('Edit')).toBeVisible();
      await expect(page.getByText('Danger')).toBeVisible();

      page.once('dialog', async (dialog) => {
        await dialog.accept(`${BUCKET_NAME}/${prefix}/archive`);
      });
      await renamedRow.getByRole('button', { name: 'Move' }).click();

      await expect(page.getByText('Item moved successfully.')).toBeVisible();

      await openBrowserPath(`${BUCKET_NAME}/${prefix}/archive`, page);
      await expect(page.getByText('renamed.txt')).toBeVisible();
    } finally {
      await cleanupPrefix(prefix);
    }
  });

  test('supports select-all and bulk delete keyboard flow', async ({ page }) => {
    const prefix = uniquePrefix('bulk-delete');
    await seedPrefix(prefix);

    try {
      await openBrowserPath(`${BUCKET_NAME}/${prefix}`, page);

      await page.keyboard.press('ControlOrMeta+A');
      await expect(page.locator('.selection-bar')).toContainText('selected');

      page.once('dialog', async (dialog) => {
        await dialog.accept();
      });
      await page.keyboard.press('Delete');

      await expect(page.getByText(/Deleted \d+ of \d+ selected item\(s\)\./)).toBeVisible();
      await expect(page.locator('.selection-bar')).toHaveCount(0);
    } finally {
      await cleanupPrefix(prefix);
    }
  });
});
