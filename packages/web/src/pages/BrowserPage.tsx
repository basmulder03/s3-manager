import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import {
  ChevronDown,
  ChevronUp,
  File,
  Folder,
  House,
  RefreshCw,
  Search,
  Undo2,
  X,
} from 'lucide-react';
import { Button, Input } from '@web/components/ui';
import type { BrowseItem } from '@server/services/s3/types';
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
  onRowClick: (item: BrowseItem, index: number, event: MouseEvent<HTMLElement>) => void;
  onRowDoubleClick: (item: BrowseItem) => void;
  onOpenContextMenu: (item: BrowseItem, event: MouseEvent) => void;
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

const nameCollator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});

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
  onRowClick,
  onRowDoubleClick,
  onOpenContextMenu,
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
  const [pendingFolderUploadFiles, setPendingFolderUploadFiles] = useState<File[]>([]);
  const [sortRules, setSortRules] = useState<SortRule[]>([
    { key: 'type', direction: 'asc' },
    { key: 'name', direction: 'asc' },
  ]);
  const breadcrumbInputRef = useRef<HTMLInputElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const uploadFilesInputRef = useRef<HTMLInputElement>(null);
  const uploadFolderInputRef = useRef<HTMLInputElement>(null);
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
  const hasBucketContext = selectedPath.trim().replace(/^\/+/, '').length > 0;
  const uploadDisabled = isUploading || !hasBucketContext;
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

  const contextItemCapability = useMemo(() => {
    if (!contextMenu || contextMenu.item.type !== 'file') {
      return null;
    }

    return resolveFileCapability(contextMenu.item.path);
  }, [contextMenu]);

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
                  <Button variant="danger" onClick={() => void onBulkDelete()}>
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
                    <th>
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
                    <th>
                      <button
                        className={styles.sortHeaderButton}
                        type="button"
                        onClick={(event) => setSortForColumn('size', event.shiftKey)}
                        title={getSortTooltip('size')}
                      >
                        <span>Size</span>
                        <span className={styles.sortIndicator} aria-hidden>
                          {getSortIndicator('size')}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        className={styles.sortHeaderButton}
                        type="button"
                        onClick={(event) => setSortForColumn('modified', event.shiftKey)}
                        title={getSortTooltip('modified')}
                      >
                        <span>Modified</span>
                        <span className={styles.sortIndicator} aria-hidden>
                          {getSortIndicator('modified')}
                        </span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {renderedItems.map(({ item, isParentNavigation }, index) => (
                    <tr
                      key={`${item.type}:${isParentNavigation ? '__parent__' : item.path}`}
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
                    >
                      <td className={styles.nameCell}>
                        <div className={styles.itemMainButton}>
                          <span className={styles.itemIcon} aria-hidden>
                            {item.type === 'directory' ? <Folder size={16} /> : <File size={16} />}
                          </span>
                          <strong>{item.name}</strong>
                        </div>
                      </td>
                      <td>{isParentNavigation ? '' : formatItemSize(item)}</td>
                      <td>{isParentNavigation ? '' : formatDate(item.lastModified)}</td>
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

              {canWrite || canDelete ? <div className={styles.contextMenuSeparator} /> : null}

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

              {canDelete ? (
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
