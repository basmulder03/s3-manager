import { KeyValue, Panel } from '@web/components';
import styles from '@web/App.module.css';

interface OverviewPageProps {
  app: string;
  version: string;
  env: string;
  authRequired: boolean;
  provider: string;
  authError: boolean;
  user?: {
    name: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
}

export const OverviewPage = ({
  app,
  version,
  env,
  authRequired,
  provider,
  authError,
  user,
}: OverviewPageProps) => {
  return (
    <section className={styles.gridTwo}>
      <Panel title="Server Status" subtitle="From `trpc.health.info` and `trpc.auth.status`">
        <KeyValue label="App" value={app} />
        <KeyValue label="Version" value={version} />
        <KeyValue label="Environment" value={env} />
        <KeyValue label="Auth Required" value={String(authRequired)} />
        <KeyValue label="Provider" value={provider} />
      </Panel>

      <Panel title="Current User" subtitle="From `trpc.auth.me` (protected)">
        {authError ? (
          <p className={`${styles.state} ${styles.stateWarn}`}>
            Not authenticated yet. Use Login to start OIDC flow.
          </p>
        ) : (
          <>
            <KeyValue label="Name" value={user?.name ?? '-'} />
            <KeyValue label="Email" value={user?.email ?? '-'} />
            <KeyValue label="Roles" value={user?.roles?.join(', ') ?? '-'} />
            <KeyValue label="Permissions" value={user?.permissions?.join(', ') ?? '-'} />
          </>
        )}
      </Panel>
    </section>
  );
};
