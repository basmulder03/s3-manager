import type { CSSProperties } from 'react';
import { House, MoreVertical, RefreshCw, Search, SlidersHorizontal, Undo2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Button, Input } from '@web/components/ui';
import type { OverviewColumnKey, OverviewColumnVisibility } from '@web/pages/browser/types';
import { overviewColumnDefinitions } from '@web/pages/browser/constants';
import styles from '@web/App.module.css';

interface BrowserToolbarProps {
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  parentPath: string;
  breadcrumbSegments: Array<{ label: string; path: string }>;
  breadcrumbValidationMessage?: string;
  isBrowseRefreshing: boolean;
  isBreadcrumbEditing: boolean;
  setIsBreadcrumbEditing: (editing: boolean) => void;
  breadcrumbDraft: string;
  setBreadcrumbDraft: (draft: string) => void;
  breadcrumbInputRef: React.RefObject<HTMLInputElement>;
  breadcrumbHintOptions: string[];
  activeBreadcrumbHintIndex: number;
  setActiveBreadcrumbHintIndex: (index: number) => void;
  isBreadcrumbPathCommitAllowed: (path: string) => boolean;
  commitBreadcrumbPath: (path: string) => void;
  isFilterOpen: boolean;
  setIsFilterOpen: (open: boolean) => void;
  filterInputRef: React.RefObject<HTMLInputElement>;
  filterDraftQuery: string;
  setFilterDraftQuery: (query: string) => void;
  closeFilter: () => void;
  openFilter: () => void;
  isOverviewFieldsMenuOpen: boolean;
  setIsOverviewFieldsMenuOpen: (open: boolean) => void;
  overviewFieldsMenuRef: React.RefObject<HTMLDivElement>;
  overviewFieldsPanelRef: React.RefObject<HTMLDivElement>;
  overviewFieldsMenuStyle: CSSProperties;
  overviewFieldsFilterQuery: string;
  setOverviewFieldsFilterQuery: (query: string) => void;
  overviewColumnVisibility: OverviewColumnVisibility;
  setOverviewColumnVisibility: (
    visibility:
      | OverviewColumnVisibility
      | ((prev: OverviewColumnVisibility) => OverviewColumnVisibility)
  ) => void;
  allOverviewColumnsSelected: boolean;
  filteredOverviewColumns: Array<{ key: OverviewColumnKey; label: string }>;
  selectedRecordsCount: number;
  selectedFiles: Array<{ path: string; type: string }>;
  onBulkDownload: () => Promise<void>;
  onBulkDelete: () => Promise<void>;
  onClearSelection: () => void;
  canDelete: boolean;
  hasDeletableSelection: boolean;
  explorerZoomLevel: number;
  explorerZoomStyle: CSSProperties;
  nudgeExplorerZoom: (direction: 1 | -1) => void;
  resetExplorerZoom: () => void;
  onRefetch: () => void;
  canWrite: boolean;
  hasBucketContext: boolean;
  isActionsMenuOpen: boolean;
  setIsActionsMenuOpen: (open: boolean) => void;
  actionsMenuRef: React.RefObject<HTMLDivElement>;
  uploadFilesInputRef: React.RefObject<HTMLInputElement>;
  onSelectFolderForUpload: () => Promise<void>;
  openCreateEntryModal: (kind: 'file' | 'folder') => void;
  isExplorerGridView: boolean;
  uploadDisabled: boolean;
}

