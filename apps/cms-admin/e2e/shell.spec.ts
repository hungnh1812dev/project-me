import type { Role } from '../src/features/auth/types.ts';
import type { ContentType } from '../src/features/content/types.ts';
import { DEFAULT_PASSWORD, expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';
import type { MockContent } from './fixtures/mockContent.ts';

const JANE = { email: 'jane@example.com', name: 'Jane Doe' };
const DARK = /(^|\s)dark(\s|$)/;

/** Jane (Editor unless a role is given) has a session, so /admin pages open straight away. */
function signInJane(mockApi: MockApi, role: Role = ROLES.editor) {
  mockApi.addUser({ ...JANE, role });
  mockApi.signInAs(JANE.email);
}

const STAMP = '2026-01-01T00:00:00.000Z';

function contentType(slug: string, name: string, kind: ContentType['kind']): ContentType {
  return {
    documentId: `ct-${slug}`,
    slug,
    name,
    kind,
    draftToPublish: true,
    fields: [{ name: 'title', type: 'text', header: true }],
    listFields: ['title'],
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

/** Two collection types (Post added before Article) and one single type. */
function seedContent(content: MockContent) {
  content.addContentType(contentType('post', 'Post', 'collection'));
  content.addContentType(contentType('article', 'Article', 'collection'));
  content.addContentType(contentType('home', 'Home', 'single'));
}

const SETTINGS = ['Users', 'Roles', 'Permissions', 'Access tokens', 'Media library'];

test('Skip to content is the first Tab stop and moves focus to main', async ({ page, mockApi }) => {
  signInJane(mockApi);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

test('navigation retitles the page and moves focus to its heading', async ({ page, mockApi }) => {
  signInJane(mockApi);
  await page.goto('/admin');
  await expect(page).toHaveTitle('Welcome, Jane Doe · CMS Admin');

  await page.getByRole('link', { name: 'Your profile' }).click();

  await expect(page.getByRole('heading', { name: 'Your profile', level: 1 })).toBeFocused();
  await expect(page).toHaveTitle('Your profile · CMS Admin');
});

test('the shell has one main, a sticky header and a footer at the bottom', async ({
  page,
  mockApi,
}) => {
  signInJane(mockApi);
  await page.goto('/admin');

  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('banner')).toHaveCSS('position', 'sticky');
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('hungnhdev CMS');
  await expect(footer).toContainText(/v\d+\.\d+\.\d+/);
  await expect(footer).toContainText(`© ${new Date().getFullYear()}`);
  const box = await footer.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && Math.round(box.y + box.height)).toBe(viewport?.height);
});

test('public pages render without the shell', async ({ page, mockApi }) => {
  // With no users, /login redirects to /register (first run); seed one so the form stays.
  mockApi.addUser({ email: 'jane@example.com' });
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skip to content' })).toHaveCount(0);
});

test('the account menu opens from the keyboard and Escape returns focus', async ({
  page,
  mockApi,
}) => {
  signInJane(mockApi);
  await page.goto('/admin');
  const trigger = page.getByRole('button', { name: 'Account menu' });
  await expect(trigger).toContainText('JD');
  await expect(trigger).toContainText('Jane Doe');

  await trigger.focus();
  await page.keyboard.press('Enter');

  const menu = page.getByRole('menu');
  await expect(menu).toContainText('jane@example.com');
  await expect(menu).toContainText('Editor');
  await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Theme' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Profile in the account menu opens the profile page', async ({ page, mockApi }) => {
  signInJane(mockApi);
  await page.goto('/admin');

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Profile' }).click();

  await expect(page).toHaveURL('/admin/profile');
  await expect(page.getByRole('heading', { name: 'Your profile', level: 1 })).toBeVisible();
});

test('Log out from the account menu returns to the same page after signing in', async ({
  page,
  mockApi,
}) => {
  signInJane(mockApi);
  await page.goto('/admin/profile');
  await expect(page.getByRole('heading', { name: 'Your profile', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();

  await expect(page).toHaveURL('/login');
  expect(mockApi.requests.map((r) => `${r.method} ${r.path}`)).toContain(
    'POST /api/v1/auth/logout',
  );

  await page.getByLabel('Email').fill(JANE.email);
  await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/admin/profile');
});

test('the theme choice from the account menu persists across a reload', async ({
  page,
  mockApi,
}) => {
  signInJane(mockApi);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/admin');
  await expect(page.locator('html')).not.toHaveClass(DARK);

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(DARK);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(DARK);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test.describe('side menu', () => {
  const menu = (page: import('@playwright/test').Page) =>
    page.getByRole('navigation', { name: 'Main' });

  test('a user manager sees Users and Roles under Settings', async ({ page, mockApi }) => {
    signInJane(mockApi, ROLES.userManager);
    await page.goto('/admin');

    const settings = menu(page).getByRole('list', { name: 'Settings' });
    await expect(settings.getByRole('link')).toHaveText(['Users', 'Roles']);
    await expect(menu(page).getByRole('button', { name: 'Content' })).toHaveCount(0);
  });

  test('an editor has neither Content nor Settings, and no content-type request', async ({
    page,
    mockApi,
  }) => {
    signInJane(mockApi, ROLES.editor);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();

    await expect(menu(page)).toBeAttached();
    await expect(menu(page).getByRole('link')).toHaveCount(0);
    await expect(menu(page).getByRole('button', { name: 'Content' })).toHaveCount(0);
    await expect(menu(page).getByRole('button', { name: 'Settings' })).toHaveCount(0);
    expect(mockApi.requests.map((r) => r.path)).not.toContain('/api/v1/content-types');
  });

  test('a content editor has Content, grouped and sorted, but no Settings', async ({
    page,
    mockApi,
    mockContent,
  }) => {
    seedContent(mockContent);
    signInJane(mockApi, ROLES.contentEditor);
    await page.goto('/admin');

    await expect(
      menu(page).getByRole('list', { name: 'Collection types' }).getByRole('link'),
    ).toHaveText(['Article', 'Post']);
    await expect(
      menu(page).getByRole('list', { name: 'Single types' }).getByRole('link'),
    ).toHaveText(['Home']);
    await expect(menu(page).getByRole('button', { name: 'Settings' })).toHaveCount(0);
  });

  test('a custom role with media:manager sees only Media library', async ({ page, mockApi }) => {
    signInJane(mockApi, {
      ...ROLES.editor,
      slug: 'media',
      name: 'Media',
      permissions: ['media:manager'],
    });
    await page.goto('/admin');

    await expect(menu(page).getByRole('link')).toHaveText(['Media library']);
    await menu(page).getByRole('link', { name: 'Media library' }).click();
    await expect(page).toHaveURL('/admin/settings/media');
    await expect(page.getByRole('heading', { name: 'Media library', level: 1 })).toBeVisible();
    await expect(page.getByText('No files yet.')).toBeVisible();
    await expect(page.getByText('Coming in Phase 4.')).toHaveCount(0);
  });

  test('every settings link shows for a role with every grant', async ({ page, mockApi }) => {
    signInJane(mockApi, {
      ...ROLES.superAdmin,
      permissions: ['user:read', 'role:read', 'permission:read', 'api_token:read', 'media:read'],
    });
    await page.goto('/admin');

    await expect(menu(page).getByRole('link')).toHaveText(SETTINGS);
  });

  test('/admin/users redirects to /admin/settings/users', async ({ page, mockApi }) => {
    signInJane(mockApi, ROLES.superAdmin);
    await page.goto('/admin/users');

    await expect(page).toHaveURL('/admin/settings/users');
    await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible();
  });

  test('the link of the current page is marked active', async ({ page, mockApi, mockContent }) => {
    seedContent(mockContent);
    signInJane(mockApi, ROLES.contentEditor);
    await page.goto('/admin/content-types/article');

    const article = menu(page).getByRole('link', { name: 'Article' });
    await expect(article).toHaveAttribute('aria-current', 'page');
    await expect(menu(page).getByRole('link', { name: 'Post' })).not.toHaveAttribute(
      'aria-current',
    );

    await menu(page).getByRole('link', { name: 'Post' }).click();
    await expect(menu(page).getByRole('link', { name: 'Post' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(article).not.toHaveAttribute('aria-current');
  });

  for (const { theme, accent, accentForeground, highlight } of [
    // SPEC colour table (Strapi palette): the active item has the sidebar-accent tint
    // #F0F0FF / #181826 with sidebar-accent-foreground text #271FE0 / #9A98FF, and a
    // 4px highlight (= primary-ink) left bar #4945FF / #9A98FF.
    {
      theme: 'light',
      accent: 'rgb(240, 240, 255)',
      accentForeground: 'rgb(39, 31, 224)',
      highlight: 'rgb(73, 69, 255)',
    },
    {
      theme: 'dark',
      accent: 'rgb(24, 24, 38)',
      accentForeground: 'rgb(154, 152, 255)',
      highlight: 'rgb(154, 152, 255)',
    },
  ]) {
    test(`only the active link shows the highlight indicator (${theme}, AC-14)`, async ({
      page,
      mockApi,
    }) => {
      signInJane(mockApi, ROLES.superAdmin);
      await page.addInitScript({
        content: `window.localStorage.setItem('cms-admin:theme', '${theme}');`,
      });
      await page.goto('/admin/settings/users');
      await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible();

      const indicator = (name: string) =>
        menu(page)
          .getByRole('link', { name })
          .evaluate((el) => {
            const view = el.ownerDocument.defaultView!;
            const before = view.getComputedStyle(el, '::before');
            const self = view.getComputedStyle(el);
            return {
              content: before.content,
              barColour: before.backgroundColor,
              barWidth: before.width,
              background: self.backgroundColor,
              color: self.color,
            };
          });

      expect(await indicator('Users')).toEqual({
        content: '""',
        barColour: highlight,
        barWidth: '4px',
        background: accent,
        color: accentForeground,
      });
      const inactive = await indicator('Roles');
      expect(inactive.content).toBe('none');
      expect(inactive.background).not.toBe(accent);
    });
  }

  test('a group collapses and stays collapsed after a reload', async ({ page, mockApi }) => {
    signInJane(mockApi, ROLES.superAdmin);
    await page.goto('/admin');
    const toggle = menu(page).getByRole('button', { name: 'Settings' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(menu(page).getByRole('link', { name: 'Users' })).toBeHidden();

    await page.reload();
    await expect(menu(page).getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('the menu collapses to a rail with tooltips, by toggle and Ctrl+B, and stays after a reload', async ({
    page,
    mockApi,
  }) => {
    signInJane(mockApi, ROLES.superAdmin);
    await page.goto('/admin');
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');

    await page.getByRole('button', { name: 'Toggle menu' }).click();
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    const users = menu(page).getByRole('link', { name: 'Users' });
    await expect(users).toBeVisible();
    await users.hover();
    // Base UI tooltips carry no tooltip role; the link keeps its own accessible name.
    await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText('Users');

    await page.reload();
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');

    await page.keyboard.press('ControlOrMeta+b');
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');
  });
});

test.describe('breadcrumbs', () => {
  const trail = (page: import('@playwright/test').Page) =>
    page.getByRole('navigation', { name: 'Breadcrumb' });

  test('a content-type page shows the cached name without an extra request', async ({
    page,
    mockApi,
    mockContent,
  }) => {
    seedContent(mockContent);
    signInJane(mockApi, ROLES.contentEditor);
    await page.goto('/admin/content-types/article');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect(trail(page).getByRole('listitem')).toHaveText([
      'Home',
      'Content types',
      'Article',
    ]);
    await expect(trail(page).getByText('Article')).toHaveAttribute('aria-current', 'page');
    const paths = mockApi.requests.map((r) => r.path);
    expect(paths.filter((p) => p === '/api/v1/content-types')).toHaveLength(1);
    expect(paths.filter((p) => p === '/api/v1/content-types/article')).toHaveLength(1);

    await trail(page).getByRole('link', { name: 'Content types' }).click();
    await expect(page).toHaveURL('/admin/content-types');
    await expect(trail(page).getByRole('listitem')).toHaveText(['Home', 'Content types']);
  });

  test('a settings page shows Settings as plain text', async ({ page, mockApi }) => {
    signInJane(mockApi, ROLES.superAdmin);
    await page.goto('/admin/settings/users');

    await expect(trail(page).getByRole('listitem')).toHaveText(['Home', 'Settings', 'Users']);
    await expect(trail(page).getByRole('link')).toHaveText(['Home']);
  });

  test.describe('at 375px', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('the middle items collapse into a menu and a long name truncates', async ({
      page,
      mockApi,
      mockContent,
    }) => {
      const long = 'Quarterly investor relations announcements archive';
      mockContent.addContentType(contentType('reports', long, 'collection'));
      signInJane(mockApi, ROLES.contentEditor);
      await page.goto('/admin/content-types/reports');

      const current = trail(page).getByText(long);
      await expect(current).toBeVisible();
      await expect(trail(page).getByRole('link', { name: 'Content types' })).toBeHidden();
      expect(
        await current.evaluate((el) => el.scrollWidth > el.clientWidth),
        'the label is cut',
      ).toBe(true);
      await expect(current).toHaveCSS('text-overflow', 'ellipsis');

      await trail(page).getByRole('button', { name: 'More breadcrumbs' }).click();
      await page.getByRole('menuitem', { name: 'Content types' }).click();
      await expect(page).toHaveURL('/admin/content-types');
    });
  });
});

test.describe('mobile drawer', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('opens from the toggle, navigates, and closes on a link', async ({ page, mockApi }) => {
    signInJane(mockApi, ROLES.superAdmin);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Toggle menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    // The page behind cannot scroll while the drawer is open.
    expect(
      await page.evaluate<string>(
        'getComputedStyle(document.documentElement).overflow + getComputedStyle(document.body).overflow',
      ),
    ).toContain('hidden');

    const users = drawer.getByRole('link', { name: 'Users' });
    expect((await users.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await users.click();

    await expect(page).toHaveURL('/admin/settings/users');
    await expect(drawer).toBeHidden();
  });

  test('Escape closes the drawer and returns focus to the toggle', async ({ page, mockApi }) => {
    signInJane(mockApi, ROLES.superAdmin);
    await page.goto('/admin');
    const toggle = page.getByRole('button', { name: 'Toggle menu' });

    await toggle.click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(':focus')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test('the open drawer is a modal dialog (AC-22)', async ({ page, mockApi }) => {
    signInJane(mockApi, ROLES.superAdmin);
    await page.goto('/admin');

    await page.getByRole('button', { name: 'Toggle menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();

    await expect(drawer).toHaveAttribute('role', 'dialog');
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
  });
});

for (const width of [375, 768, 1024, 1440]) {
  test(`no horizontal scroll at ${width}px`, async ({ page, mockApi, mockContent }) => {
    seedContent(mockContent);
    signInJane(mockApi, {
      ...ROLES.contentEditor,
      permissions: [...ROLES.contentEditor.permissions, 'user:read'],
    });
    await page.setViewportSize({ width, height: 900 });

    for (const path of ['/admin', '/admin/content-types/article', '/admin/settings/users']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate<number>(
        'document.documentElement.scrollWidth - document.documentElement.clientWidth',
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
}
