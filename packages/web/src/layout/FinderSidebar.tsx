import styles from '@web/App.module.css';

interface FinderSidebarProps {
  provider: string | undefined;
  userEmail: string | undefined;
  selectedPath: string;
  permissions: string[];
}

export const FinderSidebar = ({
  provider,
  userEmail,
  selectedPath,
  permissions,
}: FinderSidebarProps) => {
  return (
    <aside className={styles.finderSidebar} aria-label="Workspace sidebar">
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
