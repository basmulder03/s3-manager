import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MouseEvent } from 'react';
import { useModalFocusTrapEffect } from '@web/hooks/useModalFocusTrapEffect';
import { trpcProxyClient } from '@web/trpc/client';
import type { BrowseItem } from '@server/services/s3/types';
import { overviewColumnDefinitions } from '@web/pages/browser/constants';
import { BrowserContextMenu } from '@web/pages/browser/components/BrowserContextMenu';
import { BrowserInfoModals } from '@web/pages/browser/components/BrowserInfoModals';
import { BrowserToolbar } from '@web/pages/browser/components/BrowserToolbar';
import { BrowserModals } from '@web/pages/browser/components/BrowserModals';
import { BrowserItemsTable } from '@web/pages/browser/components/BrowserItemsTable';
import { useRenderedItems } from '@web/pages/browser/hooks/useRenderedItems';
import { useUploadDropHandlers } from '@web/pages/browser/hooks/useUploadDropHandlers';
import { useBreadcrumbNavigation } from '@web/pages/browser/hooks/useBreadcrumbNavigation';
import { useBrowserZoom } from '@web/pages/browser/hooks/useBrowserZoom';
import { useBrowserSorting } from '@web/pages/browser/hooks/useBrowserSorting';
import { useFilterManagement } from '@web/pages/browser/hooks/useFilterManagement';
import { useOverviewFieldsMenu } from '@web/pages/browser/hooks/useOverviewFieldsMenu';
import { usePropertiesLoading } from '@web/pages/browser/hooks/usePropertiesLoading';
import { useKeyboardNavigation } from '@web/pages/browser/hooks/useKeyboardNavigation';
import { useContextMenu } from '@web/pages/browser/hooks/useContextMenu';
import { useModalManagement } from '@web/pages/browser/hooks/useModalManagement';
import { useUploadHandling } from '@web/pages/browser/hooks/useUploadHandling';
import { useDragAndDropState } from '@web/pages/browser/hooks/useDragAndDropState';
import {
  resolveOverviewFieldValue,
  isSortableColumn,
  resolveSortKey,
} from '@web/pages/browser/utils/fieldResolvers';
import styles from '@web/App.module.css';

interface BrowseData {
  breadcrumbs: Array<{ name: string; path: string }>;
  items: BrowseItem[];
}

