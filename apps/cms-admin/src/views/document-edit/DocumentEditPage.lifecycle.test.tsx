import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { contentEditPath } from '@configs/App.routes';
import { EN_TEXT } from '@configs/locales/en';
import type { PermissionRow } from '@features/access/Access.api';
import type { PublishState } from '@features/content/Content.constants';
import { CV_PAGE_TYPE } from '@test/CvPage.fixture';
import type { FakeHandler } from '@test/FakeApi.fixture';
import { createTestServices, renderApp, TEST_USER } from '@test/RenderApp.fixture';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { CONTENT_TYPES, DOCUMENTS, ROLES } = API_ENDPOINTS;
const copy = EN_TEXT.content;
const actions = copy.actions;
const SLUG = 'cv-page';
const DOC_ID = 'doc_1';
const BY_ID = `GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`;
const PUBLISH = `POST ${DOCUMENTS.PUBLISH(SLUG, DOC_ID)}`;
const UNPUBLISH = `POST ${DOCUMENTS.UNPUBLISH(SLUG, DOC_ID)}`;
const DISCARD = `POST ${DOCUMENTS.DISCARD(SLUG, DOC_ID)}`;

function draftOf(publishState: PublishState | undefined, version = 3) {
  return {
    documentId: DOC_ID,
    version,
    values: { position: 'Engineer', isMain: false, company: 'Acme', summary: '<p>Hi</p>' },
    components: {},
    _maskedFields: [] as string[],
    ...(publishState === undefined ? {} : { publishState }),
  };
}

function row(action: PermissionRow['action'], writableFields: string[] | null): PermissionRow {
  return {
    subject: SLUG,
    action,
    readableFields: null,
    writableFields,
    conditions: null,
  };
}

interface OpenOptions {
  role?: string;
  permissions?: PermissionRow[];
  type?: unknown;
}

async function open(
  state: PublishState | undefined,
  handlers: Record<string, FakeHandler> = {},
  { role = 'owner', permissions = [], type = CV_PAGE_TYPE }: OpenOptions = {},
) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: { ...TEST_USER, role } }),
    [`GET ${ROLES.LIST}`]: () => ({
      status: 200,
      data: { data: [{ id: 'r1', slug: role, name: role, rank: 5, permissions }] },
    }),
    [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: () => ({ status: 200, data: type }),
    [BY_ID]: () => ({ status: 200, data: draftOf(state) }),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, contentEditPath(SLUG, DOC_ID));
  await screen.findByLabelText('Position');
  return { api };
}

const button = (name: string) => screen.queryByRole('button', { name });
const dirtyForm = async () => userEvent.type(await screen.findByLabelText('Position'), '!');

describe('DocumentEditPage lifecycle: badge and enabled states', () => {
  it.each([
    ['draft', copy.publishState.draft, { publish: true, unpublish: false, discard: false }],
    ['modified', copy.publishState.modified, { publish: true, unpublish: true, discard: true }],
    ['published', copy.publishState.published, { publish: false, unpublish: true, discard: false }],
  ] as const)(
    'state %s shows its badge and enables the right actions',
    async (state, label, on) => {
      await open(state);
      expect(await screen.findByText(label)).toBeInTheDocument();
      expect(button(actions.publish)).toHaveProperty('disabled', !on.publish);
      expect(button(actions.unpublish)).toHaveProperty('disabled', !on.unpublish);
      expect(button(actions.discard)).toHaveProperty('disabled', !on.discard);
      // Nothing edited yet: Save is off.
      expect(button(copy.save)).toBeDisabled();
    },
  );

  it('enables Save and disables Publish while the form has unsaved edits', async () => {
    await open('modified');
    await dirtyForm();
    expect(button(copy.save)).toBeEnabled();
    expect(button(actions.publish)).toBeDisabled();
  });

  it('shows no badge and only Save for a type without draft and publish', async () => {
    await open(undefined, {}, { type: { ...CV_PAGE_TYPE, draftAndPublish: false } });
    await dirtyForm();
    expect(button(copy.save)).toBeEnabled();
    expect(button(actions.publish)).toBeNull();
    expect(button(actions.unpublish)).toBeNull();
    expect(button(actions.discard)).toBeNull();
    expect(screen.queryByText(copy.publishState.draft)).toBeNull();
  });

  it('shows no actions to a reviewer', async () => {
    await open('published', {}, { role: 'reviewer' });
    expect(button(copy.save)).toBeNull();
    expect(button(actions.publish)).toBeNull();
    expect(button(actions.unpublish)).toBeNull();
    expect(button(actions.discard)).toBeNull();
  });

  it('shows only the actions the role holds', async () => {
    await open(
      'modified',
      {},
      { role: 'editor', permissions: [row('update', ['position']), row('publish', null)] },
    );
    expect(await screen.findByText(copy.publishState.modified)).toBeInTheDocument();
    expect(button(actions.publish)).toBeEnabled();
    expect(button(actions.unpublish)).toBeNull();
    // update is held, but not write access to every field.
    expect(button(actions.discard)).toBeNull();
  });

  it('offers Discard when update covers every field', async () => {
    await open('modified', {}, { role: 'editor', permissions: [row('update', null)] });
    expect(await screen.findByRole('button', { name: actions.discard })).toBeEnabled();
    expect(button(actions.publish)).toBeNull();
  });
});

