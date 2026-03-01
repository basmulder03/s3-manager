import type { RefObject } from 'react';
import type {
  DeleteModalState,
  FilePreviewModalState,
  MoveModalState,
  PropertiesModalState,
  RenameModalState,
} from '@web/hooks';
import { DeleteModal } from '@web/components/modals/file/DeleteModal';
import { DiscardChangesModal } from '@web/components/modals/file/DiscardChangesModal';
import { FilePreviewModal } from '@web/components/modals/file/FilePreviewModal';
import { MoveModal } from '@web/components/modals/file/MoveModal';
import { PropertiesModal } from '@web/components/modals/file/PropertiesModal';
import { RenameModal } from '@web/components/modals/file/RenameModal';
import type { PropertiesField } from '@web/components/modals/file/types';

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
  onPropertiesFieldChange: (field: PropertiesField, value: string) => void;
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
  return (
    <>
      {renameModal ? (
        <RenameModal
          renameModal={renameModal}
          modalError={modalError}
          activeModalRef={activeModalRef}
          onClose={onClose}
          onRenameNextNameChange={onRenameNextNameChange}
          onSubmitRename={onSubmitRename}
        />
      ) : null}

      {moveModal ? (
        <MoveModal
          moveModal={moveModal}
          modalError={modalError}
          activeModalRef={activeModalRef}
          onClose={onClose}
          onMoveDestinationPathChange={onMoveDestinationPathChange}
          onSubmitMove={onSubmitMove}
        />
      ) : null}

      {deleteModal ? (
        <DeleteModal
          deleteModal={deleteModal}
          modalError={modalError}
          activeModalRef={activeModalRef}
          onClose={onClose}
          onSubmitDelete={onSubmitDelete}
        />
      ) : null}

      {propertiesModal ? (
        <PropertiesModal
          propertiesModal={propertiesModal}
          canEditProperties={canEditProperties}
          activeModalRef={activeModalRef}
          onClose={onClose}
          onSubmitPropertiesSave={onSubmitPropertiesSave}
          onResetPropertiesDraft={onResetPropertiesDraft}
          onPropertiesFieldChange={onPropertiesFieldChange}
          onAddPropertiesMetadataRow={onAddPropertiesMetadataRow}
          onUpdatePropertiesMetadataRow={onUpdatePropertiesMetadataRow}
          onRemovePropertiesMetadataRow={onRemovePropertiesMetadataRow}
          formatDate={formatDate}
        />
      ) : null}

      {filePreviewModal ? (
        <FilePreviewModal
          filePreviewModal={filePreviewModal}
          activeModalRef={activeModalRef}
          onClose={onClose}
          onFilePreviewTextChange={onFilePreviewTextChange}
          onSubmitFilePreviewSave={onSubmitFilePreviewSave}
          onSwitchFilePreviewToEdit={onSwitchFilePreviewToEdit}
          onDownloadFilePreview={onDownloadFilePreview}
        />
      ) : null}

      {showDiscardChangesModal ? (
        <DiscardChangesModal
          activeModalRef={activeModalRef}
          onConfirmDiscardChanges={onConfirmDiscardChanges}
          onCancelDiscardChanges={onCancelDiscardChanges}
        />
      ) : null}
    </>
  );
};
