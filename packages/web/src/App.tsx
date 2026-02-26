import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Panel } from '@web/components/Panel';
import { KeyValue } from '@web/components/KeyValue';
import { AuthActions } from '@web/components/AuthActions';
import { UploadPanel } from '@web/components/UploadPanel';
import { Button } from '@web/components/ui/Button';
import { Input } from '@web/components/ui/Input';
import { trpc, trpcProxyClient } from '@web/trpc/client';
import { useUiStore } from '@web/state/ui';
import { useState } from 'react';

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

  const downloadFile = async (path: string) => {
    try {
      const { bucketName, objectKey } = splitObjectPath(path);
      const metadata = await trpcProxyClient.s3.getObjectMetadata.query({
        bucketName,
        objectKey,
      });

      window.open(metadata.downloadUrl, '_blank', 'noopener,noreferrer');
      setBrowserMessage('Download link opened.');
    } catch {
      setBrowserMessage('Failed to generate download URL.');
    }
  };

  const removeItem = async (path: string, type: 'file' | 'directory') => {
    const confirmed = window.confirm(
      type === 'directory'
        ? 'Delete this folder and all nested contents?'
        : 'Delete this file?'
    );

    if (!confirmed) {
      return;
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
    } catch {
      setBrowserMessage(type === 'directory' ? 'Failed to delete folder.' : 'Failed to delete file.');
    }
  };

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
                    {browse.data.items.map((item) => (
                      <li key={`${item.type}:${item.path}`}>
                        <div className="item-row">
                          <Button onClick={() => item.type === 'directory' && setSelectedPath(item.path)}>
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