interface BrowserPageProps {
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  filterQuery: string;
  setFilterQuery: (query: string) => void;
  knownBucketNames: string[];
  breadcrumbValidationMessage?: string;
  canWrite: boolean;
  canDelete: boolean;
  isUploading: boolean;
  browse: {
    data?: BrowseData;
    isLoading: boolean;
    isFetching?: boolean;
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
  onCreateFile: (fileName: string) => Promise<void>;
  onCreateFolder: (folderName: string) => Promise<void>;
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
  onMove: (path: string, destinationPath?: string) => void;
  onCopyItems: (items: BrowseItem[]) => void;
  onCopyTextToClipboard: (value: string, label: string) => Promise<void>;
  onCutItems: (items: BrowseItem[]) => void;
  onPasteIntoPath: (destinationPath: string) => Promise<void>;
  hasClipboardItems: boolean;
  clipboardMode?: 'copy' | 'cut' | null;
  clipboardPaths?: Set<string>;
  onDownload: (path: string) => Promise<void>;
  onCalculateFolderSize: (path: string) => Promise<void>;
  onOpenProperties: (path: string) => Promise<void>;
  onDeletePathItems: (items: BrowseItem[]) => void;
  onViewFile: (path: string) => Promise<void>;
  onEditFile: (path: string) => Promise<void>;
  isShortcutsModalOpen?: boolean;
  setIsShortcutsModalOpen?: (isOpen: boolean) => void;
  isFilterHelpModalOpen?: boolean;
  setIsFilterHelpModalOpen?: (isOpen: boolean) => void;
}

export const BrowserPage = ({
  selectedPath,
  setSelectedPath,
  filterQuery,
  setFilterQuery,
  knownBucketNames,
  breadcrumbValidationMessage,
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
  onCreateFile,
  onCreateFolder,
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
  onCopyItems,
  onCopyTextToClipboard,
  onCutItems,
  onPasteIntoPath,
  hasClipboardItems,
  clipboardMode = null,
  clipboardPaths = new Set<string>(),
  onDownload,
  onCalculateFolderSize,
  onOpenProperties,
  onDeletePathItems,
  onViewFile,
  onEditFile,
  isShortcutsModalOpen: isShortcutsModalOpenProp,
  setIsShortcutsModalOpen: setIsShortcutsModalOpenProp,
  isFilterHelpModalOpen: isFilterHelpModalOpenProp,
  setIsFilterHelpModalOpen: setIsFilterHelpModalOpenProp,
}: BrowserPageProps) => {
  const isBrowseRefreshing = browse.isFetching ?? browse.isLoading;

  // Refs
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const activeModalRef = useRef<HTMLDivElement>(null);
  const uploadDropEnterDepthRef = useRef(0);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Initialize hooks
  const modals = useModalManagement(
    isShortcutsModalOpenProp,
    setIsShortcutsModalOpenProp,
    isFilterHelpModalOpenProp,
    setIsFilterHelpModalOpenProp
  );

  const upload = useUploadHandling();
  const dragDrop = useDragAndDropState();

  const breadcrumb = useBreadcrumbNavigation({
    selectedPath,
    setSelectedPath,
    knownBucketNames,
    browseData: browse.data,
  });

  const zoom = useBrowserZoom();
  const sorting = useBrowserSorting();
  const filter = useFilterManagement({ filterQuery, setFilterQuery });
  const overviewFields = useOverviewFieldsMenu();

  const isAnyPropertyBackedColumnVisible = useMemo(
    () =>
      overviewColumnDefinitions.some(
        (column) => column.requiresProperties && overviewFields.overviewColumnVisibility[column.key]
      ),
    [overviewFields.overviewColumnVisibility]
  );

  const properties = usePropertiesLoading({
    browseItems: browse.data?.items ?? [],
    isAnyPropertyBackedColumnVisible,
    filterQuery,
  });

  const { parentPath, renderedItems } = useRenderedItems({
    browseItems: browse.data?.items ?? [],
    selectedPath,
    filterQuery,
    parsedFilterClauses: properties.parsedFilterClauses,
    propertiesByPath: properties.propertiesByPath,
    folderSizesByPath,
    sortRules: sorting.sortRules,
  });

  const keyboard = useKeyboardNavigation({
    renderedItems,
    isExplorerGridView: zoom.isExplorerGridView,
    selectedPath,
    setSelectedPath,
    parentPath,
    onViewFile,
    onRowDoubleClick,
    onSelectItemOnly,
    onToggleItemSelection,
    onOpenItemContextMenu,
    openFilter: filter.openFilter,
    setIsShortcutsModalOpen: modals.setIsShortcutsModalOpen,
    onRefetch: browse.refetch,
    nudgeExplorerZoom: zoom.nudgeExplorerZoom,
    resetExplorerZoom: zoom.resetExplorerZoom,
    contextMenu,
    isActionsMenuOpen: modals.isActionsMenuOpen,
    setIsActionsMenuOpen: modals.setIsActionsMenuOpen,
    isShortcutsModalOpen: modals.isShortcutsModalOpen,
    isFilterHelpModalOpen: modals.isFilterHelpModalOpen,
    rowRefs,
  });

  const hasBucketContext = selectedPath.trim().replace(/^\/+/, '').length > 0;
  const uploadDisabled = !hasBucketContext;

  const uploadDropHandlers = useUploadDropHandlers({
    uploadDisabled,
    draggedMovePath: dragDrop.draggedMovePath,
    uploadDropEnterDepthRef,
    setIsUploadDropActive: dragDrop.setIsUploadDropActive,
    setPendingFileUploadFiles: upload.setPendingFileUploadFiles,
    setPendingFolderUploadFiles: upload.setPendingFolderUploadFiles,
  });

  const contextMenuHook = useContextMenu({
    contextMenu,
    hasBucketContext,
    hasClipboardItems,
    canWrite,
    canDelete,
    propertiesByPath: properties.propertiesByPath,
    propertiesLoadingPaths: properties.propertiesLoadingPaths,
    onCloseContextMenu,
    setSelectedPath,
    onCalculateFolderSize,
    onPasteIntoPath,
    onViewFile,
    onEditFile,
    onDownload,
    onOpenProperties,
    onCopyTextToClipboard,
    onCopyItems,
    onCutItems,
    onRename,
    onMove,
    onDeletePathItems,
  });

  // Derived values
  const selectedBrowseItems = useMemo(
    () => (browse.data?.items ?? []).filter((item) => selectedItems.has(item.path)),
    [browse.data?.items, selectedItems]
  );

  const hasDeletableSelection = useMemo(
    () =>
      selectedBrowseItems.some((item) => !(item.type === 'directory' && !item.path.includes('/'))),
    [selectedBrowseItems]
  );

  const selectedRecordsCount = selectedItems.size;

  // Field resolver wrapper with injected dependencies
  const resolveFieldValue = useCallback(
    (item: BrowseItem, columnKey: any, isParentNavigation: boolean): string => {
      return resolveOverviewFieldValue({
        item,
        columnKey,
        isParentNavigation,
        folderSizesByPath,
        folderSizeLoadingPaths,
        propertiesByPath: properties.propertiesByPath,
        propertiesLoadingPaths: properties.propertiesLoadingPaths,
      });
    },
    [folderSizesByPath, folderSizeLoadingPaths, properties]
  );

  // Load properties for context menu item
  useEffect(() => {
    if (!contextMenu || contextMenu.item.type !== 'file') {
      return;
    }

    const targetPath = contextMenu.item.path;
    if (
      properties.propertiesByPath[targetPath] !== undefined ||
      properties.propertiesLoadingPaths.has(targetPath)
    ) {
      return;
    }

    properties.setPropertiesLoadingPaths((previous) => {
      if (previous.has(targetPath)) {
        return previous;
      }

      const next = new Set(previous);
      next.add(targetPath);
      return next;
    });

    let cancelled = false;
    const loadProperties = async () => {
      try {
        const details = await trpcProxyClient.s3.getProperties.query({ path: targetPath });
        if (cancelled) {
          return;
        }

        properties.setPropertiesByPath((previous) => {
          if (previous[targetPath] !== undefined) {
            return previous;
          }

          return {
            ...previous,
            [targetPath]: details,
          };
        });
      } catch {
        if (cancelled) {
          return;
        }

        properties.setPropertiesByPath((previous) => {
          if (previous[targetPath] !== undefined) {
            return previous;
          }

          return {
            ...previous,
            [targetPath]: null,
          };
        });
      } finally {
        properties.setPropertiesLoadingPaths((previous) => {
          if (!previous.has(targetPath)) {
            return previous;
          }

          const next = new Set(previous);
          next.delete(targetPath);
          return next;
        });
      }
    };

    void loadProperties();

    return () => {
      cancelled = true;
    };
  }, [contextMenu, properties]);

  // Close actions menu on outside click
  useEffect(() => {
    if (!modals.isActionsMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (actionsMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      modals.setIsActionsMenuOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [modals.isActionsMenuOpen, modals.setIsActionsMenuOpen]);

  // Modal navigation blocking
  const isModalNavigationBlocked =
    modals.isShortcutsModalOpen ||
    modals.isFilterHelpModalOpen ||
    upload.pendingFileUploadFiles.length > 0 ||
    upload.pendingFolderUploadFiles.length > 0 ||
    modals.createEntryModal !== null;

  useModalFocusTrapEffect(isModalNavigationBlocked, activeModalRef);

  return (
    <>
      <BrowserToolbar
        selectedPath={selectedPath}
        setSelectedPath={setSelectedPath}
        parentPath={parentPath}
        breadcrumbSegments={breadcrumb.breadcrumbSegments}
        breadcrumbValidationMessage={breadcrumbValidationMessage}
        isBrowseRefreshing={isBrowseRefreshing}
        isBreadcrumbEditing={breadcrumb.isBreadcrumbEditing}
        setIsBreadcrumbEditing={breadcrumb.setIsBreadcrumbEditing}
        breadcrumbDraft={breadcrumb.breadcrumbDraft}
        setBreadcrumbDraft={breadcrumb.setBreadcrumbDraft}
        breadcrumbInputRef={breadcrumb.breadcrumbInputRef}
        breadcrumbHintOptions={breadcrumb.breadcrumbHintOptions}
        activeBreadcrumbHintIndex={breadcrumb.activeBreadcrumbHintIndex}
        setActiveBreadcrumbHintIndex={breadcrumb.setActiveBreadcrumbHintIndex}
        isBreadcrumbPathCommitAllowed={breadcrumb.isBreadcrumbPathCommitAllowed}
        commitBreadcrumbPath={breadcrumb.commitBreadcrumbPath}
        isFilterOpen={filter.isFilterOpen}
        setIsFilterOpen={filter.setIsFilterOpen}
        filterInputRef={filter.filterInputRef}
        filterDraftQuery={filter.filterDraftQuery}
        setFilterDraftQuery={filter.setFilterDraftQuery}
        closeFilter={filter.closeFilter}
        openFilter={filter.openFilter}
        isOverviewFieldsMenuOpen={overviewFields.isOverviewFieldsMenuOpen}
        setIsOverviewFieldsMenuOpen={overviewFields.setIsOverviewFieldsMenuOpen}
        overviewFieldsMenuRef={overviewFields.overviewFieldsMenuRef}
        overviewFieldsPanelRef={overviewFields.overviewFieldsPanelRef}
        overviewFieldsMenuStyle={overviewFields.overviewFieldsMenuStyle}
        overviewFieldsFilterQuery={overviewFields.overviewFieldsFilterQuery}
        setOverviewFieldsFilterQuery={overviewFields.setOverviewFieldsFilterQuery}
        overviewColumnVisibility={overviewFields.overviewColumnVisibility}
        setOverviewColumnVisibility={overviewFields.setOverviewColumnVisibility}
        allOverviewColumnsSelected={overviewFields.allOverviewColumnsSelected}
        filteredOverviewColumns={overviewFields.filteredOverviewColumns}
        selectedRecordsCount={selectedRecordsCount}
        selectedFiles={selectedFiles}
        onBulkDownload={onBulkDownload}
        onBulkDelete={onBulkDelete}
        onClearSelection={onClearSelection}
        canDelete={canDelete}
        hasDeletableSelection={hasDeletableSelection}
        explorerZoomLevel={zoom.explorerZoomLevel}
        explorerZoomStyle={zoom.explorerZoomStyle}
        nudgeExplorerZoom={zoom.nudgeExplorerZoom}
        resetExplorerZoom={zoom.resetExplorerZoom}
        onRefetch={browse.refetch}
        canWrite={canWrite}
        hasBucketContext={hasBucketContext}
        isActionsMenuOpen={modals.isActionsMenuOpen}
        setIsActionsMenuOpen={modals.setIsActionsMenuOpen}
        actionsMenuRef={actionsMenuRef}
        uploadFilesInputRef={upload.uploadFilesInputRef}
        onSelectFolderForUpload={upload.onSelectFolderForUpload}
        openCreateEntryModal={modals.openCreateEntryModal}
        isExplorerGridView={zoom.isExplorerGridView}
        uploadDisabled={uploadDisabled}
      />

      {browse.isLoading ? (
        <p className={`${styles.state} ${styles.loadingState}`}>Loading objects...</p>
      ) : null}
      {browse.isError ? (
        <p className={`${styles.state} ${styles.stateError}`}>Failed to load S3 path data.</p>
      ) : null}

      {browse.data ? (
        <>
          <BrowserInfoModals
            isShortcutsModalOpen={modals.isShortcutsModalOpen}
            setIsShortcutsModalOpen={modals.setIsShortcutsModalOpen}
            isFilterHelpModalOpen={modals.isFilterHelpModalOpen}
            setIsFilterHelpModalOpen={modals.setIsFilterHelpModalOpen}
            activeModalRef={activeModalRef}
          />

          <input
            ref={upload.uploadFilesInputRef}
            className={styles.hiddenInput}
            type="file"
            multiple
            data-testid="upload-files-input"
            onChange={(event) => {
              const files = event.target.files;
              if (!files || files.length === 0) {
                return;
              }

              upload.setPendingFileUploadFiles(Array.from(files));
              event.target.value = '';
            }}
          />
          <input
            ref={upload.uploadFolderInputRef}
            className={styles.hiddenInput}
            type="file"
            multiple
            data-testid="upload-folder-input"
            {...upload.folderInputAttributes}
            onChange={(event) => {
              const files = event.target.files;
              if (!files || files.length === 0) {
                return;
              }

              upload.setPendingFolderUploadFiles(Array.from(files));
              event.target.value = '';
            }}
          />

          <BrowserModals
            pendingFileUploadFiles={upload.pendingFileUploadFiles}
            setPendingFileUploadFiles={upload.setPendingFileUploadFiles}
            pendingFolderUploadFiles={upload.pendingFolderUploadFiles}
            setPendingFolderUploadFiles={upload.setPendingFolderUploadFiles}
            onUploadFiles={onUploadFiles}
            onUploadFolder={onUploadFolder}
            createEntryModal={modals.createEntryModal}
            setCreateEntryModal={modals.setCreateEntryModal}
            createEntryError={modals.createEntryError}
            setCreateEntryError={modals.setCreateEntryError}
            closeCreateEntryModal={modals.closeCreateEntryModal}
            submitCreateEntryModal={() =>
              modals.submitCreateEntryModal(onCreateFile, onCreateFolder)
            }
            activeModalRef={activeModalRef}
            explorerZoomStyle={zoom.explorerZoomStyle}
          />

          <div
            className={`${styles.itemsDropZone} ${dragDrop.isUploadDropActive ? styles.itemsDropZoneActive : ''}`}
            data-testid="browser-drop-zone"
            style={zoom.explorerZoomStyle}
            onDragEnter={uploadDropHandlers.handleUploadDropEnter}
            onDragOver={uploadDropHandlers.handleUploadDropOver}
            onDragLeave={uploadDropHandlers.handleUploadDropLeave}
            onDrop={uploadDropHandlers.handleUploadDrop}
          >
            <BrowserItemsTable
              renderedItems={renderedItems}
              visibleOverviewColumns={overviewFields.visibleOverviewColumns}
              rowRefs={rowRefs}
              focusedRowIndex={keyboard.focusedRowIndex}
              setFocusedRowIndex={keyboard.setFocusedRowIndex}
              selectedItems={selectedItems}
              clipboardPaths={clipboardPaths}
              clipboardMode={clipboardMode}
              moveDropTargetPath={dragDrop.moveDropTargetPath}
              canWrite={canWrite}
              draggedMovePath={dragDrop.draggedMovePath}
              setDraggedMovePath={dragDrop.setDraggedMovePath}
              setMoveDropTargetPath={dragDrop.setMoveDropTargetPath}
              isInternalMoveDrag={uploadDropHandlers.isInternalMoveDrag}
              getDraggedMovePath={uploadDropHandlers.getDraggedMovePath}
              canMoveToDestination={uploadDropHandlers.canMoveToDestination}
              onRowClick={onRowClick}
              onRowDoubleClick={onRowDoubleClick}
              onOpenContextMenu={onOpenContextMenu}
              handleRowKeyDown={keyboard.handleRowKeyDown}
              onMove={onMove}
              onViewFile={onViewFile}
              setSelectedPath={setSelectedPath}
              parentPath={parentPath}
              folderSizesByPath={folderSizesByPath}
              folderSizeLoadingPaths={folderSizeLoadingPaths}
              resolveOverviewFieldValue={resolveFieldValue}
              sortRules={sorting.sortRules}
              setSortForColumn={sorting.setSortForColumn}
              getSortIndicator={sorting.getSortIndicator}
              getSortTooltip={sorting.getSortTooltip}
              isSortableColumn={isSortableColumn}
              resolveSortKey={resolveSortKey}
              isExplorerGridView={zoom.isExplorerGridView}
            />
            {dragDrop.isUploadDropActive ? (
              <div className={styles.uploadDropOverlay} aria-live="polite">
                <p className={styles.uploadDropOverlayTitle}>DROP TO START UPLOAD</p>
                <p className={styles.uploadDropOverlayBody}>
                  {isUploading
                    ? 'Uploads are in progress. You can drop more files or folders to queue another upload.'
                    : 'Review dropped files or folders, then confirm to start upload.'}
                </p>
              </div>
            ) : null}
          </div>

          <BrowserContextMenu
            contextMenu={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
            contextMenuRef={contextMenuHook.contextMenuRef}
            contextSubmenuRef={contextMenuHook.contextSubmenuRef}
            contextMenuItemRefs={contextMenuHook.contextMenuItemRefs}
            contextSubmenuItemRefs={contextMenuHook.contextSubmenuItemRefs}
            contextSubmenuSide={contextMenuHook.contextSubmenuSide}
            contextMenuActions={contextMenuHook.contextMenuActions}
            openSubmenuActionId={contextMenuHook.openSubmenuActionId}
            setOpenSubmenuActionId={contextMenuHook.setOpenSubmenuActionId}
            handleContextMenuKeyDown={contextMenuHook.handleContextMenuKeyDown}
          />
        </>
      ) : null}
    </>
  );
};
