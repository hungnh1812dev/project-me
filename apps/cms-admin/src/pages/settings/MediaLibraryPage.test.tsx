import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { MediaAsset } from '@/features/settings/types';
import { makeMediaAsset, makeMeUser, makeRole } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import {
  deleteMediaHandler,
  listMediaHandler,
  settingsErrorReply,
  uploadMediaHandler,
} from '@/test/msw/settingsHandlers';
import { uploadFile, useNodeFormData } from '@/test/nodeMultipart';
import { renderWithProviders } from '@/test/renderWithProviders';

import MediaLibraryPage from './MediaLibraryPage';

const DOG = makeMediaAsset({
  documentId: 'media-dog',
  fileName: 'a-very-long-file-name-for-the-dog-picture.jpg',
  mimeType: 'image/jpeg',
  size: 1258291,
  width: 1920,
  height: 1080,
  thumbnailUrl: 'https://media.example.com/thumb/dog.jpg',
  createdAt: '2026-01-02T00:00:00.000Z',
});
const CAT = makeMediaAsset({
  documentId: 'media-cat',
  fileName: 'cat.png',
  size: 20480,
  width: 640,
  height: 480,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const MANAGER = ['media:read', 'media:manager'];
const DENIED = 'Requires the "media:manager" permission.';

function auth(permissions: string[] = MANAGER) {
  return {
    status: 'authenticated' as const,
    user: makeMeUser({ role: makeRole({ permissions }) }),
  };
}

/** Installs M1 over a mutable list. */
function mockApi(assets: MediaAsset[] = [DOG, CAT]) {
  const store = { assets };
  const m1 = listMediaHandler(() => HttpResponse.json(store.assets));
  server.use(m1.handler);
  return { store, m1 };
}

async function renderPage(permissions = MANAGER) {
  const view = renderWithProviders(<MediaLibraryPage />, { auth: auth(permissions) });
  await screen.findByRole('list', { name: 'Media files' });
  return view;
}

const cards = () =>
  within(screen.getByRole('list', { name: 'Media files' })).getAllByRole('listitem');

describe('MediaLibraryPage grid (AC-2, AC-35)', () => {
  it('renders the heading, a description and Upload', async () => {
    mockApi();
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Media library' })).toBeInTheDocument();
    expect(screen.getByText(/png and jpeg images/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeVisible();
  });

  it('shows each asset newest first with a lazy, fixed-size thumbnail named after the file', async () => {
    mockApi();
    await renderPage();

    const [first] = cards();
    const image = within(first as HTMLElement).getByRole('img', { name: DOG.fileName });
    expect(image).toHaveAttribute('src', DOG.thumbnailUrl);
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image.parentElement?.className).toMatch(/aspect-/);
    expect(cards()).toHaveLength(2);
  });

  it('shows the truncated name with the full name, dimensions, size and date', async () => {
    mockApi();
    await renderPage();

    const card = within(cards()[0] as HTMLElement);
    const name = card.getByText(DOG.fileName);
    expect(name.className).toMatch(/truncate/);
    expect(name).toHaveAttribute('title', DOG.fileName);
    expect(card.getByText('1920 × 1080')).toBeInTheDocument();
    expect(card.getByText('1.2 MB')).toBeInTheDocument();
    expect(card.getByText('Jan 2, 2026')).toBeInTheDocument();
  });

  it('uses 2 columns on small screens and more on wider ones', async () => {
    mockApi();
    await renderPage();

    expect(screen.getByRole('list', { name: 'Media files' }).className).toMatch(
      /grid-cols-2 .*sm:grid-cols-3/,
    );
  });

  it('filters by file name without a request and announces the count (AC-4)', async () => {
    const { m1 } = mockApi();
    const { user } = await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search files' }), 'CAT');

    expect(cards()).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'cat.png' })).toBeInTheDocument();
    expect(screen.getByText('1 file')).toBeInTheDocument();
    expect(m1.requests).toHaveLength(1);
  });
});

