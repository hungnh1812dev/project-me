import {
  ImageIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  ShieldIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';

/** One link of the side menu's Settings section. */
export interface SettingsLink {
  key: string;
  label: string;
  to: string;
  /** Shown only when `hasPermission` passes, so `<res>:manager` qualifies too. */
  permission: string;
  icon: LucideIcon;
}

/** The Settings section (AC-25), in menu order. Each key has a page in `router.tsx` (AC-1). */
export const SETTINGS_LINKS: readonly SettingsLink[] = Object.freeze([
  {
    key: 'users',
    label: 'Users',
    to: '/admin/settings/users',
    permission: 'user:read',
    icon: UsersIcon,
  },
  {
    key: 'roles',
    label: 'Roles',
    to: '/admin/settings/roles',
    permission: 'role:read',
    icon: ShieldIcon,
  },
  {
    key: 'permissions',
    label: 'Permissions',
    to: '/admin/settings/permissions',
    permission: 'permission:read',
    icon: LockKeyholeIcon,
  },
  {
    key: 'access-tokens',
    label: 'Access tokens',
    to: '/admin/settings/access-tokens',
    permission: 'api_token:read',
    icon: KeyRoundIcon,
  },
  {
    key: 'media',
    label: 'Media library',
    to: '/admin/settings/media',
    permission: 'media:read',
    icon: ImageIcon,
  },
]);
