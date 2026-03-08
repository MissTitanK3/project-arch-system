# Quick Publishing Guide

## Pre-flight Checklist

- [x] LICENSE files added (MIT)
- [x] CHANGELOG.md created for both packages
- [x] README.md comprehensive (15KB and 12KB)
- [x] package.json metadata complete
- [x] Examples created (4 for project-arch)
- [x] CONTRIBUTING.md added
- [x] Builds successful
- [x] npm pack validated

## Publishing Commands

### Step 1: Login to npm

```bash
npm login
# Follow prompts to authenticate
```

### Step 2: Publish project-arch (Core Package)

```bash
cd packages/project-arch

# Final build
pnpm build

# Dry run to verify
npm publish --dry-run

# Publish (when ready)
npm publish --access public

# Verify publication
npm view project-arch
```

### Step 3: Publish create-project-arch (Scaffolder)

```bash
cd ../create-project-arch

# Final build
pnpm build

# Dry run to verify
npm publish --dry-run

# Publish (when ready)
npm publish --access public

# Verify publication
npm view create-project-arch
```

### Step 4: Test Installation

```bash
# Test project-arch
npm install -g project-arch
pa --version
pa --help

# Test create-project-arch
npx create-project-arch test-install --force
```

### Step 5: Create GitHub Releases

```bash
# Tag the release
git tag v1.1.0
git push origin v1.1.0

# Create release on GitHub with:
# - Version: v1.1.0
# - Title: "v1.1.0 - NPM Publication Ready"
# - Body: Copy from CHANGELOG.md
```

## Post-Publication

1. **Add badges to workspace README:**

   ```markdown
   [![project-arch](https://img.shields.io/npm/v/project-arch.svg)](https://www.npmjs.com/package/project-arch)
   [![create-project-arch](https://img.shields.io/npm/v/create-project-arch.svg)](https://www.npmjs.com/package/create-project-arch)
   [![Downloads](https://img.shields.io/npm/dm/project-arch.svg)](https://www.npmjs.com/package/project-arch)
   ```

2. **Update workspace README with install instructions:**

   ```markdown
   ## Installation

   \`\`\`bash
   npm install -g project-arch
   \`\`\`

   ## Quick Start

   \`\`\`bash
   npx create-project-arch my-project
   \`\`\`
   ```

3. **Announce:**
   - Twitter/X
   - Reddit (r/typescript, r/javascript, r/programming)
   - Dev.to article
   - Hacker News
   - Product Hunt

4. **Monitor:**
   - npm package pages
   - GitHub issues
   - Download stats
   - User feedback

## Troubleshooting

### "You do not have permission to publish"

```bash
# Check you're logged in
npm whoami

# Check org permissions
npm org ls project-arch

# Or use your personal scope
npm publish --access public
```

### "Package already exists"

```bash
# Bump version first
npm version patch  # or minor, or major
git push && git push --tags
```

### "CLI not executable"

Ensure dist/cli.js has shebang:

```javascript
#!/usr/bin/env node
```

## Package URLs

After publication:

- **project-arch:** <https://www.npmjs.com/package/project-arch>
- **create-project-arch:** <https://www.npmjs.com/package/create-project-arch>
- **GitHub:** <https://github.com/project-arch/project-arch-system>

## Quick Stats

| Package             | Version | Size  | Files |
| ------------------- | ------- | ----- | ----- |
| project-arch        | 1.1.0   | 149KB | 296   |
| create-project-arch | 1.1.0   | 58KB  | 92    |
