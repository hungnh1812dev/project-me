import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { formatFileSize } from './MediaDetails';
import { MediaInput, type MediaInputFile } from './MediaInput';

const labels = {
  empty: 'No file attached',
  choose: 'Choose from library',
  upload: 'Upload new',
  replace: 'Replace',
  remove: 'Remove',
  delete: 'Delete from library',
  replaceFile: 'Replace file',
  removeFromField: 'Remove from field',
  previewFallback: (name: string) => `Preview of ${name}`,
};

const file: MediaInputFile = {
  id: 'f1',
  fileName: 'portrait.jpg',
  mimeType: 'image/jpeg',
  size: 1536,
  url: 'https://cdn.test/portrait.jpg',
  thumbnailUrl: 'https://cdn.test/portrait-t.jpg',
  alt: null,
  provider: 'cloudinary',
  createdAt: '2026-10-01T10:00:00.000Z',
};

describe('MediaInput', () => {
  it('shows an empty state with only the choose action', () => {
    render(
      <MediaInput
        label="Photo"
        labels={labels}
        value={null}
        onOpenLibrary={() => undefined}
        onRemove={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(screen.getByText('No file attached')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose from library' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove from field' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  });

  it('shows preview, name, size, provider and date', () => {
    render(<MediaInput label="Photo" labels={labels} value={file} />);
    expect(screen.getByRole('img', { name: 'Preview of portrait.jpg' })).toHaveAttribute(
      'src',
      file.thumbnailUrl,
    );
    expect(screen.getByText('portrait.jpg')).toBeInTheDocument();
    expect(screen.getByText('1.5 KB')).toBeInTheDocument();
    expect(screen.getByText('cloudinary')).toBeInTheDocument();
  });

  it('hides the provider badge when unknown and uses alt text for the preview', () => {
    render(
      <MediaInput
        label="Photo"
        labels={labels}
        value={{ ...file, provider: undefined, alt: 'A portrait' }}
      />,
    );
    expect(screen.queryByText('cloudinary')).toBeNull();
    expect(screen.getByRole('img', { name: 'A portrait' })).toBeInTheDocument();
  });

  it('calls each overlay action and the footer delete', async () => {
    const onOpenLibrary = vi.fn<() => void>();
    const onRemove = vi.fn<() => void>();
    const onDelete = vi.fn<() => void>();
    const onReplace = vi.fn<() => void>();
    render(
      <MediaInput
        label="Photo"
        labels={labels}
        value={file}
        onOpenLibrary={onOpenLibrary}
        onRemove={onRemove}
        onDelete={onDelete}
        onReplace={onReplace}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Replace file' }));
    await userEvent.click(screen.getByRole('button', { name: 'Choose from library' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove from field' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete from library' }));
    expect(onReplace).toHaveBeenCalledOnce();
    expect(onOpenLibrary).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('hides an overlay action whose handler is absent', () => {
    render(<MediaInput label="Photo" labels={labels} value={file} onRemove={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Remove from field' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace file' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose from library' })).toBeNull();
  });

  it('falls back to the old labels when the new ones are absent', () => {
    const { replaceFile: _r, removeFromField: _f, ...oldLabels } = labels;
    render(
      <MediaInput
        label="Photo"
        labels={oldLabels}
        value={file}
        onReplace={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('shows the details footer with the file name and short hash', () => {
    render(
      <MediaInput label="Photo" labels={labels} value={{ ...file, sha256: 'abcdef0123456789' }} />,
    );
    expect(screen.getByText('portrait.jpg · abcdef01')).toBeInTheDocument();
  });

  it('empty: Upload calls onUpload and a 300 px area holds both actions', async () => {
    const onUpload = vi.fn<() => void>();
    const onOpenLibrary = vi.fn<() => void>();
    const { container } = render(
      <MediaInput
        label="Photo"
        labels={labels}
        value={null}
        onUpload={onUpload}
        onOpenLibrary={onOpenLibrary}
      />,
    );
    expect(container.querySelector('[data-slot="media-empty"]')).toHaveClass(
      'h-(--size-media-preview)',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Upload new' }));
    await userEvent.click(screen.getByRole('button', { name: 'Choose from library' }));
    expect(onUpload).toHaveBeenCalledOnce();
    expect(onOpenLibrary).toHaveBeenCalledOnce();
  });

  it('keeps the old onFilePick path for Upload and for Replace file', async () => {
    const onFilePick = vi.fn<(file: File) => void>();
    const picked = new File(['x'], 'new.png', { type: 'image/png' });
    const { rerender } = render(
      <MediaInput label="Photo" labels={labels} value={null} onFilePick={onFilePick} />,
    );
    await userEvent.upload(screen.getByTestId('media-file-input'), picked);
    expect(onFilePick).toHaveBeenCalledWith(picked);

    onFilePick.mockClear();
    rerender(<MediaInput label="Photo" labels={labels} value={file} onFilePick={onFilePick} />);
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeInTheDocument();
    await userEvent.upload(screen.getByTestId('media-file-input'), picked);
    expect(onFilePick).toHaveBeenCalledWith(picked);
  });

  it('keeps the deprecated onChange working and prefers onFilePick', async () => {
    const onChange = vi.fn<(file: File) => void>();
    const onFilePick = vi.fn<(file: File) => void>();
    const picked = new File(['x'], 'new.png', { type: 'image/png' });
    const { rerender } = render(
      <MediaInput label="Photo" labels={labels} value={null} onChange={onChange} />,
    );
    await userEvent.upload(screen.getByTestId('media-file-input'), picked);
    expect(onChange).toHaveBeenCalledWith(picked);

    onChange.mockClear();
    rerender(
      <MediaInput
        label="Photo"
        labels={labels}
        value={null}
        onChange={onChange}
        onFilePick={onFilePick}
      />,
    );
    await userEvent.upload(screen.getByTestId('media-file-input'), picked);
    expect(onFilePick).toHaveBeenCalledWith(picked);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables actions and shows the error', () => {
    render(
      <MediaInput
        label="Photo"
        labels={labels}
        value={file}
        disabled
        error="Required"
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Remove from field' })).toBeDisabled();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});

describe('MediaInput group name', () => {
  it('is announced as a group named by the field label', () => {
    render(<MediaInput label="Photo" labels={labels} value={null} />);
    expect(screen.getByRole('group', { name: 'Photo' })).toBeInTheDocument();
  });
});

describe('formatFileSize', () => {
  it('scales units', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB');
  });
});
