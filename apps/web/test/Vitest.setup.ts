import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// The 1000 ms default for findBy / waitFor is too short when the monorepo's tests run in parallel.
const ASYNC_UTIL_TIMEOUT_MS = 5000;
configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS });

afterEach(() => {
  cleanup();
});
