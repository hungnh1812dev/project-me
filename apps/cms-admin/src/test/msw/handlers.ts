import { http, HttpResponse, type RequestHandler } from 'msw';

// Default handlers shared by every test. Tests add their own with `server.use(...)`.
export const handlers: RequestHandler[] = [
  // An installed CMS: `/login` stays on the sign-in form.
  http.get('*/api/v1/auth/has-users', () => HttpResponse.json({ hasUsers: true })),
  // No session by default: there is no refresh cookie, so a refresh is rejected.
  http.post('*/api/v1/auth/refresh', () =>
    HttpResponse.json(
      { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' },
      { status: 401 },
    ),
  ),
  // Logout never fails on the backend.
  http.post('*/api/v1/auth/logout', () => HttpResponse.json({ message: 'Logged out' })),
];
