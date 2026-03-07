#!/usr/bin/env node
import { runCli } from "./cli/index";

runCli(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
