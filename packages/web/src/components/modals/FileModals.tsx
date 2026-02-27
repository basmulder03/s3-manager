import type { RefObject } from 'react';
import { Button, Input } from '@web/components/ui';
import { KeyValue } from '@web/components';
import { formatBytes } from '@web/utils/formatBytes';
import type {
  DeleteModalState,
  MoveModalState,
  PropertiesModalState,
  RenameModalState,
} from '@web/hooks';
import styles from '@web/App.module.css';

interface FileModalsProps {
  renameModal: RenameModalState | null;
  moveModal: MoveModalState | null;
  deleteModal: DeleteModalState | null;
  propertiesModal: PropertiesModalState | null;
  modalError: string;
  activeModalRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onRenameNextNameChange: (value: string) => void;
  onMoveDestinationPathChange: (value: string) => void;
  onSubmitRename: () => Promise<void> | void;
  onSubmitMove: () => Promise<void> | void;
  onSubmitDelete: () => Promise<void> | void;
  formatDate: (value: string | null) => string;
}

export const FileModals = ({
  renameModal,
  moveModal,
  deleteModal,
  propertiesModal,
  modalError,
  activeModalRef,
  onClose,
  onRenameNextNameChange,
  onMoveDestinationPathChange,
  onSubmitRename,
  onSubmitMove,
  onSubmitDelete,
  formatDate,
}: FileModalsProps) => {
  const formatPropertySize = (size: number): string => {
    const readable = formatBytes(size);
    if (size < 1024) {
      return readable;
    }

    return `${readable} (${size.toLocaleString()} bytes)`;
  };

  return (
    <>
      {renameModal ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-modal-title"
          aria-describedby="rename-modal-description"
          aria-label="Rename item dialog"
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
      ) : null}

      {moveModal ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-modal-title"
          aria-describedby="move-modal-description"
          aria-label="Move item dialog"
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
      ) : null}

      {deleteModal ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          aria-describedby="delete-modal-description"
          aria-label="Delete items dialog"
        >
          <div className={styles.modalCard} ref={activeModalRef}>
            <h3 id="delete-modal-title">Confirm Delete</h3>
            <p id="delete-modal-description">
              {deleteModal.items.length === 1
                ? `Delete ${deleteModal.items[0]?.name ?? 'selected item'}?`
                : `Delete ${deleteModal.items.length} selected item(s)?`}
            </p>
            <p className={`${styles.state} ${styles.stateWarn}`}>This action cannot be undone.</p>
            {modalError ? (
              <p className={`${styles.state} ${styles.stateError}`}>{modalError}</p>
            ) : null}
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
      ) : null}

      {propertiesModal ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="properties-modal-title"
          aria-describedby="properties-modal-description"
          aria-label="File properties dialog"
        >
          <div className={styles.modalCard} ref={activeModalRef}>
            <h3 id="properties-modal-title">File Properties</h3>
            <p id="properties-modal-description">Path: {propertiesModal.path}</p>
            {propertiesModal.loading ? <p className={styles.state}>Loading properties...</p> : null}
            {propertiesModal.error ? (
              <p className={`${styles.state} ${styles.stateError}`}>{propertiesModal.error}</p>
            ) : null}
            {propertiesModal.details ? (
              <div className={styles.propertiesGrid}>
                <KeyValue label="Name" value={propertiesModal.details.name} />
                <KeyValue label="Key" value={propertiesModal.details.key} />
                <KeyValue label="Size" value={formatPropertySize(propertiesModal.details.size)} />
                <KeyValue label="Content Type" value={propertiesModal.details.contentType} />
                <KeyValue label="Storage Class" value={propertiesModal.details.storageClass} />
                <KeyValue
                  label="Last Modified"
                  value={formatDate(propertiesModal.details.lastModified)}
                />
                <KeyValue label="ETag" value={propertiesModal.details.etag ?? '-'} />

                <div className={styles.propertiesMetadata}>
                  <p>Metadata</p>
                  {Object.keys(propertiesModal.details.metadata).length === 0 ? (
                    <code>-</code>
                  ) : (
                    <div className={styles.metadataTable}>
                      {Object.entries(propertiesModal.details.metadata).map(([key, value]) => (
                        <div key={key} className={styles.metadataRow}>
                          <span>{key}</span>
                          <code>{value}</code>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            <div className={styles.modalActions}>
              <Button variant="muted" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
