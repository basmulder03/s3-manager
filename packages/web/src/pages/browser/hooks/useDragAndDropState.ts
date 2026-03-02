import { useState } from 'react';

export function useDragAndDropState() {
  const [isUploadDropActive, setIsUploadDropActive] = useState(false);
  const [draggedMovePath, setDraggedMovePath] = useState<string | null>(null);
  const [moveDropTargetPath, setMoveDropTargetPath] = useState<string | null>(null);

  return {
    isUploadDropActive,
    setIsUploadDropActive,
    draggedMovePath,
    setDraggedMovePath,
    moveDropTargetPath,
    setMoveDropTargetPath,
  };
}
