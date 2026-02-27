import { Button } from '@web/components/ui';
import type { SnackbarItem } from '@web/hooks';
import styles from '@web/App.module.css';
import { X } from 'lucide-react';

interface SnackbarHostProps {
  snackbars: SnackbarItem[];
  onDismiss: (id: number) => void;
}

export const SnackbarHost = ({ snackbars, onDismiss }: SnackbarHostProps) => {
  if (snackbars.length === 0) {
    return null;
  }

  return (
    <div className={styles.snackbarHost} aria-live="polite" aria-atomic="true">
      {snackbars.map((snackbar) => (
        <div
          key={snackbar.id}
          className={`${styles.snackbar} ${
            snackbar.tone === 'success'
              ? styles.snackbarSuccess
              : snackbar.tone === 'error'
                ? styles.snackbarError
                : styles.snackbarInfo
          }`}
          role="status"
        >
          <div className={styles.snackbarBody}>
            <span>{snackbar.message}</span>
            {typeof snackbar.progress === 'number' ? (
              <div className={styles.snackbarProgressTrack} aria-hidden>
                <div
                  className={styles.snackbarProgressBar}
                  style={{ width: `${Math.max(0, Math.min(100, snackbar.progress))}%` }}
                />
              </div>
            ) : null}
          </div>
          {snackbar.actionLabel && snackbar.onAction ? (
            <Button
              variant="muted"
              className={styles.snackbarAction}
              onClick={snackbar.onAction}
              aria-label={snackbar.actionLabel}
            >
              {snackbar.actionLabel}
            </Button>
          ) : null}
          <Button
            variant="muted"
            className={styles.snackbarDismiss}
            onClick={() => onDismiss(snackbar.id)}
            aria-label="Dismiss status message"
          >
            <X className={styles.snackbarDismissIcon} aria-hidden="true" />
          </Button>
        </div>
      ))}
    </div>
  );
};
