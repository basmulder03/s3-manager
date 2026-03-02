import type { MouseEventHandler, RefObject } from 'react';
import { Button, Input } from '@web/components/ui';
import { ModalPortal } from '@web/components/modals/ModalPortal';
import type { RenameModalState } from '@web/hooks';
import styles from '@web/App.module.css';

interface RenameModalProps {
  renameModal: RenameModalState;
  modalError: string;
  activeModalRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onRenameNextNameChange: (value: string) => void;
  onSubmitRename: () => Promise<void> | void;
}

export const RenameModal = ({
  renameModal,
  modalError,
  activeModalRef,
  onClose,
  onRenameNextNameChange,
  onSubmitRename,
}: RenameModalProps) => {
  const handleOverlayClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <ModalPortal>
      <div
        className={styles.modalOverlay}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-modal-title"
        aria-describedby="rename-modal-description"
        aria-label="Rename item dialog"
        onClick={handleOverlayClick}
      >
        <div className={styles.modalCard} ref={activeModalRef}>
          <h3 id="rename-modal-title">Rename Item</h3>
          <p id="rename-modal-description">Current name: {renameModal.currentName}</p>
          <label>
            New name
            <Input
              value={renameModal.nextName}
              onChange={(event) => onRenameNextNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void onSubmitRename();
                }
              }}
              placeholder="Enter new name"
            />
          </label>
          {modalError ? (
            <p className={`${styles.state} ${styles.stateError}`}>{modalError}</p>
          ) : null}
          <div className={styles.modalActions}>
            <Button variant="muted" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void onSubmitRename()}>Save</Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
