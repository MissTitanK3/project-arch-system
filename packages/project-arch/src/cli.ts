#!/usr/bin/env node
import { runCli } from "./cli/index";
import { addHintToError } from "./cli/help/hints";

runCli(process.argv).catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(addHintToError(error));
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
