import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { API_ORIGIN, trpc } from '@web/trpc/client';
import { useUiStore } from '@web/state/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileModals, SignInGate, SnackbarHost } from '@web/components';
import { useBrowserController } from '@web/hooks';
import { FinderHeader, FinderSidebar } from '@web/layout';
import { BrowserPage } from '@web/pages';
import styles from '@web/App.module.css';

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

const normalizeVirtualPath = (value: string): string =>
  value.trim().replace(/^\/+/, '').replace(/\/+$/, '');

const getBucketNameFromPath = (path: string): string => {
  const normalized = normalizeVirtualPath(path);
  if (!normalized) {
    return '';
  }

  const [bucketName = ''] = normalized.split('/');
  return bucketName;
};

const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const App = () => {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pendingDiscardAction, setPendingDiscardAction] = useState<
    { type: 'close' } | { type: 'open'; path: string; mode: 'view' | 'edit' } | null
  >(null);
  const lastOpenedPreviewKeyRef = useRef('');
  const hadElevationRef = useRef(false);
  const suppressNextElevationDropNoticeRef = useRef(false);

  const selectedPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeVirtualPath(params.get('path') ?? '');
  }, [location.search]);

  const openedFilePath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeVirtualPath(params.get('file') ?? '');
  }, [location.search]);

  const openedFileMode = useMemo<'view' | 'edit'>(() => {
    const params = new URLSearchParams(location.search);
    return params.get('mode') === 'edit' ? 'edit' : 'view';
  }, [location.search]);

  const setSelectedPath = useCallback(
    (nextPath: string) => {
      const normalized = normalizeVirtualPath(nextPath);
      const params = new URLSearchParams(location.search);

      if (normalized) {
        params.set('path', normalized);
      } else {
        params.delete('path');
      }

      const nextSearch = params.toString();
      const nextUrl = nextSearch.length > 0 ? `/?${nextSearch}` : '/';
      const currentUrl = `${location.pathname}${location.search}`;

      if (nextUrl === currentUrl) {
        return;
      }

      navigate(nextUrl);
    },
    [location.pathname, location.search, navigate]
  );

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
  const createFolder = trpc.s3.createFolder.useMutation();
  const renameItem = trpc.s3.renameItem.useMutation();
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    let inFlight = false;
    const intervalId = window.setInterval(() => {
      if (inFlight) {
        return;
      }

      inFlight = true;
      void refreshSession()
        .then((refreshed) => {
          if (!refreshed) {
            window.clearInterval(intervalId);
          }
        })
        .finally(() => {
          inFlight = false;
        });
    }, SESSION_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authenticated, refreshSession]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!authenticated) {
        return;
      }

      const isManualRefreshShortcut =
        event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r';

      if (!isManualRefreshShortcut) {
        return;
      }

      event.preventDefault();
      void refreshSession();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [authenticated, refreshSession]);

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
    createFolderAsync: createFolder.mutateAsync,
    renameItemAsync: renameItem.mutateAsync,
    deleteObjectAsync: deleteObject.mutateAsync,
    deleteFolderAsync: deleteFolder.mutateAsync,
    deleteMultipleAsync: async (input) => {
      const result = await deleteMultipleItems.mutateAsync(input);
      return {
        message: result.message,
      };
    },
  });

  useEffect(() => {
    const hasElevation = authenticated && elevationSources.length > 0;
    const previouslyElevated = hadElevationRef.current;

    if (previouslyElevated && !hasElevation) {
      if (suppressNextElevationDropNoticeRef.current) {
        suppressNextElevationDropNoticeRef.current = false;
      } else {
        browser.enqueueSnackbar({
          tone: 'info',
          message: 'Temporary elevated access expired.',
        });
      }
    }

    hadElevationRef.current = hasElevation;
  }, [authenticated, elevationSources, browser]);

  useEffect(() => {
    if (!authenticated || elevationSources.length === 0) {
      return;
    }

    const now = Date.now();
    const expiryTimes = elevationSources
      .map((source) => source.expiresAt)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => Date.parse(value))
      .filter((value) => !Number.isNaN(value) && value > now);

    if (expiryTimes.length === 0) {
      return;
    }

    const nearestExpiry = Math.min(...expiryTimes);
    const delayMs = Math.max(1_000, nearestExpiry - now + 1_000);
    const timerId = window.setTimeout(() => {
      refreshAuthState();
    }, delayMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [authenticated, elevationSources, refreshAuthState]);

  const setOpenedFileInUrl = useCallback(
    (path: string, mode: 'view' | 'edit') => {
      const normalized = normalizeVirtualPath(path);
      const params = new URLSearchParams(location.search);
      if (normalized) {
        params.set('file', normalized);
        params.set('mode', mode);
      } else {
        params.delete('file');
        params.delete('mode');
      }

      const nextSearch = params.toString();
      const nextUrl = nextSearch.length > 0 ? `/?${nextSearch}` : '/';
      const currentUrl = `${location.pathname}${location.search}`;
      if (nextUrl !== currentUrl) {
        navigate(nextUrl);
      }
    },
    [location.pathname, location.search, navigate]
  );

  const clearOpenedFileInUrl = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete('file');
    params.delete('mode');
    const nextSearch = params.toString();
    const nextUrl = nextSearch.length > 0 ? `/?${nextSearch}` : '/';
    const currentUrl = `${location.pathname}${location.search}`;
    if (nextUrl !== currentUrl) {
      navigate(nextUrl);
    }
  }, [location.pathname, location.search, navigate]);

  const hasUnsavedPreviewChanges =
    browser.filePreviewModal?.mode === 'text' &&
    browser.filePreviewModal.editable &&
    browser.filePreviewModal.content !== browser.filePreviewModal.originalContent;

  const executePreviewAction = useCallback(
    async (action: { type: 'close' } | { type: 'open'; path: string; mode: 'view' | 'edit' }) => {
      if (action.type === 'close') {
        clearOpenedFileInUrl();
        return;
      }

      setOpenedFileInUrl(action.path, action.mode);
    },
    [clearOpenedFileInUrl, setOpenedFileInUrl]
  );

  const runPreviewAction = useCallback(
    async (action: { type: 'close' } | { type: 'open'; path: string; mode: 'view' | 'edit' }) => {
      if (hasUnsavedPreviewChanges) {
        setPendingDiscardAction(action);
        return;
      }

      await executePreviewAction(action);
    },
    [executePreviewAction, hasUnsavedPreviewChanges]
  );

  const closeActiveModal = useCallback(() => {
    if (browser.filePreviewModal) {
      void runPreviewAction({ type: 'close' });
      return;
    }

    browser.closeModals();
  }, [browser, runPreviewAction]);

  useEffect(() => {
    if (!canView) {
      return;
    }

    if (!openedFilePath) {
      lastOpenedPreviewKeyRef.current = '';
      if (browser.filePreviewModal) {
        browser.closeFilePreview();
      }
      return;
    }

    if (openedFileMode === 'edit' && !canWrite) {
      setOpenedFileInUrl(openedFilePath, 'view');
      return;
    }

    const desiredMode: 'view' | 'edit' = openedFileMode === 'edit' && canWrite ? 'edit' : 'view';
    const previewKey = `${openedFilePath}|${desiredMode}`;

    if (browser.filePreviewModal?.path === openedFilePath) {
      if (browser.filePreviewModal.mode === 'text') {
        const shouldBeEditable = desiredMode === 'edit';
        if (browser.filePreviewModal.editable !== shouldBeEditable) {
          browser.setFilePreviewEditable(shouldBeEditable);
        }
      }
      lastOpenedPreviewKeyRef.current = previewKey;
      return;
    }

    if (lastOpenedPreviewKeyRef.current === previewKey) {
      return;
    }

    lastOpenedPreviewKeyRef.current = previewKey;
    void browser.openFilePreview(openedFilePath, desiredMode).then((opened) => {
      if (opened) {
        return;
      }

      clearOpenedFileInUrl();
      lastOpenedPreviewKeyRef.current = '';
    });
  }, [
    browser,
    canView,
    canWrite,
    clearOpenedFileInUrl,
    openedFileMode,
    openedFilePath,
    setOpenedFileInUrl,
  ]);

  if (showSignInOnly) {
    return <SignInGate />;
  }

  return (
    <main className={styles.appShell}>
      <FinderHeader
        theme={theme}
        setTheme={setTheme}
        authenticated={authenticated}
        sidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((previous) => !previous)}
      />

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
                message: `Temporary access granted for ${request.entitlementKey}.`,
              });
            }}
            onElevationRevoked={(entitlementKey) => {
              suppressNextElevationDropNoticeRef.current = true;
              refreshAuthState();
              browser.enqueueSnackbar({
                tone: 'success',
                message: `Temporary access turned off for ${entitlementKey}.`,
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
                    onDownload={browser.downloadFile}
                    onCalculateFolderSize={browser.calculateFolderSize}
                    onOpenProperties={browser.openProperties}
                    onDeletePathItems={browser.deletePathItems}
                    onViewFile={async (path) => {
                      await runPreviewAction({ type: 'open', path, mode: 'view' });
                    }}
                    onEditFile={async (path) => {
                      await runPreviewAction({ type: 'open', path, mode: 'edit' });
                    }}
                  />
                ) : (
                  <p className={styles.state}>No file browsing permission available.</p>
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
        onConfirmDiscardChanges={() => {
          if (!pendingDiscardAction) {
            return;
          }

          const action = pendingDiscardAction;
          setPendingDiscardAction(null);
          void executePreviewAction(action);
        }}
        onCancelDiscardChanges={() => {
          setPendingDiscardAction(null);
        }}
        formatDate={formatDate}
      />

      <SnackbarHost snackbars={browser.snackbars} onDismiss={browser.dismissSnackbar} />
    </main>
  );
};
