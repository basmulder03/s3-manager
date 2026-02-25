import { Panel } from '@web/components/Panel';
import { KeyValue } from '@web/components/KeyValue';
import { trpc } from '@web/trpc/client';
import { useUiStore } from '@web/state/ui';

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

  const healthInfo = trpc.health.info.useQuery();
  const authStatus = trpc.auth.status.useQuery();
  const authMe = trpc.auth.me.useQuery(undefined, { retry: false });
  const browse = trpc.s3.browse.useQuery({ virtualPath: selectedPath });

  return (
    <main className="app-shell">
      <div className="hero-glow" />
      <header className="hero">
        <p className="hero-kicker">S3 MANAGER STAGE 4</p>
        <h1>Frontend baseline with typed tRPC data flow</h1>
        <p>
          React + TypeScript + Vite + Zustand with a first-pass operations surface for health, auth, and S3
          browsing.
        </p>
      </header>

      <section className="grid two">
        <Panel title="Server Status" subtitle="From `trpc.health.info` and `trpc.auth.status`">
          <KeyValue label="App" value={healthInfo.data?.app ?? 'Loading...'} />
          <KeyValue label="Version" value={healthInfo.data?.version ?? '-'} />
          <KeyValue label="Environment" value={healthInfo.data?.env ?? '-'} />
          <KeyValue label="Auth Required" value={String(authStatus.data?.authRequired ?? false)} />
          <KeyValue label="Provider" value={authStatus.data?.provider ?? '-'} />
        </Panel>

        <Panel title="Current User" subtitle="From `trpc.auth.me` (protected)">
          {authMe.isError ? (
            <p className="state warn">Not authenticated yet. Use `/auth/login` to start OIDC flow.</p>
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

      <Panel title="S3 Browser" subtitle="From `trpc.s3.browse`">
        <div className="browser-controls">
          <input
            className="path-input"
            value={selectedPath}
            onChange={(event) => setSelectedPath(event.target.value)}
            placeholder="Path example: my-bucket/folder"
          />
          <button type="button" onClick={() => browse.refetch()}>
            Refresh
          </button>
          <button type="button" onClick={() => setSelectedPath('')}>
            Root
          </button>
        </div>

        {browse.isLoading ? <p className="state">Loading objects...</p> : null}
        {browse.isError ? <p className="state error">Failed to load S3 path data.</p> : null}

        {browse.data ? (
          <>
            <div className="breadcrumbs">
              {browse.data.breadcrumbs.map((crumb) => (
                <button key={crumb.path || 'home'} type="button" onClick={() => setSelectedPath(crumb.path)}>
                  {crumb.name}
                </button>
              ))}
            </div>
            <ul className="items">
              {browse.data.items.map((item) => (
                <li key={`${item.type}:${item.path}`}>
                  <button type="button" onClick={() => item.type === 'directory' && setSelectedPath(item.path)}>
                    <span className="tag">{item.type}</span>
                    <strong>{item.name}</strong>
                    <span>{item.path}</span>
                    <span>{item.size === null ? '-' : `${item.size} bytes`}</span>
                    <span>{formatDate(item.lastModified)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Panel>
    </main>
  );
};
