import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { Button, Input } from '@web/components/ui';
import { Panel } from '@web/components';
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
  newFolderName: string;
  setNewFolderName: (value: string) => void;
  selectedItems: Set<string>;
  selectedFiles: BrowseItem[];
  browserMessage: string;
  contextMenu: { x: number; y: number; item: BrowseItem } | null;
  onCreateFolder: () => Promise<void>;
  onBulkDownload: () => Promise<void>;
  onBulkDelete: () => Promise<void>;
  onClearSelection: () => void;
  onToggleSelection: (path: string, checked: boolean) => void;
  onSetLastSelectedIndex: (index: number) => void;
  onRowClick: (item: BrowseItem, index: number, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenContextMenu: (item: BrowseItem, event: MouseEvent) => void;
  onRename: (path: string, currentName: string) => void;
  onMove: (path: string) => void;
  onDownload: (path: string) => Promise<void>;
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
  newFolderName,
  setNewFolderName,
  selectedItems,
  selectedFiles,
  browserMessage,
  contextMenu,
  onCreateFolder,
  onBulkDownload,
  onBulkDelete,
  onClearSelection,
  onToggleSelection,
  onSetLastSelectedIndex,
  onRowClick,
  onOpenContextMenu,
  onRename,
  onMove,
  onDownload,
  onOpenProperties,
  onDeletePathItems,
}: BrowserPageProps) => {
  const [pathDraft, setPathDraft] = useState(selectedPath);

  useEffect(() => {
    setPathDraft(selectedPath);
  }, [selectedPath]);

  const commitPath = (rawPath: string) => {
    const normalized = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (normalized !== selectedPath) {
      setSelectedPath(normalized);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      commitPath(pathDraft);
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pathDraft, selectedPath]);

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

  return (
    <Panel title="Files" subtitle="Browse and manage items">
      <div className={styles.browserToolbar}>
        <div className={styles.browserControls}>
          <Input
            className={styles.pathInput}
            value={pathDraft}
            onChange={(event) => setPathDraft(event.target.value)}
            onBlur={(event) => commitPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitPath((event.target as HTMLInputElement).value);
              }
            }}
            placeholder="bucket/folder"
          />
          <Button variant="muted" onClick={browse.refetch}>
            Refresh
          </Button>
          <Button variant="muted" onClick={() => setSelectedPath('')}>
            Root
          </Button>
        </div>
        {canWrite ? (
          <div className={styles.browserControls}>
            <Input
              className={styles.folderInput}
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="New folder name"
            />
            <Button onClick={() => void onCreateFolder()}>Create Folder</Button>
          </div>
        ) : null}
      </div>

      <div className={styles.breadcrumbTrail}>
        <button className={styles.breadcrumbLink} onClick={() => setSelectedPath('')}>
          root
        </button>
        {breadcrumbSegments.map((segment) => (
          <span key={segment.path} className={styles.breadcrumbPart}>
            <span className={styles.breadcrumbDivider}>/</span>
            <button className={styles.breadcrumbLink} onClick={() => setSelectedPath(segment.path)}>
              {segment.label}
            </button>
          </span>
        ))}
      </div>

      <p className={styles.hotkeysHint}>
        Shortcuts: Ctrl/Cmd+A select all, Delete remove, Ctrl/Cmd+D download, F2 rename,
        Ctrl/Cmd+Shift+M move.
      </p>

      {selectedItems.size > 0 ? (
        <div className={styles.selectionBar}>
          <span>{selectedItems.size} selected</span>
          <Button
            variant="muted"
            onClick={() => void onBulkDownload()}
            disabled={selectedFiles.length === 0}
            title={
              selectedFiles.length === 0 ? 'Select at least one file' : 'Download selected files'
            }
          >
            Download Selected
          </Button>
          {canDelete ? (
            <Button variant="danger" onClick={() => void onBulkDelete()}>
              Delete Selected
            </Button>
          ) : null}
          <Button variant="muted" onClick={onClearSelection}>
            Clear
          </Button>
        </div>
      ) : null}

      {browse.isLoading ? <p className={styles.state}>Loading objects...</p> : null}
      {browse.isError ? (
        <p className={`${styles.state} ${styles.stateError}`}>Failed to load S3 path data.</p>
      ) : null}
      {browserMessage ? <p className={styles.state}>{browserMessage}</p> : null}

      {browse.data ? (
        <>
          <div className={styles.itemsHead} aria-hidden>
            <span />
            <span>Name</span>
            <span>Path</span>
            <span>Size</span>
            <span>Modified</span>
            <span>Actions</span>
          </div>

          <ul className={styles.items}>
            {browse.data.items.map((item, index) => (
              <li
                key={`${item.type}:${item.path}`}
                className={selectedItems.has(item.path) ? styles.isSelected : ''}
              >
                <div
                  className={styles.itemRow}
                  onContextMenu={(event) => onOpenContextMenu(item, event)}
                >
                  <label className={styles.rowCheckbox}>
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.path)}
                      onChange={(event) => {
                        onToggleSelection(item.path, event.target.checked);
                        onSetLastSelectedIndex(index);
                      }}
                    />
                  </label>

                  <button
                    className={styles.itemMainButton}
                    onClick={(event) => onRowClick(item, index, event)}
                  >
                    <div className={styles.itemMain}>
                      <span className={styles.itemIcon} aria-hidden>
                        {item.type === 'directory' ? '📁' : '📄'}
                      </span>
                      <strong>{item.name}</strong>
                      <span className={styles.itemPath}>{item.path}</span>
                      <span>{item.size === null ? '-' : `${item.size} bytes`}</span>
                      <span>{formatDate(item.lastModified)}</span>
                    </div>
                  </button>

                  <div className={styles.itemActions}>
                    {canWrite ? (
                      <button
                        className={styles.rowAction}
                        onClick={() => onRename(item.path, item.name)}
                      >
                        Rename
                      </button>
                    ) : null}
                    {canWrite ? (
                      <button className={styles.rowAction} onClick={() => onMove(item.path)}>
                        Move
                      </button>
                    ) : null}
                    {item.type === 'file' ? (
                      <button
                        className={styles.rowAction}
                        onClick={() => void onDownload(item.path)}
                      >
                        Download
                      </button>
                    ) : null}
                    {item.type === 'file' ? (
                      <button
                        className={styles.rowAction}
                        onClick={() => void onOpenProperties(item.path)}
                      >
                        Properties
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        className={`${styles.rowAction} ${styles.rowActionDanger}`}
                        onClick={() => onDeletePathItems([item])}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {contextMenu ? (
            <div
              className={styles.contextMenu}
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              <p className={styles.contextGroupTitle}>Quick Actions</p>
              {contextMenu.item.type === 'directory' ? (
                <Button variant="muted" onClick={() => setSelectedPath(contextMenu.item.path)}>
                  Open
                </Button>
              ) : (
                <>
                  <Button variant="muted" onClick={() => void onDownload(contextMenu.item.path)}>
                    Download
                  </Button>
                  <Button
                    variant="muted"
                    onClick={() => void onOpenProperties(contextMenu.item.path)}
                  >
                    Properties
                  </Button>
                </>
              )}

              {canWrite ? <p className={styles.contextGroupTitle}>Edit</p> : null}
              {canWrite ? (
                <Button
                  variant="muted"
                  onClick={() => onRename(contextMenu.item.path, contextMenu.item.name)}
                >
                  Rename
                </Button>
              ) : null}
              {canWrite ? (
                <Button variant="muted" onClick={() => onMove(contextMenu.item.path)}>
                  Move
                </Button>
              ) : null}

              {canDelete ? <p className={styles.contextGroupTitle}>Danger</p> : null}
              {canDelete ? (
                <Button variant="danger" onClick={() => onDeletePathItems([contextMenu.item])}>
                  Delete
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
};
