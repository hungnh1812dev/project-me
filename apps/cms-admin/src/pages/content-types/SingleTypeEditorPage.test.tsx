import { act, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { ContentType, Document } from '@/features/content/types';
import { makeContentType, makeDocument } from '@/test/contentFixtures';
import { makeMeUser, makeRole } from '@/test/fixtures';
import {
  errorReply,
  getSingleTypeHandler,
  publishSingleTypeHandler,
  saveSingleTypeHandler,
  unpublishSingleTypeHandler,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { renderRoutes } from '@/test/renderWithProviders';

import SingleTypeEditorPage from './SingleTypeEditorPage';

const ALL = [
  'content_type:read',
  'document:read',
  'document:update',
  'document:publish',
  'document:unpublish',
];

const HOME = makeContentType({
  slug: 'home',
  name: 'Home',
  kind: 'single',
  fields: [
    { name: 'headline', type: 'text', header: true },
    { name: 'heroCount', type: 'number' },
  ],
});

function renderPage(type: ContentType = HOME, permissions = ALL) {
  // A data router, because the unsaved-changes guard uses `useBlocker`.
  return renderRoutes(
    [
      { path: '/admin/content-types/home', element: <SingleTypeEditorPage type={type} /> },
      { path: '/admin/content-types', element: <h1>Overview</h1> },
    ],
    {
      route: '/admin/content-types/home',
      auth: { status: 'authenticated', user: makeMeUser({ role: makeRole({ permissions }) }) },
    },
  );
}

/** S1 replies with `doc` (wrapped), or 404 when `doc` is null. */
function single(doc: Document | null) {
  return getSingleTypeHandler(
    doc ? () => HttpResponse.json({ data: doc }) : errorReply(404, 'Document not found'),
  );
}

/** Matches the audit paragraph, whose date sits in a nested <time>. */
const auditLine = (pattern: RegExp) => (_: string, element: Element | null) =>
  element?.tagName === 'P' && pattern.test(element.textContent ?? '');

const saved = (overrides: Partial<Document> = {}) =>
  makeDocument({ headline: 'Welcome', heroCount: 3, ...overrides });

describe('SingleTypeEditorPage loading states', () => {
  it('shows a status while the document loads', () => {
    server.use(single(saved()).handler);

    renderPage();

    expect(screen.getByText('Loading document…')).toHaveAttribute('role', 'status');
  });

  it('shows the access alert without a request when read is denied', async () => {
    const s1 = single(saved());
    server.use(s1.handler);

    renderPage(HOME, ['content_type:read', 'document:read:other']);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have access to this content type.",
    );
    expect(s1.requests).toHaveLength(0);
  });

  it('shows the access alert when the server forbids the document', async () => {
    server.use(getSingleTypeHandler(errorReply(403, 'Forbidden resource')).handler);

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have access to this content type.",
    );
  });

  it('shows a generic alert when the document fails otherwise', async () => {
    server.use(getSingleTypeHandler(errorReply(400, 'Bad slug')).handler);

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the document.");
  });
});

