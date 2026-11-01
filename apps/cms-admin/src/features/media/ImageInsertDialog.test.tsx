import { COPY } from '@configs/Copy.constants';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ImageInsertDialog, type InsertedImage } from './ImageInsertDialog';
import type { MediaApi, MediaFile } from './Media.api';
import { MediaApiProvider } from './MediaApi.context';

const copy = COPY.media;

const photo = (overrides: Partial<MediaFile> = {}): MediaFile => ({
  id: 'f1',
  fileName: 'photo.png',
  mimeType: 'image/png',
  size: 10,
  width: 1,
  height: 1,
  alt: 'A photo',
  url: 'https://cdn.test/photo.png',
  thumbnailUrl: null,
  isReviewerPreset: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  sha256: 'abcdef0123456789',
  ...overrides,
});

function setup(props: { canUpload?: boolean; canChoose?: boolean; uploaded?: MediaFile } = {}) {
  const list = vi.fn<MediaApi['list']>(() =>
    Promise.resolve({ data: [photo()], meta: { page: 1, pageSize: 20, total: 1 } }),
  );
  const upload = vi.fn<MediaApi['upload']>(() =>
    Promise.resolve(props.uploaded ?? photo({ id: 'f2', alt: null })),
  );
  const onInsert = vi.fn<(image: InsertedImage) => void>();
  const onClose = vi.fn<() => void>();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MediaApiProvider api={{ list, upload } as unknown as MediaApi}>
        <ImageInsertDialog
          open
          onClose={onClose}
          onInsert={onInsert}
          canUpload={props.canUpload ?? true}
          canChoose={props.canChoose ?? true}
        />
      </MediaApiProvider>
    </QueryClientProvider>,
  );
  return { list, upload, onInsert, onClose };
}

describe('ImageInsertDialog', () => {
  it('offers both paths and inserts a library image with url, alt and id', async () => {
    const { onInsert, list, onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: copy.imageInsert.library }));
    await userEvent.click(
      await screen.findByRole('button', { name: copy.picker.select('photo.png') }),
    );
    expect(onInsert).toHaveBeenCalledWith({
      src: 'https://cdn.test/photo.png',
      alt: 'A photo',
      mediaId: 'f1',
    });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'image/*' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('uploads an image and inserts it with an empty alt when it has none', async () => {
    const { onInsert, upload } = setup();
    await userEvent.click(screen.getByRole('button', { name: copy.imageInsert.upload }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByTestId('upload-dialog-input');
    expect(input).toHaveAttribute('accept', expect.not.stringContaining('application/pdf'));
    expect(input).toHaveAttribute('accept', expect.not.stringContaining('video/mp4'));
    await userEvent.upload(input, new File(['x'], 'new.png', { type: 'image/png' }));
    await userEvent.click(within(dialog).getByRole('button', { name: copy.uploadDialog.upload }));
    await within(dialog).findByRole('button', { name: copy.uploadDialog.close });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith({
      src: 'https://cdn.test/photo.png',
      alt: '',
      mediaId: 'f2',
    });
  });

  it('rejects a non-image in the upload path', async () => {
    const { onInsert, upload } = setup();
    await userEvent.click(screen.getByRole('button', { name: copy.imageInsert.upload }));
    const dialog = await screen.findByRole('dialog');
    await userEvent
      .setup({ applyAccept: false })
      .upload(
        within(dialog).getByTestId('upload-dialog-input'),
        new File(['x'], 'doc.pdf', { type: 'application/pdf' }),
      );
    expect(within(dialog).getByRole('button', { name: copy.uploadDialog.upload })).toBeDisabled();
    expect(upload).not.toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('hides the upload path without create permission', () => {
    setup({ canUpload: false });
    expect(screen.queryByRole('button', { name: copy.imageInsert.upload })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.imageInsert.library })).toBeInTheDocument();
  });

  it('hides the library path without read permission', () => {
    setup({ canChoose: false });
    expect(
      screen.queryByRole('button', { name: copy.imageInsert.library }),
    ).not.toBeInTheDocument();
  });
});
