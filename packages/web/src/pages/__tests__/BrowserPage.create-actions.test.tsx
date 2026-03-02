import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ObjectPropertiesResult } from '@server/services/s3/types';
import { BrowserPage } from '@web/pages/BrowserPage';
import {
  createProps,
  getPropertiesQueryMock,
  setupTestEnvironment,
} from './BrowserPage.test-helpers';

vi.mock('@web/trpc/client', () => ({
  trpcProxyClient: {
    s3: {
      getProperties: {
        query: getPropertiesQueryMock,
      },
    },
  },
}));

beforeEach(() => {
  setupTestEnvironment();
});

describe('BrowserPage create actions', () => {
  afterEach(() => {
    cleanup();
  });

  it('creates a file from toolbar using modal input', () => {
    const { props } = createProps();

    render(<BrowserPage {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open actions menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Create File' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'File name' }), {
      target: { value: 'notes.txt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create File' }));

    expect(props.onCreateFile).toHaveBeenCalledWith('notes.txt');
  });

  it('creates a folder from toolbar using modal input', () => {
    const { props } = createProps();

    render(<BrowserPage {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open actions menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Create Folder' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Folder name' }), {
      target: { value: 'assets' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Folder' }));

    expect(props.onCreateFolder).toHaveBeenCalledWith('assets');
  });
});
