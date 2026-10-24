import { createApiContext } from '../../lib/create-api-context';
import type { PasswordApi } from './password.api';

export const [PasswordApiProvider, usePasswordApi] =
  createApiContext<PasswordApi>('Password');
