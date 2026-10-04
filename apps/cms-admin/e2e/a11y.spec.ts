import { AxeBuilder } from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

import type { Role } from '../src/features/auth/types.ts';
import type { ContentType } from '../src/features/content/types.ts';
import type { AccessToken, MediaAsset } from '../src/features/settings/types.ts';
import { blogPost, CONTENT_MANAGER, seedContent } from './fixtures/contentFixtures.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';
import type { MockContent } from './fixtures/mockContent.ts';

/**
 * Accessibility gates (AC-45, AC-46): axe on every listed page in both themes at desktop and
 * phone width, plus keyboard-only walks with a visible focus indicator on every Tab stop.
 */
const STAMP = '2026-01-01T00:00:00.000Z';
const ARTICLE: ContentType = {
  documentId: 'ct-article',
  slug: 'article',
  name: 'Article',
  kind: 'collection',
  draftToPublish: true,
  fields: [{ name: 'title', type: 'text', header: true }],
  listFields: ['title'],
  createdAt: STAMP,
  updatedAt: STAMP,
};

/**
 * `seed` picks the fixtures: Jane (the default), the settings super admin, or the Phase 5 content
 * manager. `ready` waits for what loads after the heading (a list, a lazy editor).
 */
const PAGES: {
  path: string;
  heading: string;
  signedIn: boolean;
  seed?: 'settings' | 'documents';
  ready?: (page: Page) => Promise<void>;
}[] = [
  { path: '/login', heading: 'Sign in', signedIn: false },
  { path: '/register', heading: 'Create account', signedIn: false },
  { path: '/forgot-password', heading: 'Reset your password', signedIn: false },
  { path: '/403', heading: 'Access denied', signedIn: false },
  { path: '/admin', heading: 'Welcome, Jane Doe', signedIn: true },
  { path: '/admin/profile', heading: 'Your profile', signedIn: true },
  { path: '/admin/content-types/article', heading: 'Article', signedIn: true },
  { path: '/admin/dev/ui-kit', heading: 'UI kit', signedIn: true },
  // AC-16: the pages the palette change touches most.
  {
    path: '/admin/settings/users',
    heading: 'Users',
    signedIn: true,
    seed: 'settings',
    ready: (page) => expect(page.locator('[aria-busy="true"]')).toHaveCount(0),
  },
  {
    path: '/admin/settings/media',
    heading: 'Media library',
    signedIn: true,
    seed: 'settings',
    ready: (page) => expect(page.locator('[aria-busy="true"]')).toHaveCount(0),
  },
  {
    // The field showcase has a `media` field (Cover image).
    path: '/admin/content-types/showcase/new',
    heading: 'New entry',
    signedIn: true,
    seed: 'documents',
    ready: (page) =>
      expect(page.getByRole('group', { name: 'Cover image', exact: true })).toBeVisible(),
  },
];
const THEMES = ['light', 'dark'] as const;
const DARK = /(^|\s)dark(\s|$)/;
const WIDTHS = [1280, 375] as const;

/** Jane can read content types, so the content-type page and its menu render. */
function seed(mockApi: MockApi, signedIn: boolean) {
  mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe', role: ROLES.contentEditor });
  mockApi.content.addContentType(ARTICLE);
  if (signedIn) mockApi.signInAs('jane@example.com');
}

/** Stores the theme choice before any page script runs, and turns transitions off. */
async function prepare(page: Page, theme: string, width: number) {
  await page.addInitScript({
    content: `window.localStorage.setItem('cms-admin:theme', '${theme}');`,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height: 812 });
}

/** Runs axe once the theme and fonts have settled; serious or critical violations fail. */
async function expectNoBlockingViolations(page: Page, theme: string) {
  const html = expect(page.locator('html'));
  await (theme === 'dark' ? html.toHaveClass(DARK) : html.not.toHaveClass(DARK));
  await page.evaluate('document.fonts.ready');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));

  expect(blocking).toEqual([]);
}

for (const { path, heading, signedIn, seed: fixtures, ready } of PAGES) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`axe: ${path} has no serious or critical violations (${theme}, ${width}px)`, async ({
        page,
        mockApi,
        mockContent,
      }) => {
        if (fixtures === 'settings') seedSettings(mockApi);
        else if (fixtures === 'documents') seedDocuments(mockApi, mockContent);
        else seed(mockApi, signedIn);
        await prepare(page, theme, width);

        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        await ready?.(page);

        await expectNoBlockingViolations(page, theme);
      });
    }
  }
}

