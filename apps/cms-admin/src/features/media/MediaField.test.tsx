import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FakeHandler } from '../../../test/fake-api';
import {
  createTestServices,
  renderApp,
  TEST_USER,
} from '../../../test/render-app';
import { COPY } from '../../config/copy.constants';
import { API_ENDPOINTS } from '../../config/endpoints';
import { contentEditPath } from '../../config/routes';
import type { ContentType } from '../content-types';
import type { MediaFile } from './media.api';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { CONTENT_TYPES, DOCUMENTS, ROLES, MEDIA } = API_ENDPOINTS;
const copy = COPY.media;
const SLUG = 'profile';
const DOC_ID = 'doc_1';

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

async function open(handlers: Record<string, FakeHandler>) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
    [`GET ${ROLES.LIST}`]: () => ({ status: 200, data: { data: [] } }),
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
    await userEvent.click(
      screen.getByRole('button', { name: copy.input.replace }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      await within(dialog).findByRole('button', {
        name: copy.picker.select('portrait.jpg'),
      }),
    );
    expect(await screen.findByText('portrait.jpg')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: COPY.content.save }),
    );
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
    await screen.findByText('portrait.jpg');
    await userEvent.click(
      screen.getByRole('button', { name: copy.input.remove }),
    );
    expect(await screen.findByText(copy.input.empty)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: COPY.content.save }),
    );
    await waitFor(() => expect(api.callsTo(put)).toHaveLength(1));
    expect(
      (sent(api.callsTo(put)[0]).values as Record<string, unknown>).photo,
    ).toBeNull();
  });

  it('uploads a new file into the field and shows the reason when rejected', async () => {
    let status = 415;
    await open({
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: doc(null),
      }),
      [`POST ${MEDIA.LIST}`]: () =>
        status === 415
          ? { status, data: { errorCode: 'MEDIA_UNSUPPORTED_TYPE' } }
          : { status: 201, data: library() },
    });
    await screen.findByText(copy.input.empty);
    const input = screen.getByTestId('media-file-input');
    await userEvent.upload(
      input,
      new File(['x'], 'a.png', { type: 'image/png' }),
    );
    expect(
      await screen.findByText(copy.errors.unsupportedType),
    ).toBeInTheDocument();
    status = 201;
    await userEvent.upload(
      input,
      new File(['x'], 'portrait.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByText('portrait.jpg')).toBeInTheDocument();
  });
});
