import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { formatFileSize, MediaInput, type MediaInputFile } from './MediaInput';

const labels = {
  empty: 'No file attached',
  choose: 'Choose from library',
  upload: 'Upload new',
  replace: 'Replace',
  remove: 'Remove',
  delete: 'Delete from library',
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
    expect(
      screen.getByRole('button', { name: 'Choose from library' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  });

  it('shows preview, name, size, provider and date', () => {
    render(<MediaInput label="Photo" labels={labels} value={file} />);
    expect(
      screen.getByRole('img', { name: 'Preview of portrait.jpg' }),
    ).toHaveAttribute('src', file.thumbnailUrl);
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

  it('calls the action callbacks', async () => {
    const onOpenLibrary = vi.fn<() => void>();
    const onRemove = vi.fn<() => void>();
    const onDelete = vi.fn<() => void>();
    const onChange = vi.fn<(file: File) => void>();
    render(
      <MediaInput
        label="Photo"
        labels={labels}
        value={file}
        onOpenLibrary={onOpenLibrary}
        onRemove={onRemove}
        onDelete={onDelete}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete from library' }),
    );
    const picked = new File(['x'], 'new.png', { type: 'image/png' });
    await userEvent.upload(screen.getByTestId('media-file-input'), picked);
    expect(onOpenLibrary).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(picked);
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
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
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
