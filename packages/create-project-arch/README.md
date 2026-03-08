# create-project-arch

[![NPM Version](https://img.shields.io/npm/v/create-project-arch.svg)](https://www.npmjs.com/package/create-project-arch)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A scaffolding tool designed to bootstrap new projects with `project-arch` integrated natively. Create production-ready monorepos with architecture management built-in from day one.

## Features

🚀 **Quick Setup** - Get started with architecture-first development in minutes  
📦 **Modern Stack** - Next.js, React, TypeScript, and Turborepo  
🎨 **UI Templates** - Pre-built architecture visualization components  
🏗️ **Structured Architecture** - Phases, milestones, and tasks from the start  
📝 **ADR Support** - Architecture decision records included  
🔧 **Customizable** - Choose your package manager and template options

## Quick Start

Create a new project with npx (no installation required):

```bash
npx create-project-arch my-awesome-project
```

Or with pnpm:

```bash
pnpm create project-arch my-awesome-project
```

Or with yarn:

```bash
yarn create project-arch my-awesome-project
```

Then follow the interactive prompts to configure your project!

## Usage

```bash
create-project-arch <project-name> [options]
```

### Options

| Option              | Description                              | Default   |
| ------------------- | ---------------------------------------- | --------- |
| `--template <name>` | Template to use                          | `arch-ui` |
| `--pm <name>`       | Package manager (pnpm, npm, yarn)        | `pnpm`    |
| `--force`           | Allow scaffolding in non-empty directory | `false`   |

### Examples

Basic usage:

```bash
# Create with default options (pnpm, arch-ui template)
npx create-project-arch my-project

# Specify package manager
npx create-project-arch my-project --pm npm

# Use specific template
npx create-project-arch my-project --template ui-package

# Force creation in existing directory
npx create-project-arch my-project --force
```

## What Gets Created?

When you run `create-project-arch`, it:

1. **Creates a Turborepo monorepo** with modern tooling
2. **Initializes project-arch** with `arch-model/` directory
3. **Scaffolds template applications** based on your selection
4. **Configures package scripts** for architecture management
5. **Installs dependencies** using your chosen package manager

### Project Structure

```
my-awesome-project/
├── apps/
│   ├── arch/                    # Architecture UI (Next.js app)
│   │   ├── app/
│   │   │   ├── page.tsx        # Dashboard
│   │   │   ├── phases/         # Phase explorer
│   │   │   ├── milestones/     # Milestone viewer
│   │   │   ├── tasks/          # Task manager
│   │   │   └── decisions/      # ADR browser
│   │   └── components/
│   │       ├── PhaseCard.tsx
│   │       ├── TaskList.tsx
│   │       └── MilestoneTimeline.tsx
│   └── web/                     # Your main application
├── packages/
│   └── ui/                      # Shared UI components
│       ├── src/
│       │   ├── button.tsx
│       │   ├── card.tsx
│       │   └── ...
│       └── package.json
├── arch-model/                  # Architecture directory
│   ├── phases/
│   │   └── phase-1/
│   │       └── milestones/
│   ├── decisions/
│   └── docs/
├── package.json
├── turbo.json
└── pnpm-workspace.yaml
```

## Available Templates

### arch-ui (Default)

A complete Next.js application for visualizing and managing your project architecture.

**Includes:**

- 📊 Dashboard with project overview
- 📋 Phase and milestone explorer
- ✅ Task management interface
- 📝 ADR browser and editor
- 📈 Progress tracking and metrics
- 🎨 Beautiful UI with Tailwind CSS

**Perfect for:**

- Teams that want visual architecture management
- Projects with multiple phases and complex dependencies
- Organizations adopting architecture-first development

**Technologies:**

- Next.js 14+ (App Router)
- React 18+
- TypeScript
- Tailwind CSS
- project-arch SDK

### ui-package

A starter template for building a shared React component library.

**Includes:**

- 🎨 Basic UI components (Button, Card, Input, etc.)
- 📚 Component documentation structure
- 🔧 TypeScript configuration
- 📦 Optimized for publishing

**Perfect for:**

- Building design systems
- Creating shared component libraries
- Publishing npm packages

**Technologies:**

- React 18+
- TypeScript
- ESLint configuration

## Getting Started with Your New Project

After scaffolding completes:

### 1. Navigate to your project

```bash
cd my-awesome-project
```

### 2. Install dependencies (if not auto-installed)

```bash
pnpm install
```

### 3. Start the development server

```bash
# Start all apps
pnpm dev

# Or start specific app
pnpm dev --filter=arch
```

The architecture UI will be available at `http://localhost:3000`

### 4. Initialize your architecture

The project comes with a sample architecture, but you can customize it:

```bash
# Create a new phase
pnpm arch phase new phase-1

# Create a milestone
pnpm arch milestone new phase-1 milestone-1

# Create tasks
pnpm arch task new phase-1 milestone-1

# Document a decision
pnpm arch decision new use-react

# Run validations
pnpm arch check
```

### 5. View your architecture

Open the architecture UI at `http://localhost:3000` to see:

- Visual representation of phases and milestones
- Task progress and dependencies
- Architecture decision records
- Project metrics and reports

## Architecture Management Commands

Your scaffolded project includes these scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "arch": "pa",
    "arch:check": "pa check",
    "arch:report": "pa report",
    "arch:docs": "pa docs"
  }
}
```

### Available Commands

```bash
# Initialize architecture (already done during scaffolding)
pnpm arch init

