import type { CSSProperties } from 'react';
import { Button, Input } from '@web/components/ui';
import { ModalPortal } from '@web/components/modals/ModalPortal';
import styles from '@web/App.module.css';

interface BrowserModalsProps {
  pendingFileUploadFiles: File[];
  setPendingFileUploadFiles: (files: File[]) => void;
  pendingFolderUploadFiles: File[];
  setPendingFolderUploadFiles: (files: File[]) => void;
  onUploadFiles: (files: FileList | File[]) => Promise<void>;
  onUploadFolder: (files: FileList | File[]) => Promise<void>;
  createEntryModal: { kind: 'file' | 'folder'; value: string } | null;
  setCreateEntryModal: (
    modal:
      | { kind: 'file' | 'folder'; value: string }
      | null
      | ((
          prev: { kind: 'file' | 'folder'; value: string } | null
        ) => { kind: 'file' | 'folder'; value: string } | null)
  ) => void;
  createEntryError: string;
  setCreateEntryError: (error: string) => void;
  closeCreateEntryModal: () => void;
  submitCreateEntryModal: () => Promise<void>;
  activeModalRef: React.RefObject<HTMLDivElement>;
  explorerZoomStyle: CSSProperties;
}

export const BrowserModals = ({
  pendingFileUploadFiles,
  setPendingFileUploadFiles,
  pendingFolderUploadFiles,
  setPendingFolderUploadFiles,
  onUploadFiles,
  onUploadFolder,
  createEntryModal,
  setCreateEntryModal,
  createEntryError,
  setCreateEntryError,
  closeCreateEntryModal,
  submitCreateEntryModal,
  activeModalRef,
  explorerZoomStyle,
}: BrowserModalsProps) => {
  return (
    <>
      {pendingFileUploadFiles.length > 0 ? (
        <ModalPortal>
          <div
            className={styles.modalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-upload-modal-title"
            aria-describedby="file-upload-modal-description"
            aria-label="Upload selected files?"
          >
            <div className={styles.modalCard} ref={activeModalRef} style={explorerZoomStyle}>
              <h3 id="file-upload-modal-title">Upload selected files?</h3>
              <p id="file-upload-modal-description">
                Upload {pendingFileUploadFiles.length} selected file(s) to this location.
              </p>
              <div className={styles.modalActions}>
                <Button
                  variant="muted"
                  onClick={() => {
                    setPendingFileUploadFiles([]);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    void onUploadFiles(pendingFileUploadFiles);
                    setPendingFileUploadFiles([]);
                  }}
                >
                  Upload Files
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {pendingFileUploadFiles.length === 0 && pendingFolderUploadFiles.length > 0 ? (
        <ModalPortal>
          <div
            className={styles.modalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-upload-modal-title"
            aria-describedby="folder-upload-modal-description"
            aria-label="Confirm folder upload"
          >
            <div className={styles.modalCard} ref={activeModalRef}>
              <h3 id="folder-upload-modal-title">Upload selected folder?</h3>
              <p id="folder-upload-modal-description">
                Upload {pendingFolderUploadFiles.length} file(s) from the selected folder.
              </p>
              <div className={styles.modalActions}>
                <Button
                  variant="muted"
                  onClick={() => {
                    setPendingFolderUploadFiles([]);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    void onUploadFolder(pendingFolderUploadFiles);
                    setPendingFolderUploadFiles([]);
                  }}
                >
                  Upload Folder
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {createEntryModal ? (
        <ModalPortal>
          <div
            className={styles.modalOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-entry-modal-title"
            aria-describedby="create-entry-modal-description"
            aria-label={createEntryModal.kind === 'file' ? 'Create file' : 'Create folder'}
          >
            <div className={styles.modalCard} ref={activeModalRef}>
              <h3 id="create-entry-modal-title">
                {createEntryModal.kind === 'file' ? 'Create file' : 'Create folder'}
              </h3>
              <p id="create-entry-modal-description">
                {createEntryModal.kind === 'file'
                  ? 'Enter a file name to create an empty object in this location.'
                  : 'Enter a folder name to create a virtual folder in this location.'}
              </p>
              <Input
                autoFocus
                value={createEntryModal.value}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setCreateEntryModal((previous) =>
                    previous ? { ...previous, value: nextValue } : previous
                  );
                  if (createEntryError) {
                    setCreateEntryError('');
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submitCreateEntryModal();
                  }
                }}
                placeholder={createEntryModal.kind === 'file' ? 'notes.txt' : 'assets'}
                aria-label={createEntryModal.kind === 'file' ? 'File name' : 'Folder name'}
              />
              {createEntryError ? <p className={styles.modalError}>{createEntryError}</p> : null}
              <div className={styles.modalActions}>
                <Button variant="muted" onClick={closeCreateEntryModal}>
                  Cancel
                </Button>
                <Button onClick={() => void submitCreateEntryModal()}>
                  {createEntryModal.kind === 'file' ? 'Create File' : 'Create Folder'}
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
};
