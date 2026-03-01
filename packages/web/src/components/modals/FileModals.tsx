import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
  type RefObject,
} from 'react';
import { Maximize2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { Button, Input } from '@web/components/ui';
import { KeyValue } from '@web/components';
import { formatBytes } from '@web/utils/formatBytes';
import type {
  DeleteModalState,
  FilePreviewModalState,
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
  canEditProperties: boolean;
  filePreviewModal: FilePreviewModalState | null;
  showDiscardChangesModal: boolean;
  modalError: string;
  activeModalRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onRenameNextNameChange: (value: string) => void;
  onMoveDestinationPathChange: (value: string) => void;
  onSubmitRename: () => Promise<void> | void;
  onSubmitMove: () => Promise<void> | void;
  onSubmitDelete: () => Promise<void> | void;
  onSubmitPropertiesSave: () => Promise<void> | void;
  onResetPropertiesDraft: () => void;
  onPropertiesFieldChange: (
    field:
      | 'contentType'
      | 'storageClass'
      | 'cacheControl'
      | 'contentDisposition'
      | 'contentEncoding'
      | 'contentLanguage'
      | 'expires',
    value: string
  ) => void;
  onAddPropertiesMetadataRow: () => void;
  onUpdatePropertiesMetadataRow: (id: string, field: 'key' | 'value', value: string) => void;
  onRemovePropertiesMetadataRow: (id: string) => void;
  onFilePreviewTextChange: (value: string) => void;
  onSubmitFilePreviewSave: () => Promise<void> | void;
  onSwitchFilePreviewToEdit: () => void;
  onDownloadFilePreview: (path: string) => Promise<void> | void;
  onConfirmDiscardChanges: () => void;
  onCancelDiscardChanges: () => void;
  formatDate: (value: string | null) => string;
}

const formatMediaTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

interface MediaPreviewPlayerProps {
  mode: 'audio' | 'video';
  mediaUrl: string;
  path: string;
}

const MediaPreviewPlayer = ({ mode, mediaUrl, path }: MediaPreviewPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const volumeId = useId();
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const getMediaElement = useCallback(() => {
    return mode === 'audio' ? audioRef.current : videoRef.current;
  }, [mode]);

  useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setPaused(true);
    setMuted(false);
    setVolume(1);
  }, [mediaUrl, mode]);

  const syncFromMediaElement = useCallback(() => {
    const mediaElement = getMediaElement();
    if (!mediaElement) {
      return;
    }

    setDuration(Number.isFinite(mediaElement.duration) ? mediaElement.duration : 0);
    setCurrentTime(mediaElement.currentTime);
    setPaused(mediaElement.paused);
    setMuted(mediaElement.muted);
    setVolume(mediaElement.volume);
  }, [getMediaElement]);

  const handlePlayToggle = async () => {
    const mediaElement = getMediaElement();
    if (!mediaElement) {
      return;
    }

    if (mediaElement.paused) {
      try {
        await mediaElement.play();
      } catch {
        setPaused(true);
      }
      return;
    }

    mediaElement.pause();
  };

  const handleSeek = (nextTime: number) => {
    const mediaElement = getMediaElement();
    if (!mediaElement) {
      return;
    }

    mediaElement.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleToggleMute = () => {
    const mediaElement = getMediaElement();
    if (!mediaElement) {
      return;
    }

    mediaElement.muted = !mediaElement.muted;
    setMuted(mediaElement.muted);
  };

  const handleVolumeChange = (nextVolume: number) => {
    const mediaElement = getMediaElement();
    if (!mediaElement) {
      return;
    }

    mediaElement.volume = nextVolume;
    mediaElement.muted = nextVolume === 0;
    setVolume(nextVolume);
    setMuted(mediaElement.muted);
  };

  const handleFullscreenToggle = () => {
    if (mode !== 'video') {
      return;
    }

    const mediaElement = videoRef.current;
    if (!mediaElement) {
      return;
    }

    if (document.fullscreenElement === mediaElement) {
      void document.exitFullscreen();
      return;
    }

    void mediaElement.requestFullscreen();
  };

  const hasKnownDuration = duration > 0;
  const seekMax = hasKnownDuration ? duration : 100;
  const seekValue = hasKnownDuration ? Math.min(currentTime, duration) : 0;
  const controlsClassName =
    mode === 'video'
      ? `${styles.filePreviewMediaControls} ${styles.filePreviewMediaControlsOverlay}`
      : styles.filePreviewMediaControls;
  const controls = (
    <div className={controlsClassName}>
      <p className={styles.filePreviewMediaLabel}>{path}</p>
      <div className={styles.filePreviewMediaTimelineRow}>
        <span>{formatMediaTime(currentTime)}</span>
        <input
          className={styles.filePreviewMediaTimeline}
          type="range"
          min={0}
          max={seekMax}
          step={0.1}
          value={seekValue}
          onChange={(event) => handleSeek(Number(event.target.value))}
          disabled={!hasKnownDuration}
          aria-label="Playback position"
        />
        <span>{formatMediaTime(duration)}</span>
      </div>
      <div className={styles.filePreviewMediaControlsRow}>
        <div className={styles.filePreviewMediaControlGroup}>
          <button
            type="button"
            className={styles.filePreviewMediaButton}
            onClick={() => handleSeek(Math.max(0, currentTime - 10))}
            aria-label="Rewind 10 seconds"
            title="Rewind 10 seconds"
          >
            <SkipBack className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.filePreviewMediaButton} ${styles.filePreviewMediaButtonPrimary}`}
            onClick={() => {
              void handlePlayToggle();
            }}
            aria-label={paused ? 'Play media' : 'Pause media'}
            title={paused ? 'Play' : 'Pause'}
          >
            {paused ? (
              <Play className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            ) : (
              <Pause className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={styles.filePreviewMediaButton}
            onClick={() => handleSeek(Math.min(duration, currentTime + 10))}
            aria-label="Forward 10 seconds"
            disabled={!hasKnownDuration}
            title="Forward 10 seconds"
          >
            <SkipForward className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.filePreviewMediaControlGroup}>
          <button
            type="button"
            className={styles.filePreviewMediaButton}
            onClick={handleToggleMute}
            aria-label={muted ? 'Unmute media' : 'Mute media'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? (
              <VolumeX className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            ) : (
              <Volume2 className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            )}
          </button>
          <label className={styles.filePreviewMediaVolume} htmlFor={volumeId}>
            {muted || volume === 0 ? (
              <VolumeX className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            ) : (
              <Volume2 className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            )}
            <input
              id={volumeId}
              className={styles.filePreviewMediaVolumeInput}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => handleVolumeChange(Number(event.target.value))}
              aria-label="Volume"
            />
          </label>
          {mode === 'video' ? (
            <button
              type="button"
              className={styles.filePreviewMediaButton}
              onClick={handleFullscreenToggle}
              aria-label="Toggle fullscreen"
              title="Fullscreen"
            >
              <Maximize2 className={styles.filePreviewMediaButtonIcon} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.filePreviewMediaPlayer}>
      {mode === 'audio' ? (
        <>
          <audio
            ref={audioRef}
            className={`${styles.filePreviewMedia} ${styles.filePreviewMediaAudio}`}
            src={mediaUrl}
            preload="metadata"
            onLoadedMetadata={syncFromMediaElement}
            onTimeUpdate={syncFromMediaElement}
            onPlay={syncFromMediaElement}
            onPause={syncFromMediaElement}
            onVolumeChange={syncFromMediaElement}
            onEnded={syncFromMediaElement}
          >
            Your browser does not support audio playback.
          </audio>
          {controls}
        </>
      ) : (
        <div className={styles.filePreviewMediaFrame}>
          <video
            ref={videoRef}
            className={styles.filePreviewMedia}
            src={mediaUrl}
            preload="metadata"
            playsInline
            onLoadedMetadata={syncFromMediaElement}
            onTimeUpdate={syncFromMediaElement}
            onPlay={syncFromMediaElement}
            onPause={syncFromMediaElement}
            onVolumeChange={syncFromMediaElement}
            onEnded={syncFromMediaElement}
          >
            Your browser does not support video playback.
          </video>
          {controls}
        </div>
      )}
    </div>
  );
};

export const FileModals = ({
  renameModal,
  moveModal,
  deleteModal,
  propertiesModal,
  canEditProperties,
  filePreviewModal,
  showDiscardChangesModal,
  modalError,
  activeModalRef,
  onClose,
  onRenameNextNameChange,
  onMoveDestinationPathChange,
  onSubmitRename,
  onSubmitMove,
  onSubmitDelete,
  onSubmitPropertiesSave,
  onResetPropertiesDraft,
  onPropertiesFieldChange,
  onAddPropertiesMetadataRow,
  onUpdatePropertiesMetadataRow,
  onRemovePropertiesMetadataRow,
  onFilePreviewTextChange,
  onSubmitFilePreviewSave,
  onSwitchFilePreviewToEdit,
  onDownloadFilePreview,
  onConfirmDiscardChanges,
  onCancelDiscardChanges,
  formatDate,
}: FileModalsProps) => {
  const filePreviewLineNumbersRef = useRef<HTMLPreElement>(null);
  const handleOverlayClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const formatPropertySize = (size: number): string => {
    const readable = formatBytes(size);
    if (size < 1024) {
      return readable;
    }

    return `${readable} (${size.toLocaleString()} bytes)`;
  };

  const filePreviewLineCount = useMemo(() => {
    if (!filePreviewModal || filePreviewModal.mode !== 'text') {
      return 0;
    }

    return Math.max(1, filePreviewModal.content.split('\n').length);
  }, [filePreviewModal]);

  const knownContentTypes = [
    'application/octet-stream',
    'application/json',
    'application/pdf',
    'application/xml',
    'text/plain',
    'text/csv',
    'text/html',
    'image/png',
    'image/jpeg',
    'audio/mpeg',
    'video/mp4',
  ];
  const knownStorageClasses = [
    'STANDARD',
    'STANDARD_IA',
    'ONEZONE_IA',
    'INTELLIGENT_TIERING',
    'GLACIER',
    'DEEP_ARCHIVE',
  ];
  const knownContentEncodings = ['identity', 'gzip', 'br', 'deflate'];
  const knownContentLanguages = ['en', 'en-US', 'en-GB', 'de', 'fr', 'es', 'it', 'nl', 'pt-BR'];
  const knownMetadataKeys = [
    'cache-key',
    'checksum',
    'classification',
    'owner',
    'retention',
    'source',
    'uploaded_by',
    'uploaded_at',
  ];

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
      ) : null}

      {moveModal ? (
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
      ) : null}

      {deleteModal ? (
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
          onClick={handleOverlayClick}
        >
          <div className={styles.modalCard} ref={activeModalRef}>
            <h3 id="properties-modal-title">File Properties</h3>
            <p id="properties-modal-description">Path: {propertiesModal.path}</p>
            {propertiesModal.loading ? (
              <p className={`${styles.state} ${styles.loadingState}`}>Loading properties...</p>
            ) : null}
            {propertiesModal.error ? (
              <p className={`${styles.state} ${styles.stateError}`}>{propertiesModal.error}</p>
            ) : null}
            {propertiesModal.details ? (
              <div className={styles.propertiesGrid}>
                <KeyValue label="Name" value={propertiesModal.details.name} />
                <KeyValue label="Key" value={propertiesModal.details.key} />
                <KeyValue label="Size" value={formatPropertySize(propertiesModal.details.size)} />
                <KeyValue
                  label="Last Modified"
                  value={formatDate(propertiesModal.details.lastModified)}
                />
                <KeyValue label="ETag" value={propertiesModal.details.etag ?? '-'} />
                <KeyValue label="Version Id" value={propertiesModal.details.versionId ?? '-'} />
                <KeyValue
                  label="Server-side encryption"
                  value={propertiesModal.details.serverSideEncryption ?? '-'}
                />

                {!canEditProperties ? (
                  <>
                    <KeyValue label="Content Type" value={propertiesModal.details.contentType} />
                    <KeyValue label="Storage Class" value={propertiesModal.details.storageClass} />
                    <KeyValue
                      label="Cache Control"
                      value={propertiesModal.details.cacheControl ?? '-'}
                    />
                    <KeyValue
                      label="Content Disposition"
                      value={propertiesModal.details.contentDisposition ?? '-'}
                    />
                    <KeyValue
                      label="Content Encoding"
                      value={propertiesModal.details.contentEncoding ?? '-'}
                    />
                    <KeyValue
                      label="Content Language"
                      value={propertiesModal.details.contentLanguage ?? '-'}
                    />
                    <KeyValue
                      label="Expires"
                      value={
                        propertiesModal.details.expires
                          ? formatDate(propertiesModal.details.expires)
                          : '-'
                      }
                    />
                  </>
                ) : null}

                {canEditProperties && propertiesModal.draft ? (
                  <div className={styles.propertiesEditor}>
                    <p>Editable fields</p>
                    <label>
                      Content Type
                      <Input
                        value={propertiesModal.draft.contentType}
                        onChange={(event) =>
                          onPropertiesFieldChange('contentType', event.target.value)
                        }
                        list="known-content-types"
                        placeholder="application/octet-stream"
                      />
                    </label>
                    <label>
                      Storage Class
                      <Input
                        value={propertiesModal.draft.storageClass}
                        onChange={(event) =>
                          onPropertiesFieldChange('storageClass', event.target.value)
                        }
                        list="known-storage-classes"
                        placeholder="STANDARD"
                      />
                    </label>
                    <label>
                      Cache Control
                      <Input
                        value={propertiesModal.draft.cacheControl}
                        onChange={(event) =>
                          onPropertiesFieldChange('cacheControl', event.target.value)
                        }
                        placeholder="max-age=3600"
                      />
                    </label>
                    <label>
                      Content Disposition
                      <Input
                        value={propertiesModal.draft.contentDisposition}
                        onChange={(event) =>
                          onPropertiesFieldChange('contentDisposition', event.target.value)
                        }
                        placeholder="inline"
                      />
                    </label>
                    <label>
                      Content Encoding
                      <Input
                        value={propertiesModal.draft.contentEncoding}
                        onChange={(event) =>
                          onPropertiesFieldChange('contentEncoding', event.target.value)
                        }
                        list="known-content-encodings"
                        placeholder="gzip"
                      />
                    </label>
                    <label>
                      Content Language
                      <Input
                        value={propertiesModal.draft.contentLanguage}
                        onChange={(event) =>
                          onPropertiesFieldChange('contentLanguage', event.target.value)
                        }
                        list="known-content-languages"
                        placeholder="en-US"
                      />
                    </label>
                    <label>
                      Expires
                      <Input
                        value={propertiesModal.draft.expires}
                        onChange={(event) => onPropertiesFieldChange('expires', event.target.value)}
                        placeholder="2026-06-30T12:00:00.000Z"
                      />
                    </label>
                  </div>
                ) : null}

                <div className={styles.propertiesMetadata}>
                  <p>Metadata</p>
                  {!canEditProperties &&
                  Object.keys(propertiesModal.details.metadata).length === 0 ? (
                    <code>-</code>
                  ) : (
                    <div className={styles.metadataTable}>
                      {canEditProperties && propertiesModal.draft
                        ? propertiesModal.draft.metadata.map((entry) => (
                            <div key={entry.id} className={styles.metadataEditorRow}>
                              <Input
                                value={entry.key}
                                onChange={(event) =>
                                  onUpdatePropertiesMetadataRow(entry.id, 'key', event.target.value)
                                }
                                list="known-metadata-keys"
                                placeholder="key"
                              />
                              <Input
                                value={entry.value}
                                onChange={(event) =>
                                  onUpdatePropertiesMetadataRow(
                                    entry.id,
                                    'value',
                                    event.target.value
                                  )
                                }
                                placeholder="value"
                              />
                              <Button
                                variant="muted"
                                onClick={() => onRemovePropertiesMetadataRow(entry.id)}
                                aria-label={`Remove metadata ${entry.key || entry.id}`}
                              >
                                Remove
                              </Button>
                            </div>
                          ))
                        : Object.entries(propertiesModal.details.metadata).map(([key, value]) => (
                            <div key={key} className={styles.metadataRow}>
                              <span>{key}</span>
                              <code>{value}</code>
                            </div>
                          ))}
                    </div>
                  )}
                  {canEditProperties ? (
                    <Button variant="muted" onClick={onAddPropertiesMetadataRow}>
                      Add Metadata Field
                    </Button>
                  ) : null}
                </div>

                <datalist id="known-content-types">
                  {knownContentTypes.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
                <datalist id="known-storage-classes">
                  {knownStorageClasses.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
                <datalist id="known-content-encodings">
                  {knownContentEncodings.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
                <datalist id="known-content-languages">
                  {knownContentLanguages.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
                <datalist id="known-metadata-keys">
                  {knownMetadataKeys.map((value) => (
                    <option key={value} value={value} />
                  ))}
                  {Object.keys(propertiesModal.details.metadata).map((value) => (
                    <option key={`existing-${value}`} value={value} />
                  ))}
                </datalist>
              </div>
            ) : null}
            <div className={styles.modalActions}>
              {canEditProperties && propertiesModal.details ? (
                <Button
                  variant="muted"
                  onClick={onResetPropertiesDraft}
                  disabled={!propertiesModal.dirty || propertiesModal.saving}
                >
                  Reset
                </Button>
              ) : null}
              {canEditProperties && propertiesModal.details ? (
                <Button
                  onClick={() => void onSubmitPropertiesSave()}
                  disabled={!propertiesModal.dirty || propertiesModal.saving}
                >
                  {propertiesModal.saving ? 'Saving...' : 'Save'}
                </Button>
              ) : null}
              <Button variant="muted" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {filePreviewModal ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-modal-title"
          aria-describedby="preview-modal-description"
          aria-label="File preview dialog"
          onClick={handleOverlayClick}
        >
          <div
            className={`${styles.modalCard} ${styles.filePreviewModalCard}`}
            ref={activeModalRef}
          >
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
      ) : null}

      {showDiscardChangesModal ? (
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
      ) : null}
    </>
  );
};
