import { DEFAULT_PASSWORD, expect, OTP_CODE, test } from './fixtures/mockApi.ts';

const ADMIN = {
  name: 'Ada Admin',
  username: 'ada',
  email: 'ada@example.com',
  password: 'first-pass-1',
};

test('a first run goes register → verify → sign in as the admin', async ({ page }) => {
  await page.goto('/login');

  await expect(page).toHaveURL('/register');
  await expect(page.getByRole('heading', { name: 'Set up admin account' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(ADMIN.name);
  await page.getByLabel('Username').fill(ADMIN.username);
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL('/verify-otp');
  await expect(page.getByLabel('Email')).toHaveValue(ADMIN.email);
  await page.getByRole('button', { name: 'Resend code' }).click();
  await expect(page.getByRole('status')).toHaveText(`A new code was sent to ${ADMIN.email}.`);
  await page.getByLabel('Verification code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toHaveText('The code is invalid or has expired.');
  await page.getByLabel('Verification code').fill(OTP_CODE);
  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('status')).toHaveText('Your email is verified. Please sign in.');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: `Welcome, ${ADMIN.name}` })).toBeVisible();
});

test('registering a taken email shows the conflict message', async ({ page, mockApi }) => {
  mockApi.addUser({ email: ADMIN.email, username: 'someone' });

  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(ADMIN.name);
  await page.getByLabel('Username').fill(ADMIN.username);
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('alert')).toHaveText('Email or username is already in use.');
  await expect(page).toHaveURL('/register');
});

test('forgot → reset → sign in with the new password', async ({ page, mockApi }) => {
  const jane = mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe' });

  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Email').fill(jane.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toHaveText('If that email exists, a reset link was sent.');

  const token = mockApi.resetTokenFor(jane.email);
  expect(token).toBeDefined();
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel('New password', { exact: true }).fill('brand-new-pass');
  await page.getByLabel('Confirm new password').fill('brand-new-pass');
  await page.getByRole('button', { name: 'Reset password' }).click();

  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('status')).toHaveText(
    'Your password has been reset. Please sign in.',
  );
  await page.getByLabel('Email').fill(jane.email);
  await page.getByLabel('Password', { exact: true }).fill(DEFAULT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');

  await page.getByLabel('Password', { exact: true }).fill('brand-new-pass');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();
});

test('the reset link token leaves the URL and history (SEC-5)', async ({ page, mockApi }) => {
  const jane = mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe' });
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(jane.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toHaveText('If that email exists, a reset link was sent.');
  const token = mockApi.resetTokenFor(jane.email);
  expect(token).toBeDefined();
  await page.addInitScript('window.__historyLengthAtLoad = history.length');

  await page.goto(`/reset-password?token=${token}`);

  await expect(page).toHaveURL('/reset-password');
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  const lengths = await page.evaluate<{ atLoad: number; now: number }>(
    '({ atLoad: window.__historyLengthAtLoad, now: history.length })',
  );
  expect(lengths.now).toBe(lengths.atLoad);

  await page.getByLabel('New password', { exact: true }).fill('brand-new-pass');
  await page.getByLabel('Confirm new password').fill('brand-new-pass');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('status')).toHaveText(
    'Your password has been reset. Please sign in.',
  );
  expect(mockApi.requests).toContainEqual(
    expect.objectContaining({ method: 'POST', path: '/api/v1/auth/reset-password', status: 200 }),
  );
});

test('reloading the reset page after the strip shows "Link expired"', async ({ page }) => {
  await page.goto('/reset-password?token=reset-any');
  await expect(page).toHaveURL('/reset-password');
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible();
});

test('forgot-password never reveals whether the account exists', async ({ page, mockApi }) => {
  mockApi.addUser({ email: 'jane@example.com' });

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();

  await expect(page.getByRole('status')).toHaveText('If that email exists, a reset link was sent.');
  expect(mockApi.resetTokenFor('nobody@example.com')).toBeUndefined();
});

test('a used or unknown reset link shows "Link expired"', async ({ page, mockApi }) => {
  mockApi.addUser({ email: 'jane@example.com' });

  await page.goto('/reset-password');
  await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible();

  await page.goto('/reset-password?token=reset-unknown');
  await page.getByLabel('New password', { exact: true }).fill('brand-new-pass');
  await page.getByLabel('Confirm new password').fill('brand-new-pass');
  await page.getByRole('button', { name: 'Reset password' }).click();

  await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible();
  await page.getByRole('link', { name: 'Request a new link' }).click();
  await expect(page).toHaveURL('/forgot-password');
});
