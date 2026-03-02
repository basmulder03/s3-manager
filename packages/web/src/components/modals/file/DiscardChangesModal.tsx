import type { RefObject } from 'react';
import { Button } from '@web/components/ui';
import { ModalPortal } from '@web/components/modals/ModalPortal';
import styles from '@web/App.module.css';

interface DiscardChangesModalProps {
  activeModalRef: RefObject<HTMLDivElement>;
  onConfirmDiscardChanges: () => void;
  onCancelDiscardChanges: () => void;
}

export const DiscardChangesModal = ({
  activeModalRef,
  onConfirmDiscardChanges,
  onCancelDiscardChanges,
}: DiscardChangesModalProps) => {
  return (
    <ModalPortal>
      <div
        className={styles.modalOverlay}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-changes-modal-title"
        aria-describedby="discard-changes-modal-description"
        aria-label="Unsaved changes dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onCancelDiscardChanges();
          }
        }}
      >
        <div className={styles.modalCard} ref={activeModalRef}>
          <h3 id="discard-changes-modal-title">Discard unsaved changes?</h3>
          <p id="discard-changes-modal-description">
            You have unsaved edits. Closing or opening another file will lose those changes.
          </p>
          <div className={styles.modalActions}>
            <Button variant="muted" onClick={onCancelDiscardChanges}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={onConfirmDiscardChanges}>
              Discard changes
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
