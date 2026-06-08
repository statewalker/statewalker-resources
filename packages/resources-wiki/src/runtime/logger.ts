import {
  type Adaptable,
  type Logger,
  LoggerAdapter,
  type LoggerLevel,
} from "@statewalker/resources-workspace";
import { newPinoLogger } from "@statewalker/shared-logger-pino";

/**
 * A {@link LoggerAdapter} backed by pino (`@statewalker/shared-logger-pino`). One
 * root logger is created at the configured `level`; `newLogger(key)` returns a
 * child carrying `key` (and any extra options) as structured metadata.
 *
 * Register it on the repository so every stage can resolve a logger:
 * ```ts
 * repository.register("", LoggerAdapter, (a) => new PinoLoggerAdapter(a, { level: "debug" }));
 * ```
 */
export class PinoLoggerAdapter extends LoggerAdapter {
  private readonly root: Logger;

  constructor(adaptable: Adaptable, options?: Record<string, unknown>) {
    super(adaptable, options);
    this.root = newPinoLogger((options?.level as LoggerLevel) ?? "info");
  }

  newLogger(key: string, options?: Record<string, unknown>): Logger {
    return this.root.child({ name: key, ...(options ?? {}) });
  }
}
