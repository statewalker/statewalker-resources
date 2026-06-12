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
 *
 * Pass `destination: 2` to send all log output to stderr (keeping stdout free for
 * a machine-readable data channel); the default `1` writes to stdout.
 */
export class PinoLoggerAdapter extends LoggerAdapter {
  private readonly root: Logger;

  constructor(adaptable: Adaptable, options?: Record<string, unknown>) {
    super(adaptable, options);
    const destination = (options?.destination as 1 | 2) ?? 1;
    this.root = newPinoLogger((options?.level as LoggerLevel) ?? "info", {}, { destination });
  }

  newLogger(key: string, options?: Record<string, unknown>): Logger {
    return this.root.child({ name: key, ...(options ?? {}) });
  }
}
