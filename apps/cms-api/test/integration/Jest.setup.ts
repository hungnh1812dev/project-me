/** Container start-up (image pull on first run) can take well over Jest's 5 s default. */
const INTEGRATION_TIMEOUT_MS = 120_000;

jest.setTimeout(INTEGRATION_TIMEOUT_MS);
