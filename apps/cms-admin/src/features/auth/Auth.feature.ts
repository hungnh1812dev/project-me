import { defineApiService } from '@apis/client/ApiService.setup';

import type { Feature } from '../Features.registry';
import { createPasswordApi } from './Password.api';
import { PasswordApiProvider } from './PasswordApi.context';
import { createSetupApi } from './Setup.api';
import { SetupApiProvider } from './SetupApi.context';

export const authFeature: Feature = {
  apiServices: [
    defineApiService(createPasswordApi, PasswordApiProvider),
    defineApiService(createSetupApi, SetupApiProvider),
  ],
};
