import { SetMetadata } from '@nestjs/common';

import type { PermissionAction } from '../../generated/prisma/client';
import {
  PERMISSION_METADATA_KEY,
  type SystemSubject,
} from './access.constants';

/**
 * What a route needs. A system route names its subject; a content route
 * names the route param holding the content type slug (`:slug`), which the
 * guard resolves through the registry, never as SQL.
 */
export type PermissionRequirement =
  | { action: PermissionAction; subject: SystemSubject }
  | { action: PermissionAction; subjectParam: string };

/**
 * Declares the permission a handler needs. Only metadata: the guard that
 * reads it and calls `PolicyEvaluator.can()` is `PermissionGuard`.
 */
export const RequirePermission = (requirement: PermissionRequirement) =>
  SetMetadata(PERMISSION_METADATA_KEY, requirement);
