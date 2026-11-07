/** DI token of the active `AppLogger`. */
export const APP_LOGGER = Symbol('APP_LOGGER');

/** What a use case may log; `context` names the caller (class or feature). */
export interface AppLogger {
  /** A routine event worth a line, such as a finished request. */
  info(message: string, context?: string): void;
  warn(message: string, context?: string): void;
  error(message: string, context?: string): void;
}
