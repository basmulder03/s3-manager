import { NavLink } from 'react-router-dom';
import styles from '@web/App.module.css';

interface FinderSidebarProps {
  canView: boolean;
  canWrite: boolean;
  provider: string | undefined;
  userEmail: string | undefined;
  selectedPath: string;
  permissions: string[];
}

export const FinderSidebar = ({
  canView,
  canWrite,
  provider,
  userEmail,
  selectedPath,
  permissions,
}: FinderSidebarProps) => {
  return (
    <aside className={styles.finderSidebar} aria-label="Workspace sidebar">
      <section>
        <p className={styles.finderSidebarTitle}>Favorites</p>
        <nav className={styles.finderNav}>
          <NavLink to="/overview">Overview</NavLink>
          {canView ? <NavLink to="/browser">All Files</NavLink> : null}
          {canWrite ? <NavLink to="/upload">Uploads</NavLink> : null}
        </nav>
      </section>

      <section>
        <p className={styles.finderSidebarTitle}>Session</p>
        <div className={styles.finderMeta}>
          <span>Provider</span>
          <strong>{provider ?? '-'}</strong>
        </div>
        <div className={styles.finderMeta}>
          <span>User</span>
          <strong>{userEmail ?? 'Not signed in'}</strong>
        </div>
        <div className={styles.finderMeta}>
          <span>Path</span>
          <strong>{selectedPath || '/'}</strong>
        </div>
      </section>

      <section>
        <p className={styles.finderSidebarTitle}>Permissions</p>
        <div className={styles.permissionChips}>
          {permissions.length > 0 ? (
            permissions.map((permission) => (
              <span key={permission} className={styles.permissionChip}>
                {permission}
              </span>
            ))
          ) : (
            <span className={`${styles.permissionChip} ${styles.permissionChipEmpty}`}>none</span>
          )}
        </div>
      </section>
    </aside>
  );
};