/** What the browser reports about the element that has focus after a Tab press. */
interface TabStop {
  name: string;
  landmark: string;
  /** Inside `<main>`, even when a nearer `<header>` (a page header) sets `landmark`. */
  inMain: boolean;
  top: number;
  visibleFocus: boolean;
}

/**
 * Presses Tab until focus leaves the document or comes back to the first stop, and records each
 * stop. A cap well above the real count turns a keyboard trap into a test failure.
 */
async function walkTabOrder(page: Page, cap = 120): Promise<TabStop[]> {
  const stops: TabStop[] = [];
  let first: string | null = null;
  for (let i = 0; i < cap; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate<(TabStop & { key: string }) | null>(`(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const ring = style.boxShadow !== 'none';
      const region = el.closest('[data-sidebar="sidebar"], header, main, footer');
      const landmark = el.matches('a[href="#main-content"]')
        ? 'skip'
        : region
          ? region.tagName === 'DIV' ? 'nav' : region.tagName.toLowerCase()
          : 'other';
      const labelledBy = (el.getAttribute('aria-labelledby') || '').split(' ')
        .map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
      const name = (el.getAttribute('aria-label') || labelledBy || el.labels?.[0]?.textContent || el.textContent || el.getAttribute('name') || el.tagName)
        .trim().replace(/\\s+/g, ' ').slice(0, 40);
      const rect = el.getBoundingClientRect();
      if (!el.dataset.tabWalk) el.dataset.tabWalk = String(${i});
      return { key: el.dataset.tabWalk, name, landmark, inMain: !!el.closest('main'), top: rect.top + window.scrollY, visibleFocus: outline || ring };
    })()`);
    if (!stop) return stops;
    if (first === null) first = stop.key;
    else if (stop.key === first) return stops;
    stops.push({
      name: stop.name,
      landmark: stop.landmark,
      inMain: stop.inMain,
      top: stop.top,
      visibleFocus: stop.visibleFocus,
    });
  }
  throw new Error(`Focus never left the page after ${cap} Tab presses (a keyboard trap?)`);
}

/** Collapses consecutive repeats: ['a', 'a', 'b'] → ['a', 'b']. */
const runs = (values: string[]) => values.filter((v, i) => v !== values[i - 1]);

test('keyboard walk in the shell: skip link, menu, header, main, with visible focus (AC-45)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi, true);
  await page.setViewportSize({ width: 1280, height: 812 });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Article' })).toBeVisible();

  const stops = await walkTabOrder(page);

  expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
  expect(runs(stops.map((s) => s.landmark))).toEqual(['skip', 'nav', 'header', 'main']);
  expect(stops.map((s) => s.name)).toEqual(
    expect.arrayContaining(['Skip to content', 'Article', 'Toggle menu', 'Your profile']),
  );
});

test('keyboard walk on the mobile shell reaches the menu button first (AC-45)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi, true);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();

  const stops = await walkTabOrder(page);

  expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
  // The drawer is closed, so no menu link takes focus behind it.
  expect(runs(stops.map((s) => s.landmark))).toEqual(['skip', 'header', 'main']);
  expect(stops[1].name).toBe('Toggle menu');
});

for (const { path, heading } of PAGES.filter((p) => !p.signedIn)) {
  test(`keyboard walk on ${path} follows the visual order with visible focus (AC-45)`, async ({
    page,
    mockApi,
  }) => {
    seed(mockApi, false);
    await page.setViewportSize({ width: 1280, height: 812 });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();

    const stops = await walkTabOrder(page);

    expect(stops.length).toBeGreaterThan(0);
    expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
    // Single-column card: each stop sits at or below the one before it.
    const tops = stops.map((s) => Math.round(s.top));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
  });
}

test('keyboard walk on the UI kit reaches every control with visible focus (AC-45)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi, true);
  await page.setViewportSize({ width: 1280, height: 812 });
  await page.goto('/admin/dev/ui-kit');
  await expect(page.getByRole('heading', { name: 'UI kit', level: 1 })).toBeVisible();
  // The JSON editors load lazily; walk once every editor has replaced its skeleton.
  await expect(page.locator('[data-slot="json-editor-skeleton"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="json-code-editor"] .cm-content')).toHaveCount(
    await page.locator('[data-slot="json-input"]').count(),
  );

  const stops = await walkTabOrder(page, 200);
  const inMain = stops.filter((s) => s.landmark === 'main');

  expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
  // Disabled controls are skipped; every other visible control in main is a Tab stop.
  const enabled = await page.evaluate<number>(
    `[...document.querySelectorAll('main *')].filter(
      (el) => el.tabIndex >= 0 && !el.disabled && el.checkVisibility(),
    ).length`,
  );
  expect(inMain.length).toBe(enabled);
});

