import { NavLink } from 'react-router-dom';
import { AuthActions } from '@web/components';
import { Button } from '@web/components/ui';
import styles from '@web/App.module.css';

interface FinderHeaderProps {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  authenticated: boolean;
  onAfterRefresh: () => void;
  canView: boolean;
  canWrite: boolean;
}

export const FinderHeader = ({
  theme,
  setTheme,
  authenticated,
  onAfterRefresh,
  canView,
  canWrite,
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
      <h1>Finder-style S3 workspace</h1>
      <p>Browse, manage, and upload objects with permission-aware actions.</p>
      <nav className={styles.tabs} aria-label="Primary">
        <NavLink to="/overview">Overview</NavLink>
        {canView ? <NavLink to="/browser">Browser</NavLink> : null}
        {canWrite ? <NavLink to="/upload">Upload</NavLink> : null}
      </nav>
    </header>
  );
};
