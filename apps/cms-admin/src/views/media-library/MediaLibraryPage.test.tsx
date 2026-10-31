import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { APP_ROUTES } from '@configs/App.routes';
import { COPY } from '@configs/Copy.constants';
import type { MediaFile } from '@features/media/Media.api';
import type { FakeHandler } from '@test/FakeApi.fixture';
import { createTestServices, renderApp } from '@test/RenderApp.fixture';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, vi } from 'vitest';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { MEDIA } = API_ENDPOINTS;
const copy = COPY.media;

function file(overrides: Partial<MediaFile> = {}): MediaFile {
  return {
    id: 'f1',
    fileName: 'portrait.jpg',
    mimeType: 'image/jpeg',
    size: 2048,
    width: 10,
    height: 10,
    alt: null,
    url: 'https://cdn.test/portrait.jpg',
    thumbnailUrl: 'https://cdn.test/portrait-t.jpg',
    isReviewerPreset: false,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    sha256: 'abcdef0123456789',
    ...overrides,
  };
}

const PORTRAIT_CARD_NAME = /^portrait\.jpg · abcdef01$/;

function body(list: MediaFile[]) {
  return { data: list, meta: { page: 1, pageSize: 10, total: list.length } };
}

async function open(handlers: Record<string, FakeHandler>, route: string = APP_ROUTES.MEDIA) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({
      status: 200,
      data: {
        id: 'acc_owner',
        email: 'o@domain.localhost',
        displayName: 'Owner',
        role: 'owner',
        twoFactorEnabled: false,
        twoFactorMethod: null,
      },
    }),
    [`GET ${API_ENDPOINTS.ROLES.LIST}`]: () => ({
      status: 200,
      data: { data: [] },
    }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, route);
  return { api };
}

async function chooseFiles(files: File[]) {
  await userEvent.click(screen.getByRole('button', { name: copy.upload }));
  await userEvent.upload(await screen.findByTestId('upload-dialog-input'), files);
}

