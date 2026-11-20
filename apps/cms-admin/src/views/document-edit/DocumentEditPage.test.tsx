import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { contentEditPath, contentNewPath } from '@configs/App.routes';
import { EN_TEXT } from '@configs/locales/en';
import type { DocumentRecord } from '@features/content/Content.api';
import { CONTENT_QUERY_KEYS } from '@features/content/Content.queries';
import { QueryClient } from '@tanstack/react-query';
import { CV_PAGE_TYPE } from '@test/CvPage.fixture';
import type { FakeHandler } from '@test/FakeApi.fixture';
import {
  createTestServices,
  findToast,
  renderApp,
  renderInApp,
  TEST_USER,
} from '@test/RenderApp.fixture';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Navigate, Route, Routes } from 'react-router';
import { vi } from 'vitest';

import { DocumentEditPage } from './DocumentEditPage';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { CONTENT_TYPES, DOCUMENTS, ROLES } = API_ENDPOINTS;
const copy = EN_TEXT.content;
const SLUG = 'cv-page';
const DOC_ID = 'doc_1';
const UID_SKILL = '00000000-0000-4000-8000-00000000000a';

const typeHandler: FakeHandler = () => ({ status: 200, data: CV_PAGE_TYPE });

function draft(overrides: Record<string, unknown> = {}) {
  return {
    documentId: DOC_ID,
    version: 3,
    values: {
      position: 'Engineer',
      isMain: false,
      name: 'Acme',
      summary: '<p>Hi</p>',
    },
    components: {
      skills: [
        {
          componentUid: UID_SKILL,
          values: { level: 'Senior', skill: 'React' },
          components: {},
        },
      ],
    },
    _maskedFields: [] as string[],
    ...overrides,
  };
}

async function open(route: string, handlers: Record<string, FakeHandler> = {}) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
    [`GET ${ROLES.LIST}`]: () => ({ status: 200, data: { data: [] } }),
    [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: typeHandler,
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, route);
  return { api, services };
}

function bodyOf(call: { data?: unknown } | undefined): Record<string, unknown> {
  return JSON.parse(String(call?.data)) as Record<string, unknown>;
}

describe('DocumentEditPage: new cv-page', () => {
  it('renders every cv-page field type and creates the draft', async () => {
    const { api } = await open(contentNewPath(SLUG), {
      [`POST ${DOCUMENTS.BY_SLUG(SLUG)}`]: () => ({
        status: 201,
        data: { documentId: DOC_ID, version: 1 },
      }),
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: draft(),
      }),
    });

    await screen.findByLabelText('Position');
    expect(
      screen.getByRole('heading', { name: copy.newTitle('Page CV (Type A)') }),
    ).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(SLUG))).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Main Page' })).toBeInTheDocument();
    // The richtext editor is lazy-loaded.
    expect(await screen.findByText('Summary')).toBeInTheDocument();
    for (const label of ['Skills', 'Experiences', 'Projects', 'Educations']) {
      expect(screen.getByRole('heading', { level: 2, name: label })).toBeInTheDocument();
    }

    await userEvent.type(screen.getByLabelText('Position'), 'Engineer');
    await userEvent.click(screen.getByRole('switch', { name: 'Main Page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Click to add skills' }));
    await userEvent.type(screen.getByLabelText('Skill', { selector: 'input' }), 'React');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));

    await waitFor(() => expect(api.callsTo(`POST ${DOCUMENTS.BY_SLUG(SLUG)}`)).toHaveLength(1));
    expect(bodyOf(api.callsTo(`POST ${DOCUMENTS.BY_SLUG(SLUG)}`)[0])).toEqual({
      values: { position: 'Engineer', isMain: true },
      components: { skills: [{ values: { skill: 'React' } }] },
    });
    expect(
      await screen.findByRole('heading', { name: copy.editTitle('Page CV (Type A)') }),
    ).toBeInTheDocument();
  });

  it('blocks the save on invalid numbers and JSON in a nested component (depth 2)', async () => {
    const { api } = await open(contentNewPath(SLUG));
    await screen.findByLabelText('Position');
    await userEvent.click(screen.getByRole('button', { name: 'Click to add experiences' }));
    await userEvent.click(screen.getByRole('button', { name: 'Click to add roles' }));
    await userEvent.type(screen.getByLabelText('Team Size'), '4.5');
    await userEvent.type(screen.getByLabelText('Technical Stacks'), 'not json');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));

    expect(await screen.findByText(copy.invalidInteger)).toBeInTheDocument();
    expect(screen.getByText(copy.invalidJson)).toBeInTheDocument();
    expect(api.callsTo(`POST ${DOCUMENTS.BY_SLUG(SLUG)}`)).toHaveLength(0);
  });

  it('shows the server message when the draft is rejected and keeps the input', async () => {
    await open(contentNewPath(SLUG), {
      [`POST ${DOCUMENTS.BY_SLUG(SLUG)}`]: () => ({
        status: 400,
        data: {
          errorCode: 'DOCUMENT_INVALID',
          message: 'values.position is required',
        },
      }),
    });
    await userEvent.type(await screen.findByLabelText('Name'), 'Acme');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));
    expect(await screen.findByRole('alert')).toHaveTextContent('values.position is required');
    expect(screen.getByLabelText('Name')).toHaveValue('Acme');
  });

  it('says so when the role can see no fields', async () => {
    await open(contentNewPath(SLUG), {
      [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: () => ({
        status: 200,
        data: { ...CV_PAGE_TYPE, fields: [] },
      }),
    });
    expect(await screen.findByText(copy.noFields)).toBeInTheDocument();
  });

  it('shows a not-found notice for an unknown or unreadable type', async () => {
    await open(contentNewPath(SLUG), {
      [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: () => ({ status: 404 }),
    });
    expect(await screen.findByText(copy.typeNotFound)).toBeInTheDocument();
  });
});

