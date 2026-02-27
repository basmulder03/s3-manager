import { AuthActions } from '@web/components';
import { Button } from '@web/components/ui';
import styles from '@web/App.module.css';

interface FinderHeaderProps {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  authenticated: boolean;
  onAfterRefresh: () => void;
}

export const FinderHeader = ({
  theme,
  setTheme,
  authenticated,
  onAfterRefresh,
}: FinderHeaderProps) => {
  return (
    <header className={styles.hero}>
      <div className={styles.heroTopline}>
        <p className={styles.heroKicker}>S3 MANAGER</p>
        <div className={styles.heroActions}>
          <Button variant="muted" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </Button>
          <AuthActions authenticated={authenticated} onAfterRefresh={onAfterRefresh} />
        </div>
      </div>
      <h1>File Manager</h1>
      <p>Browse and manage your files.</p>
    </header>
  );
};