/* ------------------------------------------------------------------------------------------------
 * Settings pages (AC-42, AC-43): a super admin with one row on every list, so each page shows its
 * search, its primary action and its row actions.
 * --------------------------------------------------------------------------------------------- */

const ADA = 'ada@example.com';
/** A valid 1 × 1 PNG, so the media thumbnail renders without a media host. */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const WRITER: Role = {
  documentId: 'role-writer',
  name: 'Writer',
  slug: 'writer',
  level: 10,
  permissions: ['document:read', 'document:update'],
  isDefault: false,
  createdAt: STAMP,
  updatedAt: STAMP,
  updatedBy: null,
};
const DEPLOY: AccessToken = {
  documentId: 'tok-deploy',
  name: 'Deploy bot',
  permissions: ['document:read'],
  expiresAt: '2099-01-01T00:00:00.000Z',
  createdAt: STAMP,
  updatedAt: STAMP,
  updatedBy: null,
};
const CAT: MediaAsset = {
  documentId: 'media-cat',
  fileName: 'cat.png',
  mimeType: 'image/png',
  size: 1258291,
  width: 1920,
  height: 1080,
  url: PIXEL,
  thumbnailUrl: PIXEL,
  publicId: 'cms/media-cat',
  hash: 'media-cat'.padStart(64, '0'),
  uploadedBy: null,
  createdAt: STAMP,
  updatedAt: STAMP,
};

/**
 * Each settings page, with the Tab stops a keyboard user must reach in this order (AC-43): the
 * primary action in the page header, the search, then the row actions.
 */
const SETTINGS_PAGES = [
  {
    path: '/admin/settings/users',
    heading: 'Users',
    order: ['Search users', 'Change role for bob@example.com', 'Delete bob@example.com'],
  },
  {
    path: '/admin/settings/roles',
    heading: 'Roles',
    order: ['New role', 'Search roles', 'Edit Writer', 'Delete Writer'],
  },
  {
    path: '/admin/settings/permissions',
    heading: 'Permissions',
    order: ['New permission', 'Search permissions', 'Edit document:read', 'Delete document:read'],
  },
  {
    path: '/admin/settings/access-tokens',
    heading: 'Access tokens',
    order: ['New token', 'Search access tokens', 'Revoke Deploy bot', 'Delete Deploy bot'],
  },
  {
    path: '/admin/settings/media',
    heading: 'Media library',
    order: ['Upload', 'Search files', 'Delete cat.png'],
  },
];

/** Ada (super admin) signed in, plus Bob, a custom role, a token and an image. */
function seedSettings(mockApi: MockApi) {
  mockApi.addUser({ email: ADA, name: 'Ada Admin', role: ROLES.superAdmin });
  mockApi.addUser({ email: 'bob@example.com', name: 'Bob Writer', role: WRITER });
  mockApi.settings.addAccessToken({ ...DEPLOY });
  mockApi.settings.addMedia({ ...CAT });
  mockApi.signInAs(ADA);
}

async function openSettings(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  // Wait for the list itself, not only the skeleton.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

// Users and Media run in the `PAGES` loop above with the same fixtures (AC-16).
for (const { path, heading } of SETTINGS_PAGES.filter(
  (s) => !PAGES.some((p) => p.path === s.path),
)) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`axe: ${path} has no serious or critical violations (${theme}, ${width}px)`, async ({
        page,
        mockApi,
      }) => {
        seedSettings(mockApi);
        await prepare(page, theme, width);

        await openSettings(page, path, heading);

        await expectNoBlockingViolations(page, theme);
      });
    }
  }
}

