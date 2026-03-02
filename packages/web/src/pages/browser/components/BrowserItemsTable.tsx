import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react';
import type { BrowseItem } from '@server/services/s3/types';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatBytes } from '@web/utils/formatBytes';
import { renderBrowseItemIcon } from '@web/pages/browser/fileIcons';
import { formatDate } from '@web/pages/browser/utils';
import { INTERNAL_MOVE_DRAG_TYPE } from '@web/pages/browser/dragDrop';
import type { OverviewColumnKey, SortKey } from '@web/pages/browser/types';
import styles from '@web/App.module.css';

interface BrowserItemsTableProps {
  renderedItems: Array<{ item: BrowseItem; isParentNavigation: boolean }>;
  visibleOverviewColumns: Array<{ key: OverviewColumnKey; label: string }>;
  rowRefs: React.MutableRefObject<Array<HTMLTableRowElement | null>>;
  focusedRowIndex: number | null;
  setFocusedRowIndex: (index: number | null) => void;
  selectedItems: Set<string>;
  clipboardPaths: Set<string>;
  clipboardMode: 'copy' | 'cut' | null;
  moveDropTargetPath: string | null;
  canWrite: boolean;
  draggedMovePath: string | null;
  setDraggedMovePath: (path: string | null) => void;
  setMoveDropTargetPath: (path: string | null) => void;
  isInternalMoveDrag: (dataTransfer: DataTransfer) => boolean;
  getDraggedMovePath: (dataTransfer: DataTransfer) => string;
  canMoveToDestination: (sourcePath: string, destinationPath: string) => boolean;
  onRowClick: (item: BrowseItem, index: number, event: MouseEvent<HTMLElement>) => void;
  onRowDoubleClick: (item: BrowseItem) => void;
  onOpenContextMenu: (item: BrowseItem, event: MouseEvent) => void;
  handleRowKeyDown: (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    item: BrowseItem,
    index: number,
    isParentNavigation: boolean
  ) => void;
  onMove: (path: string, destinationPath?: string) => void;
  onViewFile: (path: string) => Promise<void>;
  setSelectedPath: (path: string) => void;
  parentPath: string;
  folderSizesByPath: Record<string, number>;
  folderSizeLoadingPaths: Set<string>;
  resolveOverviewFieldValue: (
    item: BrowseItem,
    columnKey: OverviewColumnKey,
    isParentNavigation: boolean
  ) => string;
  sortRules: Array<{ key: SortKey; direction: 'asc' | 'desc' }>;
  setSortForColumn: (key: SortKey, additive: boolean) => void;
  getSortIndicator: (key: SortKey) => React.ReactNode;
  getSortTooltip: (key: SortKey) => string;
  isSortableColumn: (columnKey: OverviewColumnKey) => boolean;
  resolveSortKey: (columnKey: OverviewColumnKey) => SortKey;
  isExplorerGridView: boolean;
  explorerZoomStyle: CSSProperties;
}

