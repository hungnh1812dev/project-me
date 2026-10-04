import type { Role } from '@/features/auth/types';

import type { Permission } from './types';

// Pure form rules for the settings dialogs (AC-19, AC-20, AC-25, AC-26).

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

// Roles

/** Lowercase letters and digits in dash-separated runs (AC-19). */
export const ROLE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ROLE_NAME_MAX = 100;
export const ROLE_SLUG_MAX = 63;
export const ROLE_LEVEL_MAX = 100;

/**
 * The slug derived from a role name (AC-19): lowercase, every run of other characters becomes one
 * `-`, no leading or trailing `-`, at most 63 characters.
 */
export function roleSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ROLE_SLUG_MAX)
    .replace(/-+$/, '');
}

/** The role form's values, as typed. `level` is the input's text. */
export interface RoleValues {
  name: string;
  slug: string;
  level: string;
  permissions: readonly string[];
}

/** One message per invalid field; an empty object means valid. */
export type RoleErrors = Partial<Record<'name' | 'slug' | 'level', string>>;

/**
 * Checks the role form (AC-19, AC-20): name required (trimmed) with at most 100 characters; slug
 * required, matching `ROLE_SLUG_PATTERN`, at most 63 characters (skipped on edit, where it is
 * read-only); level a whole number from 0 to 100. No rule compares the level with the actor's (D4).
 */
export function validateRole(
  values: RoleValues,
  { isEdit = false }: { isEdit?: boolean } = {},
): RoleErrors {
  const errors: RoleErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = 'Enter a name.';
  else if (name.length > ROLE_NAME_MAX) errors.name = 'Use 100 characters or fewer.';
  if (!isEdit) {
    if (!values.slug) errors.slug = 'Enter a slug.';
    else if (values.slug.length > ROLE_SLUG_MAX) errors.slug = 'Use 63 characters or fewer.';
    else if (!ROLE_SLUG_PATTERN.test(values.slug)) {
      errors.slug = 'Use lowercase letters, numbers and single dashes, for example content-writer.';
    }
  }
  const level = values.level.trim();
  if (!level) errors.level = 'Enter a level.';
  else if (!/^\d+$/.test(level) || Number(level) > ROLE_LEVEL_MAX) {
    errors.level = 'Use a whole number from 0 to 100.';
  }
  return errors;
}

/** R3's body: only the fields that differ from `original` (AC-20). Permissions compare as sets. */
export function roleChanges(
  original: Pick<Role, 'name' | 'level' | 'permissions'>,
  values: Pick<RoleValues, 'name' | 'level' | 'permissions'>,
): { name?: string; level?: number; permissions?: string[] } {
  const name = values.name.trim();
  const level = Number(values.level.trim());
  const permissions = [...new Set(values.permissions)];
  const before = new Set(original.permissions);
  const samePermissions =
    permissions.length === before.size && permissions.every((slug) => before.has(slug));
  return {
    ...(name !== original.name && { name }),
    ...(level !== original.level && { level }),
    ...(!samePermissions && { permissions }),
  };
}

// Access tokens

export const TOKEN_NAME_MAX = 100;

/** Checks a token name (AC-29): required once trimmed, with at most 100 characters. */
export function validateTokenName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return 'Enter a name.';
  if (name.length > TOKEN_NAME_MAX) return 'Use 100 characters or fewer.';
  return undefined;
}

// Profile

export const PROFILE_NAME_MAX = 100;

/** Checks the profile name (AC-39): required once trimmed, with at most 100 characters. */
export function validateProfileName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return 'Enter your name.';
  if (name.length > PROFILE_NAME_MAX) return 'Use 100 characters or fewer.';
  return undefined;
}
