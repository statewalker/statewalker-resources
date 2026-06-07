#!/usr/bin/env tsx
import process from "node:process";
import { NodeFilesApi } from "@statewalker/webrun-files-node";
import { runWikiCli } from "../src/runtime/cli.js";

// argv: <root> <command> <project> [args…]
const [, , root, ...args] = process.argv;
const filesApi = new NodeFilesApi({ rootDir: root ?? process.cwd() });

runWikiCli(args, { filesApi, env: process.env }).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
