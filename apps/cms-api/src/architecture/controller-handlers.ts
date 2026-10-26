import 'reflect-metadata';

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import {
  PERMISSION_METADATA_KEY,
  PermissionGuard,
  type PermissionRequirement,
} from '../modules/access/http/Permission.guard';
import { DocumentAuthGuard } from '../modules/access/document-auth/http/DocumentAuth.guard';
import { RATE_LIMIT_POLICY_METADATA } from '../common/guards/throttle.guard';
import type { RateLimitPolicy } from '../common/constants/limits.constants';
import { JwtAuthGuard } from '../modules/identity/jwt.strategy';
import type { PublicHandlerReason } from './public-handlers.constants';

/**
 * Reads the route handlers of Nest controller classes from their decorator
 * metadata, for the architecture specs. Inherited handlers are included.
 */
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

type HandlerFunction = (...args: never[]) => unknown;
type GuardClass = abstract new (...args: never[]) => unknown;

export type ControllerClass = (new (...args: never[]) => object) & {
  prototype: Record<string, unknown>;
};

export interface DiscoveredHandler {
  /** `ControllerClassName.methodName` */
  id: string;
  routePath: string;
  requirement: PermissionRequirement | undefined;
  /** Class guards first, then method guards: the order Nest runs them. */
  guards: GuardClass[];
  /** Rules of the method-level `@Throttle`; undefined when not throttled. */
  throttlePolicy: RateLimitPolicy | undefined;
}

/** The guard each non-public reason promises (see PUBLIC_HANDLERS). */
export const GUARD_PROMISED_BY_REASON: Record<
  PublicHandlerReason,
  GuardClass | undefined
> = {
  public: undefined,
  'authenticated-only': JwtAuthGuard,
  'document-auth-guard': DocumentAuthGuard,
};

export const AUTHENTICATION_GUARDS: readonly GuardClass[] = [
  JwtAuthGuard,
  DocumentAuthGuard,
];

export { PermissionGuard };

const reflector = new Reflector();

export function isControllerClass(value: unknown): value is ControllerClass {
  return (
    typeof value === 'function' && Reflect.hasMetadata(PATH_METADATA, value)
  );
}

function guardsDeclaredOn(target: object): GuardClass[] {
  return (Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as GuardClass[];
}

function methodNamesOf(controller: ControllerClass): string[] {
  const names = new Set<string>();
  for (
    let proto: object | null = controller.prototype;
    proto !== null && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    Object.getOwnPropertyNames(proto).forEach((name) => names.add(name));
  }
  return [...names];
}

export function handlersOf(controller: ControllerClass): DiscoveredHandler[] {
  const classPath = String(Reflect.getMetadata(PATH_METADATA, controller));
  return methodNamesOf(controller).flatMap((name) => {
    const method = controller.prototype[name];
    if (
      typeof method !== 'function' ||
      !Reflect.hasMetadata(METHOD_METADATA, method)
    ) {
      return [];
    }
    return {
      id: `${controller.name}.${name}`,
      routePath: `${classPath}/${String(Reflect.getMetadata(PATH_METADATA, method))}`,
      requirement: reflector.getAllAndOverride<
        PermissionRequirement | undefined
      >(PERMISSION_METADATA_KEY, [method as HandlerFunction, controller]),
      guards: [...guardsDeclaredOn(controller), ...guardsDeclaredOn(method)],
      throttlePolicy: Reflect.getMetadata(
        RATE_LIMIT_POLICY_METADATA,
        method,
      ) as RateLimitPolicy | undefined,
    };
  });
}

/** True when `PermissionGuard` runs and an authentication guard runs before it. */
export function isPermissionEnforced({ guards }: DiscoveredHandler): boolean {
  const permissionAt = guards.indexOf(PermissionGuard);
  return (
    permissionAt >= 0 &&
    guards.slice(0, permissionAt).some((g) => AUTHENTICATION_GUARDS.includes(g))
  );
}

export function hasPromisedGuard(
  { guards }: DiscoveredHandler,
  reason: PublicHandlerReason,
): boolean {
  const promised = GUARD_PROMISED_BY_REASON[reason];
  return promised === undefined || guards.includes(promised);
}