/** The settings dialogs that AC-42 checks open: the Roles form, the token reveal, a delete. */
const SETTINGS_DIALOGS: {
  name: string;
  path: string;
  heading: string;
  open: (page: Page) => Promise<Locator>;
}[] = [
  {
    name: 'the Roles form with the PermissionTree',
    path: '/admin/settings/roles',
    heading: 'Roles',
    open: async (page) => {
      await page.getByRole('button', { name: 'New role' }).click();
      const dialog = page.getByRole('dialog', { name: 'New role' });
      // AC-25: the ui Checkbox tree, with one checked box and its group in the mixed state.
      const tree = dialog.getByRole('group', { name: 'Permissions' });
      await tree.getByRole('checkbox', { name: 'media:manager' }).check();
      await expect(tree.getByRole('checkbox', { name: 'media', exact: true })).toHaveAttribute(
        'aria-checked',
        'mixed',
      );
      return dialog;
    },
  },
  {
    name: 'the token reveal',
    path: '/admin/settings/access-tokens',
    heading: 'Access tokens',
    open: async (page) => {
      await page.getByRole('button', { name: 'New token' }).click();
      const form = page.getByRole('dialog', { name: 'New token' });
      await form.getByRole('textbox', { name: 'Name' }).fill('Nightly export');
      await form.getByRole('textbox', { name: 'Name' }).press('Enter');
      return page.getByRole('alertdialog', { name: 'Copy your token now' });
    },
  },
  {
    name: 'the media delete confirmation',
    path: '/admin/settings/media',
    heading: 'Media library',
    open: async (page) => {
      await page.getByRole('button', { name: 'Delete cat.png' }).click();
      return page.getByRole('alertdialog', { name: 'Delete "cat.png"?' });
    },
  },
];

for (const { name, path, heading, open } of SETTINGS_DIALOGS) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`axe: ${name} has no serious or critical violations (${theme}, ${width}px)`, async ({
        page,
        mockApi,
      }) => {
        seedSettings(mockApi);
        await prepare(page, theme, width);
        await openSettings(page, path, heading);

        const dialog = await open(page);
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('aria-modal', 'true');

        await expectNoBlockingViolations(page, theme);
      });
    }
  }
}

for (const { path, heading, order } of SETTINGS_PAGES) {
  test(`keyboard walk on ${path}: primary action, search, row actions in DOM order (AC-43)`, async ({
    page,
    mockApi,
  }) => {
    seedSettings(mockApi);
    await page.setViewportSize({ width: 1280, height: 812 });
    await openSettings(page, path, heading);

    const stops = await walkTabOrder(page, 200);
    const inMain = stops.filter((s) => s.inMain).map((s) => s.name);

    expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
    // The named stops come in this order (other stops may sit between them).
    expect(inMain.filter((n) => order.includes(n))).toEqual(order);
    // Tab visited every focusable control in main, in DOM order (`walkTabOrder` tags each one).
    const visited = await page.evaluate<(string | null)[]>(
      `[...document.querySelectorAll('main *')]
        .filter((el) => el.tabIndex >= 0 && !el.disabled && el.checkVisibility())
        .map((el) => el.dataset.tabWalk ?? null)`,
    );
    expect(visited).not.toContain(null);
    const indexes = visited.map(Number);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });
}

/** Asserts focus stays inside `dialog` for more than a full lap of Tab, then of Shift+Tab. */
async function expectFocusTrapped(page: Page, dialog: Locator) {
  const focused = dialog.locator(':focus');
  // Every control that can take focus inside, so the laps below go all the way round.
  const count = await dialog
    .locator('a[href], button, input, select, textarea, [tabindex="0"]')
    .filter({ visible: true })
    .count();
  await expect(focused).toHaveCount(1);
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < count + 2; i += 1) {
      await page.keyboard.press(key);
      // Base UI's focus guards hand focus back inside on the next tick, so this retries briefly.
      await expect(focused, `${key} #${i + 1} left the dialog`).toHaveCount(1);
    }
  }
}

