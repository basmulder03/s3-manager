import type { MouseEventHandler, RefObject } from 'react';
import { KeyValue } from '@web/components';
import { Button, Input } from '@web/components/ui';
import type { PropertiesModalState } from '@web/hooks';
import { formatBytes } from '@web/utils/formatBytes';
import type { PropertiesField } from '@web/components/modals/file/types';
import styles from '@web/App.module.css';

interface PropertiesModalProps {
  propertiesModal: PropertiesModalState;
  canEditProperties: boolean;
  activeModalRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onSubmitPropertiesSave: () => Promise<void> | void;
  onResetPropertiesDraft: () => void;
  onPropertiesFieldChange: (field: PropertiesField, value: string) => void;
  onAddPropertiesMetadataRow: () => void;
  onUpdatePropertiesMetadataRow: (id: string, field: 'key' | 'value', value: string) => void;
  onRemovePropertiesMetadataRow: (id: string) => void;
  formatDate: (value: string | null) => string;
}

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

const formatPropertySize = (size: number): string => {
  const readable = formatBytes(size);
  if (size < 1024) {
    return readable;
  }

  return `${readable} (${size.toLocaleString()} bytes)`;
};

export const PropertiesModal = ({
  propertiesModal,
  canEditProperties,
  activeModalRef,
  onClose,
  onSubmitPropertiesSave,
  onResetPropertiesDraft,
  onPropertiesFieldChange,
  onAddPropertiesMetadataRow,
  onUpdatePropertiesMetadataRow,
  onRemovePropertiesMetadataRow,
  formatDate,
}: PropertiesModalProps) => {
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
                    onChange={(event) => onPropertiesFieldChange('contentType', event.target.value)}
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
              {!canEditProperties && Object.keys(propertiesModal.details.metadata).length === 0 ? (
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
                              onUpdatePropertiesMetadataRow(entry.id, 'value', event.target.value)
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
  );
};