# Create and manage phases
pnpm arch phase new <phase-id>
pnpm arch phase list

# Create and manage milestones
pnpm arch milestone new <phase> <milestone>
pnpm arch milestone list <phase>

# Create and manage tasks
pnpm arch task new <phase> <milestone>
pnpm arch task discover <phase> <milestone> --from <task-id>
pnpm arch task idea <phase> <milestone>
pnpm arch task lanes <phase> <milestone>

# Document decisions
pnpm arch decision new <decision-id>
pnpm arch decision list

# Validation and reporting
pnpm arch check
pnpm arch report
pnpm arch docs
```

## Developing Templates (For Contributors)

If you want to customize the templates or contribute new ones:

### 1. Initialize the Sandbox

```bash
pnpm run sandbox:init
```

This creates a `testProject/` directory with the scaffolded templates.

### 2. Start Development

```bash
pnpm run sandbox:dev
```

This starts the Next.js dev server for the arch-ui template at `http://localhost:4020`.

### 3. Make Changes

Edit files in `testProject/apps/arch/` and `testProject/packages/ui/`. Changes will hot-reload.

### 4. Sync Changes Back

When satisfied with your changes:

```bash
pnpm run sandbox:sync
```

This copies your changes back to the `templates/` directory so they're included in the next release.

### 5. Test Scaffolding

```bash
# Build the CLI
pnpm build

# Test scaffolding
node dist/cli.js test-output --force
```

## Template Structure

Templates are stored in `templates/` directory:

```
templates/
├── arch-ui/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── ...
│   └── components/
│       └── ...
└── ui-package/
    ├── package.json
    ├── tsconfig.json
    └── src/
        └── ...
```

### Creating a New Template

1. Create a new directory in `templates/`
2. Add all necessary files for the template
3. Use placeholders for project-specific values:
   - `{{PROJECT_NAME}}` - Replaced with the project name
   - `{{PACKAGE_MANAGER}}` - Replaced with pm choice
4. Update the CLI to recognize the new template
5. Add documentation

## Configuration

### Package Manager Detection

The tool automatically detects and uses the package manager you invoked it with:

```bash
npx create-project-arch my-app      # Uses npm
pnpm create project-arch my-app     # Uses pnpm
yarn create project-arch my-app     # Uses yarn
```

You can override with `--pm`:

```bash
npx create-project-arch my-app --pm pnpm
```

### Template Selection

Choose a template with `--template`:

```bash
npx create-project-arch my-app --template ui-package
```

## Troubleshooting

### Installation Fails

**Issue**: Dependencies fail to install

**Solution**:

```bash
# Clear cache and retry
pnpm store prune
pnpm install
```

### Port Already in Use

**Issue**: Dev server can't start (port 3000 in use)

**Solution**:

```bash
# Use a different port
PORT=3001 pnpm dev
```

### Template Not Found

**Issue**: `Template 'xyz' not found`

**Solution**: Check available templates:

```bash
npx create-project-arch --help
```

Valid templates: `arch-ui`, `ui-package`

### Force Flag Required

**Issue**: `Directory not empty`

**Solution**: Use `--force` flag to scaffold in existing directory:

```bash
npx create-project-arch my-app --force
```

**Warning**: This will overwrite existing files!

## Examples

### Create a Team Project

```bash
# Scaffold with architecture UI
npx create-project-arch team-project

# Navigate and start
cd team-project
pnpm install
pnpm dev

# Set up initial architecture
pnpm arch phase new foundation
pnpm arch milestone new foundation mvp
pnpm arch task new foundation mvp
```

### Create a Component Library

```bash
# Use ui-package template
npx create-project-arch my-ui-lib --template ui-package

cd my-ui-lib
pnpm install

# Build the library
pnpm build

# Develop with hot reload
pnpm dev
```

### Quick Prototype

```bash
# Use npm for simplicity
npx create-project-arch prototype --pm npm

cd prototype
npm install
npm run dev
```

## Migration from Existing Projects

To add project-arch to an existing project:

1. Install project-arch:

```bash
pnpm add project-arch -w
```

2. Initialize architecture:

```bash
pnpm exec pa init
```

3. (Optional) Copy template files manually from this repository

## API Reference (Programmatic Usage)

You can use create-project-arch programmatically:

```typescript
import { scaffold } from "create-project-arch";

await scaffold({
  projectName: "my-project",
  template: "arch-ui",
  packageManager: "pnpm",
  targetDir: "/path/to/project",
  force: false,
});
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

### Areas for Contribution

- 🎨 New templates
- 🐛 Bug fixes
- 📚 Documentation improvements
- ✨ Feature enhancements
- 🧪 Test coverage

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related Projects

- [project-arch](https://www.npmjs.com/package/project-arch) - Core CLI and SDK
- [Turborepo](https://turbo.build/) - High-performance build system
- [Next.js](https://nextjs.org/) - React framework

## Support

- 📖 [Documentation](https://github.com/project-arch/project-arch-system#readme)
- 🐛 [Issue Tracker](https://github.com/project-arch/project-arch-system/issues)
- 💬 [Discussions](https://github.com/project-arch/project-arch-system/discussions)

## Acknowledgments

Built with:

- [Commander.js](https://github.com/tj/commander.js) - CLI framework
- [fs-extra](https://github.com/jprichardson/node-fs-extra) - File system utilities
- [project-arch](https://github.com/project-arch/project-arch-system) - Architecture management

---

**Ready to build architecture-first?** 🚀

```bash
npx create-project-arch my-next-project
```
