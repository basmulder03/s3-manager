import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { BrowseItem } from '@server/services/s3/types';
import { useBrowserShortcutsEffect } from './useBrowserShortcutsEffect';

interface HarnessProps {
  canWrite?: boolean;
  selectedPath?: string;
  selectedRecords?: BrowseItem[];
  onCopySelection?: () => void;
  onCutSelection?: () => void;
  onPaste?: () => void;
}

const renderHarness = ({
  canWrite = true,
  selectedPath = 'my-bucket/folder',
  selectedRecords = [],
  onCopySelection = vi.fn(),
  onCutSelection = vi.fn(),
  onPaste = vi.fn(),
}: HarnessProps = {}) => {
  const Harness = () => {
    useBrowserShortcutsEffect({
      locationPathname: '/',
      isModalOpen: false,
      browseItems: selectedRecords,
      canDelete: true,
      canWrite,
      selectedRecords,
      selectedRecordsCount: selectedRecords.length,
      selectedFilesCount: selectedRecords.filter((item) => item.type === 'file').length,
      selectedSingleItem: selectedRecords[0] ?? null,
      selectedPath,
      onCloseModals: vi.fn(),
      onClearSelection: vi.fn(),
      onCloseContextMenu: vi.fn(),
      onSelectAll: vi.fn(),
      onBulkDelete: vi.fn(async () => {}),
      onBulkDownload: vi.fn(async () => {}),
      onCopySelection,
      onCutSelection,
      onPaste,
      onRename: vi.fn(),
      onMove: vi.fn(),
    });

    return null;
  };

  render(<Harness />);
  return {
    onCopySelection,
    onCutSelection,
    onPaste,
  };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('useBrowserShortcutsEffect clipboard shortcuts', () => {
  it('copies selected items on Ctrl/Cmd+C', () => {
    const selectedRecords: BrowseItem[] = [
      {
        name: 'alpha.txt',
        path: 'my-bucket/folder/alpha.txt',
        type: 'file',
        size: 12,
        lastModified: null,
      },
    ];

    const { onCopySelection } = renderHarness({ selectedRecords });
    fireShortcut('c');

    expect(onCopySelection).toHaveBeenCalledTimes(1);
  });

  it('cuts selected items on Ctrl/Cmd+X when write is allowed', () => {
    const selectedRecords: BrowseItem[] = [
      {
        name: 'assets',
        path: 'my-bucket/folder/assets',
        type: 'directory',
        size: null,
        lastModified: null,
      },
    ];

    const { onCutSelection } = renderHarness({ selectedRecords, canWrite: true });
    fireShortcut('x');

    expect(onCutSelection).toHaveBeenCalledTimes(1);
  });

  it('pastes on Ctrl/Cmd+V when destination path is available', () => {
    const { onPaste } = renderHarness({ selectedPath: 'archive-bucket/target' });
    fireShortcut('v');

    expect(onPaste).toHaveBeenCalledTimes(1);
  });
});

const fireShortcut = (key: string) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true }));
};