export const BrowserToolbar = ({
  selectedPath,
  setSelectedPath,
  parentPath,
  breadcrumbSegments,
  breadcrumbValidationMessage,
  isBrowseRefreshing,
  isBreadcrumbEditing,
  setIsBreadcrumbEditing,
  breadcrumbDraft,
  setBreadcrumbDraft,
  breadcrumbInputRef,
  breadcrumbHintOptions,
  activeBreadcrumbHintIndex,
  setActiveBreadcrumbHintIndex,
  isBreadcrumbPathCommitAllowed,
  commitBreadcrumbPath,
  isFilterOpen,
  filterInputRef,
  filterDraftQuery,
  setFilterDraftQuery,
  closeFilter,
  openFilter,
  isOverviewFieldsMenuOpen,
  setIsOverviewFieldsMenuOpen,
  overviewFieldsMenuRef,
  overviewFieldsPanelRef,
  overviewFieldsMenuStyle,
  overviewFieldsFilterQuery,
  setOverviewFieldsFilterQuery,
  overviewColumnVisibility,
  setOverviewColumnVisibility,
  allOverviewColumnsSelected,
  filteredOverviewColumns,
  selectedRecordsCount,
  selectedFiles,
  onBulkDownload,
  onBulkDelete,
  onClearSelection,
  canDelete,
  hasDeletableSelection,
  explorerZoomLevel,
  explorerZoomStyle,
  nudgeExplorerZoom,
  resetExplorerZoom,
  onRefetch,
  canWrite,
  hasBucketContext,
  isActionsMenuOpen,
  setIsActionsMenuOpen,
  actionsMenuRef,
  uploadFilesInputRef,
  onSelectFolderForUpload,
  openCreateEntryModal,
  isExplorerGridView,
  uploadDisabled,
}: BrowserToolbarProps) => {
  return (
    <div
      className={`${styles.browserToolbar} ${isExplorerGridView ? styles.browserToolbarGridView : ''}`}
      style={explorerZoomStyle}
      data-explorer-zoom={explorerZoomLevel}
    >
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

          <div className={styles.breadcrumbField}>
            <div
              className={`${styles.breadcrumbTrail} ${
                isBrowseRefreshing ? styles.breadcrumbTrailRefreshing : ''
              } ${breadcrumbValidationMessage ? styles.breadcrumbTrailInvalid : ''}`.trim()}
              data-testid="breadcrumb-trail"
              onDoubleClick={() => setIsBreadcrumbEditing(true)}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setIsBreadcrumbEditing(true);
                }
              }}
            >
              {isBreadcrumbEditing ? (
                <div className={styles.breadcrumbInputWrap}>
                  <Input
                    ref={breadcrumbInputRef}
                    className={styles.breadcrumbInput}
                    value={breadcrumbDraft}
                    onChange={(event) => {
                      setBreadcrumbDraft(event.target.value);
                      setActiveBreadcrumbHintIndex(-1);
                    }}
                    onBlur={(event) => {
                      if (isBreadcrumbPathCommitAllowed(event.target.value)) {
                        commitBreadcrumbPath(event.target.value);
                      }
                      setIsBreadcrumbEditing(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown') {
                        if (breadcrumbHintOptions.length === 0) {
                          return;
                        }

                        event.preventDefault();
                        setActiveBreadcrumbHintIndex((previous) => {
                          if (previous < 0) {
                            return 0;
                          }

                          return Math.min(previous + 1, breadcrumbHintOptions.length - 1);
                        });
                        return;
                      }

                      if (event.key === 'ArrowUp') {
                        if (breadcrumbHintOptions.length === 0) {
                          return;
                        }

                        event.preventDefault();
                        setActiveBreadcrumbHintIndex((previous) => {
                          if (previous < 0) {
                            return breadcrumbHintOptions.length - 1;
                          }

                          return Math.max(previous - 1, 0);
                        });
                        return;
                      }

                      if (event.key === 'Enter') {
                        if (activeBreadcrumbHintIndex >= 0) {
                          const highlighted = breadcrumbHintOptions[activeBreadcrumbHintIndex];
                          if (highlighted) {
                            setBreadcrumbDraft(highlighted);
                            commitBreadcrumbPath(highlighted);
                            setIsBreadcrumbEditing(false);
                            return;
                          }
                        }

                        const enteredValue = (event.target as HTMLInputElement).value;
                        if (isBreadcrumbPathCommitAllowed(enteredValue)) {
                          commitBreadcrumbPath(enteredValue);
                        }
                        setIsBreadcrumbEditing(false);
                        return;
                      }

                      if (event.key === 'Tab' && activeBreadcrumbHintIndex >= 0) {
                        const highlighted = breadcrumbHintOptions[activeBreadcrumbHintIndex];
                        if (!highlighted) {
                          return;
                        }

                        event.preventDefault();
                        setBreadcrumbDraft(highlighted);
                        if (isBreadcrumbPathCommitAllowed(highlighted)) {
                          commitBreadcrumbPath(highlighted);
                        }
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
                  {breadcrumbHintOptions.length > 0 ? (
                    <div
                      className={styles.breadcrumbHints}
                      data-testid="breadcrumb-hints"
                      role="listbox"
                    >
                      {breadcrumbHintOptions.map((hint, index) => (
                        <button
                          key={hint}
                          type="button"
                          role="option"
                          aria-selected={activeBreadcrumbHintIndex === index}
                          className={`${styles.breadcrumbHintButton} ${
                            activeBreadcrumbHintIndex === index
                              ? styles.breadcrumbHintButtonActive
                              : ''
                          }`.trim()}
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => {
                            setBreadcrumbDraft(hint);
                            if (isBreadcrumbPathCommitAllowed(hint)) {
                              commitBreadcrumbPath(hint);
                            }
                            setIsBreadcrumbEditing(false);
                          }}
                        >
                          {hint}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
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
            {breadcrumbValidationMessage ? (
              <p className={styles.breadcrumbValidationError}>{breadcrumbValidationMessage}</p>
            ) : null}
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
                  value={filterDraftQuery}
                  onChange={(event) => setFilterDraftQuery(event.target.value)}
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
            {isOverviewFieldsMenuOpen
              ? createPortal(
                  <div
                    ref={overviewFieldsPanelRef}
                    className={styles.overviewFieldsMenu}
                    role="menu"
                    aria-label="Visible fields menu"
                    style={{ ...overviewFieldsMenuStyle, ...explorerZoomStyle }}
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
                  </div>,
                  document.body
                )
              : null}
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

          <div className={styles.zoomControls} role="group" aria-label="Explorer zoom controls">
            <Button
              variant="muted"
              className={styles.iconButton}
              onClick={() => nudgeExplorerZoom(-1)}
              aria-label="Zoom out explorer"
              title="Zoom out (Ctrl/Cmd + -)"
            >
              -
            </Button>
            <Button
              variant="muted"
              onClick={resetExplorerZoom}
              aria-label="Reset explorer zoom"
              title="Reset zoom (Ctrl/Cmd + 0)"
              className={styles.zoomResetButton}
            >
              {explorerZoomLevel}%
            </Button>
            <Button
              variant="muted"
              className={styles.iconButton}
              onClick={() => nudgeExplorerZoom(1)}
              aria-label="Zoom in explorer"
              title="Zoom in (Ctrl/Cmd + +)"
            >
              +
            </Button>
          </div>

          <Button
            variant="muted"
            className={`${styles.iconButton} ${styles.refreshButton} ${isBrowseRefreshing ? styles.refreshButtonBusy : ''}`}
            onClick={onRefetch}
            aria-label="Refresh current location"
            title={isBrowseRefreshing ? 'Refreshing...' : 'Refresh'}
            aria-busy={isBrowseRefreshing}
          >
            <RefreshCw size={16} aria-hidden />
          </Button>

          {canWrite ? (
            <div className={styles.actionsMenuWrap} ref={actionsMenuRef}>
              <Button
                variant="muted"
                className={styles.actionsMenuTrigger}
                disabled={!hasBucketContext}
                onClick={() => setIsActionsMenuOpen((previous) => !previous)}
                aria-haspopup="menu"
                aria-expanded={isActionsMenuOpen}
                aria-label="Open actions menu"
                title={
                  !hasBucketContext
                    ? 'Navigate to a bucket before using file actions'
                    : 'Open actions menu'
                }
              >
                <MoreVertical size={14} aria-hidden />
              </Button>
              {isActionsMenuOpen ? (
                <div
                  className={styles.actionsMenuPanel}
                  role="menu"
                  aria-label="File and folder actions"
                >
                  <button
                    className={styles.actionsMenuItem}
                    type="button"
                    role="menuitem"
                    disabled={!hasBucketContext}
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      openCreateEntryModal('file');
                    }}
                    title={
                      !hasBucketContext
                        ? 'Navigate to a bucket before creating files'
                        : 'Create file'
                    }
                  >
                    Create File
                  </button>
                  <button
                    className={styles.actionsMenuItem}
                    type="button"
                    role="menuitem"
                    disabled={!hasBucketContext}
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      openCreateEntryModal('folder');
                    }}
                    title={
                      !hasBucketContext
                        ? 'Navigate to a bucket before creating folders'
                        : 'Create folder'
                    }
                  >
                    Create Folder
                  </button>
                  <button
                    className={styles.actionsMenuItem}
                    type="button"
                    role="menuitem"
                    disabled={uploadDisabled}
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      uploadFilesInputRef.current?.click();
                    }}
                    title={
                      !hasBucketContext ? 'Navigate to a bucket before uploading' : 'Upload files'
                    }
                  >
                    Upload Files
                  </button>
                  <button
                    className={styles.actionsMenuItem}
                    type="button"
                    role="menuitem"
                    disabled={uploadDisabled}
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      void onSelectFolderForUpload();
                    }}
                    title={
                      !hasBucketContext ? 'Navigate to a bucket before uploading' : 'Upload folder'
                    }
                  >
                    Upload Folder
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