beforeEach(() => {
  URL.createObjectURL = vi.fn<(source: Blob | MediaSource) => string>(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn<(url: string) => void>();
});

describe('MediaLibraryPage', () => {
  it('lists files and shows the empty state', async () => {
    await open({
      [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body([]) }),
    });
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
  });

  it('shows a retry when the list fails', async () => {
    await open({ [`GET ${MEDIA.LIST}`]: () => ({ status: 500 }) });
    expect(await screen.findByText(copy.loadFailed)).toBeInTheDocument();
  });

  it('uploads a file and refreshes the list', async () => {
    let list: MediaFile[] = [];
    const { api } = await open({
      [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body(list) }),
      [`POST ${MEDIA.LIST}`]: () => {
        list = [file()];
        return { status: 201, data: file() };
      },
    });
    await screen.findByText(copy.empty);
    await chooseFiles([new File(['x'], 'portrait.jpg', { type: 'image/jpeg' })]);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('portrait.jpg')).toBeInTheDocument();
    expect(api.callsTo(`POST ${MEDIA.LIST}`)).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: copy.uploadDialog.upload }));
    expect(await screen.findByText(copy.uploaded(1))).toBeInTheDocument();
    expect(await screen.findByText('2 KB')).toBeInTheDocument();
    expect(api.callsTo(`POST ${MEDIA.LIST}`)).toHaveLength(1);
  });

  it('shows the server reason for a rejected upload', async () => {
    await open({
      [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body([]) }),
      [`POST ${MEDIA.LIST}`]: () => ({
        status: 415,
        data: { errorCode: 'MEDIA_UNSUPPORTED_TYPE' },
      }),
    });
    await screen.findByText(copy.empty);
    await chooseFiles([new File(['x'], 'a.png', { type: 'image/png' })]);
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: copy.uploadDialog.upload }));
    expect(await within(dialog).findByText(copy.errors.unsupportedType)).toBeInTheDocument();
  });

  it('edits alt text (blank clears) and shows it in the list', async () => {
    let current = file();
    const { api } = await open({
      [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body([current]) }),
      [`PATCH ${MEDIA.ONE('f1')}`]: (config) => {
        const sent = JSON.parse(String(config.data)) as { alt: string | null };
        current = file({ alt: sent.alt });
        return { status: 200, data: current };
      },
    });
    await userEvent.click(
      await screen.findByRole('button', {
        name: copy.editAltLabel('portrait.jpg'),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(copy.altDialog.label), 'A portrait');
    await userEvent.click(within(dialog).getByRole('button', { name: copy.altDialog.save }));
    expect(await screen.findByText(copy.altDialog.saved('portrait.jpg'))).toBeInTheDocument();
    expect(JSON.parse(String(api.callsTo(`PATCH ${MEDIA.ONE('f1')}`)[0]?.data))).toEqual({
      alt: 'A portrait',
    });
  });

  it('refuses a too-long alt text without calling the API', async () => {
    const { api } = await open({
      [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body([file()]) }),
    });
    await userEvent.click(
      await screen.findByRole('button', {
        name: copy.editAltLabel('portrait.jpg'),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(copy.altDialog.label);
    await userEvent.click(field);
    await userEvent.paste('a'.repeat(501));
    await userEvent.click(within(dialog).getByRole('button', { name: copy.altDialog.save }));
    expect(await within(dialog).findByText(copy.altDialog.tooLong(500))).toBeInTheDocument();
    expect(api.callsTo(`PATCH ${MEDIA.ONE('f1')}`)).toHaveLength(0);
  });

  it('deletes after confirmation', async () => {
    let list = [file()];
    await open({
      [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body(list) }),
      [`DELETE ${MEDIA.ONE('f1')}`]: () => {
        list = [];
        return { status: 204 };
      },
    });
    await userEvent.click(
      await screen.findByRole('button', {
        name: copy.deleteLabel('portrait.jpg'),
      }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: copy.deleteDialog.submit('portrait.jpg'),
      }),
    );
    expect(await screen.findByText(copy.deleteDialog.deleted('portrait.jpg'))).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(copy.empty)).toBeInTheDocument());
  });

  it('keeps the dialog open and explains a file that is in use', async () => {
    await open({
      [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body([file()]) }),
      [`DELETE ${MEDIA.ONE('f1')}`]: () => ({
        status: 409,
        data: { errorCode: 'MEDIA_IN_USE' },
      }),
    });
    await userEvent.click(
      await screen.findByRole('button', {
        name: copy.deleteLabel('portrait.jpg'),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', {
        name: copy.deleteDialog.submit('portrait.jpg'),
      }),
    );
    expect(await within(dialog).findByText(copy.errors.inUse)).toBeInTheDocument();
    expect(screen.getByText(PORTRAIT_CARD_NAME)).toBeInTheDocument();
  });

  it('reads page, size, search and type from the URL', async () => {
    const { api } = await open(
      { [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body([file()]) }) },
      `${APP_ROUTES.MEDIA}?page=2&pageSize=50&search=cv&mimeType=application/pdf`,
    );
    await screen.findByText(PORTRAIT_CARD_NAME);
    expect(api.callsTo(`GET ${MEDIA.LIST}`)[0]?.params).toMatchObject({
      page: 2,
      pageSize: 50,
      search: 'cv',
      mimeType: 'application/pdf',
    });
  });

  it('falls back to the defaults for invalid query values', async () => {
    const { api } = await open(
      { [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body([file()]) }) },
      `${APP_ROUTES.MEDIA}?page=-3&pageSize=7&mimeType=text/html`,
    );
    await screen.findByText(PORTRAIT_CARD_NAME);
    expect(api.callsTo(`GET ${MEDIA.LIST}`)[0]?.params).toEqual({ page: 1, pageSize: 10 });
  });

  it('resets to page 1 when a filter changes', async () => {
    const { api } = await open(
      {
        [`GET ${MEDIA.LIST}`]: () => ({
          status: 200,
          data: { data: [file()], meta: { page: 2, pageSize: 10, total: 15 } },
        }),
      },
      `${APP_ROUTES.MEDIA}?page=2`,
    );
    await screen.findByText(PORTRAIT_CARD_NAME);
    await userEvent.selectOptions(screen.getByLabelText(copy.filters.mimeType), 'image/*');
    await waitFor(() =>
      expect(api.callsTo(`GET ${MEDIA.LIST}`).at(-1)?.params).toEqual({
        page: 1,
        pageSize: 10,
        mimeType: 'image/*',
      }),
    );
  });

  it('shows every card action for a role that can update and delete', async () => {
    await open({ [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body([file()]) }) });
    expect(
      await screen.findByRole('button', { name: copy.editAltLabel('portrait.jpg') }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: copy.grid.replaceLabel('portrait.jpg') }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: copy.deleteLabel('portrait.jpg') })).toBeVisible();
    const original = screen.getByRole('link', { name: copy.grid.viewOriginal('portrait.jpg') });
    expect(original).toHaveAttribute('target', '_blank');
    expect(original).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows no view-original link for a PDF', async () => {
    await open({
      [`GET ${MEDIA.LIST}`]: () => ({
        status: 200,
        data: body([file({ fileName: 'cv.pdf', mimeType: 'application/pdf', thumbnailUrl: null })]),
      }),
    });
    await screen.findByRole('button', { name: copy.deleteLabel('cv.pdf') });
    expect(screen.queryByRole('link', { name: copy.grid.viewOriginal('cv.pdf') })).toBeNull();
  });

  it('replaces a file in place with PUT', async () => {
    const { api } = await open({
      [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body([file()]) }),
      [`PUT ${MEDIA.FILE('f1')}`]: () => ({ status: 200, data: file({ fileName: 'new.png' }) }),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: copy.grid.replaceLabel('portrait.jpg') }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.upload(
      within(dialog).getByTestId('upload-dialog-input'),
      new File(['x'], 'new.png', { type: 'image/png' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: copy.uploadDialog.upload }));
    expect(await screen.findByText(copy.replaced('new.png'))).toBeInTheDocument();
    expect(api.callsTo(`PUT ${MEDIA.FILE('f1')}`)).toHaveLength(1);
    expect(api.callsTo(`POST ${MEDIA.LIST}`)).toHaveLength(0);
  });

  it('refuses a replacement from another family', async () => {
    const { api } = await open({
      [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body([file()]) }),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: copy.grid.replaceLabel('portrait.jpg') }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.upload(
      within(dialog).getByTestId('upload-dialog-input'),
      new File(['x'], 'a.pdf', { type: 'application/pdf' }),
      { applyAccept: false },
    );
    expect(
      await within(dialog).findByText(copy.uploadDialog.rejected['type-not-allowed']),
    ).toBeInTheDocument();
    expect(api.callsTo(`PUT ${MEDIA.FILE('f1')}`)).toHaveLength(0);
  });

  it('opens the upload dialog with files dropped on the grid', async () => {
    await open({ [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: body([file()]) }) });
    const grid = (await screen.findByRole('list', { name: copy.grid.label })).parentElement;
    const dropped = new File(['x'], 'dropped.png', { type: 'image/png' });
    fireEvent.drop(grid as HTMLElement, { dataTransfer: { files: [dropped] } });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('dropped.png')).toBeInTheDocument();
  });
});
