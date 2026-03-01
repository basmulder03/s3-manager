import { useMemo, useRef, type MouseEventHandler, type RefObject } from 'react';
import { Button } from '@web/components/ui';
import type { FilePreviewModalState } from '@web/hooks';
import { MediaPreviewPlayer } from '@web/components/modals/file/MediaPreviewPlayer';
import { ModalPortal } from '@web/components/modals/ModalPortal';
import styles from '@web/App.module.css';

interface FilePreviewModalProps {
  filePreviewModal: FilePreviewModalState;
  activeModalRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onFilePreviewTextChange: (value: string) => void;
  onSubmitFilePreviewSave: () => Promise<void> | void;
  onSwitchFilePreviewToEdit: () => void;
  onDownloadFilePreview: (path: string) => Promise<void> | void;
}

export const FilePreviewModal = ({
  filePreviewModal,
  activeModalRef,
  onClose,
  onFilePreviewTextChange,
  onSubmitFilePreviewSave,
  onSwitchFilePreviewToEdit,
  onDownloadFilePreview,
}: FilePreviewModalProps) => {
  const filePreviewLineNumbersRef = useRef<HTMLPreElement>(null);

  const handleOverlayClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const filePreviewLineCount = useMemo(() => {
    if (filePreviewModal.mode !== 'text') {
      return 0;
    }

    return Math.max(1, filePreviewModal.content.split('\n').length);
  }, [filePreviewModal]);

  return (
    <ModalPortal>
      <div
        className={styles.modalOverlay}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-modal-title"
        aria-describedby="preview-modal-description"
        aria-label="File preview dialog"
        onClick={handleOverlayClick}
      >
        <div className={`${styles.modalCard} ${styles.filePreviewModalCard}`} ref={activeModalRef}>
          <h3 id="preview-modal-title">
            {filePreviewModal.mode === 'text' && filePreviewModal.editable
              ? 'Edit File'
              : 'View File'}
          </h3>
          <p id="preview-modal-description">Path: {filePreviewModal.path}</p>

          {filePreviewModal.loading ? (
            <p className={`${styles.state} ${styles.loadingState}`}>Loading file...</p>
          ) : null}
          {filePreviewModal.error ? (
            <p className={`${styles.state} ${styles.stateError}`}>{filePreviewModal.error}</p>
          ) : null}

          {!filePreviewModal.loading &&
          !filePreviewModal.error &&
          filePreviewModal.mode === 'text' ? (
            <div className={styles.filePreviewTextLayout}>
              <pre
                className={styles.filePreviewLineNumbers}
                ref={filePreviewLineNumbersRef}
                aria-hidden
              >
                {Array.from({ length: filePreviewLineCount }, (_, index) => `${index + 1}`).join(
                  '\n'
                )}
              </pre>
              <textarea
                className={styles.filePreviewTextarea}
                value={filePreviewModal.content}
                readOnly={!filePreviewModal.editable}
                onChange={(event) => onFilePreviewTextChange(event.target.value)}
                onScroll={(event) => {
                  if (filePreviewLineNumbersRef.current) {
                    filePreviewLineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
                  }
                }}
                spellCheck={false}
                aria-label="Text file content"
              />
            </div>
          ) : null}

          {!filePreviewModal.loading &&
          !filePreviewModal.error &&
          filePreviewModal.mode === 'image' ? (
            <img
              className={styles.filePreviewImage}
              src={filePreviewModal.mediaUrl}
              alt={filePreviewModal.path}
            />
          ) : null}

          {!filePreviewModal.loading &&
          !filePreviewModal.error &&
          filePreviewModal.mode === 'audio' ? (
            <MediaPreviewPlayer
              mode="audio"
              mediaUrl={filePreviewModal.mediaUrl}
              path={filePreviewModal.path}
            />
          ) : null}

          {!filePreviewModal.loading &&
          !filePreviewModal.error &&
          filePreviewModal.mode === 'video' ? (
            <MediaPreviewPlayer
              mode="video"
              mediaUrl={filePreviewModal.mediaUrl}
              path={filePreviewModal.path}
            />
          ) : null}

          <div className={styles.modalActions}>
            <Button variant="muted" onClick={onClose}>
              Close
            </Button>
            {!filePreviewModal.loading ? (
              <Button
                variant="muted"
                onClick={() => void onDownloadFilePreview(filePreviewModal.path)}
              >
                Download
              </Button>
            ) : null}
            {filePreviewModal.mode === 'text' &&
            !filePreviewModal.editable &&
            filePreviewModal.canToggleEdit ? (
              <Button onClick={onSwitchFilePreviewToEdit}>Edit</Button>
            ) : null}
            {filePreviewModal.mode === 'text' && filePreviewModal.editable ? (
              <Button
                onClick={() => void onSubmitFilePreviewSave()}
                disabled={filePreviewModal.loading}
              >
                Save
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
