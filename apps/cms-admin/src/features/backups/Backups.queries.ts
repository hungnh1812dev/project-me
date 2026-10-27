import { useQuery } from '@tanstack/react-query';

import { APP_ROUTES } from '../../config/App.routes';
import { COPY } from '../../config/Copy.constants';
import {
  API_ERROR_CODES,
  HEALTH_QUERY_RETRY,
  HTTP_STATUS,
} from '../../config/Http.constants';
import { apiFailureOf } from '../../lib/ApiFailure.errors';
import type {
  FeatureNavItem,
  NavItemsState,
} from '../../lib/FeatureDefinition';
import { useCallerAccess } from '../access';
import { useBackupsApi } from './BackupsApi.context';

export const BACKUPS_QUERY_KEYS = {
  list: ['backups', 'list'],
} as const;

/** The owner-only rule has no permission subject; this names the link for the shell's check. */
const BACKUPS_NAV_ITEM: FeatureNavItem = {
  label: COPY.backups.nav,
  path: APP_ROUTES.BACKUPS,
  section: 'systemSettings',
  subject: 'backups',
  action: 'read',
};

/** The server answers 404 BACKUPS_NOT_CONFIGURED while the bucket keys are unset. */
export function isBackupsNotConfigured(error: unknown): boolean {
  const failure = apiFailureOf(error);
  return (
    failure.kind === 'http' &&
    failure.status === HTTP_STATUS.NOT_FOUND &&
    failure.errorCode === API_ERROR_CODES.BACKUPS_NOT_CONFIGURED
  );
}

export function isBackupsRateLimited(error: unknown): boolean {
  return apiFailureOf(error).kind === 'rate-limited';
}

/** A 4xx answer is final (not configured, not the owner, rate limited); only network and 5xx retry. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const failure = apiFailureOf(error);
  if (failure.kind === 'rate-limited') return false;
  if (
    failure.kind === 'http' &&
    failure.status < HTTP_STATUS.SERVER_ERROR_MIN
  ) {
    return false;
  }
  return failureCount < HEALTH_QUERY_RETRY;
}

/** Never fetches on its own: the page's button calls `refetch` (the server throttles the list per actor). */
export function useBackupsQuery() {
  const api = useBackupsApi();
  return useQuery({
    queryKey: BACKUPS_QUERY_KEYS.list,
    queryFn: api.list,
    retry: shouldRetry,
    enabled: false,
  });
}

/**
 * `backupsFeature.useNavItems`: the item shows for the owner only and needs
 * no request; the page reports a missing backup storage after its refresh (D20).
 */
export function useBackupsNavItems(): NavItemsState {
  const caller = useCallerAccess();
  return {
    items: caller.isOwner ? [BACKUPS_NAV_ITEM] : [],
    isLoading: false,
    hasFailed: false,
    retry: () => undefined,
  };
}
