# project-arch

[![NPM Version](https://img.shields.io/npm/v/project-arch.svg)](https://www.npmjs.com/package/project-arch)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Deterministic architecture CLI + SDK for repository-native planning, architecture governance, validation, workflow scaffolding, and path-scoped analysis.

`project-arch` helps teams keep roadmap intent, task execution, architecture decisions, and graph/check artifacts aligned in one repository-native workflow.

## Why teams use it

- Deterministic task lanes (`planned`, `discovered`, `backlog`) with strict ID ranges
- Architecture decision records linked to tasks, code targets, and docs
- Machine-readable validation (`pa check --json`) for CI automation
- Structured context resolution with `pa context --json`
- Path-scoped sync and drift analysis with `pa learn --path ... --json`
- Explicit workflow generation under `.github/workflows/` via `pa init --with-workflows`
- Safety rails for repository mutations (safe IDs, path confinement, symlink policy)
- Built-in workflow routing (`pa next`) and health diagnostics (`pa doctor health`)
- SDK surface for integrating checks and workflows into custom tooling

`project-arch` also scaffolds a canonical architecture/governance model during `pa init`, including:

- canonical `architecture/` family structure
- init output-tier guidance
- setup planning guidance
- agent-surface strategy guidance
- workflow-generation guidance
- CLI context and learn guidance

## Use cases

### Platform teams

Use `project-arch` to standardize how cross-cutting changes are planned, validated, and traced across services, packages, and shared architecture decisions.

### Monorepo maintainers

Use it to keep roadmap structure, module boundaries, reconciliation artifacts, and graph-based checks aligned as the repository grows.

### Architecture and governance owners

Use it to make decisions, validation contracts, health diagnostics, and CI-facing JSON outputs part of a deterministic operating model instead of ad hoc documentation.

## Install

### Local project dependency

```bash
pnpm add project-arch
# or
npm install project-arch
# or
yarn add project-arch
```

### Global CLI install

```bash
npm install -g project-arch
```

After install, the CLI is available as `pa`.

## Quick start

```bash
# 1) Initialize architecture scaffolding
pa init

# Optional: materialize first-pass workflow helper files
pa init --with-workflows

# 2) Inspect current execution context and next action
pa context --json
pa next

# 3) Run validation and generate a state report
pa check
pa report --json

# 4) Investigate a specific surface
pa learn --path packages/ui --json
```

## Core commands

### Planning and execution

- `pa phase new <id>`, `pa phase list`
- `pa milestone new <phaseId> <milestoneId>`, `pa milestone list`, `pa milestone status`, `pa milestone activate`, `pa milestone complete`
- `pa task new|discover|idea <phaseId> <milestoneId>`
- `pa task status <phaseId> <milestoneId> <taskId>`
- `pa task lanes <phaseId> <milestoneId>`
- `pa task register-surfaces <phaseId> <milestoneId> <taskId>`

### Architecture decisions

- `pa decision new --scope <project|phase|milestone> [--phase ...] [--milestone ...]`
- `pa decision link <decisionId> [--task ...] [--code ...] [--doc ...]`
- `pa decision status <decisionId> <status>`
- `pa decision supersede <decisionId> <supersededDecisionId>`
- `pa decision list`, `pa decision migrate`

### Validation and health

- `pa check [--json] [--changed] [--only ...] [--severity ...] [--paths ...]`
- `pa check --profile <quality|balanced|budget>`
- `pa check --completeness-threshold <0-100>`
- `pa check --coverage-mode <warning|error>`
- `pa context --json`
- `pa learn --path <path> [--path <path> ...] [--json]`
- `pa doctor` (3-step sweep: frontmatter lint fix, markdown lint, check)
- `pa doctor health [--repair] [--json]`
- `pa next [--json]`
- `pa report [--json]`
- `pa docs [--json] [--linked-only]`
- `pa explain <diagnostic-code>`
- `pa lint frontmatter [--fix]`
- `pa fix frontmatter [--yes] [--check]`
- `pa normalize [--yes] [--check]`

### Agents skill system

- `pa agents list [--json]`
- `pa agents show <id> [--json]`
- `pa agents new <id> [--title ...] [--summary ...] [--override] [--tags ...]`
- `pa agents sync [--check] [--json]`
- `pa agents check [--json]`

Skill schema reference: [docs/agents-skill-schema.md](docs/agents-skill-schema.md)

### Reconciliation lifecycle

- `pa reconcile task <taskId>`
- `pa reconcile --latest`
- `pa reconcile prune [--apply]`
- `pa reconcile compact [--apply]`

Reconciliation report schema: [docs/reconciliation-report-schema.md](docs/reconciliation-report-schema.md)

### Init and scaffold behavior

- `pa init`
- `pa init --force`
- `pa init --with-ai`
- `pa init --with-workflows`

`pa init` now scaffolds the canonical architecture/governance model by default.

`--with-workflows` explicitly materializes the first-pass generated workflow files under `.github/workflows/`.

## JSON contracts for CI and automation

- `pa check --json` emits a stable diagnostics envelope (`schemaVersion: "1.0"`)
- `pa doctor health --json` emits structural health status + issue catalog (`PAH*`)
- `pa next --json` emits deterministic routing decision
- `pa context --json` emits active repository context for downstream automation
- `pa learn --path ... --json` emits path-scoped findings, summary counts, and suggested follow-up commands
- `pa report --json` emits structured repository status, diagnostics, and coverage/report metadata
- `pa docs --json` emits structured document inventory data

Schema docs:

- [docs/check-json-diagnostics-schema.md](docs/check-json-diagnostics-schema.md)
- [docs/security-operations-model.md](docs/security-operations-model.md)

## SDK usage (TypeScript)

```ts
import { check, context, learn, next, report, docs, agents } from "project-arch";

const checkResult = await check.checkRun({
  completenessThreshold: 90,
  coverageMode: "warning",
});

if (checkResult.success && checkResult.data?.ok) {
  console.log("Architecture checks passed");
}

const route = await next.nextResolve();
if (route.success) {
  console.log(route.data?.recommendedCommand);
}

const currentContext = await context.contextResolve();
if (currentContext.success) {
  console.log(currentContext.data?.active?.task?.id);
}

const learned = await learn.learnPath({
  paths: ["packages/ui"],
});
if (learned.success) {
  console.log(learned.data?.summary.totalGaps);
}

const repoReport = await report.reportGenerate();
if (repoReport.success) {
  console.log(repoReport.data?.report.summary.totalTasks);
}

const inventory = await docs.docsList({
  linkedOnly: true,
});
if (inventory.success) {
  console.log(inventory.data?.documents.length);
}

const skills = await agents.agentsList();
if (skills.success) {
  console.log(skills.data?.skills.map((skill) => skill.id));
}
```

Published entrypoints:

- Package API: `project-arch`
- CLI runtime: `project-arch/cli`
- Binary: `pa`

## Security and operations summary

Normal operation is repository-local and offline.

- No hidden HTTP(S) calls during standard CLI workflows
- File mutations are scoped to project architecture surfaces
- `pa check --changed` uses `git status --porcelain`
- `pa doctor` runs `pnpm lint:md` in its sweep
- workflow generation remains explicit rather than automatic in default init

Full model: [docs/security-operations-model.md](docs/security-operations-model.md)

## Release preparation (local)

Run pre-push/pre-publish release gates:

```bash
pnpm release:prepare
```

Useful flags:

- `--version <semver>`
- `--allow-dirty`
- `--json`
- `--dry-run`
- `--no-tests`

This writes `.project-arch/release/release-check.json` unless `--dry-run` is used.

## Changelog highlights

Recent releases added major workflow and safety capabilities:

- **1.7.0**: canonical scaffold/governance expansion, real `pa context --json`, real `pa learn --path`, explicit workflow generation, expanded docs/report JSON output, and scaffold/package-surface cleanup
- **1.6.0**: `pa doctor health`, `pa next`, agents surface expansion, workflow profiles, graph completeness diagnostics, and hardening rails
- **1.5.0**: bootstrap init expansion, milestone dependency enforcement, and blocked-task status signaling

See full details in [CHANGELOG.md](CHANGELOG.md).

## Compatibility notes

- CLI and JSON output contracts are versioned; check `schemaVersion` in machine consumers
- Prefer additive parsing for diagnostics (`code`, `severity`, `message`, `path`, `hint`)
- Treat unknown diagnostics as forward-compatible

## Contributing and support

- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Issues: <https://github.com/MissTitanK3/project-arch-system/issues>
- Discussions: <https://github.com/MissTitanK3/project-arch-system/discussions>

## License

MIT — see [LICENSE](LICENSE).
