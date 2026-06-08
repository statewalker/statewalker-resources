import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import {
  ConsoleLoggerAdapter,
  type Logger,
  LoggerAdapter,
  loggerOf,
  NULL_LOGGER,
  ResourceRepository,
} from "../../src/core/index.js";

function repo(): ResourceRepository {
  return new ResourceRepository({ filesApi: new MemFilesApi({ initialFiles: {} }) });
}

describe("LoggerAdapter", () => {
  it("loggerOf returns NULL_LOGGER when no LoggerAdapter is registered", () => {
    expect(loggerOf(repo(), "anything")).toBe(NULL_LOGGER);
  });

  it("loggerOf routes to the registered adapter, scoping by key + options", () => {
    const r = repo();
    const seen: Array<{ key: string; options?: Record<string, unknown> }> = [];
    class CaptureLoggerAdapter extends LoggerAdapter {
      newLogger(key: string, options?: Record<string, unknown>): Logger {
        seen.push({ key, options });
        return NULL_LOGGER;
      }
    }
    r.register("", LoggerAdapter, CaptureLoggerAdapter);

    loggerOf(r, "Summarizer", { uri: "a.md" });

    expect(seen).toEqual([{ key: "Summarizer", options: { uri: "a.md" } }]);
    // The spec's explicit form resolves the same registered adapter.
    expect(r.requireAdapter(LoggerAdapter)).toBeInstanceOf(CaptureLoggerAdapter);
  });

  it("ConsoleLoggerAdapter yields a Logger-shaped child per key", () => {
    const r = repo();
    r.register("", LoggerAdapter, ConsoleLoggerAdapter);
    const log = r.requireAdapter(LoggerAdapter).newLogger("scanner");
    expect(typeof log.info).toBe("function");
    expect(typeof log.child).toBe("function");
    expect(log.level).toBe("info");
  });
});
