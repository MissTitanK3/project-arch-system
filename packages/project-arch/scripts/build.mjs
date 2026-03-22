import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(import.meta.dirname, "..");
const distDir = path.join(packageRoot, "dist");
const tscPath = require.resolve("typescript/bin/tsc");

fs.rmSync(distDir, { recursive: true, force: true });

const result = spawnSync(process.execPath, [tscPath, "-p", "tsconfig.build.json"], {
  cwd: packageRoot,
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
