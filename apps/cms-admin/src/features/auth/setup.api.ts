import type { AxiosInstance } from 'axios';

import { API_ENDPOINTS } from '../../config/endpoints';

export interface SetupStatus {
  open: boolean;
}

/** Body of `POST /setup/owner`; `displayName` is left out when blank. */
export interface CreateOwnerInput {
  setupToken: string;
  email: string;
  displayName?: string;
  password: string;
}

/**
 * One-time owner setup endpoints. Public: no Bearer token and no
 * refresh-and-retry, so a 401 is the answer (wrong setup token).
 */
export function createSetupApi(client: AxiosInstance) {
  return {
    getSetupStatus: async (): Promise<SetupStatus> => {
      const { data } = await client.get<SetupStatus>(
        API_ENDPOINTS.SETUP.STATUS,
        { skipAuthRefresh: true },
      );
      return data;
    },

    createOwner: async (input: CreateOwnerInput): Promise<void> => {
      await client.post(API_ENDPOINTS.SETUP.OWNER, input, {
        skipAuthRefresh: true,
      });
    },
  };
}

export type SetupApi = ReturnType<typeof createSetupApi>;
