# project-arch 2.2.0 Release Candidate Summary

## Suggested PR title

`release(project-arch): prepare 2.2.0`

## Suggested PR body

### Summary

This PR prepares `project-arch` `2.2.0` for publish.

The release centers on three themes:

- making `pa init --mono` the canonical scaffold experience
- aligning runtime/docs/validation with canonical `architecture/metadata/...` paths
- adding a guarded `pa roadmap cleanup legacy` workflow for legacy mirror cleanup

### What changed

#### Canonical mono scaffold and operator workflow

- made `mono` the default init template and added `pa init --mono` as the primary entrypoint
- scaffolded Taskfile-first root workflow surfaces, including `task check`, `task lint:md`, and thin `pnpm` wrappers
- added first-run no-test baseline behavior and operator guidance for fresh repos with no workspace packages yet
- added root scaffold support files such as `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, and a bootstrap root `README.md`

#### Canonical metadata path adoption

- moved canonical architecture metadata references to:
  - `architecture/metadata/codebase-map/`
  - `architecture/metadata/domains/`
  - `architecture/metadata/traceability/`
- updated validation, report generation, doctor health, graph SDK APIs, generated docs, and help text to prefer canonical paths while retaining legacy compatibility where supported
- switched CLI version reporting to package metadata lookup so release output stays aligned with `package.json`

#### Legacy roadmap cleanup workflow

- added `pa roadmap cleanup legacy` with dry-run preview and guarded apply modes
- added cleanup classification, preservation-record writing, runtime reconfirmation, and post-cleanup graph refresh behavior
- kept destructive cleanup behind explicit apply semantics and preservation gates

### Verification

- release notes prepared in `packages/project-arch/CHANGELOG.md`
- package version bumped to `2.2.0`
- targeted regression coverage added for init, cleanup, compatibility, and package metadata flows
- local release-prep validation still needs final run against the current worktree before publish

### Risk / reviewer focus

- initialized scaffold output changed materially; reviewers should inspect generated root files and first-run operator guidance carefully
- canonical metadata path migration touches validation/reporting/help/docs in several places; reviewers should watch for missed legacy references
- cleanup apply flow is intentionally safety-heavy; reviewers should focus on preservation record behavior and deletion refusal paths

### Publish notes

Expected local publish flow after merge/readiness:

```bash
pnpm --filter project-arch release:prepare
pnpm --filter project-arch publish --access public
```

If publishing from the repo root helper instead:

```bash
pnpm release:prepare
pnpm --filter project-arch publish --access public
```
