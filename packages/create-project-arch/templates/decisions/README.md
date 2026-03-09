# Decision Records

<!-- Guidance: Use decision records for meaningful architecture choices and tradeoffs. -->

## Workflow

1. Copy `DECISION_TEMPLATE.md` for each significant decision.
2. Set frontmatter (`id`, `title`, `slug`, `status`, timestamps, links).
3. Fill Context, Decision, Rationale, Alternatives, and Affected Artifacts.
4. Track implementation progress with the checklist.

## Decision Locations

- `architecture/decisions/` for architecture-level decision records.
- `roadmap/decisions/` and milestone decision indexes can reference decision IDs for execution traceability.

## CLI Support

Use `pa decision new` to create operational decision records linked into roadmap indexes.
