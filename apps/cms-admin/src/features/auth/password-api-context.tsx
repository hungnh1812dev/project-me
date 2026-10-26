import { createApiContext } from '../../lib/ApiContext.setup';
import type { PasswordApi } from './password.api';

export const [PasswordApiProvider, usePasswordApi] =
  createApiContext<PasswordApi>('Password');
