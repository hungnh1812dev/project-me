import { DEFAULT_PASSWORD, expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

const JANE = { email: 'jane@example.com', name: 'Jane Doe' };
const DARK = /(^|\s)dark(\s|$)/;

/** Jane (Editor) has a session, so /admin pages open straight away. */
function signInJane(mockApi: MockApi) {
  mockApi.addUser({ ...JANE, role: ROLES.editor });
  mockApi.signInAs(JANE.email);
}

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

test('public pages render without the shell', async ({ page }) => {
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
  await page.getByLabel('Password').fill(DEFAULT_PASSWORD);
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
