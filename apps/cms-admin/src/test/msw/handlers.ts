import type { RequestHandler } from 'msw';

// Default handlers shared by every test. Tests add their own with `server.use(...)`.
export const handlers: RequestHandler[] = [];
