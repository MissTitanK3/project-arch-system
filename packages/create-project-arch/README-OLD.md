# create-project-arch

A scaffolding tool designed to bootstrap a new Turborepo monorepo with `project-arch` integrated natively.

## Usage

You can use `npx` or `pnpx` to run the scaffolder directly:

```bash
npx create-project-arch my-new-architecture
```

### Under the Hood

When executed, `create-project-arch`:

1. Runs `npx create-turbo` to generate the raw workspace.
2. Invokes `pa init` to seed an `arch-model/` directory.
3. Injects architecture applications (`apps/arch` and `packages/ui`) from internal templates.
4. Auto-wires the `package.json` configurations so `project-arch` commands are available out of the box.

## Options

```bash
create-project-arch <project-name> [options]

Options:
  --template <name>      template (default: "nextjs-turbo")
  --apps <items>         comma-separated apps (default: "web,docs")
  --pm <name>            package manager (default: "pnpm")
  --with-ai              create ai/indexing directory (default: false)
  --with-docs-site       create docs app (default: enabled)
  --force                allow scaffolding in a non-empty target directory
```

## Developing the Architecture UI (Arch-UI)

The `arch-ui` Next.js application and `@repo/ui` packages are stored as static templates inside `templates/`. To iterate on them with full IDE support and hot-reloading, use the Sandbox DX flow provided in the monorepo root:

1. **Initialize the Sandbox:**

   ```bash
   pnpm run sandbox:init
   ```

   _This scaffolds `testProject` and runs `pnpm install` inside it._

2. **Start the Dev Server:**

   ```bash
   pnpm run sandbox:dev
   ```

   _This boots up Next.js for the `arch-ui` inside the sandbox on port 4020._

3. **Develop & Iterate:**
   Open the files located in `testProject/apps/arch/` and `testProject/packages/ui/`. Your changes will hot-reload.

4. **Sync Changes Back:**
   When you are satisfied with your UI changes, sync them back to the static `templates/` directory so they are included in the next CLI release:
   ```bash
   pnpm run sandbox:sync
   ```
