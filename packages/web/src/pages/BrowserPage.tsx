import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Eraser,
  File,
  Folder,
  House,
  Keyboard,
  PencilLine,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Button, Input } from '@web/components/ui';
import { trpcProxyClient } from '@web/trpc/client';
import type { BrowseItem, ObjectPropertiesResult } from '@server/services/s3/types';
import { resolveFileCapability } from '@web/utils/fileCapabilities';
import { formatBytes } from '@web/utils/formatBytes';
import styles from '@web/App.module.css';

interface BrowseData {
  breadcrumbs: Array<{ name: string; path: string }>;
  items: BrowseItem[];
}

interface BrowserPageProps {
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  canWrite: boolean;
  canDelete: boolean;
  isUploading: boolean;
  browse: {
    data?: BrowseData;
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
  };
  selectedItems: Set<string>;
  selectedFiles: BrowseItem[];
  folderSizesByPath: Record<string, number>;
  folderSizeLoadingPaths: Set<string>;
  contextMenu: { x: number; y: number; item: BrowseItem } | null;
  onBulkDownload: () => Promise<void>;
  onBulkDelete: () => Promise<void>;
  onUploadFiles: (files: FileList | File[]) => Promise<void>;
  onUploadFolder: (files: FileList | File[]) => Promise<void>;
  onClearSelection: () => void;
  onSelectItemOnly: (path: string, index: number) => void;
  onToggleItemSelection: (path: string, index: number) => void;
  onRowClick: (item: BrowseItem, index: number, event: MouseEvent<HTMLElement>) => void;
  onRowDoubleClick: (item: BrowseItem) => void;
  onOpenContextMenu: (item: BrowseItem, event: MouseEvent) => void;
  onOpenItemContextMenu: (item: BrowseItem) => void;
  onCloseContextMenu: () => void;
  onRename: (path: string, currentName: string) => void;
  onMove: (path: string) => void;
  onDownload: (path: string) => Promise<void>;
  onCalculateFolderSize: (path: string) => Promise<void>;
  onOpenProperties: (path: string) => Promise<void>;
  onDeletePathItems: (items: BrowseItem[]) => void;
  onViewFile: (path: string) => Promise<void>;
  onEditFile: (path: string) => Promise<void>;
}

type SortKey = 'name' | 'size' | 'modified' | 'type';
type SortDirection = 'asc' | 'desc';

interface SortRule {
  key: SortKey;
  direction: SortDirection;
}

type OverviewColumnKey =
  | 'showKey'
  | 'showSize'
  | 'showModified'
  | 'showEtag'
  | 'showVersionId'
  | 'showServerSideEncryption'
  | 'showContentType'
  | 'showStorageClass'
  | 'showCacheControl'
  | 'showContentDisposition'
  | 'showContentEncoding'
  | 'showContentLanguage'
  | 'showExpires';

type OverviewColumnVisibility = Record<OverviewColumnKey, boolean> & {
  showName: boolean;
  showMetadata: boolean;
};

interface OverviewColumnDefinition {
  key: OverviewColumnKey;
  label: string;
  requiresProperties: boolean;
}

interface ShortcutDefinition {
  id: string;
  action: string;
  keys: string[];
  Icon: typeof Keyboard;
}

const browserShortcuts: ShortcutDefinition[] = [
  {
    id: 'select-all',
    action: 'Select all visible items',
    keys: ['Ctrl/Cmd', 'A'],
    Icon: CheckSquare,
  },
  {
    id: 'focus-filter',
    action: 'Focus file filter',
    keys: ['/'],
    Icon: Search,
  },
  {
    id: 'shortcuts-modal',
    action: 'Open shortcuts help',
    keys: ['?'],
    Icon: Keyboard,
  },
  {
    id: 'parent',
    action: 'Go to parent folder',
    keys: ['ArrowLeft', 'Backspace', 'Alt+ArrowUp'],
    Icon: Undo2,
  },
  {
    id: 'row-nav',
    action: 'Jump to explorer and move focus',
    keys: ['Arrow keys', 'Home', 'End'],
    Icon: Folder,
  },
  {
    id: 'row-open',
    action: 'Open focused item',
    keys: ['Enter', 'ArrowRight'],
    Icon: File,
  },
  {
    id: 'row-select',
    action: 'Select focused item',
    keys: ['Space'],
    Icon: CheckSquare,
  },
  {
    id: 'row-menu',
    action: 'Open item context menu',
    keys: ['Shift', 'F10'],
    Icon: Keyboard,
  },
  {
    id: 'download',
    action: 'Download selected files',
    keys: ['Ctrl/Cmd', 'D'],
    Icon: ArrowDownToLine,
  },
  {
    id: 'rename',
    action: 'Rename selected item',
    keys: ['F2'],
    Icon: PencilLine,
  },
  {
    id: 'move',
    action: 'Move selected item',
    keys: ['Ctrl/Cmd', 'Shift', 'M'],
    Icon: ArrowRightLeft,
  },
  {
    id: 'delete',
    action: 'Delete selected items',
    keys: ['Delete'],
    Icon: Trash2,
  },
  {
    id: 'escape',
    action: 'Clear selection or close dialogs',
    keys: ['Esc'],
    Icon: Eraser,
  },
];

