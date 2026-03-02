import type { BrowseItem } from '@server/services/s3/types';
import type { OverviewColumnKey, SortKey } from '@web/pages/browser/types';
import { formatBytes } from '@web/utils/formatBytes';
import { formatDate, getObjectKeyFromPath } from '@web/pages/browser/utils';
import { overviewColumnSortKeyByColumn } from '@web/pages/browser/constants';

interface OverviewFieldValueParams {
  item: BrowseItem;
  columnKey: OverviewColumnKey;
  isParentNavigation: boolean;
  folderSizesByPath: Record<string, number>;
  folderSizeLoadingPaths: Set<string>;
  propertiesByPath: Record<string, any>;
  propertiesLoadingPaths: Set<string>;
}

/**
 * Resolves the display value for an overview column field
 */
export function resolveOverviewFieldValue(params: OverviewFieldValueParams): string {
  const {
    item,
    columnKey,
    isParentNavigation,
    folderSizesByPath,
    folderSizeLoadingPaths,
    propertiesByPath,
    propertiesLoadingPaths,
  } = params;

  if (isParentNavigation) {
    return '';
  }

  if (columnKey === 'showSize') {
    if (item.type === 'directory') {
      if (folderSizeLoadingPaths.has(item.path)) {
        return 'Calculating...';
      }

      const folderSize = folderSizesByPath[item.path];
      return typeof folderSize === 'number' ? formatBytes(folderSize) : '-';
    }

    if (item.size === null) {
      return '-';
    }

    return formatBytes(item.size);
  }

  if (columnKey === 'showModified') {
    return formatDate(item.lastModified);
  }

  if (item.type !== 'file') {
    return '-';
  }

  const details = propertiesByPath[item.path];
  const isLoading = propertiesLoadingPaths.has(item.path);

  if (columnKey === 'showKey') {
    return details?.key ?? getObjectKeyFromPath(item.path);
  }

  if (columnKey === 'showEtag') {
    return item.etag ?? details?.etag ?? (isLoading ? 'Loading...' : '-');
  }

  if (details === undefined) {
    return isLoading ? 'Loading...' : '-';
  }

  if (details === null) {
    return '-';
  }

  if (columnKey === 'showVersionId') {
    return details.versionId ?? '-';
  }
  if (columnKey === 'showServerSideEncryption') {
    return details.serverSideEncryption ?? '-';
  }
  if (columnKey === 'showContentType') {
    return details.contentType;
  }
  if (columnKey === 'showStorageClass') {
    return details.storageClass;
  }
  if (columnKey === 'showCacheControl') {
    return details.cacheControl ?? '-';
  }
  if (columnKey === 'showContentDisposition') {
    return details.contentDisposition ?? '-';
  }
  if (columnKey === 'showContentEncoding') {
    return details.contentEncoding ?? '-';
  }
  if (columnKey === 'showContentLanguage') {
    return details.contentLanguage ?? '-';
  }
  if (columnKey === 'showExpires') {
    return details.expires ? formatDate(details.expires) : '-';
  }
  return '-';
}

/**
 * Checks if a column is sortable
 */
export function isSortableColumn(columnKey: OverviewColumnKey): boolean {
  return Object.prototype.hasOwnProperty.call(overviewColumnSortKeyByColumn, columnKey);
}

/**
 * Resolves the sort key for a column
 */
export function resolveSortKey(columnKey: OverviewColumnKey): SortKey {
  return overviewColumnSortKeyByColumn[columnKey];
}
