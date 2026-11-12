import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { APP_ROUTES } from '@configs/App.routes';
import { EN_TEXT } from '@configs/locales/en';
import type { Role } from '@features/access/Access.api';
import type { CurrentUser } from '@features/auth/Auth.slice';
import type { DefinitionValidation } from '@features/content-types';
import type { FakeHandler } from '@test/FakeApi.fixture';
import { createTestServices, renderApp, TEST_USER } from '@test/RenderApp.fixture';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const VALIDATE = `POST ${API_ENDPOINTS.CONTENT_TYPES.VALIDATE}`;
const copy = EN_TEXT.schemaBuilder;
const SLUG_ERROR = 'Slug must not be empty';

const adminRole: Role = {
  id: 'role_admin',
  slug: 'admin',
  name: 'Admin',
  rank: 80,
  isSystem: true,
  accountCount: 1,
  manageable: true,
  permissions: [],
};
const admin: CurrentUser = { ...TEST_USER, id: 'acc_a', role: 'admin' };

const VALID: DefinitionValidation = { valid: true, errors: [] };
const SLUG_INVALID: DefinitionValidation = {
  valid: false,
  errors: [{ path: ['slug'], rule: 'slug-format', message: SLUG_ERROR }],
};

async function open(
  user: CurrentUser,
  validate: FakeHandler = () => ({ status: 200, data: VALID }),
) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: user }),
    [`GET ${API_ENDPOINTS.ROLES.LIST}`]: () => ({ status: 200, data: { data: [adminRole] } }),
    [VALIDATE]: validate,
  });
  await services.session.restore();
  renderApp(services, APP_ROUTES.SCHEMA_BUILDER);
  return { api };
}

const startNew = async () =>
  userEvent.click(await screen.findByRole('button', { name: copy.start.newType }));

const lastRequest = (api: Awaited<ReturnType<typeof open>>['api']) =>
  JSON.parse(String(api.callsTo(VALIDATE).at(-1)?.data)) as {
    definition: Record<string, unknown>;
    mode: string;
  };