describe('MediaLibraryPage states (AC-3)', () => {
  it('shows the empty state', async () => {
    mockApi([]);
    renderWithProviders(<MediaLibraryPage />, { auth: auth() });

    expect(await screen.findByText('No files yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeVisible();
  });

  it('shows no matches for a search', async () => {
    mockApi();
    const { user } = await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search files' }), 'zebra');

    expect(screen.getByText('No files match "zebra".')).toBeInTheDocument();
  });

  it('shows the error with Retry, which refetches', async () => {
    let fail = true;
    server.use(
      listMediaHandler((request) =>
        fail ? settingsErrorReply(500, 'Server exploded')(request) : HttpResponse.json([CAT]),
      ).handler,
    );
    const { user } = renderWithProviders(<MediaLibraryPage />, { auth: auth() });

    // A 5xx is retried once (about a second) before the error shows.
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Server exploded',
    );
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('img', { name: 'cat.png' })).toBeInTheDocument();
  });

  it('shows the 403 message without Retry', async () => {
    server.use(listMediaHandler(settingsErrorReply(403, 'Forbidden')).handler);
    renderWithProviders(<MediaLibraryPage />, { auth: auth() });

    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have access to files.");
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});

describe('MediaLibraryPage gating (AC-5)', () => {
  it('keeps Upload and Delete visible but inert for a read-only actor', async () => {
    mockApi();
    const { user } = await renderPage(['media:read']);

    const upload = screen.getByRole('button', { name: 'Upload' });
    const remove = screen.getByRole('button', { name: `Delete ${CAT.fileName}` });
    await user.click(remove);

    expect(upload).toHaveAttribute('aria-disabled', 'true');
    expect(upload).toHaveAccessibleDescription(DENIED);
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('MediaLibraryPage upload (AC-36, AC-37)', () => {
  useNodeFormData();

  const input = (container: HTMLElement) =>
    container.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;

  it('uploads the files, lists their status, announces the summary and refreshes the grid', async () => {
    const { store, m1 } = mockApi();
    let calls = 0;
    const m2 = uploadMediaHandler(() => {
      calls += 1;
      if (calls === 2) return settingsErrorReply(413, 'Payload Too Large')({} as never);
      store.assets = [makeMediaAsset({ documentId: 'new', fileName: 'new.png' }), ...store.assets];
      return HttpResponse.json(store.assets[0], { status: 201 });
    });
    server.use(m2.handler);
    const { container } = await renderPage();

    fireEvent.change(input(container), {
      target: {
        files: [
          uploadFile('new.png', 'image/png'),
          uploadFile('big.png', 'image/png'),
          uploadFile('anim.gif', 'image/gif'),
        ],
      },
    });

    // Shown under the progress list and announced in the page's live region.
    expect(await screen.findAllByText('1 of 3 files uploaded.')).toHaveLength(2);
    const progress = within(screen.getByRole('list', { name: 'Upload progress' }));
    expect(progress.getByText('Uploaded')).toBeInTheDocument();
    expect(progress.getByText('Failed: File is too large.')).toBeInTheDocument();
    expect(
      progress.getByText('Failed: anim.gif: only PNG and JPEG images are supported.'),
    ).toBeInTheDocument();
    expect(m2.requests).toHaveLength(2);
    expect(await screen.findByRole('img', { name: 'new.png' })).toBeInTheDocument();
    expect(m1.requests).toHaveLength(2);
  });
});

describe('MediaLibraryPage delete (AC-7, AC-10, AC-38)', () => {
  it('confirms with the thumbnail, name and broken-image note, then deletes and announces', async () => {
    const { store } = mockApi();
    const m3 = deleteMediaHandler(() => {
      store.assets = [DOG];
      return new HttpResponse(null, { status: 204 });
    });
    server.use(m3.handler);
    const { user } = await renderPage();
    const trigger = screen.getByRole('button', { name: 'Delete cat.png' });

    await user.click(trigger);

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete "cat.png"?' });
    expect(within(dialog).getByRole('img', { name: 'cat.png' })).toHaveAttribute(
      'src',
      CAT.thumbnailUrl,
    );
    expect(dialog).toHaveTextContent('Documents that use this image will show a broken image.');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Delete file' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(m3.requests[0]?.params.id).toBe('media-cat');
    expect(screen.getByText('File "cat.png" deleted.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('img', { name: 'cat.png' })).toBeNull());
  });

  it('keeps the dialog open with the server error', async () => {
    mockApi();
    server.use(deleteMediaHandler(settingsErrorReply(404, 'Media not found')).handler);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete cat.png' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete file' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Media not found');
  });
});

describe('MediaLibraryPage thumbnail allowlist (P4-SEC-2, AC-18)', () => {
  const EVIL = makeMediaAsset({
    documentId: 'media-evil',
    fileName: 'evil.png',
    thumbnailUrl: 'http://evil.example.test/x.png',
    createdAt: '2026-01-03T00:00:00.000Z',
  });

  it('renders allowed thumbnails without a referrer', async () => {
    mockApi();
    await renderPage();

    const image = within(cards()[0] as HTMLElement).getByRole('img', { name: DOG.fileName });
    expect(image).toHaveAttribute('src', DOG.thumbnailUrl);
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('shows a placeholder with no src, named after the file, for an unsafe URL', async () => {
    mockApi([EVIL, DOG]);
    const { container } = await renderPage();

    const placeholder = within(cards()[0] as HTMLElement).getByRole('img', { name: 'evil.png' });
    expect(placeholder).not.toHaveAttribute('src');
    expect(container.querySelector(`img[src="${EVIL.thumbnailUrl}"]`)).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('confirms delete with the placeholder for an unsafe URL', async () => {
    mockApi([EVIL, DOG]);
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete evil.png' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete "evil.png"?' });
    const placeholder = within(dialog).getByRole('img', { name: 'evil.png' });
    expect(placeholder).not.toHaveAttribute('src');
    expect(dialog.querySelector('img')).toBeNull();
  });

  it('confirms delete with an allowed thumbnail sent without a referrer', async () => {
    mockApi();
    const { user } = await renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete cat.png' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete "cat.png"?' });
    expect(within(dialog).getByRole('img', { name: 'cat.png' })).toHaveAttribute(
      'referrerpolicy',
      'no-referrer',
    );
  });
});