describe('DocumentEditPage: edit draft', () => {
  const getDraft = (data: unknown): Record<string, FakeHandler> => ({
    [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({ status: 200, data }),
  });

  it('loads the draft and sends only the changed field with the version', async () => {
    let saved = false;
    const { api } = await open(contentEditPath(SLUG, DOC_ID), {
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: draft({ version: saved ? 4 : 3 }),
      }),
      [`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => {
        saved = true;
        return { status: 200, data: { documentId: DOC_ID, version: 4 } };
      },
    });
    const position = await screen.findByLabelText('Position');
    expect(position).toHaveValue('Engineer');
    expect(api.callsTo(`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)[0]?.params).toEqual({
      status: 'draft',
    });

    await userEvent.clear(position);
    await userEvent.type(position, 'Lead');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));

    await waitFor(() =>
      expect(api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)).toHaveLength(1),
    );
    expect(bodyOf(api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)[0])).toEqual({
      version: 3,
      values: { position: 'Lead' },
    });
    expect(await findToast(copy.saved)).toBeInTheDocument();
  });

  it('keeps component_uid when items are reordered and removed', async () => {
    const second = '00000000-0000-4000-8000-00000000000b';
    const { api } = await open(contentEditPath(SLUG, DOC_ID), {
      ...getDraft(
        draft({
          components: {
            skills: [
              {
                componentUid: UID_SKILL,
                values: { level: 'Senior', skill: 'React' },
                components: {},
              },
              {
                componentUid: second,
                values: { level: 'Mid', skill: 'Node' },
                components: {},
              },
            ],
          },
        }),
      ),
      [`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: { documentId: DOC_ID, version: 4 },
      }),
    });
    await screen.findByLabelText('Position');
    await userEvent.click(screen.getByRole('button', { name: 'Move skills 1 down' }));
    await userEvent.click(screen.getByRole('button', { name: copy.save }));
    await waitFor(() =>
      expect(api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)).toHaveLength(1),
    );
    const body = bodyOf(api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)[0]) as {
      components: { skills: { componentUid: string }[] };
    };
    expect(body.components.skills.map((item) => item.componentUid)).toEqual([second, UID_SKILL]);
  });

  it('renders masked fields read-only and never sends them', async () => {
    const { api } = await open(contentEditPath(SLUG, DOC_ID), {
      ...getDraft(
        draft({
          values: {
            position: 'Engineer',
            isMain: false,
            name: '***',
            summary: null,
          },
          components: { projects: null, skills: [] },
          _maskedFields: ['name', 'projects'],
        }),
      ),
      [`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: { documentId: DOC_ID, version: 4 },
      }),
    });
    const nameInput = await screen.findByLabelText('Name');
    expect(nameInput).toHaveAttribute('readonly');
    expect(nameInput).toHaveValue(copy.protectedValue);
    expect(screen.getByLabelText('Projects')).toHaveValue(copy.protectedValue);
    expect(screen.queryByRole('button', { name: 'Click to add projects' })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Position'), '!');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));
    await waitFor(() =>
      expect(api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)).toHaveLength(1),
    );
    expect(bodyOf(api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)[0])).toEqual({
      version: 3,
      values: { position: 'Engineer!' },
    });
  });

  it('offers a reload on a version conflict', async () => {
    const reads: DocumentRecord[] = [];
    await open(contentEditPath(SLUG, DOC_ID), {
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => {
        reads.push(draft() as unknown as DocumentRecord);
        return {
          status: 200,
          data: draft({ version: reads.length === 1 ? 3 : 5 }),
        };
      },
      [`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 409,
        data: {
          errorCode: 'DOCUMENT_VERSION_CONFLICT',
          details: { currentVersion: 5 },
        },
      }),
    });
    await userEvent.type(await screen.findByLabelText('Position'), '!');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.conflict);
    await userEvent.click(screen.getByRole('button', { name: copy.errors.reload }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Position')).toHaveValue('Engineer');
  });

  describe('conflict merge modal', () => {
    const conflictBody = (diff: unknown[]) => ({
      errorCode: 'DOCUMENT_VERSION_CONFLICT',
      details: {
        currentVersion: 5,
        server: {
          values: { position: 'Lead', name: '***' },
          components: {},
          _maskedFields: ['name'],
        },
        submitted: {
          values: { position: 'Engineer!', name: '***' },
          components: {},
          _maskedFields: ['name'],
        },
        diff,
      },
    });
    const positionDiff = {
      path: 'values.position',
      change: 'changed',
      server: 'Lead',
      submitted: 'Engineer!',
    };

    async function conflict(diff: unknown[], puts: unknown[]) {
      await open(contentEditPath(SLUG, DOC_ID), {
        [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
          status: 200,
          data: draft({ _maskedFields: ['name'] }),
        }),
        [`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: (config) => {
          puts.push(bodyOf(config));
          return puts.length === 1
            ? { status: 409, data: conflictBody(diff) }
            : { status: 200, data: { documentId: DOC_ID, version: 6 } };
        },
      });
      await userEvent.type(await screen.findByLabelText('Position'), '!');
      await userEvent.click(screen.getByRole('button', { name: copy.save }));
      return screen.findByRole('dialog', { name: copy.conflict.title });
    }

    it('shows the diff, never a masked field, and resubmits the choice with currentVersion', async () => {
      const puts: unknown[] = [];
      const dialog = await conflict(
        [
          positionDiff,
          {
            path: 'values.name',
            change: 'changed',
            server: '***',
            submitted: 'Initech',
          },
        ],
        puts,
      );
      expect(within(dialog).getByText('Lead')).toBeInTheDocument();
      expect(within(dialog).getByText('Engineer!')).toBeInTheDocument();
      expect(within(dialog).queryByText(/Initech/)).not.toBeInTheDocument();
      expect(within(dialog).getByText(copy.conflict.summary(1))).toBeVisible();

      await userEvent.click(within(dialog).getByRole('button', { name: copy.conflict.save }));
      await waitFor(() => expect(puts).toHaveLength(2));
      expect(puts[1]).toEqual({
        version: 5,
        values: { position: 'Engineer!' },
      });
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: copy.conflict.title })).not.toBeInTheDocument(),
      );
    });

    it('a merge resolve marks the type lists and the draft stale', async () => {
      const spy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
      const dialog = await conflict([positionDiff], []);
      spy.mockClear();
      await userEvent.click(within(dialog).getByRole('button', { name: copy.conflict.save }));
      await waitFor(() => {
        const keys = spy.mock.calls.map(([filters]) => filters?.queryKey);
        expect(keys).toContainEqual(CONTENT_QUERY_KEYS.list(SLUG));
        expect(keys).toContainEqual(CONTENT_QUERY_KEYS.draft(SLUG, DOC_ID));
      });
      spy.mockRestore();
    });

    it('choosing the saved version sends nothing and reloads', async () => {
      const puts: unknown[] = [];
      const dialog = await conflict([positionDiff], puts);
      await userEvent.click(within(dialog).getByRole('radio', { name: /Saved version/ }));
      await userEvent.click(within(dialog).getByRole('button', { name: copy.conflict.save }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: copy.conflict.title })).not.toBeInTheDocument(),
      );
      expect(puts).toHaveLength(1);
    });

    it('falls back to the reload alert when only masked fields differ', async () => {
      const puts: unknown[] = [];
      await open(contentEditPath(SLUG, DOC_ID), {
        [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
          status: 200,
          data: draft({ _maskedFields: ['name'] }),
        }),
        [`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: (config) => {
          puts.push(bodyOf(config));
          return {
            status: 409,
            data: conflictBody([
              {
                path: 'values.name',
                change: 'changed',
                server: '***',
                submitted: 'Initech',
              },
            ]),
          };
        },
      });
      await userEvent.type(await screen.findByLabelText('Position'), '!');
      await userEvent.click(screen.getByRole('button', { name: copy.save }));
      expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.conflict);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('can be closed and reopened from the alert', async () => {
      const dialog = await conflict([positionDiff], []);
      await userEvent.click(within(dialog).getByRole('button', { name: copy.conflict.cancel }));
      await userEvent.click(screen.getByRole('button', { name: copy.errors.reviewConflict }));
      expect(await screen.findByRole('dialog', { name: copy.conflict.title })).toBeInTheDocument();
    });
  });

  it('shows a retry when the draft cannot be loaded', async () => {
    await open(contentEditPath(SLUG, DOC_ID), {
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({ status: 500 }),
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy.loadFailed);
    expect(within(alert.parentElement!).getByRole('button')).toBeInTheDocument();
  });

  it('shows a not-found notice for a hidden document', async () => {
    await open(contentEditPath(SLUG, DOC_ID), {
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({ status: 404 }),
    });
    expect(await screen.findByText(copy.documentNotFound)).toBeInTheDocument();
  });
});

describe('DocumentEditPage: cache after a write', () => {
  const draftKey = `GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`;

  function invalidatedKeys(spy: ReturnType<typeof vi.fn>) {
    return spy.mock.calls.map(([filters]) => (filters as { queryKey: unknown }).queryKey);
  }

  it('a create marks the type lists stale', async () => {
    const { services } = await open(contentNewPath(SLUG), {
      [`POST ${DOCUMENTS.BY_SLUG(SLUG)}`]: () => ({
        status: 201,
        data: { documentId: DOC_ID, version: 1 },
      }),
      [draftKey]: () => ({ status: 200, data: draft() }),
    });
    const spy = vi.spyOn(services.queryClient, 'invalidateQueries');
    await userEvent.type(await screen.findByLabelText('Position'), 'Engineer');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));
    expect(
      await screen.findByRole('heading', { name: copy.editTitle('Page CV (Type A)') }),
    ).toBeInTheDocument();
    expect(invalidatedKeys(spy)).toContainEqual(CONTENT_QUERY_KEYS.list(SLUG));
  });

  it('an update marks the type lists and the draft stale', async () => {
    const { services } = await open(contentEditPath(SLUG, DOC_ID), {
      [draftKey]: () => ({ status: 200, data: draft() }),
      [`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: { documentId: DOC_ID, version: 4 },
      }),
    });
    const spy = vi.spyOn(services.queryClient, 'invalidateQueries');
    const position = await screen.findByLabelText('Position');
    await userEvent.clear(position);
    await userEvent.type(position, 'Lead');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));
    await findToast(copy.saved);
    await waitFor(() => {
      expect(invalidatedKeys(spy)).toContainEqual(CONTENT_QUERY_KEYS.list(SLUG));
      expect(invalidatedKeys(spy)).toContainEqual(CONTENT_QUERY_KEYS.draft(SLUG, DOC_ID));
    });
  });
});

