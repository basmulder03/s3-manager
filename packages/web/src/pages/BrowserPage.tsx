import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Button, Input } from '@web/components/ui';
import type { BrowseItem } from '@server/services/s3/types';
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
  browserMessage: string;
  contextMenu: { x: number; y: number; item: BrowseItem } | null;
  onBulkDownload: () => Promise<void>;
  onBulkDelete: () => Promise<void>;
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
}

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
  browse,
  selectedItems,
  selectedFiles,
  folderSizesByPath,
  folderSizeLoadingPaths,
  browserMessage,
  contextMenu,
  onBulkDownload,
  onBulkDelete,
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
}: BrowserPageProps) => {
  const [isBreadcrumbEditing, setIsBreadcrumbEditing] = useState(false);
  const [breadcrumbDraft, setBreadcrumbDraft] = useState(selectedPath ? `/${selectedPath}` : '/');
  const breadcrumbInputRef = useRef<HTMLInputElement>(null);

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

  const renderedItems = useMemo(() => {
    const items = browse.data?.items ?? [];
    if (!selectedPath) {
      return items.map((item) => ({ item, isParentNavigation: false }));
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
      ...items.map((item) => ({ item, isParentNavigation: false })),
    ];
  }, [browse.data?.items, parentPath, selectedPath]);

  const selectedRecordsCount = selectedItems.size;

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
              ←
            </Button>
            <Button
              variant="muted"
              className={styles.iconButton}
              onClick={() => setSelectedPath('')}
              aria-label="Go to root"
              title="Go to root"
              disabled={!selectedPath}
            >
              ⌂
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
                    root
                  </button>
                  {breadcrumbSegments.map((segment) => (
                    <span key={segment.path} className={styles.breadcrumbPart}>
                      <span className={styles.breadcrumbDivider}>/</span>
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

            <Button
              variant="muted"
              className={`${styles.iconButton} ${styles.refreshButton}`}
              onClick={browse.refetch}
              aria-label="Refresh current location"
              title="Refresh"
            >
              ↻
            </Button>
          </div>
        </div>
      </div>

      {browse.isLoading ? <p className={styles.state}>Loading objects...</p> : null}
      {browse.isError ? (
        <p className={`${styles.state} ${styles.stateError}`}>Failed to load S3 path data.</p>
      ) : null}
      {browserMessage ? <p className={styles.state}>{browserMessage}</p> : null}

      {browse.data ? (
        <>
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
                    <th>Name</th>
                    <th>Size</th>
                    <th>Modified</th>
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
                            {item.type === 'directory' ? '📁' : '📄'}
                          </span>
                          <strong>{item.name}</strong>
                        </div>
                      </td>
                      <td>
                        {isParentNavigation
                          ? ''
                          : item.type === 'directory'
                            ? folderSizeLoadingPaths.has(item.path)
                              ? 'Calculating...'
                              : typeof folderSizesByPath[item.path] === 'number'
                                ? `${folderSizesByPath[item.path]} bytes`
                                : '-'
                            : item.size === null
                              ? '-'
                              : `${item.size} bytes`}
                      </td>
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