/** Each settings dialog, opened from the keyboard: trap, close, and focus back on the trigger. */
const TRAPS: {
  name: string;
  path: string;
  heading: string;
  trigger: string;
  dialog: (page: Page) => Locator;
  close: (page: Page, dialog: Locator) => Promise<void>;
  before?: (page: Page) => Promise<void>;
}[] = [
  {
    name: 'the change-role confirmation',
    path: '/admin/settings/users',
    heading: 'Users',
    trigger: 'Change role for bob@example.com',
    dialog: (page) =>
      page.getByRole('alertdialog', { name: 'Change the role of bob@example.com?' }),
    close: (page) => page.keyboard.press('Escape'),
  },
  {
    name: 'the Roles form',
    path: '/admin/settings/roles',
    heading: 'Roles',
    trigger: 'New role',
    dialog: (page) => page.getByRole('dialog', { name: 'New role' }),
    close: (page) => page.keyboard.press('Escape'),
  },
  {
    name: 'the permission form',
    path: '/admin/settings/permissions',
    heading: 'Permissions',
    trigger: 'New permission',
    dialog: (page) => page.getByRole('dialog', { name: 'New permission' }),
    close: (page) => page.keyboard.press('Escape'),
  },
  {
    name: 'the token reveal (Escape does not close it)',
    path: '/admin/settings/access-tokens',
    heading: 'Access tokens',
    trigger: 'New token',
    before: async (page) => {
      const form = page.getByRole('dialog', { name: 'New token' });
      await form.getByRole('textbox', { name: 'Name' }).fill('Nightly export');
      await page.keyboard.press('Enter');
    },
    dialog: (page) => page.getByRole('alertdialog', { name: 'Copy your token now' }),
    close: async (page, dialog) => {
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Done' }).focus();
      await page.keyboard.press('Enter');
    },
  },
  {
    name: 'the media delete confirmation',
    path: '/admin/settings/media',
    heading: 'Media library',
    trigger: 'Delete cat.png',
    dialog: (page) => page.getByRole('alertdialog', { name: 'Delete "cat.png"?' }),
    close: (page) => page.keyboard.press('Escape'),
  },
];

for (const { name, path, heading, trigger, dialog, close, before } of TRAPS) {
  test(`keyboard: ${name} traps focus and returns it to the trigger (AC-8, AC-43)`, async ({
    page,
    mockApi,
  }) => {
    seedSettings(mockApi);
    await page.setViewportSize({ width: 1280, height: 812 });
    await openSettings(page, path, heading);
    const button = page.getByRole('button', { name: trigger, exact: true });

    await button.focus();
    await page.keyboard.press('Enter');
    await before?.(page);
    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('aria-modal', 'true');

    await expectFocusTrapped(page, modal);

    await close(page, modal);
    await expect(modal).toBeHidden();
    await expect(button).toBeFocused();
  });
}

/* ------------------------------------------------------------------------------------------------
 * Document UI (Phase 5, AC-36): every new surface, in both themes at desktop and phone width.
 * A content manager (super admin plus `content_type:manager`) sees every control ungated.
 * --------------------------------------------------------------------------------------------- */

const BLOG_LIST = '/admin/content-types/blog';

/** The Phase 5 fixtures: four types, three blog posts, a never-saved homepage, and one image. */
function seedDocuments(mockApi: MockApi, mockContent: MockContent) {
  seedContent(mockContent);
  mockApi.addUser({ email: ADA, name: 'Ada Admin', role: CONTENT_MANAGER });
  mockApi.settings.addMedia({ ...CAT });
  mockApi.signInAs(ADA);
}

const mainOf = (page: Page) => page.getByRole('main');
const entries = (page: Page) => page.getByRole('table', { name: 'Blog post entries' });

/** Opens the blog list and waits for its rows. */
async function openBlogList(page: Page, search = '') {
  await page.goto(`${BLOG_LIST}${search}`);
  await expect(entries(page).getByRole('row')).toHaveCount(4);
}

