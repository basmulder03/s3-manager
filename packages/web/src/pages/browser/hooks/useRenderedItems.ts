import { useMemo } from 'react';
import type { BrowseItem, ObjectPropertiesResult } from '@server/services/s3/types';
import { nameCollator } from '@web/pages/browser/constants';
import {
  doesStringMatch,
  normalizeFieldName,
  normalizeText,
  parseSizeLiteralBytes,
} from '@web/pages/browser/filterQuery';
import type { QueryClause, QueryOperator, SortKey, SortRule } from '@web/pages/browser/types';

interface UseRenderedItemsParams {
  browseItems: BrowseItem[];
  selectedPath: string;
  filterQuery: string;
  parsedFilterClauses: QueryClause[];
  propertiesByPath: Record<string, ObjectPropertiesResult | null>;
  folderSizesByPath: Record<string, number>;
  sortRules: SortRule[];
}

export const useRenderedItems = ({
  browseItems,
  selectedPath,
  filterQuery,
  parsedFilterClauses,
  propertiesByPath,
  folderSizesByPath,
  sortRules,
}: UseRenderedItemsParams) => {
  const parentPath = useMemo(() => {
    const normalized = selectedPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) {
      return '';
    }

    const parts = normalized.split('/');
    return parts.slice(0, -1).join('/');
  }, [selectedPath]);

  const normalizedFilter = filterQuery.trim().toLowerCase();

  const renderedItems = useMemo(() => {
    const compareNullableString = (leftValue: string | null, rightValue: string | null): number => {
      const hasLeft = leftValue !== null;
      const hasRight = rightValue !== null;

      if (!hasLeft && hasRight) {
        return 1;
      }
      if (hasLeft && !hasRight) {
        return -1;
      }
      if (!hasLeft || !hasRight) {
        return 0;
      }

      return nameCollator.compare(leftValue, rightValue);
    };

    const resolveStringSortValue = (item: BrowseItem, key: SortKey): string | null => {
      if (item.type !== 'file') {
        return null;
      }

      const details = propertiesByPath[item.path];
      if (key === 'key') {
        return (details?.key ?? item.path.split('/').slice(1).join('/')) || item.path;
      }
      if (key === 'etag') {
        return item.etag ?? details?.etag ?? null;
      }
      if (key === 'versionId') {
        return details?.versionId ?? null;
      }
      if (key === 'serverSideEncryption') {
        return details?.serverSideEncryption ?? null;
      }
      if (key === 'contentType') {
        return details?.contentType ?? null;
      }
      if (key === 'storageClass') {
        return details?.storageClass ?? null;
      }
      if (key === 'cacheControl') {
        return details?.cacheControl ?? null;
      }
      if (key === 'contentDisposition') {
        return details?.contentDisposition ?? null;
      }
      if (key === 'contentEncoding') {
        return details?.contentEncoding ?? null;
      }
      if (key === 'contentLanguage') {
        return details?.contentLanguage ?? null;
      }
      if (key === 'expires') {
        return details?.expires ?? null;
      }

      return null;
    };

    const compareItems = (left: BrowseItem, right: BrowseItem): number => {
      for (const rule of sortRules) {
        let result = 0;

        if (rule.key === 'name') {
          result = nameCollator.compare(left.name, right.name);
        }

        if (rule.key === 'type' && left.type !== right.type) {
          result = left.type === 'directory' ? -1 : 1;
        }

        if (rule.key === 'size') {
          const leftSize =
            left.type === 'directory' ? (folderSizesByPath[left.path] ?? null) : left.size;
          const rightSize =
            right.type === 'directory' ? (folderSizesByPath[right.path] ?? null) : right.size;

          if (leftSize === null && rightSize !== null) {
            result = 1;
          } else if (leftSize !== null && rightSize === null) {
            result = -1;
          } else if (leftSize !== null && rightSize !== null) {
            result = leftSize - rightSize;
          }
        }

        if (rule.key === 'modified') {
          const leftTime = left.lastModified ? Date.parse(left.lastModified) : Number.NaN;
          const rightTime = right.lastModified ? Date.parse(right.lastModified) : Number.NaN;
          const hasLeft = Number.isFinite(leftTime);
          const hasRight = Number.isFinite(rightTime);

          if (!hasLeft && hasRight) {
            result = 1;
          } else if (hasLeft && !hasRight) {
            result = -1;
          } else if (hasLeft && hasRight) {
            result = leftTime - rightTime;
          }
        }

        if (rule.key === 'expires') {
          const leftExpires = resolveStringSortValue(left, rule.key);
          const rightExpires = resolveStringSortValue(right, rule.key);
          const leftTime = leftExpires ? Date.parse(leftExpires) : Number.NaN;
          const rightTime = rightExpires ? Date.parse(rightExpires) : Number.NaN;
          const hasLeft = Number.isFinite(leftTime);
          const hasRight = Number.isFinite(rightTime);

          if (!hasLeft && hasRight) {
            result = 1;
          } else if (hasLeft && !hasRight) {
            result = -1;
          } else if (hasLeft && hasRight) {
            result = leftTime - rightTime;
          }
        }

        if (
          rule.key === 'key' ||
          rule.key === 'etag' ||
          rule.key === 'versionId' ||
          rule.key === 'serverSideEncryption' ||
          rule.key === 'contentType' ||
          rule.key === 'storageClass' ||
          rule.key === 'cacheControl' ||
          rule.key === 'contentDisposition' ||
          rule.key === 'contentEncoding' ||
          rule.key === 'contentLanguage'
        ) {
          result = compareNullableString(
            resolveStringSortValue(left, rule.key),
            resolveStringSortValue(right, rule.key)
          );
        }

        if (result !== 0) {
          return rule.direction === 'asc' ? result : -result;
        }
      }

      return nameCollator.compare(left.path, right.path);
    };

    const compareNumber = (left: number, right: number, operator: QueryOperator): boolean => {
      if (operator === '>') {
        return left > right;
      }
      if (operator === '>=') {
        return left >= right;
      }
      if (operator === '<') {
        return left < right;
      }
      if (operator === '<=') {
        return left <= right;
      }
      if (operator === '=') {
        return left === right;
      }
      return String(left).includes(String(right));
    };

    const compareDate = (
      actualIso: string | null | undefined,
      expectedRaw: string,
      operator: QueryOperator
    ) => {
      if (!actualIso) {
        return false;
      }

      const actual = Date.parse(actualIso);
      const expected = Date.parse(expectedRaw);
      if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
        return false;
      }

      return compareNumber(actual, expected, operator);
    };

    const doesClauseMatch = (item: BrowseItem, clause: QueryClause): boolean => {
      const details = item.type === 'file' ? propertiesByPath[item.path] : undefined;
      const metadata = details && details !== null ? details.metadata : undefined;
      const metadataEntries = metadata ? Object.entries(metadata) : [];
      const extension = item.name.includes('.') ? (item.name.split('.').pop() ?? '') : '';

      if (clause.kind === 'text') {
        const textTokens: string[] = [item.name, item.path, item.type];
        if (item.type === 'file') {
          textTokens.push(String(item.size ?? ''));
          textTokens.push(item.lastModified ?? '');
          textTokens.push(item.etag ?? '');
          if (details && details !== null) {
            textTokens.push(details.key);
            textTokens.push(details.contentType);
            textTokens.push(details.storageClass);
            textTokens.push(details.cacheControl ?? '');
            textTokens.push(details.contentDisposition ?? '');
            textTokens.push(details.contentEncoding ?? '');
            textTokens.push(details.contentLanguage ?? '');
            textTokens.push(details.expires ?? '');
            textTokens.push(details.versionId ?? '');
            textTokens.push(details.serverSideEncryption ?? '');
          }

          for (const [key, value] of metadataEntries) {
            textTokens.push(key);
            textTokens.push(value);
            textTokens.push(`${key}:${value}`);
          }
        }

        const haystack = textTokens.join(' ').toLowerCase();
        return haystack.includes(clause.value.toLowerCase());
      }

      const normalizedField = normalizeFieldName(clause.field);
      const value = clause.value.trim();
      const numericValue = parseSizeLiteralBytes(value) ?? Number.parseFloat(value);

      const metadataMatch = (key: string): boolean => {
        if (!metadata) {
          return false;
        }

        const direct = metadata[key];
        if (typeof direct === 'string') {
          return doesStringMatch(direct, value, clause.operator);
        }

        const fallbackEntry = Object.entries(metadata).find(
          ([entryKey]) => normalizeText(entryKey) === normalizeText(key)
        );
        return fallbackEntry ? doesStringMatch(fallbackEntry[1], value, clause.operator) : false;
      };

      if (normalizedField === 'name') {
        return doesStringMatch(item.name, value, clause.operator);
      }
      if (normalizedField === 'path') {
        return doesStringMatch(item.path, value, clause.operator);
      }
      if (normalizedField === 'type' || normalizedField === 'kind' || normalizedField === 'is') {
        return doesStringMatch(item.type, value, '=');
      }
      if (normalizedField === 'ext' || normalizedField === 'extension') {
        return doesStringMatch(extension, value.replace(/^\./, ''), clause.operator);
      }
      if (normalizedField === 'size') {
        if (!Number.isFinite(numericValue) || item.size === null) {
          return false;
        }

        return compareNumber(item.size, numericValue, clause.operator);
      }
      if (normalizedField === 'modified' || normalizedField === 'lastmodified') {
        return compareDate(item.lastModified, value, clause.operator);
      }
      if (normalizedField === 'etag') {
        const etag = item.etag ?? (details && details !== null ? details.etag : null) ?? '';
        return doesStringMatch(etag, value, clause.operator);
      }
      if (normalizedField === 'key') {
        const objectKey =
          details && details !== null
            ? details.key
            : item.path.split('/').slice(1).join('/') || item.path;
        return doesStringMatch(objectKey, value, clause.operator);
      }
      if (normalizedField === 'contenttype') {
        return doesStringMatch(
          details && details !== null ? details.contentType : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'storageclass') {
        return doesStringMatch(
          details && details !== null ? details.storageClass : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'cachecontrol') {
        return doesStringMatch(
          details && details !== null ? (details.cacheControl ?? '') : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'contentdisposition') {
        return doesStringMatch(
          details && details !== null ? (details.contentDisposition ?? '') : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'contentencoding') {
        return doesStringMatch(
          details && details !== null ? (details.contentEncoding ?? '') : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'contentlanguage') {
        return doesStringMatch(
          details && details !== null ? (details.contentLanguage ?? '') : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'versionid') {
        return doesStringMatch(
          details && details !== null ? (details.versionId ?? '') : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'expires') {
        return compareDate(
          details && details !== null ? (details.expires ?? null) : null,
          value,
          clause.operator
        );
      }
      if (normalizedField === 'serversideencryption' || normalizedField === 'sse') {
        return doesStringMatch(
          details && details !== null ? (details.serverSideEncryption ?? '') : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'meta' || normalizedField === 'metadata') {
        const allMetadata = metadataEntries
          .map(([key, metadataValue]) => `${key}:${metadataValue}`)
          .join(' ');
        return doesStringMatch(allMetadata, value, clause.operator);
      }
      if (normalizedField.startsWith('meta.')) {
        const metadataKey = normalizedField.slice('meta.'.length);
        return metadataMatch(metadataKey);
      }

      return metadataMatch(clause.field);
    };

    const filteredItems =
      normalizedFilter.length === 0
        ? browseItems
        : browseItems.filter((item) =>
            parsedFilterClauses.every((clause) => {
              const hasContent =
                clause.kind === 'text' ? clause.value.length > 0 : clause.value.length > 0;
              if (!hasContent) {
                return true;
              }

              const matched = doesClauseMatch(item, clause);
              return clause.negate ? !matched : matched;
            })
          );

    const sortedItems = [...filteredItems].sort(compareItems);

    if (!selectedPath) {
      return sortedItems.map((item) => ({ item, isParentNavigation: false }));
    }

    return [
      {
        item: {
          name: '..',
          type: 'directory' as const,
          path: parentPath,
          size: null,
          lastModified: null,
        },
        isParentNavigation: true,
      },
      ...sortedItems.map((item) => ({ item, isParentNavigation: false })),
    ];
  }, [
    browseItems,
    filterQuery,
    folderSizesByPath,
    parsedFilterClauses,
    parentPath,
    propertiesByPath,
    selectedPath,
    sortRules,
  ]);

  return { parentPath, renderedItems };
};
