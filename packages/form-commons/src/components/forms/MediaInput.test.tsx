import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MediaSource } from '../../hooks/use-media-source';
import type { MediaFile, MediaValue } from '../../lib/media';
import { MediaInput } from './MediaInput';
import { MediaProvider } from './MediaProvider';

interface Asset {
  key: string;
  name: string;
  url: string;
  size?: number;
}

const CAT: Asset = {
  key: 'cat',
  name: 'cat.png',
  url: 'https://cdn.example.com/cat.png',
  size: 20480,
};
const DOG: Asset = { key: 'dog', name: 'dog.jpg', url: 'https://cdn.example.com/dog.jpg' };

const describeAsset = (asset: Asset): MediaFile => ({
  id: asset.key,
  fileName: asset.name,
  url: asset.url,
  ...(asset.size !== undefined && { width: 640, height: 480, size: asset.size }),
});

const ALLOWED = { allowed: true, reason: null };
const BATCH_ITEM = { key: 'upload-1', name: 'new.png', status: 'uploaded' } as const;

function makeSource(overrides: Partial<MediaSource<Asset>> = {}): MediaSource<Asset> {
  return {
    items: [CAT, DOG],
    describe: describeAsset,
    canBrowse: ALLOWED,
    canUpload: ALLOWED,
    upload: vi.fn(async () => null),
    uploads: [],
    uploading: false,
    accept: 'image/png',
    uploadHint: 'or drop PNG images here',
    ...overrides,
  };
}

interface SetupOptions {
  value?: MediaValue<Asset>;
  source?: MediaSource<Asset>;
  readOnly?: boolean;
  disabled?: boolean;
}

function setup({ value = null, source = makeSource(), readOnly, disabled }: SetupOptions = {}) {
  const onChange = vi.fn();
  const onAnnounce = vi.fn();
  const Harness = () => {
    const [current, setCurrent] = useState<MediaValue<Asset>>(value);
    return (
      <MediaProvider value={source}>
        <MediaInput<Asset>
          value={current}
          onChange={(next) => {
            onChange(next);
            setCurrent(next);
          }}
          onAnnounce={onAnnounce}
          readOnly={readOnly}
          disabled={disabled}
          config={{ label: 'Cover' }}
        />
      </MediaProvider>
    );
  };
  render(<Harness />);
  return { user: userEvent.setup(), onChange, onAnnounce, source };
}

const group = () => screen.getByRole('group', { name: 'Cover' });
const preview = () => group().querySelector('[data-slot="media-preview"]') as HTMLElement;

describe('MediaInput', () => {
  it('throws a clear error outside a MediaProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      render(<MediaInput<Asset> value={null} onChange={() => {}} config={{ label: 'Cover' }} />),
    ).toThrow('MediaInput needs a <MediaProvider> above it.');
  });

  it('shows a chosen asset with its image, name, dimensions and size', () => {
    setup({ value: CAT });

    const img = within(group()).getByRole('img', { name: 'cat.png' });
    expect(img).toHaveAttribute('src', CAT.url);
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveClass('object-contain');
    expect(within(group()).getByText('cat.png')).toHaveAttribute('title', 'cat.png');
    expect(within(group()).getByText('640 × 480')).toBeInTheDocument();
    expect(within(group()).getByText('20 KB')).toBeInTheDocument();
  });

  it('leaves out unknown dimensions and size', () => {
    setup({ value: DOG });

    expect(within(group()).getByText('dog.jpg')).toBeInTheDocument();
    expect(within(group()).queryByText(/×/)).not.toBeInTheDocument();
  });

  it('resolves an id through the library', () => {
    setup({ value: 'dog' });

    expect(within(group()).getByRole('img', { name: 'dog.jpg' })).toBeInTheDocument();
  });

  it('shows "File not found" with the id for an id the library lacks', () => {
    setup({ value: 'gone' });

    expect(preview()).toHaveTextContent('File not found');
    expect(within(preview()).getByText('gone')).toHaveAttribute('title', 'gone');
  });

  it('shows the loading state for an id while the library loads', () => {
    setup({ value: 'cat', source: makeSource({ items: undefined }) });

    expect(preview()).toHaveTextContent('Loading file…');
  });

  it('shows the empty state', () => {
    setup();

    expect(preview()).toHaveTextContent('No file selected.');
    expect(screen.queryByRole('button', { name: 'Remove Cover' })).not.toBeInTheDocument();
  });

  it('shows a placeholder named after the file for a URL the source refuses', () => {
    setup({ value: CAT, source: makeSource({ imageSrc: () => null }) });

    expect(within(group()).getByRole('img', { name: 'cat.png' }).tagName).toBe('DIV');
  });

  it('removes the value, announces it and moves focus to Choose', async () => {
    const { user, onChange, onAnnounce } = setup({ value: CAT });

    await user.click(screen.getByRole('button', { name: 'Remove Cover' }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(onAnnounce).toHaveBeenCalledWith('Cover removed.');
    expect(screen.getByRole('button', { name: 'Choose Cover' })).toHaveFocus();
  });

  it('has no Choose or Remove when read-only', () => {
    setup({ value: CAT, readOnly: true });

    expect(within(group()).queryByRole('button')).not.toBeInTheDocument();
    expect(within(group()).getByText('cat.png')).toBeInTheDocument();
  });

  it('disables Choose and Remove when disabled', () => {
    setup({ value: CAT, disabled: true });

    expect(screen.getByRole('button', { name: 'Remove Cover' })).toBeDisabled();
  });

  it('gates Choose with the browse decision', async () => {
    const { user } = setup({
      value: CAT,
      source: makeSource({ canBrowse: { allowed: false, reason: 'No access.' } }),
    });

    const choose = screen.getByRole('button', { name: 'Choose Cover' });
    expect(choose).toHaveAttribute('aria-disabled', 'true');
    await user.click(choose);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the group by aria-labelledby when given', () => {
    render(
      <MediaProvider value={makeSource()}>
        <span id="cover-label">Cover photo</span>
        <MediaInput<Asset> aria-labelledby="cover-label" value={null} onChange={() => {}} />
      </MediaProvider>,
    );

    expect(screen.getByRole('group', { name: 'Cover photo' })).not.toHaveAttribute('aria-label');
  });
});

