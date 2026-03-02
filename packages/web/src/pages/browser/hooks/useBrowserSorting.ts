import { useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { SortDirection, SortKey, SortRule } from '@web/pages/browser/types';
import styles from '@web/App.module.css';

export const useBrowserSorting = () => {
  const [sortRules, setSortRules] = useState<SortRule[]>([
    { key: 'type', direction: 'asc' },
    { key: 'name', direction: 'asc' },
  ]);

  const setSortForColumn = useCallback((key: SortKey, additive: boolean) => {
    setSortRules((previous) => {
      const existing = previous.find((rule) => rule.key === key);
      const nextDirection: SortDirection = existing?.direction === 'asc' ? 'desc' : 'asc';

      if (!additive) {
        const next: SortRule[] = [{ key, direction: nextDirection }];
        if (key !== 'type') {
          next.push({ key: 'type', direction: 'asc' });
        }
        if (key !== 'name') {
          next.push({ key: 'name', direction: 'asc' });
        }
        return next;
      }

      if (existing) {
        return previous.map((rule) =>
          rule.key === key ? { ...rule, direction: nextDirection } : rule
        );
      }

      return [...previous, { key, direction: 'asc' }];
    });
  }, []);

  const getSortIndicator = useCallback(
    (key: SortKey): ReactNode => {
      const visibleSortRules = sortRules.filter((rule) => rule.key !== 'type');
      const visibleIndex = visibleSortRules.findIndex((rule) => rule.key === key);
      if (visibleIndex === -1) {
        return null;
      }
      const direction = visibleSortRules[visibleIndex]?.direction;
      return (
        <>
          {direction === 'asc' ? (
            <ChevronUp size={13} className={styles.sortIndicatorIcon} />
          ) : (
            <ChevronDown size={13} className={styles.sortIndicatorIcon} />
          )}
          {visibleSortRules.length > 1 ? <span>{visibleIndex + 1}</span> : null}
        </>
      );
    },
    [sortRules]
  );

  const getSortLabel = useCallback((key: SortKey): string => {
    if (key === 'name') {
      return 'Name';
    }
    if (key === 'size') {
      return 'Size';
    }
    if (key === 'modified') {
      return 'Modified';
    }
    if (key === 'key') {
      return 'Key';
    }
    if (key === 'etag') {
      return 'ETag';
    }
    if (key === 'versionId') {
      return 'Version Id';
    }
    if (key === 'serverSideEncryption') {
      return 'Server-side encryption';
    }
    if (key === 'contentType') {
      return 'Content Type';
    }
    if (key === 'storageClass') {
      return 'Storage Class';
    }
    if (key === 'cacheControl') {
      return 'Cache Control';
    }
    if (key === 'contentDisposition') {
      return 'Content Disposition';
    }
    if (key === 'contentEncoding') {
      return 'Content Encoding';
    }
    if (key === 'contentLanguage') {
      return 'Content Language';
    }
    if (key === 'expires') {
      return 'Expires';
    }
    return 'Type';
  }, []);

  const getSortTooltip = useCallback(
    (key: SortKey): string => {
      const visibleSortRules = sortRules.filter((rule) => rule.key !== 'type');
      const visibleIndex = visibleSortRules.findIndex((rule) => rule.key === key);
      if (visibleIndex === -1) {
        return 'Click to sort. Shift+click to add this column as an extra compare level.';
      }

      const sequence = visibleSortRules
        .map((rule, ruleIndex) => {
          const directionLabel = rule.direction === 'asc' ? 'ascending' : 'descending';
          return `${ruleIndex + 1}. ${getSortLabel(rule.key)} (${directionLabel})`;
        })
        .join(' -> ');

      return `Number ${visibleIndex + 1} means compare priority. Current order: ${sequence}.`;
    },
    [sortRules, getSortLabel]
  );

  return {
    sortRules,
    setSortRules,
    setSortForColumn,
    getSortIndicator,
    getSortLabel,
    getSortTooltip,
  };
};
