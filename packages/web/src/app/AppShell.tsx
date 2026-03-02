import { Navigate, Route, Routes, useLocation } from 'react-router';
import { API_ORIGIN, trpc } from '@web/trpc/client';
import { useUiStore } from '@web/state/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@web/i18n';
import { FileModals, SignInGate, SnackbarHost } from '@web/components';
import { useBrowserController } from '@web/hooks';
import { FinderHeader, FinderSidebar } from '@web/layout';
import { BrowserPage } from '@web/pages';
import { useExplorerZoom } from '@web/app/hooks/useExplorerZoom';
import { useSessionRefresh } from '@web/app/hooks/useSessionRefresh';
import { useAppRouting } from '@web/app/hooks/useAppRouting';
import { useFilePreviewState } from '@web/app/hooks/useFilePreviewState';
import { getBucketNameFromPath } from '@web/utils/path';
import styles from '@web/App.module.css';

export const App = () => {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const { locale, t } = useI18n();
  const location = useLocation();

  // Explorer zoom management
  const { headerZoomStyle } = useExplorerZoom();

  // URL routing state
  const {
    selectedPath,
    openedFilePath,
    openedFileMode,
    filterQuery,
    setSelectedPath,
    setOpenedFileInUrl,
    clearOpenedFileInUrl,
    setFilterQuery,
  } = useAppRouting();

  // UI state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isFilterHelpModalOpen, setIsFilterHelpModalOpen] = useState(false);

  const authStatus = trpc.auth.status.useQuery({});
  const authMe = trpc.auth.me.useQuery({}, { retry: false });
  const buckets = trpc.s3.listBuckets.useQuery({});

  const knownBucketNames = useMemo(() => {
    const rawBuckets = buckets.data?.buckets;
    if (!Array.isArray(rawBuckets)) {
      return [] as string[];
    }

    return rawBuckets
      .map((bucket) => (typeof bucket?.name === 'string' ? bucket.name.trim() : ''))
      .filter((bucketName) => bucketName.length > 0);
  }, [buckets.data?.buckets]);

  const selectedBucketName = useMemo(() => getBucketNameFromPath(selectedPath), [selectedPath]);

  const hasSelectedBucket = selectedBucketName.length > 0;
  const canValidateBucket = buckets.isSuccess;
  const selectedBucketExists = useMemo(() => {
    if (!hasSelectedBucket || !canValidateBucket) {
      return true;
    }

    return knownBucketNames.includes(selectedBucketName);
  }, [canValidateBucket, hasSelectedBucket, knownBucketNames, selectedBucketName]);

  const breadcrumbValidationMessage =
    hasSelectedBucket && canValidateBucket && !selectedBucketExists
      ? `Bucket "${selectedBucketName}" does not exist.`
      : undefined;

  const browse = trpc.s3.browse.useQuery(
    { virtualPath: selectedPath },
    {
      enabled: selectedBucketExists,
      retry: false,
    }
  );
  const createFile = trpc.s3.createFile.useMutation();
  const createFolder = trpc.s3.createFolder.useMutation();
  const renameItem = trpc.s3.renameItem.useMutation();
  const copyItem = trpc.s3.copyItem.useMutation();
  const deleteObject = trpc.s3.deleteObject.useMutation();
  const deleteFolder = trpc.s3.deleteFolder.useMutation();
  const deleteMultipleItems = trpc.s3.deleteMultiple.useMutation();

  const authRequired = authStatus.data?.authRequired ?? true;
  const authenticated = authMe.isSuccess;
  const showMockBadge =
    __DEV_PIM_MOCK_BADGE__ && Boolean(authStatus.data?.pimDevMockEnabled && authenticated);
  const permissions = authMe.data?.permissions ?? (authRequired ? [] : ['view', 'write', 'delete']);
  const elevationSources = authMe.data?.elevationSources ?? [];
  const canView = permissions.includes('view');
  const canWrite = permissions.includes('write');
  const canDelete = permissions.includes('delete');
  const canManageProperties = permissions.includes('manage_properties');
  const showSignInOnly = authRequired && !authenticated;

  const refreshAuthState = useCallback(() => {
    void authStatus.refetch();
    void authMe.refetch();
  }, [authMe, authStatus]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_ORIGIN}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      refreshAuthState();
      return response.ok;
    } catch {
      refreshAuthState();
      return false;
    }
  }, [refreshAuthState]);

  const refreshBrowse = () => {
    void browse.refetch();
  };

  const formatDate = useCallback(
    (value: string | null): string => {
      if (!value) {
        return '-';
      }

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }

      return date.toLocaleString(locale);
    },
    [locale]
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const browser = useBrowserController({
    selectedPath,
    setSelectedPath,
    browseItems: browse.data?.items,
    browsePath: browse.data?.path,
    refreshBrowse,
    canWrite,
    canDelete,
    canManageProperties,
    locationPathname: location.pathname,
    createFileAsync: createFile.mutateAsync,
    createFolderAsync: createFolder.mutateAsync,
    renameItemAsync: renameItem.mutateAsync,
    copyItemAsync: copyItem.mutateAsync,
    deleteObjectAsync: deleteObject.mutateAsync,
    deleteFolderAsync: deleteFolder.mutateAsync,
    deleteMultipleAsync: async (input) => {
      const result = await deleteMultipleItems.mutateAsync(input);
      return {
        message: result.message,
      };
    },
  });

  // Session refresh and elevation tracking
  const { suppressNextElevationNotice } = useSessionRefresh({
    authenticated,
    refreshSession,
    elevationSources,
    refreshAuthState,
    onElevationExpired: () => {
      browser.enqueueSnackbar({
        tone: 'info',
        message: t('app.elevation.expired'),
      });
    },
  });

  const hasUnsavedPreviewChanges =
    browser.filePreviewModal?.mode === 'text' &&
    browser.filePreviewModal.editable &&
    browser.filePreviewModal.content !== browser.filePreviewModal.originalContent;

  // File preview management
  const {
    pendingDiscardAction,
    runPreviewAction,
    closeActiveModal,
    confirmDiscardChanges,
    cancelDiscardChanges,
  } = useFilePreviewState({
    openedFilePath,
    openedFileMode,
    canView,
    canWrite,
    filePreviewModal: browser.filePreviewModal,
    hasUnsavedChanges: hasUnsavedPreviewChanges,
    setOpenedFileInUrl,
    clearOpenedFileInUrl,
    openFilePreview: browser.openFilePreview,
    closeFilePreview: browser.closeFilePreview,
    setFilePreviewEditable: browser.setFilePreviewEditable,
    closeModals: browser.closeModals,
  });

  if (showSignInOnly) {
    return <SignInGate />;
  }

  return (
    <main className={styles.appShell}>
      <div style={headerZoomStyle}>
        <FinderHeader
          theme={theme}
          setTheme={setTheme}
          authenticated={authenticated}
          sidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((previous) => !previous)}
          onOpenKeyboardShortcuts={() => setIsShortcutsModalOpen(true)}
          onOpenFilterQueryHelp={() => setIsFilterHelpModalOpen(true)}
        />
      </div>

      <div
        className={`${styles.finderWindow} ${!isSidebarOpen ? styles.finderWindowCollapsed : ''}`}
      >
        {isSidebarOpen ? (
          <FinderSidebar
            provider={authStatus.data?.provider}
            userEmail={authMe.data?.email}
            selectedPath={selectedPath}
            permissions={permissions}
            elevationSources={elevationSources}
            authenticated={authenticated}
            showMockBadge={showMockBadge}
            onElevationGranted={(request) => {
              refreshAuthState();
              browser.enqueueSnackbar({
                tone: 'success',
                message: t('app.elevation.granted', { entitlementKey: request.entitlementKey }),
              });
            }}
            onElevationRevoked={(entitlementKey) => {
              suppressNextElevationNotice();
              refreshAuthState();
              browser.enqueueSnackbar({
                tone: 'success',
                message: t('app.elevation.revoked', { entitlementKey }),
              });
            }}
          />
        ) : null}

        <section className={styles.finderContent}>
          <Routes>
            <Route
              path="/"
              element={
                canView ? (
                  <BrowserPage
                    selectedPath={selectedPath}
                    setSelectedPath={setSelectedPath}
                    filterQuery={filterQuery}
                    setFilterQuery={setFilterQuery}
                    knownBucketNames={knownBucketNames}
                    breadcrumbValidationMessage={breadcrumbValidationMessage}
                    canWrite={canWrite}
                    canDelete={canDelete}
                    isUploading={browser.isUploading}
                    browse={browse}
                    selectedItems={browser.selectedItems}
                    selectedFiles={browser.selectedFiles}
                    folderSizesByPath={browser.folderSizesByPath}
                    folderSizeLoadingPaths={browser.folderSizeLoadingPaths}
                    contextMenu={browser.contextMenu}
                    onBulkDownload={browser.bulkDownload}
                    onBulkDelete={browser.bulkDelete}
                    onCreateFile={browser.createFileInCurrentPath}
                    onCreateFolder={browser.createFolderInCurrentPath}
                    onUploadFiles={browser.uploadFiles}
                    onUploadFolder={browser.uploadFolder}
                    onClearSelection={browser.clearSelection}
                    onSelectItemOnly={browser.selectOnlyPath}
                    onToggleItemSelection={browser.toggleSelectionAtPath}
                    onRowClick={browser.handleRowClick}
                    onRowDoubleClick={browser.handleRowDoubleClick}
                    onOpenContextMenu={browser.openContextMenu}
                    onOpenItemContextMenu={browser.openContextMenuForItem}
                    onCloseContextMenu={browser.closeContextMenu}
                    onRename={browser.renamePathItem}
                    onMove={browser.movePathItem}
                    onCopyItems={browser.copyPathItems}
                    onCopyTextToClipboard={browser.copyTextToClipboard}
                    onCutItems={browser.cutPathItems}
                    onPasteIntoPath={browser.pasteClipboardItems}
                    hasClipboardItems={browser.hasClipboardItems}
                    clipboardMode={browser.clipboardMode}
                    clipboardPaths={browser.clipboardPaths}
                    onDownload={browser.downloadFile}
                    onCalculateFolderSize={browser.calculateFolderSize}
                    onOpenProperties={browser.openProperties}
                    onDeletePathItems={browser.deletePathItems}
                    isShortcutsModalOpen={isShortcutsModalOpen}
                    setIsShortcutsModalOpen={setIsShortcutsModalOpen}
                    isFilterHelpModalOpen={isFilterHelpModalOpen}
                    setIsFilterHelpModalOpen={setIsFilterHelpModalOpen}
                    onViewFile={async (path) => {
                      await runPreviewAction({ type: 'open', path, mode: 'view' });
                    }}
                    onEditFile={async (path) => {
                      await runPreviewAction({ type: 'open', path, mode: 'edit' });
                    }}
                  />
                ) : (
                  <p className={styles.state}>{t('app.noBrowsePermission')}</p>
                )
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </section>
      </div>

      <FileModals
        renameModal={browser.renameModal}
        moveModal={browser.moveModal}
        deleteModal={browser.deleteModal}
        propertiesModal={browser.propertiesModal}
        canEditProperties={canWrite && canManageProperties}
        filePreviewModal={browser.filePreviewModal}
        showDiscardChangesModal={pendingDiscardAction !== null}
        modalError={browser.modalError}
        activeModalRef={browser.activeModalRef}
        onClose={closeActiveModal}
        onRenameNextNameChange={browser.setRenameNextName}
        onMoveDestinationPathChange={browser.setMoveDestinationPath}
        onSubmitRename={browser.submitRename}
        onSubmitMove={browser.submitMove}
        onSubmitDelete={browser.submitDelete}
        onSubmitPropertiesSave={browser.saveProperties}
        onResetPropertiesDraft={browser.resetPropertiesDraft}
        onPropertiesFieldChange={browser.setPropertiesField}
        onAddPropertiesMetadataRow={browser.addPropertiesMetadataRow}
        onUpdatePropertiesMetadataRow={browser.updatePropertiesMetadataRow}
        onRemovePropertiesMetadataRow={browser.removePropertiesMetadataRow}
        onFilePreviewTextChange={browser.setFilePreviewTextContent}
        onSubmitFilePreviewSave={browser.saveFilePreviewText}
        onSwitchFilePreviewToEdit={() => {
          if (!openedFilePath) {
            return;
          }

          setOpenedFileInUrl(openedFilePath, 'edit');
        }}
        onDownloadFilePreview={async (path) => browser.downloadFile(path, true)}
        onConfirmDiscardChanges={confirmDiscardChanges}
        onCancelDiscardChanges={cancelDiscardChanges}
        formatDate={formatDate}
      />

      <SnackbarHost snackbars={browser.snackbars} onDismiss={browser.dismissSnackbar} />
    </main>
  );
};
