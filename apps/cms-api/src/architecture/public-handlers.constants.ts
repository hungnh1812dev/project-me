/**
 * Controller handlers that carry no `@RequirePermission` on purpose. The
 * permission guard lets a handler without metadata through (SPEC D5), so
 * every such handler must be listed here with the reason it is safe. A new
 * unlisted handler fails `permission-metadata.architecture.spec.ts`.
 */
export type PublicHandlerReason =
  'public' | 'authenticated-only' | 'document-auth-guard';

export interface PublicHandler {
  /** `ControllerClassName.methodName` */
  handler: string;
  reason: PublicHandlerReason;
}

const publicHandlers = (
  controller: string,
  reason: PublicHandlerReason,
  methods: readonly string[],
): PublicHandler[] =>
  methods.map((method) => ({ handler: `${controller}.${method}`, reason }));

export const PUBLIC_HANDLERS: readonly PublicHandler[] = [
  ...publicHandlers('HealthController', 'public', ['live', 'ready']),
  ...publicHandlers('AuthController', 'public', ['login', 'refresh', 'logout']),
  ...publicHandlers('AuthController', 'authenticated-only', ['me']),
  ...publicHandlers('OwnerSetupController', 'public', [
    'status',
    'createOwner',
  ]),
  ...publicHandlers('PasswordController', 'public', [
    'requestOtp',
    'reset',
    'set',
  ]),
  ...publicHandlers('PasswordController', 'authenticated-only', ['change']),
  ...publicHandlers('TwoFactorController', 'public', [
    'verify',
    'emailChallenge',
  ]),
  ...publicHandlers('TwoFactorController', 'authenticated-only', [
    'setupTotp',
    'enable',
    'disable',
    'sendEmailCode',
  ]),
  ...publicHandlers('ReviewerController', 'public', [
    'status',
    'createSession',
  ]),
  ...publicHandlers('ContentTypesController', 'authenticated-only', [
    'list',
    'get',
  ]),
  ...publicHandlers('GraphqlController', 'document-auth-guard', ['query']),
];