/** The create page for the field showcase, with the lazy richtext editor mounted. */
async function openShowcaseCreate(page: Page) {
  await page.goto('/admin/content-types/showcase/new');
  await expect(mainOf(page).getByRole('heading', { level: 1, name: 'New entry' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Body', exact: true })).toBeVisible();
}

/** Each Phase 5 surface: how to reach it, and what must be on screen before axe runs. */
const DOCUMENT_SURFACES: { name: string; open: (page: Page) => Promise<void> }[] = [
  {
    name: 'the content-type overview',
    open: async (page) => {
      await page.goto('/admin/content-types');
      await expect(page.getByRole('region', { name: 'Collection types' })).toBeVisible();
    },
  },
  {
    name: 'the list with rows selected and the filter panel open',
    open: async (page) => {
      await openBlogList(page);
      await page.getByRole('checkbox', { name: 'Select Post 1' }).check();
      await page.getByRole('checkbox', { name: 'Select Post 2' }).check();
      await expect(page.getByRole('region', { name: 'Bulk actions' })).toContainText('2 selected');
      await page.getByRole('button', { name: /^Filters/ }).click();
      await expect(page.getByRole('region', { name: 'Filters' })).toBeVisible();
    },
  },
  {
    name: 'the open date picker',
    open: async (page) => {
      await page.goto(`${BLOG_LIST}?filters[createdAt][$gte]=2026-02-02T00:00:00.000Z`);
      await expect(entries(page).getByRole('row')).toHaveCount(3);
      await page.getByRole('button', { name: /^Filters/ }).click();
      await page
        .getByRole('region', { name: 'Filters' })
        .getByRole('group', { name: 'Filter 1' })
        .getByRole('button', { name: 'Value' })
        .click();
      await expect(page.getByRole('dialog', { name: 'Choose a date' })).toBeVisible();
    },
  },
  {
    name: 'the single-type editor',
    open: async (page) => {
      await page.goto('/admin/content-types/homepage');
      await expect(mainOf(page).getByRole('heading', { level: 1, name: 'Homepage' })).toBeVisible();
      await expect(page.getByText('Not saved yet')).toBeVisible();
    },
  },
  { name: 'the create page with every field type', open: openShowcaseCreate },
  {
    // AC-25: axe reaches into the JSON editor's open shadow root, valid and with a parse error.
    name: 'the document editor with a JSON field',
    open: async (page) => {
      await openShowcaseCreate(page);
      const meta = page.getByRole('textbox', { name: 'Meta', exact: true });
      await expect(meta).toBeVisible();
      await expect(
        page.locator('[data-slot="field"]', { has: meta }).getByRole('button', {
          name: 'Format JSON',
        }),
      ).toBeVisible();
    },
  },
  {
    name: 'the document editor with an invalid JSON field',
    open: async (page) => {
      await openShowcaseCreate(page);
      const meta = page.getByRole('textbox', { name: 'Meta', exact: true });
      await meta.fill('{"a":');
      await meta.blur();
      await expect(page.getByRole('alert')).toContainText('Invalid JSON');
      await expect(meta).toHaveAttribute('aria-invalid', 'true');
    },
  },
  {
    name: 'the detail page',
    open: async (page) => {
      await page.goto(`${BLOG_LIST}/blog-2`);
      await expect(mainOf(page).getByRole('heading', { level: 1, name: 'Post 2' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Body', exact: true })).toBeVisible();
    },
  },
  {
    name: 'the media picker',
    open: async (page) => {
      await openShowcaseCreate(page);
      await page
        .getByRole('group', { name: 'Cover image', exact: true })
        .getByRole('button', { name: 'Choose Cover image' })
        .click();
      const picker = page.getByRole('dialog', { name: 'Choose cover image' });
      // AC-25: the ui RadioGroup, with a card selected.
      await expect(picker.getByRole('radiogroup')).toBeVisible();
      await picker.getByRole('radio', { name: 'cat.png' }).click();
      await expect(picker.getByRole('radio', { name: 'cat.png' })).toBeChecked();
    },
  },
  {
    name: 'the column chooser',
    open: async (page) => {
      await openBlogList(page);
      await page.getByRole('button', { name: 'Columns' }).click();
      await expect(page.getByRole('dialog', { name: 'Choose columns' })).toBeVisible();
    },
  },
  {
    name: 'the bulk delete dialog',
    open: async (page) => {
      await openBlogList(page);
      await page.getByRole('checkbox', { name: 'Select Post 1' }).check();
      await page
        .getByRole('region', { name: 'Bulk actions' })
        .getByRole('button', { name: 'Delete selected' })
        .click();
      await expect(page.getByRole('alertdialog', { name: 'Delete 1 entry?' })).toBeVisible();
    },
  },
  {
    name: 'the unsaved-changes dialog',
    open: async (page) => {
      await openBlogList(page);
      await entries(page).getByRole('link', { name: 'Post 1' }).click();
      await expect(mainOf(page).getByRole('heading', { level: 1, name: 'Post 1' })).toBeVisible();
      await page.getByLabel('Title', { exact: true }).fill('Post 1 edited');
      await page.evaluate('history.back()');
      await expect(
        page.getByRole('alertdialog', { name: 'Discard unsaved changes?' }),
      ).toBeVisible();
    },
  },
];

for (const { name, open } of DOCUMENT_SURFACES) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`axe: ${name} has no serious or critical violations (${theme}, ${width}px) (AC-36)`, async ({
        page,
        mockApi,
        mockContent,
      }) => {
        seedDocuments(mockApi, mockContent);
        await prepare(page, theme, width);

        await open(page);

        await expectNoBlockingViolations(page, theme);
      });
    }
  }
}

test('keyboard walk on the list: toolbar, header checkbox, sort buttons, rows, pagination in DOM order (AC-37)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedDocuments(mockApi, mockContent);
  for (let n = 4; n <= 25; n += 1) mockContent.addDocument('blog', blogPost(n));
  await page.setViewportSize({ width: 1280, height: 812 });
  await page.goto(BLOG_LIST);
  await expect(page.getByText('Showing 1–10 of 25')).toBeVisible();

  const stops = await walkTabOrder(page, 300);
  const inMain = stops.filter((s) => s.inMain).map((s) => s.name);

  expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
  const order = [
    'Create entry',
    'Search entries',
    'Filters',
    'Columns',
    'Select all entries on this page',
    'Title',
    'Views',
    'Featured',
    'Updated',
    'Select Post 25',
    'Post 25',
    'Actions for Post 25',
    'Select Post 16',
    'Post 16',
    'Actions for Post 16',
    'Next page',
  ];
  expect(inMain.filter((n) => order.includes(n))).toEqual(order);
  // Tab visited every focusable control in main, in DOM order.
  const visited = await page.evaluate<(string | null)[]>(
    `[...document.querySelectorAll('main *')]
      .filter((el) => el.tabIndex >= 0 && !el.disabled && el.checkVisibility())
      .map((el) => el.dataset.tabWalk ?? null)`,
  );
  expect(visited).not.toContain(null);
  const indexes = visited.map(Number);
  expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
});

/** Each Phase 5 dialog, opened from the keyboard: trap, Escape, and focus back on the trigger. */
const DOCUMENT_TRAPS: {
  name: string;
  width?: number;
  setup: (page: Page) => Promise<Locator>;
  dialog: (page: Page) => Locator;
}[] = [
  {
    name: 'the column chooser',
    setup: async (page) => {
      await openBlogList(page);
      return page.getByRole('button', { name: 'Columns' });
    },
    dialog: (page) => page.getByRole('dialog', { name: 'Choose columns' }),
  },
  {
    name: 'the bulk delete dialog',
    setup: async (page) => {
      await openBlogList(page);
      await page.getByRole('checkbox', { name: 'Select Post 1' }).check();
      return page
        .getByRole('region', { name: 'Bulk actions' })
        .getByRole('button', { name: 'Delete selected' });
    },
    dialog: (page) => page.getByRole('alertdialog', { name: 'Delete 1 entry?' }),
  },
  {
    name: 'the media picker',
    setup: async (page) => {
      await openShowcaseCreate(page);
      return page
        .getByRole('group', { name: 'Cover image', exact: true })
        .getByRole('button', { name: 'Choose Cover image' });
    },
    dialog: (page) => page.getByRole('dialog', { name: 'Choose cover image' }),
  },
  {
    name: 'the detail Delete confirmation',
    setup: async (page) => {
      await page.goto(`${BLOG_LIST}/blog-1`);
      await expect(mainOf(page).getByRole('heading', { level: 1, name: 'Post 1' })).toBeVisible();
      return mainOf(page).getByRole('button', { name: 'Delete', exact: true });
    },
    dialog: (page) => page.getByRole('alertdialog', { name: 'Delete "Post 1"?' }),
  },
];

for (const { name, setup, dialog } of DOCUMENT_TRAPS) {
  test(`keyboard: ${name} traps focus, closes on Escape and returns focus to the trigger (AC-37)`, async ({
    page,
    mockApi,
    mockContent,
  }) => {
    seedDocuments(mockApi, mockContent);
    await page.setViewportSize({ width: 1280, height: 812 });
    const trigger = await setup(page);

    await trigger.focus();
    await page.keyboard.press('Enter');
    const modal = dialog(page);
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('aria-modal', 'true');

    await expectFocusTrapped(page, modal);

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test('keyboard: the date picker takes focus, closes on Escape and returns focus to its button (AC-37)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedDocuments(mockApi, mockContent);
  await page.goto(`${BLOG_LIST}?filters[createdAt][$gte]=2026-02-02T00:00:00.000Z`);
  await page.getByRole('button', { name: /^Filters/ }).click();
  const value = page
    .getByRole('region', { name: 'Filters' })
    .getByRole('group', { name: 'Filter 1' })
    .getByRole('button', { name: 'Value' });

  await value.focus();
  await page.keyboard.press('Enter');
  const calendar = page.getByRole('dialog', { name: 'Choose a date' });
  await expect(calendar).toBeVisible();
  await expect(calendar.locator(':focus')).toHaveCount(1);
  // Tab moves between the calendar's own controls and stays inside it.
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Tab');
    await expect(calendar.locator(':focus'), `Tab #${i + 1} left the calendar`).toHaveCount(1);
  }

  await page.keyboard.press('Escape');
  await expect(calendar).toBeHidden();
  await expect(value).toBeFocused();
});

test('keyboard: the unsaved-changes dialog traps focus, and Escape stays and returns focus to the link (AC-37)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedDocuments(mockApi, mockContent);
  await page.setViewportSize({ width: 1280, height: 812 });
  await page.goto(`${BLOG_LIST}/blog-1`);
  await expect(mainOf(page).getByRole('heading', { level: 1, name: 'Post 1' })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Post 1 edited');
  const link = page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', {
    name: 'Blog post',
  });

  await link.focus();
  await page.keyboard.press('Enter');
  const modal = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
  await expect(modal).toBeVisible();
  await expectFocusTrapped(page, modal);

  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(page).toHaveURL(`${BLOG_LIST}/blog-1`);
  await expect(link).toBeFocused();
});