export const BrowserItemsTable = ({
  renderedItems,
  visibleOverviewColumns,
  rowRefs,
  focusedRowIndex,
  setFocusedRowIndex,
  selectedItems,
  clipboardPaths,
  clipboardMode,
  moveDropTargetPath,
  canWrite,
  setDraggedMovePath,
  setMoveDropTargetPath,
  isInternalMoveDrag,
  getDraggedMovePath,
  canMoveToDestination,
  onRowClick,
  onRowDoubleClick,
  onOpenContextMenu,
  handleRowKeyDown,
  onMove,
  onViewFile,
  setSelectedPath,
  parentPath,
  folderSizesByPath,
  folderSizeLoadingPaths,
  resolveOverviewFieldValue,
  setSortForColumn,
  getSortIndicator,
  getSortTooltip,
  isSortableColumn,
  resolveSortKey,
  isExplorerGridView,
  explorerZoomStyle,
}: BrowserItemsTableProps) => {
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

  if (renderedItems.length === 0) {
    return (
      <div className={styles.emptyItemsState}>
        <p>No items in this location.</p>
        <span>Upload files to this path or navigate to another folder.</span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.itemsTableWrap} ${
        isExplorerGridView ? styles.itemsTableWrapGrid : ''
      }`.trim()}
      data-view-mode={isExplorerGridView ? 'grid' : 'row'}
      data-testid="items-view-container"
    >
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
              draggable={canWrite && !isParentNavigation}
              tabIndex={focusedRowIndex === index ? 0 : -1}
              data-focused={focusedRowIndex === index ? 'true' : 'false'}
              onFocus={() => setFocusedRowIndex(index)}
              className={(() => {
                if (isParentNavigation) {
                  return '';
                }

                const classNames: string[] = [];
                if (selectedItems.has(item.path)) {
                  if (styles.isSelected) {
                    classNames.push(styles.isSelected);
                  }
                }

                if (clipboardPaths.has(item.path)) {
                  const clipboardClass =
                    clipboardMode === 'cut' ? styles.isClipboardCut : styles.isClipboardCopy;
                  if (clipboardClass) {
                    classNames.push(clipboardClass);
                  }
                }

                if (moveDropTargetPath === item.path) {
                  if (styles.isDragMoveTarget) {
                    classNames.push(styles.isDragMoveTarget);
                  }
                }

                return classNames.join(' ');
              })()}
              onDragStart={(event) => {
                if (isParentNavigation || !canWrite) {
                  event.preventDefault();
                  return;
                }

                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData(INTERNAL_MOVE_DRAG_TYPE, item.path);
                setDraggedMovePath(item.path);
                setMoveDropTargetPath(null);
              }}
              onDragOver={(event) => {
                if (
                  isParentNavigation ||
                  item.type !== 'directory' ||
                  !canWrite ||
                  !isInternalMoveDrag(event.dataTransfer)
                ) {
                  return;
                }

                const sourcePath = getDraggedMovePath(event.dataTransfer);
                if (!canMoveToDestination(sourcePath, item.path)) {
                  if (moveDropTargetPath === item.path) {
                    setMoveDropTargetPath(null);
                  }
                  return;
                }

                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (moveDropTargetPath !== item.path) {
                  setMoveDropTargetPath(item.path);
                }
              }}
              onDragLeave={(event) => {
                if (moveDropTargetPath !== item.path) {
                  return;
                }

                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
                  return;
                }

                setMoveDropTargetPath(null);
              }}
              onDrop={(event) => {
                if (
                  isParentNavigation ||
                  item.type !== 'directory' ||
                  !canWrite ||
                  !isInternalMoveDrag(event.dataTransfer)
                ) {
                  return;
                }

                event.preventDefault();
                const sourcePath = getDraggedMovePath(event.dataTransfer);
                setMoveDropTargetPath(null);
                if (!canMoveToDestination(sourcePath, item.path)) {
                  return;
                }

                onMove(sourcePath, item.path);
                setDraggedMovePath(null);
              }}
              onDragEnd={() => {
                setDraggedMovePath(null);
                setMoveDropTargetPath(null);
              }}
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
              onKeyDown={(event) => handleRowKeyDown(event, item, index, isParentNavigation)}
            >
              <td className={`${styles.nameCell} ${styles.nameColumn}`}>
                <div className={styles.itemMainButton}>
                  <span className={styles.itemIcon} aria-hidden>
                    {renderBrowseItemIcon(item)}
                  </span>
                  <strong>{item.name}</strong>
                  <span className={styles.itemGridMeta}>
                    {isParentNavigation
                      ? 'Open parent folder'
                      : item.type === 'directory'
                        ? 'Folder'
                        : `${item.size === null ? '-' : formatBytes(item.size)}${
                            item.lastModified ? ` • ${formatDate(item.lastModified)}` : ''
                          }`}
                  </span>
                  {!isParentNavigation && clipboardPaths.has(item.path) ? (
                    <span className={styles.clipboardTag}>
                      {clipboardMode === 'cut' ? 'Cut' : 'Copy'}
                    </span>
                  ) : null}
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
  );
};
