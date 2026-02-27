import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { trpc } from '@web/trpc/client';
import { useUiStore } from '@web/state/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileModals, SignInGate } from '@web/components';
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

export const App = () => {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const selectedPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeVirtualPath(params.get('path') ?? '');
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
  const browse = trpc.s3.browse.useQuery({ virtualPath: selectedPath });
  const createFolder = trpc.s3.createFolder.useMutation();
  const renameItem = trpc.s3.renameItem.useMutation();
  const deleteObject = trpc.s3.deleteObject.useMutation();
  const deleteFolder = trpc.s3.deleteFolder.useMutation();
  const deleteMultipleItems = trpc.s3.deleteMultiple.useMutation();

  const authRequired = authStatus.data?.authRequired ?? true;
  const authenticated = authMe.isSuccess;
  const permissions = authMe.data?.permissions ?? (authRequired ? [] : ['view', 'write', 'delete']);
  const canView = permissions.includes('view');
  const canWrite = permissions.includes('write');
  const canDelete = permissions.includes('delete');
  const showSignInOnly = authRequired && !authenticated;

  const refreshAuthState = () => {
    void authStatus.refetch();
    void authMe.refetch();
  };

  const refreshBrowse = () => {
    void browse.refetch();
  };

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

  if (showSignInOnly) {
    return <SignInGate onAfterRefresh={refreshAuthState} />;
  }

  return (
    <main className={styles.appShell}>
      <FinderHeader
        theme={theme}
        setTheme={setTheme}
        authenticated={authenticated}
        onAfterRefresh={refreshAuthState}
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
                    canWrite={canWrite}
                    canDelete={canDelete}
                    browse={browse}
                    selectedItems={browser.selectedItems}
                    selectedFiles={browser.selectedFiles}
                    folderSizesByPath={browser.folderSizesByPath}
                    folderSizeLoadingPaths={browser.folderSizeLoadingPaths}
                    browserMessage={browser.browserMessage}
                    contextMenu={browser.contextMenu}
                    onBulkDownload={browser.bulkDownload}
                    onBulkDelete={browser.bulkDelete}
                    onClearSelection={browser.clearSelection}
                    onRowClick={browser.handleRowClick}
                    onRowDoubleClick={browser.handleRowDoubleClick}
                    onOpenContextMenu={browser.openContextMenu}
                    onCloseContextMenu={browser.closeContextMenu}
                    onRename={browser.renamePathItem}
                    onMove={browser.movePathItem}
                    onDownload={browser.downloadFile}
                    onCalculateFolderSize={browser.calculateFolderSize}
                    onOpenProperties={browser.openProperties}
                    onDeletePathItems={browser.deletePathItems}
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
        modalError={browser.modalError}
        activeModalRef={browser.activeModalRef}
        onClose={browser.closeModals}
        onRenameNextNameChange={browser.setRenameNextName}
        onMoveDestinationPathChange={browser.setMoveDestinationPath}
        onSubmitRename={browser.submitRename}
        onSubmitMove={browser.submitMove}
        onSubmitDelete={browser.submitDelete}
        formatDate={formatDate}
      />
    </main>
  );
};