describe('DocumentEditPage lifecycle: actions', () => {
  it('publishes with the loaded version and shows Published', async () => {
    let state: PublishState = 'modified';
    const { api } = await open('modified', {
      [BY_ID]: () => ({ status: 200, data: draftOf(state) }),
      [PUBLISH]: () => {
        state = 'published';
        return { status: 200, data: { documentId: DOC_ID, version: 3 } };
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: actions.publish }));
    expect(await screen.findByText(actions.published)).toBeInTheDocument();
    expect(JSON.parse(String(api.callsTo(PUBLISH)[0]?.data))).toEqual({ expectedVersion: 3 });
    expect(await screen.findByText(copy.publishState.published)).toBeInTheDocument();
    expect(button(actions.publish)).toBeDisabled();
  });

  it('confirms Unpublish: Cancel keeps it, confirm unpublishes and shows Draft', async () => {
    let state: PublishState = 'published';
    const { api } = await open('published', {
      [BY_ID]: () => ({ status: 200, data: draftOf(state) }),
      [UNPUBLISH]: () => {
        state = 'draft';
        return { status: 204, data: null };
      },
    });
    const trigger = await screen.findByRole('button', { name: actions.unpublish });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(actions.unpublishDialog.title)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: actions.unpublishDialog.cancel }),
    ).toHaveFocus();

    await userEvent.click(
      within(dialog).getByRole('button', { name: actions.unpublishDialog.cancel }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.callsTo(UNPUBLISH)).toHaveLength(0);

    await userEvent.click(trigger);
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: actions.unpublishDialog.confirm,
      }),
    );
    expect(await screen.findByText(actions.unpublished)).toBeInTheDocument();
    expect(await screen.findByText(copy.publishState.draft)).toBeInTheDocument();
    expect(button(actions.unpublish)).toBeDisabled();
  });

  it('confirms Discard, names the unsaved edits, and shows Published after', async () => {
    let state: PublishState = 'modified';
    let version = 3;
    const { api } = await open('modified', {
      [BY_ID]: () => ({ status: 200, data: draftOf(state, version) }),
      [DISCARD]: () => {
        state = 'published';
        version = 4;
        return { status: 200, data: { documentId: DOC_ID, version: 4 } };
      },
    });
    await dirtyForm();
    await userEvent.click(screen.getByRole('button', { name: actions.discard }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(new RegExp(actions.discardDialog.unsavedEdits)),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: actions.discardDialog.confirm }),
    );
    expect(await screen.findByText(actions.discarded)).toBeInTheDocument();
    expect(JSON.parse(String(api.callsTo(DISCARD)[0]?.data))).toEqual({ expectedVersion: 3 });
    expect(await screen.findByText(copy.publishState.published)).toBeInTheDocument();
    expect(screen.getByLabelText('Position')).toHaveValue('Engineer');
  });

  it('offers Reload on a 409 conflict and refetches only on Reload', async () => {
    const { api } = await open('modified', {
      [PUBLISH]: () => ({
        status: 409,
        data: { errorCode: 'DOCUMENT_VERSION_CONFLICT', details: { currentVersion: 5 } },
      }),
    });
    await userEvent.click(await screen.findByRole('button', { name: actions.publish }));
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.conflict);
    expect(api.callsTo(BY_ID)).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: copy.errors.reload }));
    await waitFor(() => expect(api.callsTo(BY_ID)).toHaveLength(2));
  });

  it('shows the not-modified notice and refetches the state', async () => {
    let state: PublishState = 'modified';
    await open('modified', {
      [BY_ID]: () => ({ status: 200, data: draftOf(state) }),
      [DISCARD]: () => {
        state = 'published';
        return {
          status: 409,
          data: {
            errorCode: 'DOCUMENT_NOT_MODIFIED',
            message: 'The draft has no changes to discard.',
          },
        };
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: actions.discard }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: actions.discardDialog.confirm,
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.notModified);
    expect(await screen.findByText(copy.publishState.published)).toBeInTheDocument();
  });

  it('shows the forbidden notice on a 403', async () => {
    await open('draft', {
      [PUBLISH]: () => ({ status: 403, data: { errorCode: 'FORBIDDEN' } }),
    });
    await userEvent.click(await screen.findByRole('button', { name: actions.publish }));
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.forbidden);
  });
});
