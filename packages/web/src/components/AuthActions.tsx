import { API_ORIGIN } from '@web/trpc/client';
import { Button } from '@web/components/ui';
import { useI18n } from '@web/i18n';
import styles from '@web/components/AuthActions.module.css';

interface AuthActionsProps {
  authenticated: boolean;
  navigateTo?: (url: string) => void;
  logoutRequest?: (url: string) => Promise<string>;
}

const defaultNavigateTo = (url: string): void => {
  window.location.assign(url);
};

const defaultLogoutRequest = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Logout request failed');
  }

  const payload = (await response.json()) as { logoutUrl?: string };
  if (typeof payload.logoutUrl !== 'string' || payload.logoutUrl.trim().length === 0) {
    throw new Error('Logout URL missing in response');
  }

  return payload.logoutUrl;
};

export const AuthActions = ({
  authenticated,
  navigateTo = defaultNavigateTo,
  logoutRequest = defaultLogoutRequest,
}: AuthActionsProps) => {
  const { t } = useI18n();

  const login = (): void => {
    const returnTo = window.location.pathname + window.location.search;
    navigateTo(`${API_ORIGIN}/auth/login?returnTo=${encodeURIComponent(returnTo || '/')}`);
  };

  const logout = async (): Promise<void> => {
    const returnTo = window.location.pathname + window.location.search;
    const logoutEndpoint = `${API_ORIGIN}/auth/logout?returnTo=${encodeURIComponent(returnTo || '/')}`;

    try {
      const logoutUrl = await logoutRequest(logoutEndpoint);
      navigateTo(logoutUrl);
    } catch {
      navigateTo(returnTo || '/');
    }
  };

  return (
    <div className={styles.actions}>
      {!authenticated ? <Button onClick={login}>{t('auth.login')}</Button> : null}

      {authenticated ? (
        <>
          <Button variant="muted" onClick={logout}>
            {t('auth.logout')}
          </Button>
        </>
      ) : null}
    </div>
  );
};
