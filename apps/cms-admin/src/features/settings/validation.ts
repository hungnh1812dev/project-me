import type { Permission } from './types';

// Pure form rules for the settings dialogs (AC-25, AC-26). The Roles part arrives with 4.4.

/** `resource:action`, lowercase, each part starting with a letter (AC-25). */
export const PERMISSION_SLUG_PATTERN = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;

export const PERMISSION_NAME_MAX = 100;
export const PERMISSION_DESCRIPTION_MAX = 500;

/** The permission form's values, as typed. */
export interface PermissionValues {
  slug: string;
  name: string;
  description: string;
}

/** One message per invalid field; an empty object means valid. */
export type PermissionErrors = Partial<Record<keyof PermissionValues, string>>;

/**
 * Checks the permission form (AC-25): slug required and matching `PERMISSION_SLUG_PATTERN` (skipped
 * on edit, where it is read-only), name required with at most 100 characters, description required
 * with at most 500. Name and description are trimmed first.
 */
export function validatePermission(
  values: PermissionValues,
  { isEdit = false }: { isEdit?: boolean } = {},
): PermissionErrors {
  const errors: PermissionErrors = {};
  if (!isEdit) {
    if (!values.slug) errors.slug = 'Enter a slug.';
    else if (!PERMISSION_SLUG_PATTERN.test(values.slug)) {
      errors.slug = 'Use resource:action in lowercase, for example article:export.';
    }
  }
  const name = values.name.trim();
  if (!name) errors.name = 'Enter a name.';
  else if (name.length > PERMISSION_NAME_MAX) errors.name = 'Use 100 characters or fewer.';
  const description = values.description.trim();
  if (!description) errors.description = 'Enter a description.';
  else if (description.length > PERMISSION_DESCRIPTION_MAX) {
    errors.description = 'Use 500 characters or fewer.';
  }
  return errors;
}

/** P3's body: only the fields that differ from `original`, trimmed (AC-26). */
export function permissionChanges(
  original: Pick<Permission, 'name' | 'description'>,
  values: Pick<PermissionValues, 'name' | 'description'>,
): { name?: string; description?: string } {
  const name = values.name.trim();
  const description = values.description.trim();
  return {
    ...(name !== original.name && { name }),
    ...(description !== (original.description ?? '') && { description }),
  };
}
