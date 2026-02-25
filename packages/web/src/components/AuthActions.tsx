import { API_ORIGIN } from '@web/trpc/client';

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
    <div className="row-actions">
      {!authenticated ? (
        <button type="button" onClick={login}>
          Login
        </button>
      ) : null}

      {authenticated ? (
        <>
          <button type="button" onClick={refreshSession}>
            Refresh Session
          </button>
          <button type="button" onClick={logout}>
            Logout
          </button>
        </>
      ) : null}
    </div>
  );
};
