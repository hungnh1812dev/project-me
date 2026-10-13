import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileDropzone, type FileDropzoneProps, type FileStatusItem } from './FileDropzone';

const ALLOW = { allowed: true, reason: null };
const DENY = { allowed: false, reason: 'Requires the "media:manager" permission.' } as const;

function setup(props: Partial<FileDropzoneProps> = {}) {
  const onFiles = vi.fn();
  const view = render(
    <FileDropzone
      decision={ALLOW}
      accept="image/png,image/jpeg"
      hint="or drop PNG or JPEG images here"
      onFiles={onFiles}
      items={[]}
      {...props}
    />,
  );
  return { onFiles, user: userEvent.setup({ applyAccept: false }), ...view };
}

const png = (name = 'cat.png') => new File(['x'], name, { type: 'image/png' });
const fileInput = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;

describe('FileDropzone (AC-36, AC-37)', () => {
  it('offers a visible Upload button over a hidden multiple file input with the accept list', () => {
    const { container } = setup();

    expect(screen.getByRole('button', { name: 'Upload' })).toBeVisible();
    const input = fileInput(container);
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg');
    expect(input).toHaveAttribute('multiple');
    expect(input).not.toBeVisible();
    expect(screen.getByText('or drop PNG or JPEG images here')).toBeInTheDocument();
  });

  it('opens the file picker from the button', async () => {
    const { container, user } = setup();
    const click = vi.spyOn(fileInput(container), 'click');

    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(click).toHaveBeenCalledOnce();
  });

  it('hands the chosen files over and clears the input so the same file can be picked again', async () => {
    const { container, onFiles, user } = setup();
    const input = fileInput(container);

    await user.upload(input, [png('a.png'), png('b.png')]);

    expect(onFiles).toHaveBeenCalledOnce();
    expect(onFiles.mock.calls[0]?.[0].map((file: File) => file.name)).toEqual(['a.png', 'b.png']);
    expect(input.value).toBe('');
  });

  it('accepts files dropped on the zone and highlights it while dragging', () => {
    const { onFiles } = setup();
    const zone = screen.getByTestId('file-dropzone');

    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
    expect(zone).toHaveAttribute('data-dragging', 'true');
    fireEvent.dragLeave(zone);
    expect(zone).not.toHaveAttribute('data-dragging');
    fireEvent.drop(zone, { dataTransfer: { files: [png('dropped.png')] } });

    expect(onFiles.mock.calls[0]?.[0].map((file: File) => file.name)).toEqual(['dropped.png']);
  });

  it('ignores an empty selection', () => {
    const { onFiles } = setup();

    fireEvent.drop(screen.getByTestId('file-dropzone'), { dataTransfer: { files: [] } });

    expect(onFiles).not.toHaveBeenCalled();
  });

  it('keeps the button focusable but inert when denied, with the reason (AC-5)', async () => {
    const { container, onFiles, user } = setup({ decision: DENY });
    const button = screen.getByRole('button', { name: 'Upload' });
    const click = vi.spyOn(fileInput(container), 'click');

    await user.click(button);
    fireEvent.drop(screen.getByTestId('file-dropzone'), { dataTransfer: { files: [png()] } });

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(DENY.reason);
    expect(click).not.toHaveBeenCalled();
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('ignores new files while busy', async () => {
    const { container, onFiles, user } = setup({ busy: true });
    const click = vi.spyOn(fileInput(container), 'click');

    await user.click(screen.getByRole('button', { name: /upload/i }));
    fireEvent.drop(screen.getByTestId('file-dropzone'), { dataTransfer: { files: [png()] } });

    expect(click).not.toHaveBeenCalled();
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('lists each file with its status and the failure reason', () => {
    const items: FileStatusItem[] = [
      { key: '1', name: 'a.png', status: 'uploaded' },
      { key: '2', name: 'b.png', status: 'uploading' },
      { key: '3', name: 'c.png', status: 'waiting' },
      { key: '4', name: 'big.png', status: 'failed', error: 'File is too large.' },
    ];
    setup({ items, summary: '1 of 4 files uploaded.' });

    const list = screen.getByRole('list', { name: 'Upload progress' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'a.pngUploaded',
      'b.pngUploading',
      'c.pngWaiting',
      'big.pngFailed: File is too large.',
    ]);
    expect(screen.getByText('1 of 4 files uploaded.')).toBeInTheDocument();
  });

  it('shows no list before the first batch', () => {
    setup();

    expect(screen.queryByRole('list', { name: 'Upload progress' })).not.toBeInTheDocument();
  });
});
