import { z } from 'zod';

import { EMAIL_MAX_LENGTH } from './identity-auth.constants';
import { PASSWORD_MAX_LENGTH } from './identity.constants';

/**
 * `POST /auth/login` body. Shape checks only: the email format is not
 * validated (an unknown email simply fails like a wrong password), and the
 * password cap keeps Argon2id cost bounded.
 */
export const loginRequestSchema = z.object({
  email: z.string().trim().min(1).max(EMAIL_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
