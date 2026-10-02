import { expect, test } from './fixtures/mockApi.ts';

/** The signed-out pages and /403 share AuthLayout (AC-41, AC-44). */
const PAGES = [
  { path: '/login', title: 'Sign in' },
  { path: '/register', title: 'Create account' },
  { path: '/verify-otp', title: 'Verify your email' },
  { path: '/forgot-password', title: 'Reset your password' },
  { path: '/reset-password?token=reset-tok', title: 'Choose a new password' },
  { path: '/reset-password', title: 'Link expired' },
  { path: '/403', title: 'Access denied' },
];

test.beforeEach(({ mockApi }) => {
  // With at least one user, /login stays on the sign-in form.
  mockApi.addUser({ email: 'jane@example.com' });
});

for (const { path, title } of PAGES) {
  test(`${path} is a centred card at most 400px wide on desktop`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(path);

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(main.getByText('hungnhdev CMS')).toBeVisible();

    const card = await main.locator('[data-slot="card"]').boundingBox();
    expect(card).not.toBeNull();
    expect(card!.width).toBeLessThanOrEqual(400);
    // Centred: equal space on both sides, give or take a pixel.
    expect(Math.abs(card!.x - (1280 - (card!.x + card!.width)))).toBeLessThanOrEqual(1);
  });

  test(`${path} fills the full width at 375px without horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(path);

    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    const card = await page.locator('[data-slot="card"]').boundingBox();
    expect(card!.x).toBe(0);
    expect(card!.width).toBe(375);
    const overflow = await page.evaluate<number>(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    );
    expect(overflow).toBe(0);
  });
}

test('the login password field has a show/hide toggle (AC-42)', async ({ page }) => {
  await page.goto('/login');
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('s3cret');

  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});

test('register shows each field error under its field (AC-42)', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Name', { exact: true })).toHaveAccessibleDescription(
    'Name is required.',
  );
});

test('the verification code uses the mono font (AC-4)', async ({ page }) => {
  await page.goto('/verify-otp');

  const otp = page.getByLabel('Verification code');
  await expect(otp).toHaveAttribute('inputmode', 'numeric');
  await expect(otp).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(otp).toHaveCSS('font-family', /Fira Code/);
});