describe('DocumentEditPage: form key', () => {
  const OTHER_SLUG = 'note';
  const otherType = {
    slug: OTHER_SLUG,
    displayName: 'Note',
    kind: 'collection',
    draftAndPublish: false,
    fields: [
      {
        path: 'title',
        type: 'string',
        system: false,
        component: false,
        width: 'full',
        repeatable: false,
        rootScalar: true,
        conditionKind: null,
        sensitive: false,
        default: 'Untitled note',
      },
    ],
  };

  function openWithLink(handlers: Record<string, FakeHandler> = {}) {
    const { api, services } = createTestServices({
      [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: typeHandler,
      [`GET ${CONTENT_TYPES.ONE(OTHER_SLUG)}`]: () => ({ status: 200, data: otherType }),
      ...handlers,
    });
    renderInApp(
      services,
      <>
        <Link to={contentNewPath(OTHER_SLUG)}>go to note</Link>
        <Routes>
          <Route path="/" element={<Navigate to={contentNewPath(SLUG)} replace />} />
          <Route path="/content/:slug/new" element={<DocumentEditPage />} />
        </Routes>
      </>,
    );
    return { api, services };
  }

  it('a create form of another type starts from that type, not the typed values', async () => {
    const { services } = openWithLink();
    // Cached before the move, so the form never sees a loading gap between the two types.
    services.queryClient.setQueryData(CONTENT_QUERY_KEYS.type(OTHER_SLUG), otherType);
    await userEvent.type(await screen.findByLabelText('Position'), 'Engineer');
    await userEvent.click(screen.getByRole('link', { name: 'go to note' }));

    expect(await screen.findByLabelText('Title')).toHaveValue('Untitled note');
    expect(screen.queryByDisplayValue('Engineer')).not.toBeInTheDocument();
  });

  it('keeps typed values when a background refetch returns the same draft version', async () => {
    const draftKey = `GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`;
    const { services } = await open(contentEditPath(SLUG, DOC_ID), {
      [draftKey]: () => ({ status: 200, data: draft() }),
    });
    const position = await screen.findByLabelText('Position');
    await userEvent.clear(position);
    await userEvent.type(position, 'Lead');
    await services.queryClient.refetchQueries({ queryKey: CONTENT_QUERY_KEYS.draft(SLUG, DOC_ID) });
    expect(screen.getByLabelText('Position')).toHaveValue('Lead');
  });
});