describe('MediaPickerDialog', () => {
  it('opens with the current asset checked and confirms another with Select', async () => {
    const { user, onChange, onAnnounce } = setup({ value: CAT });

    await user.click(screen.getByRole('button', { name: 'Choose Cover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose cover' });
    expect(within(dialog).getByRole('radio', { name: 'cat.png' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.click(within(dialog).getByRole('radio', { name: 'dog.jpg' }));
    await user.click(within(dialog).getByRole('button', { name: 'Select' }));

    expect(onChange).toHaveBeenCalledWith(DOG);
    expect(onAnnounce).toHaveBeenCalledWith('Cover set to dog.jpg.');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('confirms the focused card with Enter', async () => {
    const { user, onChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Choose Cover' }));
    const dialog = await screen.findByRole('dialog');
    within(dialog).getByRole('radio', { name: 'dog.jpg' }).focus();
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith(DOG);
  });

  it('filters by file name, says when nothing matches, and Select waits for a choice', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Choose Cover' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Select' })).toBeDisabled();

    await user.type(within(dialog).getByRole('searchbox', { name: 'Search files' }), 'DOG');
    expect(
      within(dialog)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toHaveLength(1);
    expect(within(dialog).getByText('1 file')).toBeInTheDocument();

    await user.type(within(dialog).getByRole('searchbox'), 'zzz');
    expect(within(dialog).getByText('No files match "DOGzzz".')).toBeInTheDocument();
  });

  it.each([
    ['loading', { items: undefined }, () => screen.getByRole('group', { name: 'Loading files' })],
    ['empty', { items: [] }, () => screen.getByText('No files yet.')],
  ])('shows the %s state', async (_name, overrides, find) => {
    const { user } = setup({ source: makeSource(overrides) });

    await user.click(screen.getByRole('button', { name: 'Choose Cover' }));

    expect(find()).toBeInTheDocument();
  });

  it('shows a load error with Retry, and no Retry when forbidden', async () => {
    const refetch = vi.fn();
    const { user } = setup({
      source: makeSource({ items: undefined, error: { message: 'Server down' }, refetch }),
    });

    await user.click(screen.getByRole('button', { name: 'Choose Cover' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Server down');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('says there is no access for a forbidden error', async () => {
    const { user } = setup({
      source: makeSource({ items: undefined, error: { message: 'x', forbidden: true } }),
    });

    await user.click(screen.getByRole('button', { name: 'Choose Cover' }));

    expect(screen.getByRole('alert')).toHaveTextContent("You don't have access to files.");
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('uploads through the source and shows the summary', async () => {
    const NEW: Asset = { key: 'new', name: 'new.png', url: 'https://cdn.example.com/new.png' };
    const upload = vi.fn(async () => ({ added: [NEW], summary: '1 of 1 file uploaded.' }));
    // The dropzone lists the batch, with the summary under it.
    const source = makeSource({ upload, uploads: [BATCH_ITEM] });
    const { user } = setup({ source });
    await user.click(screen.getByRole('button', { name: 'Choose Cover' }));
    const dialog = await screen.findByRole('dialog');
    const file = new File(['x'], 'new.png', { type: 'image/png' });

    await user.upload(dialog.querySelector<HTMLInputElement>('input[type="file"]')!, file);

    expect(upload).toHaveBeenCalledWith([file]);
    expect(await within(dialog).findByText('1 of 1 file uploaded.')).toBeInTheDocument();
  });

  it('shows the message of an upload that throws', async () => {
    const upload = vi.fn(async () => {
      throw new Error('Not allowed.');
    });
    const { user } = setup({ source: makeSource({ upload, uploads: [BATCH_ITEM] }) });
    await user.click(screen.getByRole('button', { name: 'Choose Cover' }));
    const dialog = await screen.findByRole('dialog');

    await user.upload(
      dialog.querySelector<HTMLInputElement>('input[type="file"]')!,
      new File(['x'], 'a.png', { type: 'image/png' }),
    );

    expect(await within(dialog).findByText('Not allowed.')).toBeInTheDocument();
  });
});
