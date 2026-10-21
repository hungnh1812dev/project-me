import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CV_PAGE_TYPE } from '../../../test/cv-page.fixture';
import type { FakeHandler } from '../../../test/fake-api';
import {
  createTestServices,
  renderApp,
  TEST_USER,
} from '../../../test/render-app';
import { COPY } from '../../config/copy.constants';
import { API_ENDPOINTS } from '../../config/endpoints';
import { contentEditPath, contentNewPath } from '../../config/routes';
import type { DocumentRecord } from './content.api';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { CONTENT_TYPES, DOCUMENTS, ROLES } = API_ENDPOINTS;
const copy = COPY.content;
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
      company: 'Acme',
      summary: '<p>Hi</p>',
    },
    components: {
      skill: [
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
  return { api };
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
      screen.getByRole('heading', { name: copy.newTitle(SLUG) }),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Is main' })).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
    for (const label of [
      'Skill',
      'Experience',
      'Project',
      'Education',
      'Language',
      'Reference',
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name: label }),
      ).toBeInTheDocument();
    }

    await userEvent.type(screen.getByLabelText('Position'), 'Engineer');
    await userEvent.click(screen.getByRole('switch', { name: 'Is main' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add skill' }));
    await userEvent.type(
      screen.getByLabelText('Skill', { selector: 'input' }),
      'React',
    );
    await userEvent.click(screen.getByRole('button', { name: copy.save }));

    await waitFor(() =>
      expect(api.callsTo(`POST ${DOCUMENTS.BY_SLUG(SLUG)}`)).toHaveLength(1),
    );
    expect(bodyOf(api.callsTo(`POST ${DOCUMENTS.BY_SLUG(SLUG)}`)[0])).toEqual({
      values: { position: 'Engineer', isMain: true },
      components: { skill: [{ values: { skill: 'React' } }] },
    });
    expect(
      await screen.findByRole('heading', { name: copy.editTitle(SLUG) }),
    ).toBeInTheDocument();
  });

  it('blocks the save on invalid numbers and JSON in a nested component (depth 2)', async () => {
    const { api } = await open(contentNewPath(SLUG));
    await screen.findByLabelText('Position');
    await userEvent.click(
      screen.getByRole('button', { name: 'Add experience' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add role' }));
    await userEvent.type(screen.getByLabelText('Team size'), '4.5');
    await userEvent.type(screen.getByLabelText('Tech stack'), 'not json');
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
    await userEvent.type(await screen.findByLabelText('Company'), 'Acme');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'values.position is required',
    );
    expect(screen.getByLabelText('Company')).toHaveValue('Acme');
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
    expect(
      api.callsTo(`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)[0]?.params,
    ).toEqual({ status: 'draft' });

    await userEvent.clear(position);
    await userEvent.type(position, 'Lead');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));

    await waitFor(() =>
      expect(api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)).toHaveLength(
        1,
      ),
    );
    expect(
      bodyOf(api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)[0]),
    ).toEqual({
      version: 3,
      values: { position: 'Lead' },
    });
    expect(await screen.findByText(copy.saved)).toBeInTheDocument();
  });

  it('keeps component_uid when items are reordered and removed', async () => {
    const second = '00000000-0000-4000-8000-00000000000b';
    const { api } = await open(contentEditPath(SLUG, DOC_ID), {
      ...getDraft(
        draft({
          components: {
            skill: [
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
    await userEvent.click(
      screen.getByRole('button', { name: 'Move skill 1 down' }),
    );
    await userEvent.click(screen.getByRole('button', { name: copy.save }));
    await waitFor(() =>
      expect(api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)).toHaveLength(
        1,
      ),
    );
    const body = bodyOf(
      api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)[0],
    ) as {
      components: { skill: { componentUid: string }[] };
    };
    expect(body.components.skill.map((item) => item.componentUid)).toEqual([
      second,
      UID_SKILL,
    ]);
  });

  it('renders masked fields read-only and never sends them', async () => {
    const { api } = await open(contentEditPath(SLUG, DOC_ID), {
      ...getDraft(
        draft({
          values: {
            position: 'Engineer',
            isMain: false,
            company: '***',
            summary: null,
          },
          components: { reference: null, skill: [] },
          _maskedFields: ['company', 'reference'],
        }),
      ),
      [`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: { documentId: DOC_ID, version: 4 },
      }),
    });
    const company = await screen.findByLabelText('Company');
    expect(company).toHaveAttribute('readonly');
    expect(company).toHaveValue(copy.protectedValue);
    expect(screen.getByLabelText('Reference')).toHaveValue(copy.protectedValue);
    expect(
      screen.queryByRole('button', { name: 'Add reference' }),
    ).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Position'), '!');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));
    await waitFor(() =>
      expect(api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)).toHaveLength(
        1,
      ),
    );
    expect(
      bodyOf(api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)[0]),
    ).toEqual({
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      copy.errors.conflict,
    );
    await userEvent.click(
      screen.getByRole('button', { name: copy.errors.reload }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Position')).toHaveValue('Engineer');
  });

  describe('conflict merge modal', () => {
    const conflictBody = (diff: unknown[]) => ({
      errorCode: 'DOCUMENT_VERSION_CONFLICT',
      details: {
        currentVersion: 5,
        server: {
          values: { position: 'Lead', company: '***' },
          components: {},
          _maskedFields: ['company'],
        },
        submitted: {
          values: { position: 'Engineer!', company: '***' },
          components: {},
          _maskedFields: ['company'],
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
          data: draft({ _maskedFields: ['company'] }),
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
            path: 'values.company',
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

      await userEvent.click(
        within(dialog).getByRole('button', { name: copy.conflict.save }),
      );
      await waitFor(() => expect(puts).toHaveLength(2));
      expect(puts[1]).toEqual({
        version: 5,
        values: { position: 'Engineer!' },
      });
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: copy.conflict.title }),
        ).not.toBeInTheDocument(),
      );
    });

    it('choosing the saved version sends nothing and reloads', async () => {
      const puts: unknown[] = [];
      const dialog = await conflict([positionDiff], puts);
      await userEvent.click(
        within(dialog).getByRole('radio', { name: /Saved version/ }),
      );
      await userEvent.click(
        within(dialog).getByRole('button', { name: copy.conflict.save }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: copy.conflict.title }),
        ).not.toBeInTheDocument(),
      );
      expect(puts).toHaveLength(1);
    });

    it('falls back to the reload alert when only masked fields differ', async () => {
      const puts: unknown[] = [];
      await open(contentEditPath(SLUG, DOC_ID), {
        [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
          status: 200,
          data: draft({ _maskedFields: ['company'] }),
        }),
        [`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: (config) => {
          puts.push(bodyOf(config));
          return {
            status: 409,
            data: conflictBody([
              {
                path: 'values.company',
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
      expect(await screen.findByRole('alert')).toHaveTextContent(
        copy.errors.conflict,
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('can be closed and reopened from the alert', async () => {
      const dialog = await conflict([positionDiff], []);
      await userEvent.click(
        within(dialog).getByRole('button', { name: copy.conflict.cancel }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: copy.errors.reviewConflict }),
      );
      expect(
        await screen.findByRole('dialog', { name: copy.conflict.title }),
      ).toBeInTheDocument();
    });
  });

  it('shows a retry when the draft cannot be loaded', async () => {
    await open(contentEditPath(SLUG, DOC_ID), {
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({ status: 500 }),
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy.loadFailed);
    expect(
      within(alert.parentElement!).getByRole('button'),
    ).toBeInTheDocument();
  });

  it('shows a not-found notice for a hidden document', async () => {
    await open(contentEditPath(SLUG, DOC_ID), {
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({ status: 404 }),
    });
    expect(await screen.findByText(copy.documentNotFound)).toBeInTheDocument();
  });
});
