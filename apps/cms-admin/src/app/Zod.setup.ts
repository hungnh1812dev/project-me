import { z } from 'zod';

// Zod's eval probe (`new Function`) is reported as a CSP violation under
// `script-src 'self'`, so it must never run (ADR 0015).
z.config({ jitless: true });
