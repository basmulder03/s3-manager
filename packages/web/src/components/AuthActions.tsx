import { API_ORIGIN } from '@web/trpc/client';
import { Button } from '@web/components/ui';
import styles from '@web/components/AuthActions.module.css';

interface AuthActionsProps {
  authenticated: boolean;
  onAfterRefresh: () => void;
}

const login = (): void => {
  const returnTo = window.location.pathname + window.location.search;
  window.location.href = `${API_ORIGIN}/auth/login?returnTo=${encodeURIComponent(returnTo || '/')}`;
};

const logout = (): void => {
  const returnTo = window.location.pathname + window.location.search;
  window.location.href = `${API_ORIGIN}/auth/logout?returnTo=${encodeURIComponent(returnTo || '/')}`;
};

export const AuthActions = ({ authenticated, onAfterRefresh }: AuthActionsProps) => {
  const refreshSession = async (): Promise<void> => {
    await fetch(`${API_ORIGIN}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    onAfterRefresh();
  };

  return (
    <div className={styles.actions}>
      {!authenticated ? <Button onClick={login}>Login</Button> : null}

      {authenticated ? (
        <>
          <Button onClick={refreshSession}>Refresh Session</Button>
          <Button variant="muted" onClick={logout}>
            Logout
          </Button>
        </>
      ) : null}
    </div>
  );
};
