#!/usr/bin/env tsx
import process from "node:process";
import { NodeFilesApi } from "@statewalker/webrun-files-node";
import { runWikiCli } from "../src/runtime/cli.js";

// argv: <root> <command> <project> [args…]
const [, , root, ...args] = process.argv;
const filesApi = new NodeFilesApi({ rootDir: root ?? process.cwd() });

runWikiCli(args, {
  filesApi,
  env: process.env,
  // Data channel: structured result (JSON/YAML) goes to stdout, ObservableHQ
  // data-loader style — nothing else is written there.
  out: { write: (chunk: string) => process.stdout.write(chunk) },
  // Diagnostics channel: progress, status and stats go to stderr via console.warn,
  // keeping stdout a clean data stream.
  warn: (message: string) => console.warn(message),
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
