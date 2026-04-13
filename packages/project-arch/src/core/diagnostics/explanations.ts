/**
 * Human-readable explanations and remediation hints for every diagnostic code
 * emitted by pa check, pa lint frontmatter, and related commands.
 */

export interface DiagnosticExplanation {
  /** Short human-readable description of what the diagnostic means. */
  description: string;
  /** Step-by-step or narrative guidance for resolving the issue. */
  remediation: string;
}

export const DIAGNOSTIC_EXPLANATIONS: Readonly<Record<string, DiagnosticExplanation>> = {
  // ── Task validation ──────────────────────────────────────────────────────────

  MALFORMED_TASK_FILE: {
    description:
      "A task file could not be parsed or failed structural validation (schema mismatch, " +
      "filename prefix mismatch, lane mismatch, or ID out of range for its lane directory).",
    remediation: [
      "1. Open the file listed in the diagnostic message.",
      "2. Run `pa lint frontmatter` to identify YAML-level issues (tab indentation, missing keys, etc.).",
      "3. Run `pa lint frontmatter --fix` to auto-correct safe whitespace issues.",
      '4. Check that the frontmatter `id` field matches the filename prefix (e.g., `id: "001"` → file starts with `001-`).',
      "5. Check that the `lane` frontmatter field matches the lane directory " +
        "(planned → 001-099, discovered → 101-199, backlog → 901-999).",
      "6. After fixing, re-run `pa check` to confirm the file validates cleanly.",
    ].join("\n"),
  },

  DUPLICATE_TASK_ID: {
    description:
      "Two or more task files in the same milestone share the same numeric ID. " +
      "IDs must be unique within a milestone scope.",
    remediation: [
      "1. Run `pa task lanes <phase> <milestone>` to see current ID usage.",
      "2. Rename the duplicate file and update its `id` frontmatter field to the next available ID.",
      "3. Update any decision links (`links.tasks`) that referenced the old ID.",
      "4. Re-run `pa check` to confirm no conflicts remain.",
    ].join("\n"),
  },

  MISSING_TASK_CODE_TARGET: {
    description:
      "A task's `codeTargets` array references a file or directory path that does not exist " +
      "in the workspace.",
    remediation: [
      "1. Open the task file and review the `codeTargets` list.",
      "2. Verify the path is correct relative to the workspace root.",
      "3. If the code has not been created yet, either create the file/directory or remove the " +
        "reference until the implementation is in place.",
      "4. If the module is in a new package, declare it in `arch-model/modules.json` first.",
    ].join("\n"),
  },

  MISSING_TASK_PUBLIC_DOC: {
    description: "A task's `publicDocs` array references a documentation path that does not exist.",
    remediation: [
      "1. Open the task file and review the `publicDocs` list.",
      "2. Check that the path is correct relative to the workspace root.",
      "3. Create the documentation file or remove the stale reference.",
    ].join("\n"),
  },

  TASK_UNDECLARED_MODULE: {
    description:
      "A task's `codeTargets` entry resolves to a module (apps/<name> or packages/<name>) " +
      "that has not been declared in `arch-model/modules.json`.",
    remediation: [
      "1. Add the module to `arch-model/modules.json` (name, type, description).",
      "2. Rebuild the graph: `pa graph build` (if available) or proceed and re-run `pa check`.",
      "3. If the module is intentionally excluded from the architecture model, use a deeper path " +
        "in `codeTargets` so it does not resolve to the undeclared module root.",
    ].join("\n"),
  },

  TASK_NON_MODULE_CODE_TARGET: {
    description:
      "A task codeTarget points to a non-runtime artifact (docs/generated/infra) instead of " +
      "an application or package module path.",
    remediation: [
      "1. Prefer runtime code paths under `apps/<name>/...` or `packages/<name>/...` in `codeTargets`.",
      "2. If the path is intentionally non-runtime, add a suppress/classify rule in `.project-arch/graph.config.json`.",
      "3. Keep non-runtime references in `publicDocs` where appropriate.",
    ].join("\n"),
  },

  TASK_UNDECLARED_DOMAIN: {
    description:
      "A task's `tags` array contains a `domain:<name>` tag that has not been declared in " +
      "`arch-domains/domains.json`.",
    remediation: [
      "1. Add the domain to `arch-domains/domains.json` (name, description, owner).",
      "2. Alternatively, remove or correct the `domain:` tag if it was added by mistake.",
      "3. Re-run `pa check` to confirm the diagnostic resolves.",
    ].join("\n"),
  },

  // ── Decision validation ──────────────────────────────────────────────────────

  MISSING_DECISION_CODE_TARGET: {
    description:
      "A decision's `links.codeTargets` array references a file or directory that does not exist.",
    remediation: [
      "1. Open the decision file and review `links.codeTargets`.",
      "2. Correct the path or remove the stale reference.",
      "3. Create the file if the implementation is in progress and the link is correct.",
    ].join("\n"),
  },

  MISSING_DECISION_PUBLIC_DOC: {
    description:
      "A decision's `links.publicDocs` array references a documentation file that does not exist.",
    remediation: [
      "1. Open the decision file and review `links.publicDocs`.",
      "2. Create the documentation file or remove the reference.",
    ].join("\n"),
  },

  DECISION_UNDECLARED_MODULE: {
    description: "A decision's `links.codeTargets` entry resolves to an undeclared module.",
    remediation: [
      "Declare the module in `arch-model/modules.json` or adjust the codeTargets path. " +
        "See TASK_UNDECLARED_MODULE remediation for details.",
    ].join("\n"),
  },

  INVALID_DECISION_TASK_LINK: {
    description:
      "A decision's `links.tasks` entry is not in the required `<phase>/<milestone>/<id>` format.",
    remediation: [
      "1. Open the decision file.",
      "2. Fix each task reference in `links.tasks` to use the format `phase-1/milestone-1-setup/001`.",
      "3. Re-run `pa check` to confirm validity.",
    ].join("\n"),
  },

  MISSING_LINKED_TASK: {
    description:
      "A decision references a task via `links.tasks`, but that task does not exist in the roadmap.",
    remediation: [
      "1. Check whether the task was renamed, moved, or deleted.",
      "2. Update `links.tasks` in the decision to point to the correct task, or remove the stale link.",
    ].join("\n"),
  },

  MISSING_SUPERSEDED_DECISION: {
    description:
      "A decision lists a `supersedes` ID that does not correspond to any known decision.",
    remediation: [
      "1. Open the decision file and review the `supersedes` array.",
      "2. Correct the decision ID or remove the reference if the superseded decision was deleted.",
    ].join("\n"),
  },

  PROJECT_DECISION_INDEX_MISSING_ENTRY: {
    description:
      "The project-level decision index (`docs/project/decisions/index.json`) references a " +
      "decision ID that does not match any decision file.",
    remediation: [
      "1. Run `pa decision list` to see all known decision IDs.",
      "2. Open the index file and remove or correct the stale entry.",
    ].join("\n"),
  },

  PHASE_DECISION_INDEX_MISSING_ENTRY: {
    description:
      "A phase-level decision index references a decision ID with no corresponding file.",
    remediation: [
      "1. Open the reported phase decision index under `roadmap/projects/<project>/phases/<phase>/decisions/index.json`.",
      "2. Remove the stale entry or recreate the missing decision file.",
      "3. Run `pa decision list` to see all known decision IDs, then re-run `pa check`.",
    ].join("\n"),
  },

  MILESTONE_DECISION_INDEX_MISSING_ENTRY: {
    description:
      "A milestone-level decision index references a decision ID with no corresponding file.",
    remediation: [
      "1. Open the reported milestone decision index under `roadmap/projects/<project>/phases/<phase>/milestones/<milestone>/decisions/index.json`.",
      "2. Remove the stale entry or recreate the missing decision file.",
      "3. Run `pa decision list` to see all known decision IDs, then re-run `pa check`.",
    ].join("\n"),
  },

  // ── Graph / parity ───────────────────────────────────────────────────────────

  MISSING_LANE_DIRECTORY: {
    description:
      "A milestone is missing one of its three required lane directories " +
      "(planned, discovered, backlog).",
    remediation: [
      "1. Create the missing directory under the canonical project-owned milestone tree: `roadmap/projects/<project>/phases/<phase>/milestones/<milestone>/tasks/<lane>/`.",
      "2. Add a `.gitkeep` file if your repository tracks empty directories through placeholders.",
      "3. Re-run `pa check` to confirm all three lanes are present.",
    ].join("\n"),
  },

  MISSING_GRAPH_ARTIFACT: {
    description:
      "A required graph artifact (`.arch/graph.json`, `.arch/nodes/tasks.json`, or " +
      "`.arch/edges/milestone_to_task.json`) is missing. Graph parity cannot be validated " +
      "without it.",
    remediation: [
      "Rebuild the graph artifacts with `pa graph build` (if available in your project), " +
        "or run the architecture build pipeline defined in your project's README. " +
        "Then re-run `pa check`.",
    ].join("\n"),
  },

  GRAPH_PARITY_MISMATCH: {
    description:
      "The generated graph artifacts are out of sync with the roadmap task files. " +
      "Counts, IDs, statuses, or milestone edges do not match.",
    remediation: [
      "1. Rebuild the graph: `pa graph build` (or equivalent).",
      "2. If you updated a task status, commit the graph rebuild outputs together with the " +
        "task file change.",
      "3. Re-run `pa check` to confirm parity.",
    ].join("\n"),
  },

  // ── Schema / config ──────────────────────────────────────────────────────────

  INVALID_CONCEPT_MAP_SCHEMA: {
    description: "`arch-model/concept-map.json` does not conform to the expected schema.",
    remediation: [
      "1. Run `pa help standards` to view the concept-map schema requirements.",
      "2. Open `arch-model/concept-map.json` and fix the offending fields.",
      "3. Re-run `pa check` to confirm validity.",
    ].join("\n"),
  },

  INVALID_RECONCILE_CONFIG_SCHEMA: {
    description:
      "The reconcile config file (`.project-arch/reconcile.config.json`) does not conform to " +
      "the expected schema.",
    remediation: [
      "1. Review the schema definition for reconcile-config.",
      "2. Fix the malformed fields in the reconcile config file.",
      "3. Re-run `pa check` to confirm validity.",
    ].join("\n"),
  },

  DUPLICATE_RECONCILIATION_OVERRIDE: {
    description:
      "Multiple local reconciliation artifacts exist for the same task in `.project-arch/reconcile/`, making current override state ambiguous.",
    remediation: [
      "1. Run `pa reconcile prune` to review stale files in dry-run mode.",
      "2. Run `pa reconcile prune --apply` to keep only the latest record per task.",
      "3. Optional: run `pa reconcile compact --apply` to archive older artifacts instead of deleting.",
      "4. Re-run `pa check` to confirm the diagnostic resolves.",
    ].join("\n"),
  },

  // ── Agent skills ────────────────────────────────────────────────────────────

  PAS_SKILL_DIRECTORY_ID_MISMATCH: {
    description:
      "An agent skill directory name does not match the manifest `id`, so the skill cannot be treated as a stable repo-native artifact.",
    remediation: [
      "1. Rename the skill directory so it exactly matches `skill.json.id`, or update `skill.json.id` to match the directory.",
      "2. Re-run `pa agents check` to confirm the invariant is restored.",
    ].join("\n"),
  },

  PAS_SKILL_DUPLICATE_SOURCE_ID: {
    description:
      "Two skills in the same source tree (`skills/` or `user-skills/`) share the same id.",
    remediation: [
      "1. Keep only one skill directory per id within each source tree.",
      "2. Rename or remove the duplicate directory.",
      "3. Re-run `pa agents list` or `pa agents check` to verify deterministic resolution.",
    ].join("\n"),
  },

  PAS_SKILL_INVALID_MANIFEST: {
    description: "A skill manifest exists but does not conform to the agent skill schema.",
    remediation: [
      "1. Open the reported `skill.json` file.",
      "2. Correct the invalid field value or missing required field.",
      "3. Compare against the skill contract documentation and re-run `pa agents check`.",
    ].join("\n"),
  },

  PAS_SKILL_MISSING_CHECKLIST_FILE: {
    description: "A skill manifest references a checklist markdown file that does not exist.",
    remediation: [
      "1. Create the missing checklist file in the skill directory, or update `files.checklist` to the correct relative path.",
      "2. Re-run `pa agents check` to verify the reference resolves.",
    ].join("\n"),
  },

  PAS_SKILL_MISSING_MANIFEST: {
    description:
      "A directory under the agent skills tree is missing its required `skill.json` manifest.",
    remediation: [
      "1. Add a valid `skill.json` manifest to the directory, or remove the incomplete directory.",
      "2. Re-run `pa agents check` to confirm the tree is valid.",
    ].join("\n"),
  },

  PAS_SKILL_MISSING_SYSTEM_FILE: {
    description: "A skill manifest references a system prompt markdown file that does not exist.",
    remediation: [
      "1. Create the missing system file in the skill directory, or update `files.system` to the correct relative path.",
      "2. Re-run `pa agents check` to verify the reference resolves.",
    ].join("\n"),
  },

  PAS_SKILL_OVERRIDE_REQUIRED: {
    description:
      "A user skill reuses a built-in skill id without explicitly opting into override semantics.",
    remediation: [
      "1. If the user skill is intended to replace the built-in, set `overrides: true` in `skill.json`.",
      "2. Otherwise, rename the user skill to a distinct id.",
      "3. Re-run `pa agents list` or `pa agents check` to confirm resolution succeeds.",
    ].join("\n"),
  },

  PAS_SKILL_SOURCE_MISMATCH: {
    description:
      "A skill manifest declares a source that does not match the tree it was loaded from.",
    remediation: [
      "1. Built-in skills under `skills/` must declare `source: builtin`.",
      "2. User skills under `user-skills/` must declare `source: user`.",
      "3. Move the directory or fix `skill.json.source`, then re-run `pa agents check`.",
    ].join("\n"),
  },

  PAS_SKILL_VALIDATION_ERROR: {
    description:
      "A generic agent-skill validation failure occurred without a more specific PAS skill code.",
    remediation: [
      "Review the full diagnostic message, fix the reported skill-tree problem, and re-run `pa agents check`.",
    ].join("\n"),
  },

  // ── Doctor health ───────────────────────────────────────────────────────────

  PAH001: {
    description: "A required repository root directory is missing.",
    remediation: [
      "Create the missing directory reported by `pa doctor health`.",
      "Run `pa doctor health --repair` to apply safe directory creation automatically.",
    ].join("\n"),
  },

  PAH015: {
    description:
      "The runtime profile config file (`.project-arch/runtime.config.json`) exists but does not satisfy the canonical runtime-profile schema.",
    remediation: [
      "Review the reported runtime profile config path and failing field.",
      "Fix contradictory or malformed runtime profile config values such as duplicate profile ids or an invalid defaultProfile reference.",
      "Re-run `pa doctor health` to confirm the runtime profile config validates cleanly.",
    ].join("\n"),
  },

  PAH002: {
    description: "`roadmap/manifest.json` is missing.",
    remediation: [
      "Restore or recreate roadmap/manifest.json using `pa init` or `pa doctor health --repair`.",
      "Re-run `pa doctor health` and `pa check` after restoration.",
    ].join("\n"),
  },

  PAH003: {
    description: "`roadmap/manifest.json` is present but contains invalid JSON.",
    remediation: [
      "Fix JSON syntax and required manifest shape in roadmap/manifest.json.",
      "Re-run `pa doctor health` to confirm parseability.",
    ].join("\n"),
  },

  PAH004: {
    description: "A phase directory is missing its `milestones` directory.",
    remediation: [
      "Create the missing milestones directory under the reported project-owned phase: `roadmap/projects/<project>/phases/<phase>/milestones/`.",
      "Use `pa doctor health --repair` for safe automatic directory creation.",
    ].join("\n"),
  },

  PAH005: {
    description: "A milestone directory is missing `manifest.json`.",
    remediation: [
      "Restore the milestone manifest under `roadmap/projects/<project>/phases/<phase>/milestones/<milestone>/manifest.json` or regenerate it using safe repair mode.",
      "Verify milestone metadata and rerun health checks.",
    ].join("\n"),
  },

  PAH006: {
    description: "A milestone is missing one or more task lane directories.",
    remediation: [
      "Ensure `tasks/planned`, `tasks/discovered`, and `tasks/backlog` all exist under the canonical project-owned milestone path.",
      "Run `pa doctor health --repair` to recreate missing lane directories.",
    ].join("\n"),
  },

  PAH007: {
    description: "A decision index file is missing.",
    remediation: [
      "Create the reported `decisions/index.json` file with schemaVersion 1.0 and an empty decisions array.",
      "Use `pa doctor health --repair` for safe index creation.",
    ].join("\n"),
  },

  PAH008: {
    description: "A decision index exists but does not match expected schema.",
    remediation: [
      "Fix the index file so `schemaVersion` is `1.0` and `decisions` is a string array.",
      "Re-run `pa doctor health` to confirm the index validates.",
    ].join("\n"),
  },

  PAH009: {
    description: "A required graph artifact is missing.",
    remediation: [
      "Regenerate graph artifacts by running `pa doctor health --repair` or your graph build workflow.",
      "Re-run `pa check` after regeneration.",
    ].join("\n"),
  },

  PAH010: {
    description: "A graph artifact exists but contains invalid JSON.",
    remediation: [
      "Regenerate graph artifacts to restore valid JSON content.",
      "Run `pa doctor health --repair` for safe automated regeneration.",
    ].join("\n"),
  },

  PAH011: {
    description: "A local doctor/check config file exists but contains invalid JSON.",
    remediation: [
      "Fix malformed JSON syntax in the reported local config file.",
      "Re-run `pa doctor health` to verify parseability.",
    ].join("\n"),
  },

  PAH012: {
    description: "A doctor health repair action failed during execution.",
    remediation: [
      "Review the repair failure detail and apply the suggested fix manually.",
      "Re-run `pa doctor health --repair` after resolving the underlying error.",
    ].join("\n"),
  },

  PAH013: {
    description:
      "A project directory under `roadmap/projects/` is missing its required `manifest.json` file.",
    remediation: [
      "1. Create `roadmap/projects/<project>/manifest.json` using the project manifest contract.",
      "2. Ensure the manifest includes `schemaVersion`, `id`, `title`, `type`, `summary`, and at least one `ownedPaths` entry.",
      "3. Re-run `pa doctor health` to confirm the project scope is structurally valid.",
    ].join("\n"),
  },

  PAH014: {
    description:
      "A project manifest exists under `roadmap/projects/<project>/manifest.json` but does not conform to the expected schema.",
    remediation: [
      "1. Open the reported project manifest file.",
      "2. Repair the JSON structure so it matches the project manifest contract.",
      "3. Re-run `pa doctor health` to confirm the project manifest validates cleanly.",
    ].join("\n"),
  },

  // ── Planning coverage ───────────────────────────────────────────────────────

  PAC_TARGET_UNCOVERED: {
    description:
      "A milestone target area declared in targets.md is not linked by any planned task.",
    remediation: [
      "1. Open the milestone `targets.md` file under `roadmap/projects/<project>/phases/<phase>/milestones/<milestone>/targets.md` and identify the uncovered target area.",
      "2. Add or update a planned task so codeTargets/publicDocs/traceLinks reference that area.",
      "3. Re-run `pa check` (or `pa check --coverage-mode error` in strict mode).",
    ].join("\n"),
  },

  PAC_TASK_MISSING_OBJECTIVE_TRACE: {
    description:
      "A planned task does not include traceLinks to phase or milestone objective artifacts.",
    remediation: [
      "1. Add at least one trace link to the task frontmatter pointing to phase overview, milestone overview, or milestone targets.",
      "2. Keep trace links workspace-relative for deterministic validation.",
      "3. Re-run `pa check` to confirm traceability completeness.",
    ].join("\n"),
  },

  // ── Validation contract ─────────────────────────────────────────────────────

  PAV_CONTRACT_MISSING: {
    description:
      "A phase is missing its `validation-contract.json` artifact. " +
      "This file specifies deterministic verification commands and expected outcomes for phase completion.",
    remediation: [
      "1. Create `roadmap/projects/<project>/phases/<phaseId>/validation-contract.json` with schema version 1.0.",
      "2. Define checks with required fields: id, objectiveRef, verifyCommand, expectedSignal, owner.",
      "3. Run `pa init phase <phaseId>` to scaffold a contract with default checks, or manually craft one.",
      "4. Re-run `pa check` to validate the contract schema.",
    ].join("\n"),
  },

  PAV_CONTRACT_INVALID_SCHEMA: {
    description:
      "A phase's `validation-contract.json` file exists but does not conform to the validation contract schema.",
    remediation: [
      "1. Review the reported error details—it describes the schema violation.",
      "2. Open `roadmap/projects/<project>/phases/<phaseId>/validation-contract.json`.",
      "3. Ensure all required fields are present: schemaVersion (1.0), phaseId, checks[], createdAt, updatedAt.",
      "4. For each check, verify: id, objectiveRef, verifyCommand, expectedSignal, owner (all required).",
      "5. Run `pa validate schema validation-contract <phaseId>` to check the file before re-running `pa check`.",
    ].join("\n"),
  },

  FRONTMATTER_MISSING: {
    description: "A task or decision markdown file is missing its opening YAML frontmatter block.",
    remediation: [
      "Add a frontmatter block delimited by `---` at the top of the file, then re-run `pa lint frontmatter`.",
    ].join("\n"),
  },

  TAB_INDENTATION: {
    description:
      "The YAML frontmatter of a task or decision file uses tab characters for indentation. " +
      "YAML requires spaces.",
    remediation: [
      "Run `pa lint frontmatter --fix` or `pa fix frontmatter --yes` to automatically replace tabs with spaces. " +
        "Then re-run `pa lint frontmatter` to confirm the issue is resolved.",
    ].join("\n"),
  },

  TRAILING_WHITESPACE: {
    description: "A frontmatter line contains trailing spaces or tabs.",
    remediation: [
      "Run `pa lint frontmatter --fix` or `pa fix frontmatter --yes` to remove trailing whitespace safely.",
    ].join("\n"),
  },

  MISSING_REQUIRED_KEY: {
    description: "A required frontmatter key is absent from a task or decision file.",
    remediation: [
      "1. Run `pa lint frontmatter` to see the exact file, line, and key name.",
      "2. Open the file and add the missing key with an appropriate value.",
      "3. Run `pa help standards` to view the required frontmatter fields for tasks and decisions.",
      "4. Re-run `pa lint frontmatter` to confirm the fix.",
    ].join("\n"),
  },

  SCALAR_SAFETY: {
    description:
      "A frontmatter value looks like a number or boolean but is not quoted. " +
      "This can cause YAML to parse it as the wrong type.",
    remediation: [
      'Wrap the value in double quotes. For example, change `id: 001` to `id: "001"`, or run `pa fix frontmatter --yes` to apply safe quoting automatically. ' +
        "Run `pa lint frontmatter` to see all affected values.",
    ].join("\n"),
  },

  YAML_PARSE_ERROR: {
    description: "The YAML frontmatter could not be parsed because its syntax is invalid.",
    remediation: [
      "Run `pa lint frontmatter` to see the exact file and line, then correct the YAML syntax and re-run the command.",
    ].join("\n"),
  },

  YAML_PARSE_WARNING: {
    description: "The YAML parser detected a suspicious but non-fatal issue in frontmatter.",
    remediation: [
      "Review the reported line, correct the YAML structure if needed, and re-run `pa lint frontmatter`.",
    ].join("\n"),
  },

  SCHEMA_TYPE: {
    description: "A frontmatter value does not match the expected schema type or format.",
    remediation: [
      "Run `pa explain SCHEMA_TYPE` and compare the offending field with the task or decision schema. Then update the value and re-run validation.",
    ].join("\n"),
  },

  KEY_TYPE: {
    description: "A frontmatter key is not a string (e.g., a numeric key like `123:`).",
    remediation: [
      "All YAML frontmatter keys must be strings. Edit the file and quote or rename the " +
        "non-string key.",
    ].join("\n"),
  },

  // ── Drift / untracked ────────────────────────────────────────────────────────

  UNTRACKED_IMPLEMENTATION: {
    description:
      "A source file exists in the workspace but is not referenced by any task's `codeTargets` " +
      "or any decision's `links.codeTargets`. The file is untracked from an architecture " +
      "traceability perspective.",
    remediation: [
      "1. Determine which task or decision is responsible for this file.",
      "2. Add the file path to the appropriate `codeTargets` array.",
      "3. If the file is intentionally excluded (generated code, tests, configuration), " +
        "add it to the drift check ignore list in your arch config.",
      "4. Re-run `pa check` to confirm the diagnostic resolves.",
    ].join("\n"),
  },

  // ── Miscellaneous ────────────────────────────────────────────────────────────

  OUTSTANDING_TOOLING_FEEDBACK: {
    description:
      "There are unreconciled tooling-feedback reports in `.project-arch/feedback/`. " +
      "These are outstanding issues or observations recorded about the toolchain itself.",
    remediation: [
      "1. Run `pa feedback list` (if available) to review outstanding reports.",
      "2. Reconcile or dismiss each report by updating its status to `reconciliation complete`.",
      "3. Re-run `pa check` to confirm the warning resolves.",
    ].join("\n"),
  },

  CHECK_ERROR: {
    description:
      "A generic architecture check error that does not have a specific diagnostic code.",
    remediation: [
      "Review the full error message for details. Run `pa check --json` for machine-readable " +
        "output that may include a `hint` field with additional guidance.",
    ].join("\n"),
  },

  CHECK_WARNING: {
    description: "A generic architecture check warning without a specific diagnostic code.",
    remediation: [
      "Review the warning message for details. Run `pa check --json` for structured output.",
    ].join("\n"),
  },
};

/** All codes that have entries in the explanations map, sorted alphabetically. */
export const KNOWN_DIAGNOSTIC_CODES: readonly string[] =
  Object.keys(DIAGNOSTIC_EXPLANATIONS).sort();

/**
 * Look up an explanation by code. The lookup is case-insensitive.
 * Returns `undefined` if no explanation is registered for the code.
 */
export function getDiagnosticExplanation(code: string): DiagnosticExplanation | undefined {
  return DIAGNOSTIC_EXPLANATIONS[code.toUpperCase()];
}
