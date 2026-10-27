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

/** A 4xx answer is final (not configured, not the owner); only network and 5xx retry. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const failure = apiFailureOf(error);
  if (
    failure.kind === 'http' &&
    failure.status < HTTP_STATUS.SERVER_ERROR_MIN
  ) {
    return false;
  }
  return failureCount < HEALTH_QUERY_RETRY;
}

export function useBackupsQuery(options: { enabled?: boolean } = {}) {
  const api = useBackupsApi();
  return useQuery({
    queryKey: BACKUPS_QUERY_KEYS.list,
    queryFn: api.list,
    retry: shouldRetry,
    enabled: options.enabled ?? true,
  });
}

/**
 * `backupsFeature.useNavItems`: the item shows for the owner only, and only
 * once the server did not report the backups as not configured (D20).
 * A non-owner never sends the request.
 */
export function useBackupsNavItems(): NavItemsState {
  const caller = useCallerAccess();
  const list = useBackupsQuery({ enabled: caller.isOwner });
  const isAvailable =
    caller.isOwner &&
    (list.isSuccess || (list.isError && !isBackupsNotConfigured(list.error)));
  return {
    items: isAvailable ? [BACKUPS_NAV_ITEM] : [],
    isLoading: false,
    hasFailed: false,
    retry: () => void list.refetch(),
  };
}
