#!/usr/bin/env sh
set -eu

echo "Running architecture validation..."

pnpm arch:check
pnpm arch:report > architecture-report.txt

echo "Architecture validation complete."
