# Domain Specifications

<!-- Guidance: Define domain boundaries first, then map implementation surfaces and ownership. -->

This directory contains domain ownership artifacts for architecture-first planning.

## What To Maintain

- `domains.json` - machine-readable domain registry
- `DOMAIN_TEMPLATE.md` - template for new domains
- `core.md`, `ui.md`, `api.md` - starter domain examples

## Workflow

1. Update `domains.json` when adding/removing a domain.
2. Create or update a corresponding `<domain>.md` file.
3. Keep ownership and interface contracts aligned with `arch-model/modules.json`.
4. Reference milestone rollout in each domain spec.
