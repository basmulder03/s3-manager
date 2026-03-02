import { useState, useEffect, useMemo } from 'react';
import type { BrowseItem, ObjectPropertiesResult } from '@server/services/s3/types';
import { trpcProxyClient } from '@web/trpc/client';
import { parseFilterClauses } from '@web/pages/browser/filterQuery';

interface UsePropertiesLoadingProps {
  browseItems: BrowseItem[];
  isAnyPropertyBackedColumnVisible: boolean;
  filterQuery: string;
}

export const usePropertiesLoading = ({
  browseItems,
  isAnyPropertyBackedColumnVisible,
  filterQuery,
}: UsePropertiesLoadingProps) => {
  const [propertiesByPath, setPropertiesByPath] = useState<
    Record<string, ObjectPropertiesResult | null>
  >({});
  const [propertiesLoadingPaths, setPropertiesLoadingPaths] = useState<Set<string>>(new Set());

  const parsedFilterClauses = useMemo(() => parseFilterClauses(filterQuery), [filterQuery]);

  const hasActiveAdvancedFilter = useMemo(
    () =>
      parsedFilterClauses.some((clause) =>
        clause.kind === 'text' ? clause.value.trim().length > 0 : clause.value.trim().length > 0
      ),
    [parsedFilterClauses]
  );

  const shouldLoadPropertiesForFiltering = hasActiveAdvancedFilter;

  // Load properties for visible items when needed
  useEffect(() => {
    if (!isAnyPropertyBackedColumnVisible && !shouldLoadPropertiesForFiltering) {
      return;
    }

    const missingPaths = browseItems
      .filter((item) => item.type === 'file')
      .map((item) => item.path)
      .filter((path) => propertiesByPath[path] === undefined && !propertiesLoadingPaths.has(path));

    if (missingPaths.length === 0) {
      return;
    }

    const loadMissingProperties = async () => {
      await Promise.all(
        missingPaths.map(async (path) => {
          setPropertiesLoadingPaths((previous) => {
            if (previous.has(path)) {
              return previous;
            }

            const next = new Set(previous);
            next.add(path);
            return next;
          });

          try {
            const details = await trpcProxyClient.s3.getProperties.query({ path });

            setPropertiesByPath((previous) => {
              if (previous[path] !== undefined) {
                return previous;
              }

              return {
                ...previous,
                [path]: details,
              };
            });
          } catch {
            setPropertiesByPath((previous) => {
              if (previous[path] !== undefined) {
                return previous;
              }

              return {
                ...previous,
                [path]: null,
              };
            });
          } finally {
            setPropertiesLoadingPaths((previous) => {
              if (!previous.has(path)) {
                return previous;
              }

              const next = new Set(previous);
              next.delete(path);
              return next;
            });
          }
        })
      );
    };

    void loadMissingProperties();
  }, [
    browseItems,
    isAnyPropertyBackedColumnVisible,
    shouldLoadPropertiesForFiltering,
    propertiesByPath,
    propertiesLoadingPaths,
  ]);

  const getPropertiesForItem = (item: BrowseItem): ObjectPropertiesResult | null | undefined => {
    if (item.type !== 'file') {
      return undefined;
    }

    return propertiesByPath[item.path];
  };

  return {
    propertiesByPath,
    setPropertiesByPath,
    propertiesLoadingPaths,
    setPropertiesLoadingPaths,
    getPropertiesForItem,
    parsedFilterClauses,
    hasActiveAdvancedFilter,
  };
};
