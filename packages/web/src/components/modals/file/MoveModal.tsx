import type { MouseEventHandler, RefObject } from 'react';
import { Button, Input } from '@web/components/ui';
import { ModalPortal } from '@web/components/modals/ModalPortal';
import type { MoveModalState } from '@web/hooks';
import styles from '@web/App.module.css';

interface MoveModalProps {
  moveModal: MoveModalState;
  modalError: string;
  activeModalRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onMoveDestinationPathChange: (value: string) => void;
  onSubmitMove: () => Promise<void> | void;
}

export const MoveModal = ({
  moveModal,
  modalError,
  activeModalRef,
  onClose,
  onMoveDestinationPathChange,
  onSubmitMove,
}: MoveModalProps) => {
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
        aria-labelledby="move-modal-title"
        aria-describedby="move-modal-description"
        aria-label="Move item dialog"
        onClick={handleOverlayClick}
      >
        <div className={styles.modalCard} ref={activeModalRef}>
          <h3 id="move-modal-title">Move Item</h3>
          <p id="move-modal-description">Source: {moveModal.sourcePath}</p>
          <label>
            Destination path
            <Input
              value={moveModal.destinationPath}
              onChange={(event) => onMoveDestinationPathChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void onSubmitMove();
                }
              }}
              placeholder="my-bucket/folder"
            />
          </label>
          {modalError ? (
            <p className={`${styles.state} ${styles.stateError}`}>{modalError}</p>
          ) : null}
          <div className={styles.modalActions}>
            <Button variant="muted" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void onSubmitMove()}>Move</Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
