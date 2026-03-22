#!/usr/bin/env node
import { runCli } from "./cli/index";
import { formatErrorWithHint } from "./cli/help/hints";
import { isDebugOutputEnabled } from "./utils/outputSafety";

runCli(process.argv).catch((error: unknown) => {
  console.error(formatErrorWithHint(error, { includeStack: isDebugOutputEnabled() }));
  process.exit(1);
});
