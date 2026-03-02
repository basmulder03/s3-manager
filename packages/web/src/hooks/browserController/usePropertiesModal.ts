import type { PropertiesModalState } from '@web/hooks/browserTypes';
import { trpcProxyClient } from '@web/trpc/client';
import { parseExpiresAsIso } from './browserPathUtils';

export interface UsePropertiesModalOptions {
  canWrite: boolean;
  canManageProperties: boolean;
  propertiesModal: PropertiesModalState | null;
  setPropertiesModal: (
    state:
      | PropertiesModalState
      | null
      | ((prev: PropertiesModalState | null) => PropertiesModalState | null)
  ) => void;
  enqueueSnackbar: (message: { message: string; tone: 'success' | 'error' | 'info' }) => void;
  closeContextMenu: () => void;
  refreshBrowse: () => void;
}

export interface UsePropertiesModalReturn {
  openProperties: (path: string) => Promise<void>;
  saveProperties: () => Promise<void>;
  setPropertiesField: (
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
  addPropertiesMetadataRow: () => void;
  updatePropertiesMetadataRow: (id: string, field: 'key' | 'value', value: string) => void;
  removePropertiesMetadataRow: (id: string) => void;
  resetPropertiesDraft: () => void;
}

/**
 * Hook to manage the properties modal for file metadata editing
 * Handles loading, editing, and saving file properties and metadata
 */
export const usePropertiesModal = ({
  canWrite,
  canManageProperties,
  propertiesModal,
  setPropertiesModal,
  enqueueSnackbar,
  closeContextMenu,
  refreshBrowse,
}: UsePropertiesModalOptions): UsePropertiesModalReturn => {
  const toMetadataDraftRows = (metadata: Record<string, string>) => {
    return Object.entries(metadata).map(([key, value], index) => ({
      id: `${index}-${key}`,
      key,
      value,
    }));
  };

  const normalizeMetadataRecord = (rows: Array<{ key: string; value: string }>) => {
    const normalized: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim().toLowerCase();
      const value = row.value.trim();
      if (!key || !value) {
        continue;
      }
      normalized[key] = value;
    }
    return normalized;
  };

  const isPropertiesDraftDirty = (
    details: NonNullable<PropertiesModalState['details']>,
    draft: NonNullable<PropertiesModalState['draft']>
  ): boolean => {
    const expiresIso = parseExpiresAsIso(draft.expires);
    const detailsExpiresIso = details.expires ? parseExpiresAsIso(details.expires) : null;
    if ((expiresIso ?? '') !== (detailsExpiresIso ?? '')) {
      return true;
    }

    if (draft.contentType.trim() !== details.contentType) {
      return true;
    }
    if (draft.storageClass.trim() !== details.storageClass) {
      return true;
    }
    if (draft.cacheControl.trim() !== (details.cacheControl ?? '')) {
      return true;
    }
    if (draft.contentDisposition.trim() !== (details.contentDisposition ?? '')) {
      return true;
    }
    if (draft.contentEncoding.trim() !== (details.contentEncoding ?? '')) {
      return true;
    }
    if (draft.contentLanguage.trim() !== (details.contentLanguage ?? '')) {
      return true;
    }

    const draftMetadata = normalizeMetadataRecord(draft.metadata);
    const detailsMetadata = normalizeMetadataRecord(
      Object.entries(details.metadata).map(([key, value]) => ({ key, value }))
    );

    const draftKeys = Object.keys(draftMetadata).sort();
    const detailKeys = Object.keys(detailsMetadata).sort();
    if (draftKeys.length !== detailKeys.length) {
      return true;
    }

    return draftKeys.some((key, index) => {
      const detailKey = detailKeys[index];
      if (!detailKey || key !== detailKey) {
        return true;
      }
      return draftMetadata[key] !== detailsMetadata[key];
    });
  };

  const updatePropertiesDraft = (
    updater: (
      draft: NonNullable<PropertiesModalState['draft']>
    ) => NonNullable<PropertiesModalState['draft']>
  ) => {
    setPropertiesModal((previous) => {
      if (!previous || !previous.details || !previous.draft) {
        return previous;
      }

      const nextDraft = updater(previous.draft);
      return {
        ...previous,
        error: '',
        draft: nextDraft,
        dirty: isPropertiesDraftDirty(previous.details, nextDraft),
      };
    });
  };

  const openProperties = async (path: string) => {
    closeContextMenu();
    setPropertiesModal({
      path,
      loading: true,
      saving: false,
      error: '',
      dirty: false,
      details: null,
      draft: null,
    });

    try {
      const details = await trpcProxyClient.s3.getProperties.query({ path });
      setPropertiesModal({
        path,
        loading: false,
        saving: false,
        error: '',
        dirty: false,
        details,
        draft: {
          contentType: details.contentType,
          storageClass: details.storageClass,
          cacheControl: details.cacheControl ?? '',
          contentDisposition: details.contentDisposition ?? '',
          contentEncoding: details.contentEncoding ?? '',
          contentLanguage: details.contentLanguage ?? '',
          expires: details.expires ?? '',
          metadata: toMetadataDraftRows(details.metadata),
        },
      });
    } catch {
      setPropertiesModal({
        path,
        loading: false,
        saving: false,
        error: 'Failed to load file properties.',
        dirty: false,
        details: null,
        draft: null,
      });
    }
  };

