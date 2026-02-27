import { API_ORIGIN } from '@web/trpc/client';
import { Button } from '@web/components/ui';
import styles from '@web/components/AuthActions.module.css';

interface AuthActionsProps {
  authenticated: boolean;
  navigateTo?: (url: string) => void;
}

const defaultNavigateTo = (url: string): void => {
  window.location.assign(url);
};

export const AuthActions = ({
  authenticated,
  navigateTo = defaultNavigateTo,
}: AuthActionsProps) => {
  const login = (): void => {
    const returnTo = window.location.pathname + window.location.search;
    navigateTo(`${API_ORIGIN}/auth/login?returnTo=${encodeURIComponent(returnTo || '/')}`);
  };

  const logout = (): void => {
    const returnTo = window.location.pathname + window.location.search;
    navigateTo(`${API_ORIGIN}/auth/logout?returnTo=${encodeURIComponent(returnTo || '/')}`);
  };

  return (
    <div className={styles.actions}>
      {!authenticated ? <Button onClick={login}>Login</Button> : null}

      {authenticated ? (
        <>
          <Button variant="muted" onClick={logout}>
            Logout
          </Button>
        </>
      ) : null}
    </div>
  );
};
