import { type Logger, type LoggerLevel, newConsoleLogger } from "@statewalker/shared-logger";
import type { Adaptable, AdapterType } from "./adaptable.js";
import { Adapter } from "./adapter.js";

export type { Logger, LoggerLevel };

/** A do-nothing `Logger` — used as a default and when no logging is configured. */
export const NULL_LOGGER: Logger = {
  level: "info",
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
  child: () => NULL_LOGGER,
};

/**
 * Adapter type for obtaining named loggers. Register a concrete implementation
 * (console- or pino-backed) on a repository/workspace so any resource can resolve
 * it:
 *
 * ```ts
 * repository.register("", LoggerAdapter, (a) => new ConsoleLoggerAdapter(a, { level: "debug" }));
 * const log = workspace.requireAdapter(LoggerAdapter).newLogger("scanner");
 * log.info("…");
 * ```
 *
 * The base implementation returns {@link NULL_LOGGER}; subclasses override
 * `newLogger`.
 */
export class LoggerAdapter extends Adapter {
  /** A logger scoped to `key`, carrying `key` (and any `options`) as metadata. */
  newLogger(_key: string, _options?: Record<string, unknown>): Logger {
    return NULL_LOGGER;
  }
}

/**
 * The named logger from the registered `LoggerAdapter`, or {@link NULL_LOGGER}
 * when none is registered. Lets library code log unconditionally without forcing
 * callers to wire up logging.
 */
export function loggerOf(
  host: { getAdapter<T>(type: AdapterType<T>): T | null },
  key: string,
  options?: Record<string, unknown>,
): Logger {
  return host.getAdapter(LoggerAdapter)?.newLogger(key, options) ?? NULL_LOGGER;
}

/** A `LoggerAdapter` backed by the console logger from `@statewalker/shared-logger`. */
export class ConsoleLoggerAdapter extends LoggerAdapter {
  private readonly root: Logger;

  constructor(adaptable: Adaptable, options?: Record<string, unknown>) {
    super(adaptable, options);
    this.root = newConsoleLogger((options?.level as LoggerLevel) ?? "info");
  }

  newLogger(key: string, options?: Record<string, unknown>): Logger {
    return this.root.child({ name: key, ...(options ?? {}) });
  }
}
