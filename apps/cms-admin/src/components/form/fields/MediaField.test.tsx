import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentData, FieldDefinition } from '@/features/content/types';
import type { MediaAsset } from '@/features/settings/types';
import { makeMediaAsset, makeMeUser, makeRole } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { listMediaHandler, uploadMediaHandler } from '@/test/msw/settingsHandlers';
import { uploadFile, useNodeFormData } from '@/test/nodeMultipart';
import { renderWithProviders } from '@/test/renderWithProviders';

import { SchemaForm } from '../SchemaForm';

const CAT = makeMediaAsset({ documentId: 'media-cat', fileName: 'cat.png', size: 20480 });
const DOG = makeMediaAsset({
  documentId: 'media-dog',
  fileName: 'dog.jpg',
  mimeType: 'image/jpeg',
  size: 1258291,
});
const FIELDS: FieldDefinition[] = [{ name: 'coverImage', type: 'media' }];

const MANAGER = ['media:read', 'media:manager'];

function mockMedia(assets: MediaAsset[] = [DOG, CAT]) {
  const store = { assets };
  const m1 = listMediaHandler(() => HttpResponse.json(store.assets));
  server.use(m1.handler);
  return { store, m1 };
}

function renderForm(
  document: DocumentData | null,
  { permissions = MANAGER, readOnly = false } = {},
) {
  const onSubmit = vi.fn(async (data: DocumentData) => data);
  const view = renderWithProviders(
    <>
      <SchemaForm
        id="doc-form"
        fields={FIELDS}
        document={document}
        onSubmit={onSubmit}
        readOnly={readOnly}
      />
      <button type="submit" form="doc-form">
        Save
      </button>
    </>,
    {
      auth: { status: 'authenticated', user: makeMeUser({ role: makeRole({ permissions }) }) },
    },
  );
  return { ...view, onSubmit };
}

const field = () => screen.getByRole('group', { name: 'Cover image' });
const save = async (view: ReturnType<typeof renderForm>) => {
  await view.user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(view.onSubmit).toHaveBeenCalled());
  return (view.onSubmit.mock.calls.at(-1)?.[0] as DocumentData | undefined)?.coverImage;
};

describe('MediaField (AC-13)', () => {
  it('shows the current asset with its image, name, dimensions and size', async () => {
    mockMedia();
    renderForm({ coverImage: DOG });

    const group = field();
    expect(within(group).getByRole('img', { name: 'dog.jpg' })).toBeInTheDocument();
    expect(within(group).getByText('dog.jpg')).toHaveAttribute('title', 'dog.jpg');
    expect(within(group).getByText('640 × 480')).toBeInTheDocument();
    expect(within(group).getByText('1.2 MB')).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Choose Cover image' })).toBeEnabled();
    expect(within(group).getByRole('button', { name: 'Remove Cover image' })).toBeEnabled();
  });

  it('resolves a documentId through the media list and saves the full asset', async () => {
    mockMedia();
    const view = renderForm({ coverImage: 'media-cat' });

    expect(await within(field()).findByText('cat.png')).toBeInTheDocument();
    expect(await save(view)).toEqual(CAT);
  });

  it('shows "File not found" for an unknown documentId and sends it back unchanged', async () => {
    mockMedia();
    const view = renderForm({ coverImage: 'media-gone' });

    expect(await within(field()).findByText('File not found')).toBeInTheDocument();
    expect(within(field()).getByRole('button', { name: 'Remove Cover image' })).toBeInTheDocument();
    expect(await save(view)).toBe('media-gone');
  });

  it('removes the value, announces it and moves focus to Choose', async () => {
    mockMedia();
    const view = renderForm({ coverImage: CAT });

    await view.user.click(screen.getByRole('button', { name: 'Remove Cover image' }));

    expect(within(field()).getByText('No file selected.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Cover image' })).toHaveFocus();
    expect(screen.getByText('Cover image removed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Cover image' })).not.toBeInTheDocument();
    expect(await save(view)).toBeNull();
  });

  it('gates Choose without media:read, keeps the value visible and loads no list', async () => {
    const { m1 } = mockMedia();
    renderForm({ coverImage: CAT }, { permissions: [] });

    const choose = within(field()).getByRole('button', { name: 'Choose Cover image' });
    expect(choose).toHaveAttribute('aria-disabled', 'true');
    expect(choose).toHaveAccessibleDescription(/media:read/);
    expect(within(field()).getByText('cat.png')).toBeInTheDocument();
    expect(m1.requests).toHaveLength(0);
  });

  it('shows "File not found" for an id when the list cannot be read', () => {
    mockMedia();
    renderForm({ coverImage: 'media-cat' }, { permissions: [] });

    expect(within(field()).getByText('File not found')).toBeInTheDocument();
  });

  it('has no Choose or Remove in read-only mode', () => {
    mockMedia();
    renderForm({ coverImage: CAT }, { readOnly: true });

    expect(within(field()).getByText('cat.png')).toBeInTheDocument();
    expect(within(field()).queryByRole('button')).not.toBeInTheDocument();
  });
});