  const saveProperties = async () => {
    if (!canWrite || !canManageProperties) {
      enqueueSnackbar({
        message: 'You need both write and manage_properties permissions to edit file properties.',
        tone: 'error',
      });
      return;
    }

    if (
      !propertiesModal ||
      !propertiesModal.details ||
      !propertiesModal.draft ||
      !propertiesModal.dirty
    ) {
      return;
    }

    const normalizedMetadata = normalizeMetadataRecord(propertiesModal.draft.metadata);
    const metadataKeys = propertiesModal.draft.metadata
      .map((entry) => entry.key.trim().toLowerCase())
      .filter((key) => key.length > 0);
    const duplicateOrEmptyKey = new Set(metadataKeys).size !== metadataKeys.length;

    if (duplicateOrEmptyKey) {
      setPropertiesModal((previous) =>
        previous ? { ...previous, error: 'Duplicate metadata keys are not allowed.' } : previous
      );
      return;
    }

    const hasKeyWithoutValue = propertiesModal.draft.metadata.some(
      (entry) => entry.key.trim().length > 0 && entry.value.trim().length === 0
    );
    if (hasKeyWithoutValue) {
      setPropertiesModal((previous) =>
        previous
          ? { ...previous, error: 'Metadata values are required for each metadata key.' }
          : previous
      );
      return;
    }

    const hasValueWithoutKey = propertiesModal.draft.metadata.some(
      (entry) => entry.key.trim().length === 0 && entry.value.trim().length > 0
    );
    if (hasValueWithoutKey) {
      setPropertiesModal((previous) =>
        previous
          ? { ...previous, error: 'Metadata keys are required for each metadata value.' }
          : previous
      );
      return;
    }

    const expiresInput = propertiesModal.draft.expires.trim();
    const parsedExpires = expiresInput ? new Date(expiresInput) : null;
    if (expiresInput && (!parsedExpires || Number.isNaN(parsedExpires.getTime()))) {
      setPropertiesModal((previous) =>
        previous ? { ...previous, error: 'Expires must be a valid date/time.' } : previous
      );
      return;
    }

    setPropertiesModal((previous) =>
      previous
        ? {
            ...previous,
            saving: true,
            error: '',
          }
        : previous
    );

    try {
      const result = await trpcProxyClient.s3.updateProperties.mutate({
        path: propertiesModal.path,
        contentType: propertiesModal.draft.contentType.trim(),
        storageClass: propertiesModal.draft.storageClass.trim(),
        cacheControl: propertiesModal.draft.cacheControl.trim() || null,
        contentDisposition: propertiesModal.draft.contentDisposition.trim() || null,
        contentEncoding: propertiesModal.draft.contentEncoding.trim() || null,
        contentLanguage: propertiesModal.draft.contentLanguage.trim() || null,
        expires: expiresInput ? parsedExpires!.toISOString() : null,
        metadata: normalizedMetadata,
      });

      setPropertiesModal((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          saving: false,
          dirty: false,
          details: result,
          draft: {
            contentType: result.contentType,
            storageClass: result.storageClass,
            cacheControl: result.cacheControl ?? '',
            contentDisposition: result.contentDisposition ?? '',
            contentEncoding: result.contentEncoding ?? '',
            contentLanguage: result.contentLanguage ?? '',
            expires: result.expires ?? '',
            metadata: toMetadataDraftRows(result.metadata),
          },
          error: '',
        };
      });
      enqueueSnackbar({ message: 'File properties updated.', tone: 'success' });
      refreshBrowse();
    } catch (error) {
      setPropertiesModal((previous) =>
        previous
          ? {
              ...previous,
              saving: false,
              error: error instanceof Error ? error.message : 'Failed to save file properties.',
            }
          : previous
      );
    }
  };

  const setPropertiesField = (
    field:
      | 'contentType'
      | 'storageClass'
      | 'cacheControl'
      | 'contentDisposition'
      | 'contentEncoding'
      | 'contentLanguage'
      | 'expires',
    value: string
  ) => {
    updatePropertiesDraft((draft) => ({
      ...draft,
      [field]: value,
    }));
  };

  const addPropertiesMetadataRow = () => {
    updatePropertiesDraft((draft) => ({
      ...draft,
      metadata: [
        ...draft.metadata,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          key: '',
          value: '',
        },
      ],
    }));
  };

  const updatePropertiesMetadataRow = (id: string, field: 'key' | 'value', value: string) => {
    updatePropertiesDraft((draft) => ({
      ...draft,
      metadata: draft.metadata.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry
      ),
    }));
  };

  const removePropertiesMetadataRow = (id: string) => {
    updatePropertiesDraft((draft) => ({
      ...draft,
      metadata: draft.metadata.filter((entry) => entry.id !== id),
    }));
  };

  const resetPropertiesDraft = () => {
    setPropertiesModal((previous) => {
      if (!previous || !previous.details) {
        return previous;
      }

      const details = previous.details;
      return {
        ...previous,
        error: '',
        saving: false,
        dirty: false,
        draft: {
          contentType: details.contentType,
          storageClass: details.storageClass,
          cacheControl: details.cacheControl ?? '',
          contentDisposition: details.contentDisposition ?? '',
          contentEncoding: details.contentEncoding ?? '',
          contentLanguage: details.contentLanguage ?? '',
          expires: details.expires ?? '',
          metadata: toMetadataDraftRows(details.metadata),
        },
      };
    });
  };

  return {
    openProperties,
    saveProperties,
    setPropertiesField,
    addPropertiesMetadataRow,
    updatePropertiesMetadataRow,
    removePropertiesMetadataRow,
    resetPropertiesDraft,
  };
};
