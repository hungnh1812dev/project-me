import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { contentEditPath } from '@configs/App.routes';
import { COPY } from '@configs/Copy.constants';
import type { FakeHandler } from '@test/FakeApi.fixture';
import { createTestServices, renderApp, TEST_USER } from '@test/RenderApp.fixture';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ContentType } from '../content-types';
import type { MediaFile } from './Media.api';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { CONTENT_TYPES, DOCUMENTS, ROLES, MEDIA } = API_ENDPOINTS;
const copy = COPY.media;
const SLUG = 'profile';
const DOC_ID = 'doc_1';
const PORTRAIT_NAME = 'portrait.jpg · abcdef01';

const field = (path: string, type: string) => ({
  path,
  type,
  system: false,
  component: false,
  repeatable: false,
  rootScalar: true,
  conditionKind: null,
  sensitive: false,
});
const PROFILE: ContentType = {
  slug: SLUG,
  kind: 'collection',
  draftAndPublish: true,
  fields: [field('name', 'string'), field('photo', 'media')],
};

function library(overrides: Partial<MediaFile> = {}): MediaFile {
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
    provider: 'cloudinary',
    ...overrides,
  };
}

const page = (list: MediaFile[]) => ({
  data: list,
  meta: { page: 1, pageSize: 20, total: list.length },
});

function doc(photo: unknown) {
  return {
    documentId: DOC_ID,
    version: 1,
    values: { name: 'Mai', photo },
    components: {},
    _maskedFields: [] as string[],
  };
}

const permission = (subject: string, action: string) => ({
  subject,
  action,
  readableFields: null,
  writableFields: null,
  conditions: null,
});

async function open(
  handlers: Record<string, FakeHandler>,
  limitedTo?: ReturnType<typeof permission>[],
) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({
      status: 200,
      data: limitedTo ? { ...TEST_USER, role: 'editor' } : TEST_USER,
    }),
    [`GET ${ROLES.LIST}`]: () => ({
      status: 200,
      data: {
        data: limitedTo
          ? [
              {
                id: 'r1',
                slug: 'editor',
                name: 'editor',
                isSystem: false,
                accountCount: 1,
                manageable: false,
                permissions: limitedTo,
              },
            ]
          : [],
      },
    }),
    [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: () => ({ status: 200, data: PROFILE }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, contentEditPath(SLUG, DOC_ID));
  return { api };
}

const put = `PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`;
const sent = (call: { data?: unknown } | undefined) =>
  JSON.parse(String(call?.data)) as Record<string, unknown>;

describe('media field in the document form', () => {
  it('previews the embedded file and sends only the uuid when replaced from the picker', async () => {
    const embedded = {
      id: 'f0',
      fileName: 'old.jpg',
      url: 'https://cdn.test/old.jpg',
      thumbnailUrl: 'https://cdn.test/old-t.jpg',
      provider: 'cloudinary',
      alt: null,
      size: 1024,
      createdAt: '2026-09-01T10:00:00.000Z',
    };
    const { api } = await open({
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: doc(embedded),
      }),
      [`GET ${MEDIA.LIST}`]: () => ({ status: 200, data: page([library()]) }),
      [put]: () => ({ status: 200, data: doc(library()) }),
    });

    expect(await screen.findByText('old.jpg')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy.input.choose }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      await within(dialog).findByRole('button', {
        name: copy.picker.select('portrait.jpg'),
      }),
    );
    expect(await screen.findByText(PORTRAIT_NAME)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: COPY.content.save }));
    await waitFor(() => expect(api.callsTo(put)).toHaveLength(1));
    expect(sent(api.callsTo(put)[0])).toMatchObject({
      values: { photo: 'f1' },
    });
  });

  it('removing the file sends null; an untouched file is not resent', async () => {
    const { api } = await open({
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: doc({ ...library(), mimeType: undefined }),
      }),
      [put]: () => ({ status: 200, data: doc(null) }),
    });
    await screen.findByText(PORTRAIT_NAME);
    await userEvent.click(screen.getByRole('button', { name: copy.input.remove }));
    expect(await screen.findByText(copy.input.empty)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: COPY.content.save }));
    await waitFor(() => expect(api.callsTo(put)).toHaveLength(1));
    expect((sent(api.callsTo(put)[0]).values as Record<string, unknown>).photo).toBeNull();
  });

  it('upload opens the upload dialog and a done file is set on the field', async () => {
    const { api } = await open({
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({ status: 200, data: doc(null) }),
      [`POST ${MEDIA.LIST}`]: () => ({ status: 201, data: library() }),
      [put]: () => ({ status: 200, data: doc(library()) }),
    });
    await userEvent.click(await screen.findByRole('button', { name: copy.input.upload }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.upload(
      within(dialog).getByTestId('upload-dialog-input'),
      new File(['x'], 'portrait.jpg', { type: 'image/jpeg' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: copy.uploadDialog.upload }));
    await userEvent.click(
      await within(dialog).findByRole('button', { name: copy.uploadDialog.close }),
    );
    expect(await screen.findByText(PORTRAIT_NAME)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: COPY.content.save }));
    await waitFor(() => expect(api.callsTo(put)).toHaveLength(1));
    expect(sent(api.callsTo(put)[0])).toMatchObject({ values: { photo: 'f1' } });
  });

  it('replace uploads a new file, sets it and never deletes the old one from the library', async () => {
    const { api } = await open({
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: doc(library({ id: 'f0', fileName: 'old.jpg' })),
      }),
      [`POST ${MEDIA.LIST}`]: () => ({ status: 201, data: library() }),
    });
    await userEvent.click(await screen.findByRole('button', { name: copy.input.replace }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.upload(
      within(dialog).getByTestId('upload-dialog-input'),
      new File(['x'], 'portrait.jpg', { type: 'image/jpeg' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: copy.uploadDialog.upload }));
    await userEvent.click(
      await within(dialog).findByRole('button', { name: copy.uploadDialog.close }),
    );
    expect(await screen.findByText(PORTRAIT_NAME)).toBeInTheDocument();
    expect(api.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
    expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
  });

  it('closing the upload dialog returns focus to the Replace file button', async () => {
    await open({
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: doc({ ...library(), mimeType: undefined }),
      }),
    });
    await screen.findByText(PORTRAIT_NAME);
    const replace = screen.getByRole('button', { name: copy.input.replace });
    replace.focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(replace).toHaveFocus();
  });

  it('without media:create the upload and replace actions are not offered', async () => {
    await open(
      {
        [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({ status: 200, data: doc(null) }),
      },
      [permission(SLUG, 'read'), permission(SLUG, 'update'), permission('media', 'read')],
    );
    await screen.findByText(copy.input.empty);
    expect(screen.getByRole('button', { name: copy.input.choose })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.input.upload })).not.toBeInTheDocument();
  });

  it('keeps the embedded type, size and date so the footer shows them after a reload', async () => {
    await open({
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: doc(library({ width: 640, height: 480 })),
      }),
    });
    expect(await screen.findByText(/640\s*[x×]\s*480/)).toBeInTheDocument();
  });
});