const preview = () => field().querySelector<HTMLElement>('[data-slot="media-preview"]')!;

describe('MediaField preview (AC-28 to AC-30)', () => {
  it('is a full-width box at least 320px tall on a muted background, kept before the image loads', () => {
    mockMedia();
    renderForm({ coverImage: DOG });

    expect(preview()).toHaveClass('w-full', 'h-80', 'bg-muted', 'items-center', 'justify-center');
  });

  it('shows the full url with object-contain, lazily and with no referrer', () => {
    mockMedia();
    renderForm({ coverImage: DOG });
    const img = within(preview()).getByRole('img', { name: 'dog.jpg' });

    expect(img).toHaveAttribute('src', DOG.url);
    expect(img).toHaveClass('object-contain');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('shows the placeholder named after the file for a url that is not allowlisted', () => {
    mockMedia();
    const evil = makeMediaAsset({ fileName: 'evil.png', url: 'javascript:alert(1)' });
    renderForm({ coverImage: evil });

    expect(within(preview()).getByRole('img', { name: 'evil.png' }).tagName).toBe('DIV');
    expect(preview().querySelector('img')).toBeNull();
  });

  it('shows the loading state inside the same box', () => {
    mockMedia();
    renderForm({ coverImage: 'media-cat' });

    expect(preview()).toHaveClass('h-80');
    expect(within(preview()).getByText('Loading file…')).toBeInTheDocument();
  });

  it('shows the empty state inside the same box', () => {
    mockMedia();
    renderForm(null);

    expect(preview()).toHaveClass('h-80');
    expect(within(preview()).getByText('No file selected.')).toBeInTheDocument();
  });

  it('shows the missing state with the id inside the same box', async () => {
    mockMedia();
    renderForm({ coverImage: 'media-gone' });

    expect(await within(preview()).findByText('File not found')).toBeInTheDocument();
    expect(within(preview()).getByText('media-gone')).toHaveAttribute('title', 'media-gone');
  });
});

const tooltip = () => document.querySelector('[data-slot="tooltip-content"]');

describe('MediaField actions (AC-31)', () => {
  it('renders Choose and Remove as icon buttons with hidden icons and their names', () => {
    mockMedia();
    renderForm({ coverImage: CAT });

    for (const name of ['Choose Cover image', 'Remove Cover image']) {
      const button = within(field()).getByRole('button', { name });
      expect(button).toHaveClass('size-11', 'lg:size-9');
      expect(button).toHaveTextContent('');
      const icon = button.querySelector('svg');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
    expect(
      within(field()).getByRole('button', { name: 'Choose Cover image' }).querySelector('svg'),
    ).toHaveClass('lucide-image-plus');
    expect(
      within(field()).getByRole('button', { name: 'Remove Cover image' }).querySelector('svg'),
    ).toHaveClass('lucide-trash-2');
  });

  it('shows the name of Choose in a tooltip', async () => {
    mockMedia();
    const view = renderForm({ coverImage: CAT });

    await view.user.hover(screen.getByRole('button', { name: 'Choose Cover image' }));
    await waitFor(() => expect(tooltip()).toHaveTextContent('Choose Cover image'));
  });

  it('shows the name of Remove in a tooltip', async () => {
    mockMedia();
    const view = renderForm({ coverImage: CAT });

    await view.user.hover(screen.getByRole('button', { name: 'Remove Cover image' }));
    await waitFor(() => expect(tooltip()).toHaveTextContent('Remove Cover image'));
  });

  it('shows the denial reason in the tooltip of a gated Choose', async () => {
    mockMedia();
    const view = renderForm({ coverImage: CAT }, { permissions: [] });

    await view.user.hover(screen.getByRole('button', { name: 'Choose Cover image' }));
    await waitFor(() => expect(tooltip()).toHaveTextContent(/media:read/));
  });
});

describe('MediaPickerDialog (AC-13)', () => {
  it('picks an asset with the keyboard alone', async () => {
    mockMedia();
    const view = renderForm(null);
    const { user } = view;

    screen.getByRole('button', { name: 'Choose Cover image' }).focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Choose cover image' });
    const group = await within(dialog).findByRole('radiogroup', { name: 'Media files' });
    const [dog, cat] = within(group).getAllByRole('radio');

    dog!.focus();
    await user.keyboard('{ArrowDown}');
    expect(cat).toBeChecked();
    expect(cat).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(field()).getByText('cat.png')).toBeInTheDocument();
    expect(screen.getByText('Cover image set to cat.png.')).toBeInTheDocument();
    expect(await save(view)).toEqual(CAT);
  });

  it('opens with the current asset checked and confirms with Select', async () => {
    mockMedia();
    const view = renderForm({ coverImage: CAT });

    await view.user.click(screen.getByRole('button', { name: 'Choose Cover image' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose cover image' });
    expect(await within(dialog).findByRole('radio', { name: 'cat.png' })).toBeChecked();

    await view.user.click(within(dialog).getByRole('radio', { name: 'dog.jpg' }));
    await view.user.click(within(dialog).getByRole('button', { name: 'Select' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await save(view)).toEqual(DOG);
  });

  it('renders each card as the ui RadioGroupItem named by the file name, and the card text selects it', async () => {
    mockMedia();
    const view = renderForm({ coverImage: CAT });

    await view.user.click(screen.getByRole('button', { name: 'Choose Cover image' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose cover image' });
    const group = await within(dialog).findByRole('radiogroup', { name: 'Media files' });
    const cat = within(group).getByRole('radio', { name: 'cat.png' });
    const dog = within(group).getByRole('radio', { name: 'dog.jpg' });

    expect(group).toHaveAttribute('data-slot', 'radio-group');
    expect(cat).toHaveAttribute('data-slot', 'radio-group-item');
    expect(cat).toHaveAttribute('aria-checked', 'true');
    expect(dog).toHaveAttribute('aria-checked', 'false');
    expect(cat.closest('label')).toHaveClass('has-data-checked:ring-2');

    await view.user.click(within(group).getByText('dog.jpg'));
    expect(dog).toHaveAttribute('aria-checked', 'true');
    expect(cat).toHaveAttribute('aria-checked', 'false');
  });

  it('filters by file name, and Cancel keeps the value', async () => {
    mockMedia();
    const view = renderForm({ coverImage: CAT });

    await view.user.click(screen.getByRole('button', { name: 'Choose Cover image' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose cover image' });
    await within(dialog).findByRole('radiogroup', { name: 'Media files' });
    await view.user.type(within(dialog).getByRole('searchbox', { name: 'Search files' }), 'dog');

    expect(within(dialog).getAllByRole('radio')).toHaveLength(1);
    expect(within(dialog).getByRole('radio', { name: 'dog.jpg' })).toBeInTheDocument();
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(field()).getByText('cat.png')).toBeInTheDocument();
  });

  it('disables Select until an asset is chosen', async () => {
    mockMedia();
    const view = renderForm(null);

    await view.user.click(screen.getByRole('button', { name: 'Choose Cover image' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose cover image' });
    await within(dialog).findByRole('radiogroup', { name: 'Media files' });

    expect(within(dialog).getByRole('button', { name: 'Select' })).toBeDisabled();
  });

  it('gates Upload without media:manager', async () => {
    mockMedia();
    const view = renderForm(null, { permissions: ['media:read'] });

    await view.user.click(screen.getByRole('button', { name: 'Choose Cover image' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose cover image' });

    expect(within(dialog).getByRole('button', { name: 'Upload' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  describe('upload', () => {
    useNodeFormData();

    it('selects a newly uploaded asset automatically', async () => {
      const { store } = mockMedia();
      const added = makeMediaAsset({ documentId: 'media-new', fileName: 'new.png' });
      const m2 = uploadMediaHandler(() => {
        store.assets = [added, ...store.assets];
        return HttpResponse.json(added, { status: 201 });
      });
      server.use(m2.handler);
      const view = renderForm({ coverImage: CAT });

      await view.user.click(screen.getByRole('button', { name: 'Choose Cover image' }));
      const dialog = await screen.findByRole('dialog', { name: 'Choose cover image' });
      await within(dialog).findByRole('radiogroup', { name: 'Media files' });
      const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
      fireEvent.change(input, { target: { files: [uploadFile('new.png', 'image/png')] } });

      expect(await within(dialog).findByRole('radio', { name: 'new.png' })).toBeChecked();
      expect(within(dialog).getByText('1 of 1 file uploaded.')).toBeInTheDocument();
      await view.user.click(within(dialog).getByRole('button', { name: 'Select' }));
      expect(await save(view)).toEqual(added);
    });
  });
});
