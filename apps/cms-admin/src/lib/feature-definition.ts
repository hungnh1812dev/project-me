import type { ComponentType } from 'react';

import type { PermissionAction } from '../config/access.constants';

export interface FeatureRoute {
  /** Omit for the index route of the app shell. */
  path?: string;
  Component: ComponentType;
}

/** A top-nav link shown only to callers holding `action` on `subject`. */
export interface FeatureNavItem {
  label: string;
  path: string;
  subject: string;
  action: PermissionAction;
}

/** What a feature contributes to the app; `features/registry.ts` lists them. */
export interface Feature {
  routes: readonly FeatureRoute[];
  navItems?: readonly FeatureNavItem[];
}