const nameCollator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});

const OVERVIEW_COLUMNS_STORAGE_KEY = 'browser-overview-columns';

const defaultOverviewColumnVisibility: OverviewColumnVisibility = {
  showName: true,
  showKey: false,
  showSize: true,
  showModified: true,
  showEtag: false,
  showVersionId: false,
  showServerSideEncryption: false,
  showContentType: false,
  showStorageClass: false,
  showCacheControl: false,
  showContentDisposition: false,
  showContentEncoding: false,
  showContentLanguage: false,
  showExpires: false,
  showMetadata: false,
};

const overviewColumnDefinitions: OverviewColumnDefinition[] = [
  { key: 'showKey', label: 'Key', requiresProperties: false },
  { key: 'showSize', label: 'Size', requiresProperties: false },
  { key: 'showModified', label: 'Modified', requiresProperties: false },
  { key: 'showEtag', label: 'ETag', requiresProperties: false },
  { key: 'showVersionId', label: 'Version Id', requiresProperties: true },
  {
    key: 'showServerSideEncryption',
    label: 'Server-side encryption',
    requiresProperties: true,
  },
  { key: 'showContentType', label: 'Content Type', requiresProperties: true },
  { key: 'showStorageClass', label: 'Storage Class', requiresProperties: true },
  { key: 'showCacheControl', label: 'Cache Control', requiresProperties: true },
  { key: 'showContentDisposition', label: 'Content Disposition', requiresProperties: true },
  { key: 'showContentEncoding', label: 'Content Encoding', requiresProperties: true },
  { key: 'showContentLanguage', label: 'Content Language', requiresProperties: true },
  { key: 'showExpires', label: 'Expires', requiresProperties: true },
];

