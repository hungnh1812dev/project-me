import { COPY } from '@configs/Copy.constants';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MediaApi, MediaFile } from './Media.api';
import { MAX_PARALLEL_UPLOADS } from './Media.constants';
import { MediaApiProvider } from './MediaApi.context';
import { UploadDialog } from './UploadDialog';
import type { SendFile } from './useUploadQueue';

const copy = COPY.media.uploadDialog;
const MIB = 1024 * 1024;

interface Pending {
  file: File;
  signal: AbortSignal;
  onProgress: (sent: number, total: number) => void;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function deferredSend() {
  const pending: Pending[] = [];
  const send: SendFile = (file, onProgress, signal) =>
    new Promise<MediaFile>((resolve, reject) => {
      pending.push({
        file,
        signal,
        onProgress,
        resolve: () => resolve({ id: file.name, fileName: file.name } as MediaFile),
        reject,
      });
    });
  return { send, pending };
}

const png = (name: string, size = 1) => {
  const file = new File(['x'], name, { type: 'image/png' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

function setup(props: Partial<Parameters<typeof UploadDialog>[0]> = {}) {
  const fake = deferredSend();
  const onUploaded = vi.fn<(files: MediaFile[]) => void>();
  const onClose = vi.fn<() => void>();
  render(
    <MediaApiProvider api={{} as MediaApi}>
      <UploadDialog
        mode="many"
        open
        send={fake.send}
        onUploaded={onUploaded}
        onClose={onClose}
        {...props}
      />
    </MediaApiProvider>,
  );
  return { ...fake, onUploaded, onClose };
}

// The picker's accept filter is bypassed so the dialog's own checks are what is tested.
const choose = (files: File[]) =>
  userEvent.setup({ applyAccept: false }).upload(screen.getByTestId('upload-dialog-input'), files);
const uploadButton = () => screen.getByRole('button', { name: /^Upload( \d+ files)?$/ });

const createObjectURL = vi.fn<(source: Blob | MediaSource) => string>(() => 'blob:preview');
const revokeObjectURL = vi.fn<(url: string) => void>();

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

describe('UploadDialog', () => {
  it('lists the chosen files with name, size and type and sends nothing yet', async () => {
    const { pending } = setup();
    await choose([png('a.png', 2048), png('b.png')]);
    const list = screen.getByRole('list', { name: copy.listLabel });
    expect(within(list).getByText('a.png')).toBeInTheDocument();
    expect(within(list).getByText(/2 KB · image\/png/)).toBeInTheDocument();
    expect(within(list).getAllByRole('img')).toHaveLength(2);
    expect(pending).toHaveLength(0);
    expect(uploadButton()).toHaveTextContent(copy.uploadCount(2));
  });

  it('flags rejected files with their reason and leaves them out', async () => {
    const { pending } = setup();
    const pdf = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(pdf, 'size', { value: 21 * MIB });
    await choose([
      png('ok.png'),
      new File(['x'], 'run.exe', { type: 'application/x-msdownload' }),
      pdf,
    ]);
    expect(screen.getByText(copy.rejected['type-not-allowed'])).toBeInTheDocument();
    expect(screen.getByText(copy.rejected['too-large'])).toBeInTheDocument();
    await userEvent.click(uploadButton());
    expect(pending.map((entry) => entry.file.name)).toEqual(['ok.png']);
  });

  it('removes a row before upload', async () => {
    const { pending } = setup();
    await choose([png('a.png'), png('b.png')]);
    await userEvent.click(screen.getByRole('button', { name: copy.removeLabel('a.png') }));
    await userEvent.click(uploadButton());
    expect(pending.map((entry) => entry.file.name)).toEqual(['b.png']);
  });

  it('sends two at a time, shows progress and processing, reports, then closes on Close', async () => {
    const { pending, onUploaded, onClose } = setup();
    await choose([png('a.png', 100), png('b.png', 100), png('c.png', 100)]);
    await userEvent.click(uploadButton());
    expect(pending).toHaveLength(MAX_PARALLEL_UPLOADS);
    act(() => pending[0]?.onProgress(50, 100));
    expect(screen.getByText(copy.status.uploading(50))).toBeInTheDocument();
    act(() => pending[0]?.onProgress(100, 100));
    expect(screen.getByText(copy.status.processing)).toBeInTheDocument();
    await act(() => Promise.resolve(pending[0]?.resolve()));
    expect(pending).toHaveLength(3);
    await act(() => Promise.resolve(pending[1]?.resolve()));
    await act(() => Promise.resolve(pending[2]?.resolve()));
    expect(onUploaded.mock.calls.flatMap((call) => call[0])).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: copy.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('retries only the failed file', async () => {
    const { pending, onUploaded } = setup();
    await choose([png('a.png'), png('b.png')]);
    await userEvent.click(uploadButton());
    await act(() => Promise.resolve(pending[0]?.reject(new Error('boom'))));
    await act(() => Promise.resolve(pending[1]?.resolve()));
    expect(await screen.findByText(copy.someFailed)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Retry / })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: copy.retryLabel('a.png') }));
    expect(pending).toHaveLength(3);
    expect(pending[2]?.file.name).toBe('a.png');
    await act(() => Promise.resolve(pending[2]?.resolve()));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(2));
    expect(onUploaded.mock.calls.map((call) => call[0].length)).toEqual([1, 1]);
  });

  it('asks before closing while uploading, then aborts the unsent files and keeps the done ones', async () => {
    const { pending, onUploaded, onClose } = setup();
    await choose([png('a.png'), png('b.png'), png('c.png')]);
    await userEvent.click(uploadButton());
    await act(() => Promise.resolve(pending[0]?.resolve()));
    await userEvent.click(screen.getByRole('button', { name: copy.cancel }));
    expect(screen.getByText(copy.confirmTitle)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: copy.confirmKeep }));
    expect(screen.queryByText(copy.confirmTitle)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy.cancel }));
    await userEvent.click(screen.getByRole('button', { name: copy.confirmStop }));
    expect(pending[1]?.signal.aborted).toBe(true);
    expect(pending[2]?.signal.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUploaded.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it('closes without asking before anything is sent', async () => {
    const { onClose, pending } = setup();
    await choose([png('a.png')]);
    await userEvent.click(screen.getByRole('button', { name: copy.cancel }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(0);
  });

  it('revokes the preview object URLs when the dialog closes', async () => {
    setup();
    await choose([png('a.png')]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: copy.cancel }));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('takes one file in one mode and honours a narrower accept list', async () => {
    const { pending } = setup({ mode: 'one', accept: ['image/png'] });
    await choose([png('a.png')]);
    expect(screen.queryByTestId('upload-dialog-input')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy.removeLabel('a.png') }));
    await choose([new File(['x'], 'p.jpg', { type: 'image/jpeg' })]);
    expect(screen.getByText(copy.rejected['type-not-allowed'])).toBeInTheDocument();
    expect(pending).toHaveLength(0);
  });
});
