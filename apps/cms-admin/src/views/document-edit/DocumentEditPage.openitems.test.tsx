import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { contentEditPath, contentNewPath } from '@configs/App.routes';
import { EN_TEXT } from '@configs/locales/en';
import { CV_PAGE_TYPE } from '@test/CvPage.fixture';
import type { FakeHandler } from '@test/FakeApi.fixture';
import { createTestServices, findToast, renderInApp, TEST_USER } from '@test/RenderApp.fixture';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router';

import { DocumentEditPage } from './DocumentEditPage';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { CONTENT_TYPES, DOCUMENTS, ROLES } = API_ENDPOINTS;
const copy = EN_TEXT.content;
const SLUG = 'cv-page';
const DOC_ID = 'doc_1';
const OTHER_ID = 'doc_2';
const UID_SKILL = '00000000-0000-4000-8000-00000000000a';
const SKILL_TOGGLE = /^(Skills 1|1: )/;

const draftOf = (documentId: string, version: number, skills: unknown[]) => ({
  documentId,
  version,
  values: { position: 'Engineer', isMain: false, name: 'Acme', summary: '<p>Hi</p>' },
  components: { skills },
  _maskedFields: [] as string[],
});
const storedSkill = { componentUid: UID_SKILL, values: { skill: 'React' }, components: {} };

async function openPage(route: string, handlers: Record<string, FakeHandler>) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
    [`GET ${ROLES.LIST}`]: () => ({ status: 200, data: { data: [] } }),
    [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: () => ({ status: 200, data: CV_PAGE_TYPE }),
    ...handlers,
  });
  await services.session.restore();
  renderInApp(
    services,
    <>
      <Link to={contentEditPath(SLUG, OTHER_ID)}>go to other</Link>
      <Routes>
        <Route path="/content/:slug/new" element={<DocumentEditPage />} />
        <Route path="/content/:slug/:documentId" element={<DocumentEditPage />} />
      </Routes>
    </>,
    { entries: [route], index: 0 },
  );
  return api;
}

describe('DocumentEditPage: open items (CE-6)', () => {
  it('keeps an open item open across a save that bumps the version', async () => {
    let version = 3;
    const api = await openPage(contentEditPath(SLUG, DOC_ID), {
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: draftOf(DOC_ID, version, [storedSkill]),
      }),
      [`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => {
        version = 4;
        return { status: 200, data: { documentId: DOC_ID, version } };
      },
    });
    const toggle = await screen.findByRole('button', { name: SKILL_TOGGLE });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    const position = screen.getByLabelText('Position');
    await userEvent.clear(position);
    await userEvent.type(position, 'Lead');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));
    await waitFor(() =>
      expect(api.callsTo(`PUT ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)).toHaveLength(1),
    );
    expect(await findToast(copy.saved)).toBeInTheDocument();
    await waitFor(() =>
      expect(api.callsTo(`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`).length).toBeGreaterThan(1),
    );
    expect(screen.getByRole('button', { name: SKILL_TOGGLE })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps an added item open through the create-to-edit move, re-keyed to its uid', async () => {
    const createdSkill = { componentUid: UID_SKILL, values: { skill: 'Go' }, components: {} };
    await openPage(contentNewPath(SLUG), {
      [`POST ${DOCUMENTS.BY_SLUG(SLUG)}`]: () => ({
        status: 201,
        data: { documentId: DOC_ID, version: 1 },
      }),
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: draftOf(DOC_ID, 1, [createdSkill]),
      }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Click to add skills' }));
    await userEvent.type(screen.getByLabelText('Skill', { selector: 'input' }), 'Go');
    await userEvent.click(screen.getByRole('button', { name: copy.save }));
    expect(
      await screen.findByRole('heading', { name: copy.editTitle('Page CV (Type A)') }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: SKILL_TOGGLE })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('closes every item when another document opens', async () => {
    await openPage(contentEditPath(SLUG, DOC_ID), {
      [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
        status: 200,
        data: draftOf(DOC_ID, 3, [storedSkill]),
      }),
      [`GET ${DOCUMENTS.BY_ID(SLUG, OTHER_ID)}`]: () => ({
        status: 200,
        data: draftOf(OTHER_ID, 1, [storedSkill]),
      }),
    });
    await userEvent.click(await screen.findByRole('button', { name: SKILL_TOGGLE }));
    await userEvent.click(screen.getByRole('link', { name: 'go to other' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: SKILL_TOGGLE })).toHaveAttribute(
        'aria-expanded',
        'false',
      ),
    );
  });
});
