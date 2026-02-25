import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UploadPanel } from '@web/components/UploadPanel';

const uploadMock = vi.fn();

vi.mock('@web/trpc/client', () => ({
  trpc: {
    s3: {
      listBuckets: {
        useQuery: () => ({ data: { buckets: [{ name: 'my-bucket', creationDate: null }] } }),
      },
    },
  },
  trpcProxyClient: {},
}));

vi.mock('@server/shared/upload/trpc-adapter', () => ({
  createUploadProceduresFromTrpc: () => ({}),
}));

vi.mock('@server/shared/upload/client', () => ({
  uploadObjectWithCookbook: (...args: unknown[]) => uploadMock(...args),
}));

describe('UploadPanel', () => {
  it('shows validation message when no file is selected', async () => {
    render(<UploadPanel selectedPath="" onUploadComplete={() => {}} />);

    fireEvent.change(screen.getByLabelText('Bucket'), { target: { value: 'my-bucket' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload File' }));

    expect(await screen.findByText('Select a file first')).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