describe('SchemaBuilderPage', () => {
  it('starts empty with the two start actions and sends no check', async () => {
    const { api } = await open(TEST_USER);
    expect(await screen.findByRole('heading', { name: copy.title })).toBeVisible();
    expect(screen.getByRole('button', { name: copy.start.importJson })).toBeVisible();
    expect(screen.getByRole('button', { name: copy.start.newType })).toBeVisible();
    expect(api.callsTo(VALIDATE)).toHaveLength(0);
  });

  it('gives the owner one System settings menu item', async () => {
    await open(TEST_USER);
    await screen.findByRole('heading', { name: copy.title });
    const links = screen.getAllByRole('link', { name: EN_TEXT.access.nav.schemaBuilder });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', APP_ROUTES.SCHEMA_BUILDER);
  });

  it('gives a non-owner no menu item', async () => {
    await open(admin);
    await screen.findByText(copy.forbidden);
    expect(
      screen.queryByRole('link', { name: EN_TEXT.access.nav.schemaBuilder }),
    ).not.toBeInTheDocument();
  });

  it('shows the forbidden state to a non-owner and sends no check', async () => {
    const { api } = await open(admin);
    expect(await screen.findByText(copy.forbidden)).toBeVisible();
    expect(screen.queryByRole('button', { name: copy.start.newType })).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(api.callsTo(VALIDATE)).toHaveLength(0);
  });

  it('starts a new type with the defaults and checks it in create mode', async () => {
    const { api } = await open(TEST_USER, () => ({ status: 200, data: SLUG_INVALID }));
    await startNew();
    expect(screen.getByLabelText(copy.typeKeys.kind)).toHaveValue('collection');
    expect(screen.getByRole('checkbox', { name: copy.typeKeys.draftAndPublish })).toBeChecked();
    await vi.waitFor(() => expect(api.callsTo(VALIDATE)).toHaveLength(1));
    expect(lastRequest(api)).toMatchObject({
      mode: 'create',
      definition: { slug: '', kind: 'collection', fields: [] },
    });
    const slugField = screen.getByLabelText(new RegExp(copy.typeKeys.slug));
    await vi.waitFor(() =>
      expect(slugField).toHaveAccessibleDescription(expect.stringContaining(SLUG_ERROR)),
    );
    expect(slugField).toBeInvalid();
    expect(screen.getByText(copy.validation.errorCount(1))).toBeVisible();
  });

  it('keeps export off until the current tree checks clean, then offers the next steps', async () => {
    const downloads: string[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    await open(TEST_USER, (config) => {
      const { definition } = JSON.parse(String(config.data)) as { definition: { slug: string } };
      return { status: 200, data: definition.slug === 'cv-page' ? VALID : SLUG_INVALID };
    });
    await startNew();
    const download = screen.getByRole('button', { name: copy.export.download });
    expect(download).toBeDisabled();
    await userEvent.type(screen.getByLabelText(new RegExp(copy.typeKeys.slug)), 'cv-page');
    expect(download).toBeDisabled();
    await vi.waitFor(() => expect(download).toBeEnabled());
    await userEvent.click(download);
    expect(downloads).toEqual(['cv-page.json']);
    expect(await screen.findByText(copy.export.nextSteps.heading)).toBeVisible();
    await userEvent.type(screen.getByLabelText(copy.typeKeys.displayName), 'CV');
    expect(screen.queryByText(copy.export.nextSteps.heading)).not.toBeInTheDocument();
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it('asks before starting again over changed work, and keeps it on cancel', async () => {
    await open(TEST_USER);
    await startNew();
    await userEvent.type(screen.getByLabelText(new RegExp(copy.typeKeys.slug)), 'cv-page');
    await userEvent.click(screen.getByRole('button', { name: copy.start.newType }));
    const dialog = await screen.findByRole('dialog', { name: copy.restartDialog.title });
    await userEvent.click(within(dialog).getByRole('button', { name: copy.restartDialog.cancel }));
    expect(screen.getByLabelText(new RegExp(copy.typeKeys.slug))).toHaveValue('cv-page');
    await userEvent.click(screen.getByRole('button', { name: copy.start.newType }));
    await userEvent.click(await screen.findByRole('button', { name: copy.restartDialog.confirm }));
    expect(screen.getByLabelText(new RegExp(copy.typeKeys.slug))).toHaveValue('');
  });

  it('does not ask before starting again over untouched work', async () => {
    await open(TEST_USER);
    await startNew();
    await userEvent.click(screen.getByRole('button', { name: copy.start.newType }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('imports a file in update mode, even when it has errors, and refuses bad text', async () => {
    const { api } = await open(TEST_USER, () => ({ status: 200, data: SLUG_INVALID }));
    await userEvent.click(await screen.findByRole('button', { name: copy.start.importJson }));
    const box = await screen.findByLabelText(copy.import.textLabel);
    await userEvent.click(box);
    await userEvent.paste('nope');
    await userEvent.click(screen.getByRole('button', { name: copy.import.submit }));
    expect(await screen.findByText(copy.import.refusal.notJson)).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
    await userEvent.clear(box);
    await userEvent.paste('{"slug":"cv-page","displayName":"CV","fields":[]}');
    await userEvent.click(screen.getByRole('button', { name: copy.import.submit }));
    expect(await screen.findByLabelText(new RegExp(copy.typeKeys.slug))).toHaveValue('cv-page');
    await vi.waitFor(() => expect(api.callsTo(VALIDATE)).toHaveLength(1));
    expect(lastRequest(api)).toMatchObject({ mode: 'update', definition: { slug: 'cv-page' } });
  });

  it('shows Validation unavailable with a retry and keeps export off', async () => {
    let calls = 0;
    const { api } = await open(TEST_USER, () => {
      calls += 1;
      return calls === 1 ? { status: 503 } : { status: 200, data: VALID };
    });
    await startNew();
    expect(await screen.findByText(copy.validation.unavailable)).toBeVisible();
    expect(screen.getByRole('button', { name: copy.export.download })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: copy.validation.retry }));
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: copy.export.download })).toBeEnabled(),
    );
    expect(api.callsTo(VALIDATE)).toHaveLength(2);
  });
});
