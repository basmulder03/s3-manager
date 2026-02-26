import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Panel } from '@web/components/Panel';
import { KeyValue } from '@web/components/KeyValue';
import { AuthActions } from '@web/components/AuthActions';
import { UploadPanel } from '@web/components/UploadPanel';
import { Button } from '@web/components/ui/Button';
import { Input } from '@web/components/ui/Input';
import { trpc, trpcProxyClient } from '@web/trpc/client';
import { useUiStore } from '@web/state/ui';
import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { BrowseItem } from '@server/services/s3/types';

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
  const [newFolderName, setNewFolderName] = useState('');
  const [browserMessage, setBrowserMessage] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: BrowseItem;
  } | null>(null);
  const location = useLocation();

  const healthInfo = trpc.health.info.useQuery();
  const authStatus = trpc.auth.status.useQuery();
  const authMe = trpc.auth.me.useQuery(undefined, { retry: false });
  const browse = trpc.s3.browse.useQuery({ virtualPath: selectedPath });
  const createFolder = trpc.s3.createFolder.useMutation();
  const renameItem = trpc.s3.renameItem.useMutation();
  const deleteObject = trpc.s3.deleteObject.useMutation();
  const deleteFolder = trpc.s3.deleteFolder.useMutation();

  const authenticated = authMe.isSuccess;

  const refreshAuthState = () => {
    void authStatus.refetch();
    void authMe.refetch();
  };

  const refreshBrowse = () => {
    void browse.refetch();
  };

  useEffect(() => {
    setSelectedItems(new Set());
    setLastSelectedIndex(null);
  }, [selectedPath, browse.data?.path]);

  useEffect(() => {
    const close = () => {
      setContextMenu(null);
    };

    window.addEventListener('click', close);
    return () => {
      window.removeEventListener('click', close);
    };
  }, []);

  const itemsByPath = useMemo(() => {
    const map = new Map<string, BrowseItem>();
    for (const item of browse.data?.items ?? []) {
      map.set(item.path, item);
    }
    return map;
  }, [browse.data?.items]);

  const selectedRecords = useMemo(() => {
    const records: BrowseItem[] = [];
    for (const path of selectedItems) {
      const record = itemsByPath.get(path);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }, [itemsByPath, selectedItems]);

  const selectedFiles = useMemo(() => {
    return selectedRecords.filter((item) => item.type === 'file');
  }, [selectedRecords]);

  const selectedSingleItem = useMemo(() => {
    return selectedRecords.length === 1 ? selectedRecords[0] : null;
  }, [selectedRecords]);

  const toggleSelection = (path: string, checked: boolean) => {
    setSelectedItems((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
    setLastSelectedIndex(null);
  };

  const selectRange = (endIndex: number) => {
    if (!browse.data?.items || lastSelectedIndex === null) {
      return;
    }

    const start = Math.min(lastSelectedIndex, endIndex);
    const end = Math.max(lastSelectedIndex, endIndex);

    setSelectedItems((previous) => {
      const next = new Set(previous);
      for (let index = start; index <= end; index += 1) {
        const item = browse.data?.items[index];
        if (item) {
          next.add(item.path);
        }
      }
      return next;
    });
  };

  const selectOnly = (path: string) => {
    setSelectedItems(new Set([path]));
  };

  const handleRowClick = (item: BrowseItem, index: number, event: MouseEvent<HTMLButtonElement>) => {
    if (event.shiftKey) {
      event.preventDefault();
      selectRange(index);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      setSelectedItems((previous) => {
        const next = new Set(previous);
        if (next.has(item.path)) {
          next.delete(item.path);
        } else {
          next.add(item.path);
        }
        return next;
      });
      setLastSelectedIndex(index);
      return;
    }

    if (item.type === 'directory') {
      setSelectedPath(item.path);
      return;
    }

    selectOnly(item.path);
    setLastSelectedIndex(index);
  };

  const openContextMenu = (item: BrowseItem, event: MouseEvent) => {
    event.preventDefault();
    if (!selectedItems.has(item.path)) {
      selectOnly(item.path);
    }

    const menuWidth = 220;
    const menuHeight = 230;
    const margin = 10;

    const x = Math.min(event.clientX, window.innerWidth - menuWidth - margin);
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - margin);

    setContextMenu({
      x: Math.max(margin, x),
      y: Math.max(margin, y),
      item,
    });
  };

  const splitObjectPath = (path: string): { bucketName: string; objectKey: string } => {
    const [bucketName, ...parts] = path.split('/');
    return {
      bucketName: bucketName ?? '',
      objectKey: parts.join('/'),
    };
  };

  const createFolderInCurrentPath = async () => {
    if (!selectedPath) {
      setBrowserMessage('Navigate to a bucket path before creating folders.');
      return;
    }

    if (!newFolderName.trim()) {
      setBrowserMessage('Folder name is required.');
      return;
    }

    try {
      await createFolder.mutateAsync({
        path: selectedPath,
        folderName: newFolderName.trim(),
      });
      setNewFolderName('');
      setBrowserMessage('Folder created successfully.');
      refreshBrowse();
    } catch {
      setBrowserMessage('Failed to create folder.');
    }
  };

  const downloadFile = async (path: string, silent = false) => {
    try {
      const { bucketName, objectKey } = splitObjectPath(path);
      const metadata = await trpcProxyClient.s3.getObjectMetadata.query({
        bucketName,
        objectKey,
      });

      window.open(metadata.downloadUrl, '_blank', 'noopener,noreferrer');
      if (!silent) {
        setBrowserMessage('Download link opened.');
      }
    } catch {
      if (!silent) {
        setBrowserMessage('Failed to generate download URL.');
      }
    }
  };

  const removeItem = async (path: string, type: 'file' | 'directory', requireConfirm = true): Promise<boolean> => {
    if (requireConfirm) {
      const confirmed = window.confirm(
        type === 'directory'
          ? 'Delete this folder and all nested contents?'
          : 'Delete this file?'
      );

      if (!confirmed) {
        return false;
      }
    }

    try {
      if (type === 'directory') {
        await deleteFolder.mutateAsync({ path });
      } else {
        const { bucketName, objectKey } = splitObjectPath(path);
        await deleteObject.mutateAsync({ bucketName, objectKey });
      }

      setBrowserMessage(type === 'directory' ? 'Folder deleted.' : 'File deleted.');
      refreshBrowse();
      return true;
    } catch {
      setBrowserMessage(type === 'directory' ? 'Failed to delete folder.' : 'Failed to delete file.');
      return false;
    }
  };

  const bulkDelete = async () => {
    if (selectedRecords.length === 0) {
      setBrowserMessage('No items selected.');
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedRecords.length} selected item(s)?`);
    if (!confirmed) {
      return;
    }

    let success = 0;
    for (const item of selectedRecords) {
      const ok = await removeItem(item.path, item.type, false);
      if (ok) {
        success += 1;
      }
    }

    clearSelection();
    setBrowserMessage(`Deleted ${success} of ${selectedRecords.length} selected item(s).`);
    refreshBrowse();
  };

  const bulkDownload = async () => {
    if (selectedRecords.length === 0) {
      setBrowserMessage('No items selected.');
      return;
    }

    const files = selectedRecords.filter((item) => item.type === 'file');
    if (files.length === 0) {
      setBrowserMessage('No files selected. Folders cannot be downloaded.');
      return;
    }

    for (const file of files) {
      await downloadFile(file.path, true);
    }

    setBrowserMessage(`Started download for ${files.length} file(s).`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (location.pathname !== '/browser') {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        const all = new Set((browse.data?.items ?? []).map((item) => item.path));
        setSelectedItems(all);
        return;
      }

      if (event.key === 'Escape') {
        clearSelection();
        setContextMenu(null);
        return;
      }

      if (event.key === 'Delete' && selectedRecords.length > 0) {
        event.preventDefault();
        void bulkDelete();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selectedFiles.length > 0) {
        event.preventDefault();
        void bulkDownload();
        return;
      }

      if (event.key === 'F2' && selectedSingleItem) {
        event.preventDefault();
        void renamePathItem(selectedSingleItem.path, selectedSingleItem.name);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'm' && selectedSingleItem) {
        event.preventDefault();
        void movePathItem(selectedSingleItem.path);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    browse.data?.items,
    location.pathname,
    selectedFiles.length,
    selectedRecords.length,
    selectedSingleItem,
  ]);

  const renamePathItem = async (path: string, currentName: string) => {
    const nextName = window.prompt('Enter new name', currentName);
    if (!nextName || nextName.trim() === '' || nextName.trim() === currentName) {
      return;
    }

    try {
      await renameItem.mutateAsync({
        sourcePath: path,
        newName: nextName.trim(),
      });
      setBrowserMessage('Item renamed successfully.');
      refreshBrowse();
    } catch {
      setBrowserMessage('Failed to rename item.');
    }
  };

  const movePathItem = async (path: string) => {
    const destinationPath = window.prompt('Move to destination path (bucket/folder)', selectedPath || '');
    if (!destinationPath || destinationPath.trim() === '') {
      return;
    }

    try {
      await renameItem.mutateAsync({
        sourcePath: path,
        destinationPath: destinationPath.trim(),
      });
      setBrowserMessage('Item moved successfully.');
      refreshBrowse();
    } catch {
      setBrowserMessage('Failed to move item.');
    }
  };

  return (
    <main className="app-shell">
      <div className="hero-glow" />
      <header className="hero">
        <p className="hero-kicker">S3 MANAGER STAGE 4</p>
        <h1>Frontend baseline with typed tRPC data flow</h1>
        <p>
          React + TypeScript + Vite + Zustand with auth controls, S3 browsing, and cookbook-based uploads.
        </p>
        <nav className="tabs">
          <NavLink to="/overview">Overview</NavLink>
          <NavLink to="/browser">Browser</NavLink>
          <NavLink to="/upload">Upload</NavLink>
        </nav>
      </header>

      <Routes>
        <Route
          path="/overview"
          element={(
            <section className="grid two">
              <Panel title="Server Status" subtitle="From `trpc.health.info` and `trpc.auth.status`">
                <KeyValue label="App" value={healthInfo.data?.app ?? 'Loading...'} />
                <KeyValue label="Version" value={healthInfo.data?.version ?? '-'} />
                <KeyValue label="Environment" value={healthInfo.data?.env ?? '-'} />
                <KeyValue label="Auth Required" value={String(authStatus.data?.authRequired ?? false)} />
                <KeyValue label="Provider" value={authStatus.data?.provider ?? '-'} />
              </Panel>

              <Panel title="Current User" subtitle="From `trpc.auth.me` (protected)">
                <AuthActions authenticated={authenticated} onAfterRefresh={refreshAuthState} />

                {authMe.isError ? (
                  <p className="state warn">Not authenticated yet. Use Login to start OIDC flow.</p>
                ) : (
                  <>
                    <KeyValue label="Name" value={authMe.data?.name ?? '-'} />
                    <KeyValue label="Email" value={authMe.data?.email ?? '-'} />
                    <KeyValue label="Roles" value={authMe.data?.roles?.join(', ') ?? '-'} />
                    <KeyValue label="Permissions" value={authMe.data?.permissions?.join(', ') ?? '-'} />
                  </>
                )}
              </Panel>
            </section>
          )}
        />

        <Route
          path="/browser"
          element={(
            <Panel title="S3 Browser" subtitle="From `trpc.s3.browse`">
              <div className="browser-controls">
                <Input
                  className="path-input"
                  value={selectedPath}
                  onChange={(event) => setSelectedPath(event.target.value)}
                  placeholder="Path example: my-bucket/folder"
                />
                <Button onClick={() => browse.refetch()}>
                  Refresh
                </Button>
                <Button variant="muted" onClick={() => setSelectedPath('')}>
                  Root
                </Button>
                <Input
                  className="folder-input"
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder="New folder name"
                />
                <Button onClick={() => void createFolderInCurrentPath()}>
                  Create Folder
                </Button>
              </div>

              {selectedItems.size > 0 ? (
                <div className="selection-bar">
                  <span>{selectedItems.size} selected</span>
                  <Button
                    variant="muted"
                    onClick={() => void bulkDownload()}
                    disabled={selectedFiles.length === 0}
                    title={selectedFiles.length === 0 ? 'Select at least one file' : 'Download selected files'}
                  >
                    Download Selected
                  </Button>
                  <Button variant="muted" onClick={() => void bulkDelete()}>
                    Delete Selected
                  </Button>
                  <Button variant="muted" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              ) : null}

              {browse.isLoading ? <p className="state">Loading objects...</p> : null}
              {browse.isError ? <p className="state error">Failed to load S3 path data.</p> : null}
              {browserMessage ? <p className="state">{browserMessage}</p> : null}

                {browse.data ? (
                  <>
                  <div className="breadcrumbs">
                    {browse.data.breadcrumbs.map((crumb) => (
                      <Button key={crumb.path || 'home'} onClick={() => setSelectedPath(crumb.path)}>
                        {crumb.name}
                      </Button>
                    ))}
                  </div>
                    <ul className="items">
                      {browse.data.items.map((item, index) => (
                        <li key={`${item.type}:${item.path}`}>
                          <div className="item-row" onContextMenu={(event) => openContextMenu(item, event)}>
                            <label className="row-checkbox">
                              <input
                                type="checkbox"
                                checked={selectedItems.has(item.path)}
                                onChange={(event) => {
                                  toggleSelection(item.path, event.target.checked);
                                  setLastSelectedIndex(index);
                                }}
                              />
                            </label>
                            <Button onClick={(event) => handleRowClick(item, index, event)}>
                              <span className="tag">{item.type}</span>
                              <strong>{item.name}</strong>
                              <span>{item.path}</span>
                            <span>{item.size === null ? '-' : `${item.size} bytes`}</span>
                            <span>{formatDate(item.lastModified)}</span>
                          </Button>
                          <div className="item-actions">
                            <Button variant="muted" onClick={() => void renamePathItem(item.path, item.name)}>
                              Rename
                            </Button>
                            <Button variant="muted" onClick={() => void movePathItem(item.path)}>
                              Move
                            </Button>
                            {item.type === 'file' ? (
                              <Button variant="muted" onClick={() => void downloadFile(item.path)}>
                                Download
                              </Button>
                            ) : null}
                            <Button variant="muted" onClick={() => void removeItem(item.path, item.type)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                    </ul>

                    {contextMenu ? (
                      <div
                        className="context-menu"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <p className="context-group-title">Quick Actions</p>
                        {contextMenu.item.type === 'directory' ? (
                          <Button variant="muted" onClick={() => setSelectedPath(contextMenu.item.path)}>
                            Open
                          </Button>
                        ) : (
                          <Button variant="muted" onClick={() => void downloadFile(contextMenu.item.path)}>
                            Download
                          </Button>
                        )}

                        <p className="context-group-title">Edit</p>
                        <Button variant="muted" onClick={() => void renamePathItem(contextMenu.item.path, contextMenu.item.name)}>
                          Rename
                        </Button>
                        <Button variant="muted" onClick={() => void movePathItem(contextMenu.item.path)}>
                          Move
                        </Button>

                        <p className="context-group-title">Danger</p>
                        <Button variant="muted" onClick={() => void removeItem(contextMenu.item.path, contextMenu.item.type)}>
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : null}
            </Panel>
          )}
        />

        <Route
          path="/upload"
          element={(
            <Panel title="Uploader" subtitle="Uses typed upload cookbook with direct/multipart fallback">
              <UploadPanel selectedPath={selectedPath} onUploadComplete={refreshBrowse} />
            </Panel>
          )}
        />

        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </main>
  );
};
