import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FakeHandler } from '../../../test/FakeApi.fixture';
import { createTestServices, renderApp } from '../../../test/RenderApp.fixture';
import { COPY } from '../../config/Copy.constants';
import { API_ENDPOINTS } from '../../config/Api.endpoints';
import { APP_ROUTES } from '../../config/App.routes';
import type { MediaFile } from './media.api';

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
    ...overrides,
  };
}

function body(list: MediaFile[]) {
  return { data: list, meta: { page: 1, pageSize: 20, total: list.length } };
}

async function open(handlers: Record<string, FakeHandler>) {
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
  renderApp(services, APP_ROUTES.MEDIA);
  return { api };
}

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
    await userEvent.upload(
      screen.getByTestId('media-upload-input'),
      new File(['x'], 'portrait.jpg', { type: 'image/jpeg' }),
    );
    expect(
      await screen.findByText(copy.uploaded('portrait.jpg')),
    ).toBeInTheDocument();
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
    await userEvent.upload(
      screen.getByTestId('media-upload-input'),
      new File(['x'], 'a.png', { type: 'image/png' }),
    );
    expect(
      await screen.findByText(copy.errors.unsupportedType),
    ).toBeInTheDocument();
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
    await userEvent.type(
      within(dialog).getByLabelText(copy.altDialog.label),
      'A portrait',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: copy.altDialog.save }),
    );
    expect(await screen.findByText('A portrait')).toBeInTheDocument();
    expect(
      JSON.parse(String(api.callsTo(`PATCH ${MEDIA.ONE('f1')}`)[0]?.data)),
    ).toEqual({
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
    await userEvent.click(
      within(dialog).getByRole('button', { name: copy.altDialog.save }),
    );
    expect(
      await within(dialog).findByText(copy.altDialog.tooLong(500)),
    ).toBeInTheDocument();
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
    expect(
      await screen.findByText(copy.deleteDialog.deleted('portrait.jpg')),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(copy.empty)).toBeInTheDocument(),
    );
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
    expect(
      await within(dialog).findByText(copy.errors.inUse),
    ).toBeInTheDocument();
    expect(
      screen.getByText('portrait.jpg', { selector: 'span' }),
    ).toBeInTheDocument();
  });
});
