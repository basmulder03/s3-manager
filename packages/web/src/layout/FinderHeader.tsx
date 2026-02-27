import { AuthActions } from '@web/components';
import { Button } from '@web/components/ui';
import styles from '@web/App.module.css';
import { Menu, Moon, Sun } from 'lucide-react';

interface FinderHeaderProps {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  authenticated: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export const FinderHeader = ({
  theme,
  setTheme,
  authenticated,
  sidebarOpen,
  onToggleSidebar,
}: FinderHeaderProps) => {
  return (
    <header className={styles.hero}>
      <div className={styles.heroTopline}>
        <p className={styles.heroKicker}>S3 MANAGER</p>
        <div className={styles.heroActions}>
          <Button
            variant="muted"
            className={styles.iconToggleButton}
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? 'Hide session panel' : 'Show session panel'}
            title={sidebarOpen ? 'Hide session panel' : 'Show session panel'}
          >
            <Menu className={styles.iconToggleIcon} aria-hidden="true" />
          </Button>
          <Button
            variant="muted"
            className={styles.iconToggleButton}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className={styles.iconToggleIcon} aria-hidden="true" />
            ) : (
              <Moon className={styles.iconToggleIcon} aria-hidden="true" />
            )}
          </Button>
          <AuthActions authenticated={authenticated} />
        </div>
      </div>
      <h1>File Manager</h1>
      <p>Browse and manage your files.</p>
    </header>
  );
};