test('keyboard: a row Delete opened from the Actions menu returns focus to the menu button on Escape (AC-37)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedDocuments(mockApi, mockContent);
  await openBlogList(page);
  const actions = entries(page).getByRole('button', { name: 'Actions for Post 1' });

  await actions.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Delete' }).focus();
  await page.keyboard.press('Enter');
  const modal = page.getByRole('alertdialog', { name: 'Delete "Post 1"?' });
  await expect(modal).toBeVisible();
  await expectFocusTrapped(page, modal);

  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(actions).toBeFocused();
});

test('keyboard: after a row delete, focus moves to the entries region, not the page body (AC-37)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedDocuments(mockApi, mockContent);
  await openBlogList(page);

  await entries(page).getByRole('button', { name: 'Actions for Post 1' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page
    .getByRole('alertdialog', { name: 'Delete "Post 1"?' })
    .getByRole('button', { name: 'Delete entry' })
    .click();

  await expect(entries(page).getByRole('row')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Blog post entries' })).toBeFocused();
});

test('keyboard: after a bulk delete removes every selected row, focus moves to the entries region (AC-37)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedDocuments(mockApi, mockContent);
  await openBlogList(page);
  await page.getByRole('checkbox', { name: 'Select Post 1' }).check();
  await page.getByRole('checkbox', { name: 'Select Post 2' }).check();

  await page
    .getByRole('region', { name: 'Bulk actions' })
    .getByRole('button', { name: 'Delete selected' })
    .click();
  await page
    .getByRole('alertdialog', { name: 'Delete 2 entries?' })
    .getByRole('button', { name: 'Delete entries' })
    .click();

  await expect(entries(page).getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Bulk actions' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Blog post entries' })).toBeFocused();
});