const resolveInitialOverviewColumnVisibility = (): OverviewColumnVisibility => {
  if (typeof window === 'undefined') {
    return defaultOverviewColumnVisibility;
  }

  const stored = window.localStorage.getItem(OVERVIEW_COLUMNS_STORAGE_KEY);
  if (!stored) {
    return defaultOverviewColumnVisibility;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<OverviewColumnVisibility>;
    return overviewColumnDefinitions.reduce<OverviewColumnVisibility>(
      (next, column) => {
        const parsedValue = parsed[column.key];
        next[column.key] =
          typeof parsedValue === 'boolean'
            ? parsedValue
            : defaultOverviewColumnVisibility[column.key];
        return next;
      },
      { ...defaultOverviewColumnVisibility }
    );
  } catch {
    return defaultOverviewColumnVisibility;
  }
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

export const BrowserPage = ({
  selectedPath,
  setSelectedPath,
  canWrite,
  canDelete,
  isUploading,
  browse,
  selectedItems,
  selectedFiles,
  folderSizesByPath,
  folderSizeLoadingPaths,
  contextMenu,
  onBulkDownload,
  onBulkDelete,
  onUploadFiles,
  onUploadFolder,
  onClearSelection,
  onSelectItemOnly,
  onToggleItemSelection,
  onRowClick,
  onRowDoubleClick,
  onOpenContextMenu,
  onOpenItemContextMenu,
  onCloseContextMenu,
  onRename,
  onMove,
  onDownload,
  onCalculateFolderSize,
  onOpenProperties,
  onDeletePathItems,
  onViewFile,
  onEditFile,
}: BrowserPageProps) => {
  const [isBreadcrumbEditing, setIsBreadcrumbEditing] = useState(false);
  const [breadcrumbDraft, setBreadcrumbDraft] = useState(selectedPath ? `/${selectedPath}` : '/');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isOverviewFieldsMenuOpen, setIsOverviewFieldsMenuOpen] = useState(false);
  const [overviewFieldsFilterQuery, setOverviewFieldsFilterQuery] = useState('');
  const [overviewColumnVisibility, setOverviewColumnVisibility] =
    useState<OverviewColumnVisibility>(resolveInitialOverviewColumnVisibility);
  const [propertiesByPath, setPropertiesByPath] = useState<
    Record<string, ObjectPropertiesResult | null>
  >({});
  const [propertiesLoadingPaths, setPropertiesLoadingPaths] = useState<Set<string>>(new Set());
  const [pendingFolderUploadFiles, setPendingFolderUploadFiles] = useState<File[]>([]);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [sortRules, setSortRules] = useState<SortRule[]>([
    { key: 'type', direction: 'asc' },
    { key: 'name', direction: 'asc' },
  ]);
  const breadcrumbInputRef = useRef<HTMLInputElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const overviewFieldsMenuRef = useRef<HTMLDivElement>(null);
  const uploadFilesInputRef = useRef<HTMLInputElement>(null);
  const uploadFolderInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const folderInputAttributes = {
    directory: '',
    webkitdirectory: '',
  } as Record<string, string>;

  const commitBreadcrumbPath = (rawPath: string) => {
    const normalized = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (normalized !== selectedPath) {
      setSelectedPath(normalized);
    }
  };

  useEffect(() => {
    if (isBreadcrumbEditing) {
      return;
    }

    setBreadcrumbDraft(selectedPath ? `/${selectedPath}` : '/');
  }, [isBreadcrumbEditing, selectedPath]);

  useEffect(() => {
    if (!isBreadcrumbEditing) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      commitBreadcrumbPath(breadcrumbDraft);
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [breadcrumbDraft, isBreadcrumbEditing, selectedPath]);

  useEffect(() => {
    if (!isBreadcrumbEditing) {
      return;
    }

    breadcrumbInputRef.current?.focus();
    breadcrumbInputRef.current?.select();
  }, [isBreadcrumbEditing]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      OVERVIEW_COLUMNS_STORAGE_KEY,
      JSON.stringify(overviewColumnVisibility)
    );
  }, [overviewColumnVisibility]);

  useEffect(() => {
    if (!isOverviewFieldsMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (overviewFieldsMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOverviewFieldsMenuOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isOverviewFieldsMenuOpen]);

  useEffect(() => {
    if (!isFilterOpen) {
      return;
    }

    filterInputRef.current?.focus();
  }, [isFilterOpen]);

  const breadcrumbSegments = useMemo(() => {
    const normalized = selectedPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) {
      return [] as Array<{ label: string; path: string }>;
    }

    const segments = normalized.split('/');
    return segments.map((segment, index) => ({
      label: segment,
      path: segments.slice(0, index + 1).join('/'),
    }));
  }, [selectedPath]);

  const isAnyPropertyBackedColumnVisible = useMemo(
    () =>
      overviewColumnDefinitions.some(
        (column) => column.requiresProperties && overviewColumnVisibility[column.key]
      ),
    [overviewColumnVisibility]
  );

  useEffect(() => {
    if (!isAnyPropertyBackedColumnVisible) {
      return;
    }

    const missingPaths = (browse.data?.items ?? [])
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
    browse.data?.items,
    isAnyPropertyBackedColumnVisible,
    propertiesByPath,
    propertiesLoadingPaths,
  ]);

  const parentPath = useMemo(() => {
    const normalized = selectedPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) {
      return '';
    }

    const parts = normalized.split('/');
    return parts.slice(0, -1).join('/');
  }, [selectedPath]);

  const compareItems = useCallback(
    (left: BrowseItem, right: BrowseItem): number => {
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

        if (result !== 0) {
          return rule.direction === 'asc' ? result : -result;
        }
      }

      return nameCollator.compare(left.path, right.path);
    },
    [folderSizesByPath, sortRules]
  );

  const normalizedFilter = filterQuery.trim().toLowerCase();

  const renderedItems = useMemo(() => {
    const items = browse.data?.items ?? [];
    const filteredItems =
      normalizedFilter.length === 0
        ? items
        : items.filter((item) => {
            const haystack = `${item.name} ${item.path} ${item.type}`.toLowerCase();
            return haystack.includes(normalizedFilter);
          });

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
  }, [browse.data?.items, compareItems, normalizedFilter, parentPath, selectedPath]);

  const setSortForColumn = (key: SortKey, additive: boolean) => {
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
  };

  const getSortIndicator = (key: SortKey): ReactNode => {
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
  };

  const getSortLabel = (key: SortKey): string => {
    if (key === 'name') {
      return 'Name';
    }
    if (key === 'size') {
      return 'Size';
    }
    if (key === 'modified') {
      return 'Modified';
    }
    return 'Type';
  };

  const getSortTooltip = (key: SortKey): string => {
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
  };

  const selectedRecordsCount = selectedItems.size;
  const visibleOverviewColumns = overviewColumnDefinitions.filter(
    (column) => overviewColumnVisibility[column.key]
  );
  const visibleOverviewColumnsCount = visibleOverviewColumns.length;
  const allOverviewColumnsSelected =
    visibleOverviewColumnsCount === overviewColumnDefinitions.length;
  const normalizedOverviewFieldsFilterQuery = overviewFieldsFilterQuery.trim().toLowerCase();
  const filteredOverviewColumns = overviewColumnDefinitions.filter((column) =>
    column.label.toLowerCase().includes(normalizedOverviewFieldsFilterQuery)
  );
  const hasBucketContext = selectedPath.trim().replace(/^\/+/, '').length > 0;
  const uploadDisabled = isUploading || !hasBucketContext;
  const selectedBrowseItems = (browse.data?.items ?? []).filter((item) =>
    selectedItems.has(item.path)
  );
  const hasDeletableSelection = selectedBrowseItems.some(
    (item) => !(item.type === 'directory' && !item.path.includes('/'))
  );
  const formatItemSize = (item: BrowseItem): string => {
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
  };

  const getObjectKeyFromPath = (path: string): string => {
    const parts = path.split('/');
    return parts.slice(1).join('/') || path;
  };

  const getPropertiesForItem = (item: BrowseItem): ObjectPropertiesResult | null | undefined => {
    if (item.type !== 'file') {
      return undefined;
    }

    return propertiesByPath[item.path];
  };

  const resolveOverviewFieldValue = (
    item: BrowseItem,
    columnKey: OverviewColumnKey,
    isParentNavigation: boolean
  ): string => {
    if (isParentNavigation) {
      return '';
    }

    if (columnKey === 'showSize') {
      return formatItemSize(item);
    }

    if (columnKey === 'showModified') {
      return formatDate(item.lastModified);
    }

    if (item.type !== 'file') {
      return '-';
    }

    const details = getPropertiesForItem(item);
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
  };

  const isSortableColumn = (columnKey: OverviewColumnKey): boolean => {
    return columnKey === 'showSize' || columnKey === 'showModified';
  };

  const resolveSortKey = (columnKey: OverviewColumnKey): SortKey => {
    if (columnKey === 'showSize') {
      return 'size';
    }
    return 'modified';
  };

  const contextItemCapability = useMemo(() => {
    if (!contextMenu || contextMenu.item.type !== 'file') {
      return null;
    }

    return resolveFileCapability(contextMenu.item.path);
  }, [contextMenu]);

  const canDeleteContextItem =
    canDelete && !(contextMenu?.item.type === 'directory' && !contextMenu.item.path.includes('/'));

  const openFilter = () => {
    if (isFilterOpen) {
      filterInputRef.current?.focus();
      return;
    }

    setIsFilterOpen(true);
  };

  const closeFilter = () => {
    setFilterQuery('');
    setIsFilterOpen(false);
  };

  const focusRowAtIndex = useCallback(
    (index: number) => {
      if (renderedItems.length === 0) {
        return;
      }

      const nextIndex = Math.max(0, Math.min(index, renderedItems.length - 1));
      setFocusedRowIndex(nextIndex);
      rowRefs.current[nextIndex]?.focus();
    },
    [renderedItems.length]
  );

  const defaultRowIndex = useMemo(() => {
    if (renderedItems.length === 0) {
      return -1;
    }
    if (renderedItems[0]?.isParentNavigation && renderedItems.length > 1) {
      return 1;
    }
    return 0;
  }, [renderedItems]);

  useEffect(() => {
    if (renderedItems.length === 0 || defaultRowIndex < 0) {
      setFocusedRowIndex(null);
      return;
    }

    if (
      isShortcutsModalOpen ||
      pendingFolderUploadFiles.length > 0 ||
      isBreadcrumbEditing ||
      isFilterOpen
    ) {
      return;
    }

    const activeElement = document.activeElement;
    const isTypingInInput =
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement ||
      Boolean((activeElement as HTMLElement | null)?.isContentEditable);

    if (isTypingInInput) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      focusRowAtIndex(defaultRowIndex);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    defaultRowIndex,
    focusRowAtIndex,
    isBreadcrumbEditing,
    isFilterOpen,
    isShortcutsModalOpen,
    pendingFolderUploadFiles.length,
    selectedPath,
    renderedItems,
  ]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target;
      const isTypingInInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean((target as HTMLElement | null)?.isContentEditable);

      if (isShortcutsModalOpen && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsShortcutsModalOpen(false);
        return;
      }

      if (isTypingInInput) {
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        openFilter();
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        setIsShortcutsModalOpen(true);
        return;
      }

      if (event.key === 'Backspace' && selectedPath) {
        event.preventDefault();
        setSelectedPath(parentPath);
        return;
      }

      if (event.altKey && event.key === 'ArrowUp' && selectedPath) {
        event.preventDefault();
        setSelectedPath(parentPath);
        return;
      }

      if (event.key === 'ArrowLeft' && selectedPath) {
        event.preventDefault();
        setSelectedPath(parentPath);
        return;
      }

      const isExplorerNavigationKey =
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowLeft' ||
        event.key === 'Home' ||
        event.key === 'End';

      if (!isExplorerNavigationKey || renderedItems.length === 0) {
        return;
      }

      const activeElement = document.activeElement;
      const focusedRow =
        activeElement instanceof HTMLTableRowElement && rowRefs.current.includes(activeElement)
          ? activeElement
          : null;

      if (focusedRow) {
        return;
      }

      event.preventDefault();
      if (event.key === 'End') {
        focusRowAtIndex(renderedItems.length - 1);
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        focusRowAtIndex(defaultRowIndex > 0 ? defaultRowIndex : renderedItems.length - 1);
        return;
      }

      focusRowAtIndex(defaultRowIndex >= 0 ? defaultRowIndex : 0);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [
    defaultRowIndex,
    focusRowAtIndex,
    isShortcutsModalOpen,
    openFilter,
    parentPath,
    renderedItems.length,
    selectedPath,
    setSelectedPath,
  ]);

  const handleRowKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    item: BrowseItem,
    renderedIndex: number,
    isParentNavigation: boolean
  ) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRowAtIndex(renderedIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRowAtIndex(renderedIndex - 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusRowAtIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusRowAtIndex(renderedItems.length - 1);
      return;
    }

    if ((event.key === 'ArrowLeft' || event.key === 'Backspace') && selectedPath) {
      event.preventDefault();
      setSelectedPath(parentPath);
      return;
    }

    if (event.key === 'Enter' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (isParentNavigation) {
        setSelectedPath(parentPath);
        return;
      }

      if (item.type === 'file') {
        void onViewFile(item.path);
        return;
      }

      onRowDoubleClick(item);
      return;
    }

    if (event.key === ' ' || event.key === 'Spacebar') {
      if (isParentNavigation) {
        return;
      }

      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        onToggleItemSelection(item.path, renderedIndex);
      } else {
        onSelectItemOnly(item.path, renderedIndex);
      }
      return;
    }

    if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
      if (isParentNavigation) {
        return;
      }

      event.preventDefault();
      onOpenItemContextMenu(item);
    }
  };

  return (
    <>
      <div className={styles.browserToolbar}>
        <div className={styles.explorerChrome}>
          <div className={styles.browserControls}>
            <Button
              variant="muted"
              className={styles.iconButton}
              onClick={() => setSelectedPath(parentPath)}
              aria-label="Go back"
              title="Back"
              disabled={!selectedPath}
            >
              <Undo2 size={16} aria-hidden />
            </Button>
            <Button
              variant="muted"
              className={styles.iconButton}
              onClick={() => setSelectedPath('')}
              aria-label="Go to root"
              title="Go to root"
              disabled={!selectedPath}
            >
              <House size={16} aria-hidden />
            </Button>

            <div
              className={styles.breadcrumbTrail}
              data-testid="breadcrumb-trail"
              onDoubleClick={() => setIsBreadcrumbEditing(true)}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setIsBreadcrumbEditing(true);
                }
              }}
            >
              {isBreadcrumbEditing ? (
                <Input
                  ref={breadcrumbInputRef}
                  className={styles.breadcrumbInput}
                  value={breadcrumbDraft}
                  onChange={(event) => setBreadcrumbDraft(event.target.value)}
                  onBlur={(event) => {
                    commitBreadcrumbPath(event.target.value);
                    setIsBreadcrumbEditing(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitBreadcrumbPath((event.target as HTMLInputElement).value);
                      setIsBreadcrumbEditing(false);
                      return;
                    }

                    if (event.key === 'Escape') {
                      setBreadcrumbDraft(selectedPath ? `/${selectedPath}` : '/');
                      setIsBreadcrumbEditing(false);
                    }
                  }}
                  aria-label="Breadcrumb path"
                  placeholder="/bucket/folder"
                />
              ) : (
                <>
                  <button className={styles.breadcrumbLink} onClick={() => setSelectedPath('')}>
                    /
                  </button>
                  {breadcrumbSegments.map((segment, index) => (
                    <span key={segment.path} className={styles.breadcrumbPart}>
                      {index > 0 ? <span className={styles.breadcrumbDivider}>/</span> : null}
                      <button
                        className={styles.breadcrumbLink}
                        onClick={() => setSelectedPath(segment.path)}
                      >
                        {segment.label}
                      </button>
                    </span>
                  ))}
                </>
              )}
            </div>

            <div className={styles.browserFilterRow}>
              <Button
                variant="muted"
                className={`${styles.iconButton} ${isFilterOpen ? styles.filterToggleConnected : ''}`}
                onClick={openFilter}
                aria-label="Open filter"
                title="Open filter"
              >
                <Search size={16} aria-hidden />
              </Button>
              {isFilterOpen ? (
                <div className={styles.tableFilterWrap}>
                  <Input
                    ref={filterInputRef}
                    className={styles.tableFilterInput}
                    value={filterQuery}
                    onChange={(event) => setFilterQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        closeFilter();
                      }
                    }}
                    placeholder="Filter files and folders"
                    aria-label="Filter files and folders"
                  />
                  <button
                    className={styles.tableFilterClose}
                    type="button"
                    aria-label="Close filter"
                    onClick={closeFilter}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>

            <div className={styles.overviewFieldsWrap} ref={overviewFieldsMenuRef}>
              <Button
                variant="muted"
                className={styles.iconButton}
                onClick={() => setIsOverviewFieldsMenuOpen((previous) => !previous)}
                aria-label="Customize visible fields"
                title="Customize visible fields"
                aria-expanded={isOverviewFieldsMenuOpen}
              >
                <SlidersHorizontal size={16} aria-hidden />
              </Button>
              {isOverviewFieldsMenuOpen ? (
                <div
                  className={styles.overviewFieldsMenu}
                  role="menu"
                  aria-label="Visible fields menu"
                >
                  <div className={styles.overviewFieldsHeader}>
                    <p className={styles.overviewFieldsTitle}>Visible fields</p>
                    <Input
                      className={styles.overviewFieldsSearchInput}
                      value={overviewFieldsFilterQuery}
                      onChange={(event) => setOverviewFieldsFilterQuery(event.target.value)}
                      placeholder="Search fields"
                      aria-label="Search visible fields"
                    />
                    <div className={styles.overviewFieldsActions}>
                      <Button
                        variant="muted"
                        className={styles.overviewFieldsActionButton}
                        onClick={() => {
                          setOverviewColumnVisibility((previous) => {
                            const next = { ...previous };
                            for (const column of overviewColumnDefinitions) {
                              next[column.key] = !allOverviewColumnsSelected;
                            }
                            return next;
                          });
                        }}
                      >
                        {allOverviewColumnsSelected ? 'Toggle all off' : 'Toggle all on'}
                      </Button>
                    </div>
                  </div>
                  <div className={styles.overviewFieldsList}>
                    {filteredOverviewColumns.length === 0 ? (
                      <p className={styles.overviewFieldsEmptyState}>
                        No fields match this search.
                      </p>
                    ) : null}
                    {filteredOverviewColumns.map((column) => (
                      <label key={column.key} className={styles.overviewFieldsOption}>
                        <input
                          className={styles.overviewFieldsCheckbox}
                          type="checkbox"
                          checked={overviewColumnVisibility[column.key]}
                          onChange={(event) =>
                            setOverviewColumnVisibility((previous) => ({
                              ...previous,
                              [column.key]: event.target.checked,
                            }))
                          }
                        />
                        <span>{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {selectedRecordsCount > 0 ? (
              <>
                <span className={styles.selectionCount}>{selectedRecordsCount} selected</span>
                <Button
                  variant="muted"
                  onClick={() => void onBulkDownload()}
                  disabled={selectedFiles.length === 0}
                  title={
                    selectedFiles.length === 0
                      ? 'Select at least one file'
                      : 'Download selected files'
                  }
                >
                  Download
                </Button>
                {canDelete ? (
                  <Button
                    variant="danger"
                    onClick={() => void onBulkDelete()}
                    disabled={!hasDeletableSelection}
                    title={
                      !hasDeletableSelection
                        ? 'Bucket deletion is not supported'
                        : 'Delete selected items'
                    }
                  >
                    Delete
                  </Button>
                ) : null}
                <Button variant="muted" onClick={onClearSelection}>
                  Clear
                </Button>
              </>
            ) : null}

            {canWrite ? (
              <>
                <Button
                  variant="muted"
                  disabled={uploadDisabled}
                  onClick={() => uploadFilesInputRef.current?.click()}
                  title={
                    !hasBucketContext ? 'Navigate to a bucket before uploading' : 'Upload files'
                  }
                >
                  Upload Files
                </Button>
                <Button
                  variant="muted"
                  disabled={uploadDisabled}
                  onClick={() => uploadFolderInputRef.current?.click()}
                  title={
                    !hasBucketContext ? 'Navigate to a bucket before uploading' : 'Upload folder'
                  }
                >
                  Upload Folder
                </Button>
              </>
            ) : null}

            <Button
              variant="muted"
              className={styles.iconButton}
              onClick={() => setIsShortcutsModalOpen(true)}
              aria-label="Open keyboard shortcuts"
              title="Keyboard shortcuts"
            >
              <Keyboard size={16} aria-hidden />
            </Button>

            <Button
              variant="muted"
              className={`${styles.iconButton} ${styles.refreshButton}`}
              onClick={browse.refetch}
              aria-label="Refresh current location"
              title="Refresh"
            >
              <RefreshCw size={16} aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {browse.isLoading ? <p className={styles.state}>Loading objects...</p> : null}
      {browse.isError ? (
        <p className={`${styles.state} ${styles.stateError}`}>Failed to load S3 path data.</p>
      ) : null}

      {browse.data ? (
        <>
          {isShortcutsModalOpen ? (
            <div
              className={styles.modalOverlay}
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcuts-modal-title"
              aria-describedby="shortcuts-modal-description"
              aria-label="Keyboard shortcuts"
            >
              <div className={`${styles.modalCard} ${styles.shortcutsModalCard}`}>
                <div className={styles.shortcutsModalHeader}>
                  <Keyboard size={16} aria-hidden />
                  <h3 id="shortcuts-modal-title">Keyboard shortcuts</h3>
                </div>
                <p id="shortcuts-modal-description" className={styles.shortcutsModalDescription}>
                  Quick commands available in the browser view.
                </p>
                <div className={styles.shortcutsGrid}>
                  <div className={styles.shortcutsTableHeader}>
                    <span className={styles.shortcutsTableHeaderAction}>Action</span>
                    <span className={styles.shortcutsTableHeaderKeys}>Shortcut</span>
                  </div>
                  {browserShortcuts.map(({ id, action, keys, Icon }) => (
                    <div key={id} className={styles.shortcutItem}>
                      <span className={styles.shortcutIcon} aria-hidden>
                        <Icon size={14} />
                      </span>
                      <span className={styles.shortcutAction}>{action}</span>
                      <span className={styles.shortcutKeys}>
                        {keys.map((key) => (
                          <kbd key={`${id}-${key}`} className={styles.shortcutKeycap}>
                            {key}
                          </kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                <div className={styles.modalActions}>
                  <Button variant="muted" onClick={() => setIsShortcutsModalOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <input
            ref={uploadFilesInputRef}
            className={styles.hiddenInput}
            type="file"
            multiple
            data-testid="upload-files-input"
            onChange={(event) => {
              const files = event.target.files;
              if (!files || files.length === 0) {
                return;
              }

              void onUploadFiles(files);
              event.target.value = '';
            }}
          />
          <input
            ref={uploadFolderInputRef}
            className={styles.hiddenInput}
            type="file"
            multiple
            data-testid="upload-folder-input"
            {...folderInputAttributes}
            onChange={(event) => {
              const files = event.target.files;
              if (!files || files.length === 0) {
                return;
              }

              setPendingFolderUploadFiles(Array.from(files));
              event.target.value = '';
            }}
          />
          {pendingFolderUploadFiles.length > 0 ? (
            <div
              className={styles.modalOverlay}
              role="dialog"
              aria-modal="true"
              aria-labelledby="folder-upload-modal-title"
              aria-describedby="folder-upload-modal-description"
              aria-label="Confirm folder upload"
            >
              <div className={styles.modalCard}>
                <h3 id="folder-upload-modal-title">Upload selected folder?</h3>
                <p id="folder-upload-modal-description">
                  Upload {pendingFolderUploadFiles.length} file(s) from the selected folder.
                </p>
                <div className={styles.modalActions}>
                  <Button
                    variant="muted"
                    onClick={() => {
                      setPendingFolderUploadFiles([]);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      void onUploadFolder(pendingFolderUploadFiles);
                      setPendingFolderUploadFiles([]);
                    }}
                  >
                    Upload Folder
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {renderedItems.length === 0 ? (
            <div className={styles.emptyItemsState}>
              <p>No items in this location.</p>
              <span>Upload files to this path or navigate to another folder.</span>
            </div>
          ) : (
            <div className={styles.itemsTableWrap}>
              <table className={styles.itemsTable}>
                <thead>
                  <tr>
                    <th className={styles.nameColumn}>
                      <button
                        className={styles.sortHeaderButton}
                        type="button"
                        onClick={(event) => setSortForColumn('name', event.shiftKey)}
                        title={getSortTooltip('name')}
                      >
                        <span>Name</span>
                        <span className={styles.sortIndicator} aria-hidden>
                          {getSortIndicator('name')}
                        </span>
                      </button>
                    </th>
                    {visibleOverviewColumns.map((column) => {
                      const columnClassName =
                        column.key === 'showSize'
                          ? styles.sizeColumn
                          : column.key === 'showModified'
                            ? styles.modifiedColumn
                            : styles.propertyColumn;

                      if (!isSortableColumn(column.key)) {
                        return (
                          <th key={column.key} className={columnClassName}>
                            {column.label}
                          </th>
                        );
                      }

                      const sortKey = resolveSortKey(column.key);
                      return (
                        <th key={column.key} className={columnClassName}>
                          <button
                            className={styles.sortHeaderButton}
                            type="button"
                            onClick={(event) => setSortForColumn(sortKey, event.shiftKey)}
                            title={getSortTooltip(sortKey)}
                          >
                            <span>{column.label}</span>
                            <span className={styles.sortIndicator} aria-hidden>
                              {getSortIndicator(sortKey)}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {renderedItems.map(({ item, isParentNavigation }, index) => (
                    <tr
                      key={`${item.type}:${isParentNavigation ? '__parent__' : item.path}`}
                      ref={(element) => {
                        rowRefs.current[index] = element;
                      }}
                      tabIndex={focusedRowIndex === index ? 0 : -1}
                      data-focused={focusedRowIndex === index ? 'true' : 'false'}
                      onFocus={() => setFocusedRowIndex(index)}
                      className={
                        !isParentNavigation && selectedItems.has(item.path) ? styles.isSelected : ''
                      }
                      onClick={(event) => {
                        if (isParentNavigation) {
                          return;
                        }

                        onRowClick(item, index, event);
                      }}
                      onDoubleClick={() => {
                        if (isParentNavigation) {
                          setSelectedPath(parentPath);
                          return;
                        }

                        if (item.type === 'file') {
                          void onViewFile(item.path);
                          return;
                        }

                        onRowDoubleClick(item);
                      }}
                      onContextMenu={(event) => {
                        if (isParentNavigation) {
                          event.preventDefault();
                          return;
                        }

                        onOpenContextMenu(item, event);
                      }}
                      onKeyDown={(event) =>
                        handleRowKeyDown(event, item, index, isParentNavigation)
                      }
                    >
                      <td className={`${styles.nameCell} ${styles.nameColumn}`}>
                        <div className={styles.itemMainButton}>
                          <span className={styles.itemIcon} aria-hidden>
                            {item.type === 'directory' ? <Folder size={16} /> : <File size={16} />}
                          </span>
                          <strong>{item.name}</strong>
                        </div>
                      </td>
                      {visibleOverviewColumns.map((column) => {
                        const columnClassName =
                          column.key === 'showSize'
                            ? styles.sizeColumn
                            : column.key === 'showModified'
                              ? styles.modifiedColumn
                              : styles.propertyColumn;

                        return (
                          <td key={column.key} className={columnClassName}>
                            {resolveOverviewFieldValue(item, column.key, isParentNavigation)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {contextMenu ? (
            <div
              className={styles.contextMenu}
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              {contextMenu.item.type === 'directory' ? (
                <>
                  <button
                    className={styles.contextMenuItem}
                    onClick={() => {
                      onCloseContextMenu();
                      setSelectedPath(contextMenu.item.path);
                    }}
                  >
                    <span>Open</span>
                    <span className={styles.contextMenuHint}>Enter</span>
                  </button>
                  <button
                    className={styles.contextMenuItem}
                    onClick={() => {
                      void onCalculateFolderSize(contextMenu.item.path);
                    }}
                  >
                    <span>Calculate Size</span>
                  </button>
                </>
              ) : (
                <>
                  {contextItemCapability?.canView ? (
                    <button
                      className={styles.contextMenuItem}
                      onClick={() => {
                        onCloseContextMenu();
                        void onViewFile(contextMenu.item.path);
                      }}
                    >
                      <span>View</span>
                    </button>
                  ) : null}
                  {canWrite && contextItemCapability?.canEditText ? (
                    <button
                      className={styles.contextMenuItem}
                      onClick={() => {
                        onCloseContextMenu();
                        void onEditFile(contextMenu.item.path);
                      }}
                    >
                      <span>Edit</span>
                    </button>
                  ) : null}
                  <button
                    className={styles.contextMenuItem}
                    onClick={() => {
                      onCloseContextMenu();
                      void onDownload(contextMenu.item.path);
                    }}
                  >
                    <span>Download</span>
                    <span className={styles.contextMenuHint}>Ctrl/Cmd+D</span>
                  </button>
                  <button
                    className={styles.contextMenuItem}
                    onClick={() => {
                      void onOpenProperties(contextMenu.item.path);
                    }}
                  >
                    <span>Properties</span>
                  </button>
                </>
              )}

              {canWrite || canDeleteContextItem ? (
                <div className={styles.contextMenuSeparator} />
              ) : null}

              {canWrite ? (
                <button
                  className={styles.contextMenuItem}
                  onClick={() => {
                    onCloseContextMenu();
                    onRename(contextMenu.item.path, contextMenu.item.name);
                  }}
                >
                  <span>Rename</span>
                  <span className={styles.contextMenuHint}>F2</span>
                </button>
              ) : null}
              {canWrite ? (
                <button
                  className={styles.contextMenuItem}
                  onClick={() => {
                    onCloseContextMenu();
                    onMove(contextMenu.item.path);
                  }}
                >
                  <span>Move</span>
                  <span className={styles.contextMenuHint}>Ctrl/Cmd+Shift+M</span>
                </button>
              ) : null}

              {canDeleteContextItem ? (
                <button
                  className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
                  onClick={() => {
                    onCloseContextMenu();
                    onDeletePathItems([contextMenu.item]);
                  }}
                >
                  <span>Delete</span>
                  <span className={styles.contextMenuHint}>Delete</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
};
