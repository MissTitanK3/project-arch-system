import { cp, access, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const testProjectDir = path.join(rootDir, "testProject");
const templatesDir = path.join(rootDir, "packages", "create-project-arch", "templates");

const appsArchDir = path.join(testProjectDir, "apps", "arch");
const packagesUiDir = path.join(testProjectDir, "packages", "ui");

const archTemplateDir = path.join(templatesDir, "arch-ui");
const uiTemplateDir = path.join(templatesDir, "ui-package");

async function exists(f) {
    try {
        await access(f);
        return true;
    } catch {
        return false;
    }
}

async function syncDir(source, destination) {
    if (!(await exists(source))) {
        console.error(`Source directory not found: ${source}`);
        return;
    }

    console.log(`Syncing ${source} -> ${destination}`);

    await cp(source, destination, {
        recursive: true,
        force: true,
        filter: (src) => {
            const relativePath = path.relative(source, src);
            // Ignore common build artifacts and dependencies
            return !relativePath.includes("node_modules") &&
                !relativePath.includes(".next") &&
                !relativePath.includes(".turbo") &&
                !relativePath.startsWith("dist");
        }
    });
}

async function main() {
    console.log("Starting Sandbox UI Sync...");

    await syncDir(appsArchDir, archTemplateDir);
    await syncDir(packagesUiDir, uiTemplateDir);

    console.log("Sync complete! Your changes in testProject are now saved to the create-project-arch templates.");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
