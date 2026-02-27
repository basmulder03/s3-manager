import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { trpc } from '@web/trpc/client';
import { useUiStore } from '@web/state/ui';
import { useEffect } from 'react';
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

export const App = () => {
  const selectedPath = useUiStore((state) => state.selectedPath);
  const setSelectedPath = useUiStore((state) => state.setSelectedPath);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

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

  const urlPath = searchParams.get('path') ?? '';

  useEffect(() => {
    if (location.pathname !== '/') {
      return;
    }

    if (urlPath !== selectedPath) {
      setSelectedPath(urlPath);
    }
  }, [location.pathname, selectedPath, setSelectedPath, urlPath]);

  useEffect(() => {
    if (location.pathname !== '/') {
      return;
    }

    if (selectedPath === urlPath) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    if (selectedPath) {
      next.set('path', selectedPath);
    } else {
      next.delete('path');
    }

    setSearchParams(next, { replace: true });
  }, [location.pathname, searchParams, selectedPath, setSearchParams, urlPath]);

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
      <div className={styles.heroGlow} />
      <FinderHeader
        theme={theme}
        setTheme={setTheme}
        authenticated={authenticated}
        onAfterRefresh={refreshAuthState}
      />

      <div className={styles.finderWindow}>
        <FinderSidebar
          provider={authStatus.data?.provider}
          userEmail={authMe.data?.email}
          selectedPath={selectedPath}
          permissions={permissions}
        />

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
                    newFolderName={browser.newFolderName}
                    setNewFolderName={browser.setNewFolderName}
                    selectedItems={browser.selectedItems}
                    selectedFiles={browser.selectedFiles}
                    browserMessage={browser.browserMessage}
                    contextMenu={browser.contextMenu}
                    onCreateFolder={browser.createFolderInCurrentPath}
                    onBulkDownload={browser.bulkDownload}
                    onBulkDelete={browser.bulkDelete}
                    onClearSelection={browser.clearSelection}
                    onToggleSelection={browser.toggleSelection}
                    onSetLastSelectedIndex={browser.setLastSelectedIndex}
                    onRowClick={browser.handleRowClick}
                    onOpenContextMenu={browser.openContextMenu}
                    onRename={browser.renamePathItem}
                    onMove={browser.movePathItem}
                    onDownload={browser.downloadFile}
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