describe('SingleTypeEditorPage header (AC-17, AC-18)', () => {
  it('shows "Not saved yet" and an empty form for a never-saved single type', async () => {
    server.use(single(null).handler);

    renderPage();

    expect(await screen.findByText('Not saved yet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    expect(screen.getByLabelText('Headline')).toHaveValue('');
    expect(screen.getByLabelText('Hero count')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpublish' })).not.toBeInTheDocument();
  });

  it('shows the status badge and the audit line of a saved document', async () => {
    server.use(single(saved({ status: 'modified' })).handler);

    renderPage();

    await screen.findByLabelText('Headline');
    const header = screen.getByRole('heading', { level: 1, name: 'Home' }).closest('header')!;
    expect(within(header).getByText('Modified')).toHaveAttribute('data-slot', 'badge');
    expect(within(header).getByText(auditLine(/^Updated .+ by Jane Doe$/))).toBeInTheDocument();
    expect(header.querySelector('time')).toHaveAttribute('dateTime', '2026-01-01T00:00:00.000Z');
    expect(screen.getByLabelText('Headline')).toHaveValue('Welcome');
  });

  it('names an unknown user in the audit line', async () => {
    server.use(single(saved({ updatedBy: null })).handler);

    renderPage();

    expect(
      await screen.findByText(auditLine(/^Updated .+ by an unknown user$/)),
    ).toBeInTheDocument();
  });

  it.each<[Document['status'], string[], string[]]>([
    ['draft', ['Publish'], ['Unpublish']],
    ['modified', ['Publish', 'Unpublish'], []],
    ['published', ['Unpublish'], ['Publish']],
  ])('a %s document shows %j and hides %j', async (status, shown, hidden) => {
    server.use(single(saved({ status })).handler);

    renderPage();

    await screen.findByLabelText('Headline');
    for (const name of shown) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    for (const name of hidden)
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  });

  it('shows no badge and no publish control without draft and publish', async () => {
    server.use(single(saved({ status: 'modified' })).handler);

    renderPage({ ...HOME, draftToPublish: false });

    await screen.findByLabelText('Headline');
    expect(screen.queryByText('Modified')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpublish' })).not.toBeInTheDocument();
  });
});

describe('SingleTypeEditorPage save (AC-15, AC-17)', () => {
  it('disables Save on a clean form', async () => {
    server.use(single(saved()).handler);

    renderPage();

    expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves only schema fields with S2, announces "Saved." and is clean again', async () => {
    const s2 = saveSingleTypeHandler();
    server.use(single(null).handler, s2.handler);
    const { user } = renderPage();

    await user.type(await screen.findByLabelText('Headline'), 'Hi');
    await user.type(screen.getByLabelText('Hero count'), '4');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(s2.requests).toHaveLength(1));
    expect(s2.requests[0]!.body).toEqual({ data: { headline: 'Hi', heroCount: 4 } });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('Draft')).toHaveAttribute('data-slot', 'badge');
    expect(screen.queryByText('Not saved yet')).not.toBeInTheDocument();
  });

  it('keeps the values and shows the 400 messages on a failed save', async () => {
    server.use(
      single(saved()).handler,
      saveSingleTypeHandler(errorReply(400, 'headline is too long')).handler,
    );
    const { user } = renderPage();

    await user.type(await screen.findByLabelText('Headline'), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('headline is too long');
    expect(screen.getByLabelText('Headline')).toHaveValue('Welcome!');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

describe('SingleTypeEditorPage read-only (AC-14)', () => {
  it('is read-only with the reason when update is denied, and Save is gated', async () => {
    const s2 = saveSingleTypeHandler();
    server.use(single(saved()).handler, s2.handler);
    const { user } = renderPage(HOME, ['content_type:read', 'document:read']);

    const headline = await screen.findByLabelText('Headline');
    expect(headline).toHaveAttribute('readonly');
    expect(screen.getByRole('note')).toHaveTextContent(/document:update/);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-disabled', 'true');

    await user.click(save);
    expect(s2.requests).toHaveLength(0);
  });
});

describe('SingleTypeEditorPage publish (AC-18)', () => {
  it('publishes with S3, announces it and updates the badge', async () => {
    let status: Document['status'] = 'draft';
    const s1 = getSingleTypeHandler(() => HttpResponse.json({ data: saved({ status }) }));
    const s3 = publishSingleTypeHandler(() => {
      status = 'published';
      return HttpResponse.json({ status: 'published' });
    });
    server.use(s1.handler, s3.handler);
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(s3.requests).toHaveLength(1));
    expect(await screen.findByText('Published.')).toBeInTheDocument();
    expect(await screen.findByText('Published')).toHaveAttribute('data-slot', 'badge');
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('unpublishes with S4 and announces it', async () => {
    const s4 = unpublishSingleTypeHandler();
    server.use(single(saved({ status: 'published' })).handler, s4.handler);
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Unpublish' }));

    await waitFor(() => expect(s4.requests).toHaveLength(1));
    expect(await screen.findByText('Unpublished.')).toBeInTheDocument();
  });

  it('blocks Publish and Unpublish with "Save your changes first." while dirty', async () => {
    const s3 = publishSingleTypeHandler();
    server.use(single(saved({ status: 'modified' })).handler, s3.handler);
    const { user } = renderPage();

    await user.type(await screen.findByLabelText('Headline'), '!');

    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(publish).toHaveAttribute('aria-disabled', 'true');
    expect(publish).toHaveAccessibleDescription('Save your changes first.');
    expect(screen.getByRole('button', { name: 'Unpublish' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(publish);
    expect(s3.requests).toHaveLength(0);
  });

  it('gates Publish with the permission reason when publish is denied', async () => {
    server.use(single(saved()).handler);

    renderPage(HOME, ['content_type:read', 'document:read', 'document:update']);

    const publish = await screen.findByRole('button', { name: 'Publish' });
    expect(publish).toHaveAttribute('aria-disabled', 'true');
    expect(publish).toHaveAccessibleDescription(/document:publish/);
  });

  it('shows "no access" when the server forbids the publish', async () => {
    server.use(
      single(saved()).handler,
      publishSingleTypeHandler(errorReply(403, 'Forbidden resource')).handler,
    );
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Publish' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have access to do this.");
  });

  it('shows the server message when a publish fails otherwise', async () => {
    server.use(
      single(saved()).handler,
      publishSingleTypeHandler(errorReply(400, 'Draft and publish is off')).handler,
    );
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Publish' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Draft and publish is off');
  });
});

describe('SingleTypeEditorPage unsaved changes (AC-16)', () => {
  it('asks before leaving a dirty form, and Cancel keeps the edits', async () => {
    server.use(single(saved()).handler);
    const { user, router } = renderPage();
    await user.type(await screen.findByLabelText('Headline'), '!');

    await act(() => router.navigate('/admin/content-types'));

    expect(
      await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe('/admin/content-types/home');
    expect(screen.getByLabelText('Headline')).toHaveValue('Welcome!');
  });

  it('leaves a just-saved form without asking', async () => {
    server.use(single(saved()).handler, saveSingleTypeHandler().handler);
    const { user, router } = renderPage();
    await user.type(await screen.findByLabelText('Headline'), '!');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved.');

    await act(() => router.navigate('/admin/content-types'));

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
