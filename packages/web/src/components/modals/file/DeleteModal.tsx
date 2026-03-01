import type { MouseEventHandler, RefObject } from 'react';
import { Button } from '@web/components/ui';
import type { DeleteModalState } from '@web/hooks';
import styles from '@web/App.module.css';

interface DeleteModalProps {
  deleteModal: DeleteModalState;
  modalError: string;
  activeModalRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onSubmitDelete: () => Promise<void> | void;
}

export const DeleteModal = ({
  deleteModal,
  modalError,
  activeModalRef,
  onClose,
  onSubmitDelete,
}: DeleteModalProps) => {
  const handleOverlayClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      aria-describedby="delete-modal-description"
      aria-label="Delete items dialog"
      onClick={handleOverlayClick}
    >
      <div className={styles.modalCard} ref={activeModalRef}>
        <h3 id="delete-modal-title">Confirm Delete</h3>
        <p id="delete-modal-description">
          {deleteModal.items.length === 1
            ? `Delete ${deleteModal.items[0]?.name ?? 'selected item'}?`
            : `Delete ${deleteModal.items.length} selected item(s)?`}
        </p>
        <p className={`${styles.state} ${styles.stateWarn}`}>This action cannot be undone.</p>
        {modalError ? <p className={`${styles.state} ${styles.stateError}`}>{modalError}</p> : null}
        <div className={styles.modalActions}>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void onSubmitDelete()}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
};