test('keyboard: deleting the last entry moves focus to the list heading (AC-37)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedDocuments(mockApi, mockContent);
  await openBlogList(page);
  for (const label of ['Post 1', 'Post 2', 'Post 3']) {
    await page.getByRole('checkbox', { name: `Select ${label}` }).check();
  }

  await page
    .getByRole('region', { name: 'Bulk actions' })
    .getByRole('button', { name: 'Delete selected' })
    .click();
  await page
    .getByRole('alertdialog', { name: 'Delete 3 entries?' })
    .getByRole('button', { name: 'Delete entries' })
    .click();

  await expect(mainOf(page).getByText('No entries yet.')).toBeVisible();
  await expect(mainOf(page).getByRole('heading', { level: 1, name: 'Blog post' })).toBeFocused();
});

test('keyboard: at 375px a Delete opened from "More actions" returns focus to that button (AC-37)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedDocuments(mockApi, mockContent);
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(`${BLOG_LIST}/blog-1`);
  await expect(mainOf(page).getByRole('heading', { level: 1, name: 'Post 1' })).toBeVisible();
  const more = mainOf(page).getByRole('button', { name: 'More actions' });

  await more.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Delete' }).focus();
  await page.keyboard.press('Enter');
  const modal = page.getByRole('alertdialog', { name: 'Delete "Post 1"?' });
  await expect(modal).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(more).toBeFocused();
});

for (const { name, open } of DOCUMENT_SURFACES) {
  test(`at 375px ${name} does not scroll the page sideways (AC-38)`, async ({
    page,
    mockApi,
    mockContent,
  }) => {
    seedDocuments(mockApi, mockContent);
    await prepare(page, 'light', 375);

    await open(page);

    const overflow = await page.evaluate<number>(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
