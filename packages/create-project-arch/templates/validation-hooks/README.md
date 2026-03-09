# Validation Hook Scaffold

This scaffold adds baseline architecture validation automation.

## Included Files

- `scripts/validate.sh` - local validation entrypoint
- `.githooks/pre-commit` - optional local pre-commit hook example

## Default Workflow

1. Run `sh scripts/validate.sh` locally.
2. The script executes:
   - `pnpm arch:check`
   - `pnpm arch:report`
3. Optionally run the same script from `.githooks/pre-commit` for local enforcement.

## Task Verification Guidance

When writing or reviewing roadmap tasks, include architecture validation in acceptance checks and verification steps.
