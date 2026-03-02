import { ListBucketsCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { getLogger } from '@/telemetry';
import { recordS3FileAccess } from '@/telemetry/metrics';
import { listS3SourceIds, resolveBucketReference, toBucketReference } from '@/services/s3/client';
import { mapError, metricActor, toIso } from '@/services/s3/helpers';
import { buildBreadcrumbs, normalizeVirtualPath, parseVirtualPath } from '@/services/s3/path';
import type {
  BrowseItem,
  BrowseResult,
  ListObjectsInput,
  ListObjectsResult,
  S3BucketSummary,
  S3ObjectSummary,
} from '@/services/s3/types';

const s3Logger = () => getLogger('S3');

export class ListOperations {
  constructor(private readonly clientProvider: (sourceId: string) => S3Client) {}

  async listBuckets(actor?: string): Promise<S3BucketSummary[]> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const sourceIds = listS3SourceIds();
      const bucketGroups = await Promise.all(
        sourceIds.map(async (sourceId) => {
          const client = this.clientProvider(sourceId);
          const response = await client.send(new ListBucketsCommand({}));
          return (response.Buckets ?? []).map<S3BucketSummary>((bucket) => {
            const bucketName = bucket.Name ?? '';
            return {
              name: bucketName.length > 0 ? toBucketReference(sourceId, bucketName) : '',
              creationDate: toIso(bucket.CreationDate),
            };
          });
        })
      );
      const buckets = bucketGroups.flat();

      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: '*',
          objectKey: '*',
          result: 'success',
        },
        Date.now() - startedAt
      );

      return buckets.filter((bucket) => bucket.name.length > 0);
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: '*',
          objectKey: '*',
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, 'Failed to list buckets');
    }
  }

  async listObjects(input: ListObjectsInput, actor?: string): Promise<ListObjectsResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);
    const target = resolveBucketReference(input.bucketName);

    try {
      const client = this.clientProvider(target.sourceId);
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: target.bucketName,
          Prefix: input.prefix ?? '',
          MaxKeys: input.maxKeys ?? 1000,
          ContinuationToken: input.continuationToken,
        })
      );

      const objects = (response.Contents ?? []).map<S3ObjectSummary>((item) => ({
        key: item.Key ?? '',
        size: item.Size ?? 0,
        lastModified: toIso(item.LastModified),
        etag: item.ETag ?? null,
      }));

      const result: ListObjectsResult = {
        objects: objects.filter((item) => item.key.length > 0),
        isTruncated: response.IsTruncated ?? false,
        keyCount: response.KeyCount ?? 0,
      };

      if (response.NextContinuationToken) {
        result.nextContinuationToken = response.NextContinuationToken;
      }

      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: target.bucketReference,
          objectKey: input.prefix ?? '*',
          result: 'success',
        },
        Date.now() - startedAt
      );

      return result;
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: target.bucketReference,
          objectKey: input.prefix ?? '*',
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to list objects for bucket '${input.bucketName}'`);
    }
  }

  async browse(virtualPath = '', actor?: string): Promise<BrowseResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const normalizedPath = normalizeVirtualPath(virtualPath);
      if (normalizedPath.length === 0) {
        const buckets = await this.listBuckets(actor);
        const items: BrowseItem[] = buckets.map((bucket) => ({
          name: bucket.name,
          type: 'directory',
          path: bucket.name,
          size: null,
          lastModified: bucket.creationDate,
        }));

        return {
          path: '/',
          breadcrumbs: [{ name: 'Home', path: '' }],
          items,
        };
      }

      const { bucketName, prefix } = parseVirtualPath(normalizedPath);
      const target = resolveBucketReference(bucketName);
      const client = this.clientProvider(target.sourceId);
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: target.bucketName,
          Prefix: prefix,
          Delimiter: '/',
        })
      );

      const directories = (response.CommonPrefixes ?? []).flatMap<BrowseItem>((commonPrefix) => {
        const folderPrefix = commonPrefix.Prefix;
        if (!folderPrefix) {
          return [];
        }

        const name = folderPrefix.slice(prefix.length).replace(/\/$/, '');
        if (name.length === 0) {
          return [];
        }

        return [
          {
            name,
            type: 'directory',
            path: `${target.bucketReference}/${folderPrefix.replace(/\/$/, '')}`,
            size: null,
            lastModified: null,
          },
        ];
      });

      const files = (response.Contents ?? []).flatMap<BrowseItem>((item) => {
        const key = item.Key;
        if (!key || key === prefix) {
          return [];
        }

        const name = key.slice(prefix.length);
        if (name.length === 0 || name.includes('/')) {
          return [];
        }

        return [
          {
            name,
            type: 'file',
            path: `${target.bucketReference}/${key}`,
            size: item.Size ?? 0,
            lastModified: toIso(item.LastModified),
            etag: item.ETag,
          },
        ];
      });

      const items = [...directories, ...files].sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === 'directory' ? -1 : 1;
        }
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      });

      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: target.bucketReference,
          objectKey: prefix || '*',
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        path: `/${normalizedPath}`,
        breadcrumbs: buildBreadcrumbs(normalizedPath),
        items,
      };
    } catch (error) {
      s3Logger().error({ err: error, virtualPath }, 'Failed to browse virtual path');
      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: '*',
          objectKey: virtualPath || '*',
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, 'Failed to browse files');
    }
  }
}
