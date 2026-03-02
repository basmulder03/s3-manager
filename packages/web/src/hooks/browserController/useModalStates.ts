import { useRef, useState } from 'react';
import type {
  DeleteModalState,
  FilePreviewModalState,
  MoveModalState,
  PropertiesModalState,
  RenameModalState,
} from '@web/hooks/browserTypes';

export interface UseModalStatesReturn {
  // State
  renameModal: RenameModalState | null;
  moveModal: MoveModalState | null;
  deleteModal: DeleteModalState | null;
  propertiesModal: PropertiesModalState | null;
  filePreviewModal: FilePreviewModalState | null;
  modalError: string;
  isModalOpen: boolean;
  activeModalRef: React.RefObject<HTMLDivElement>;

  // Setters
  setRenameModal: React.Dispatch<React.SetStateAction<RenameModalState | null>>;
  setMoveModal: React.Dispatch<React.SetStateAction<MoveModalState | null>>;
  setDeleteModal: React.Dispatch<React.SetStateAction<DeleteModalState | null>>;
  setPropertiesModal: React.Dispatch<React.SetStateAction<PropertiesModalState | null>>;
  setFilePreviewModal: React.Dispatch<React.SetStateAction<FilePreviewModalState | null>>;
  setModalError: (error: string) => void;

  // Actions
  closeModals: () => void;
  closeFilePreview: () => void;
}

/**
 * Hook to manage all modal states for the browser controller
 * Handles rename, move, delete, properties, and file preview modals
 */
export const useModalStates = (): UseModalStatesReturn => {
  const [renameModal, setRenameModal] = useState<RenameModalState | null>(null);
  const [moveModal, setMoveModal] = useState<MoveModalState | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);
  const [propertiesModal, setPropertiesModal] = useState<PropertiesModalState | null>(null);
  const [filePreviewModal, setFilePreviewModal] = useState<FilePreviewModalState | null>(null);
  const [modalError, setModalError] = useState('');
  const activeModalRef = useRef<HTMLDivElement>(null);

  const isModalOpen =
    renameModal !== null ||
    moveModal !== null ||
    deleteModal !== null ||
    propertiesModal !== null ||
    filePreviewModal !== null;

  const closeModals = () => {
    setRenameModal(null);
    setMoveModal(null);
    setDeleteModal(null);
    setPropertiesModal(null);
    setFilePreviewModal(null);
    setModalError('');
  };

  const closeFilePreview = () => {
    setFilePreviewModal(null);
  };

  return {
    renameModal,
    moveModal,
    deleteModal,
    propertiesModal,
    filePreviewModal,
    modalError,
    isModalOpen,
    activeModalRef,
    setRenameModal,
    setMoveModal,
    setDeleteModal,
    setPropertiesModal,
    setFilePreviewModal,
    setModalError,
    closeModals,
    closeFilePreview,
  };
};
