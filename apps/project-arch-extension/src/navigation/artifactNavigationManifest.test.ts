import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type ExtensionManifest = {
  contributes?: {
    commands?: Array<{ command?: string }>;
    views?: Record<string, Array<{ id?: string; type?: string }>>;
    menus?: {
      "view/title"?: Array<{ command?: string; when?: string }>;
    };
  };
};

async function readManifest(): Promise<ExtensionManifest> {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const content = await fs.readFile(packageJsonPath, "utf8");
  return JSON.parse(content) as ExtensionManifest;
}

describe("artifact navigation manifest contributions", () => {
  it("contributes baseline and experimental artifact browser views", async () => {
    const manifest = await readManifest();
    const projectArchViews = manifest.contributes?.views?.["projectArch"] ?? [];

    const baselineView = projectArchViews.find((view) => view.id === "projectArch.artifacts");
    const experimentalView = projectArchViews.find(
      (view) => view.id === "projectArch.artifacts.experimental",
    );

    expect(baselineView?.type).toBe("webview");
    expect(experimentalView?.type).toBe("webview");
  });

  it("retires standalone operational views as shell consolidation progresses", async () => {
    const manifest = await readManifest();
    const projectArchViews = manifest.contributes?.views?.["projectArch"] ?? [];

    expect(projectArchViews.some((view) => view.id === "projectArch.commandCatalog")).toBe(false);
    expect(projectArchViews.some((view) => view.id === "projectArch.runs")).toBe(false);
    expect(projectArchViews.some((view) => view.id === "projectArch.lifecycle")).toBe(false);
    expect(projectArchViews.some((view) => view.id === "projectArch.runtimes")).toBe(false);
  });

  it("contributes refresh commands and title-menu entries for both surfaces", async () => {
    const manifest = await readManifest();
    const commands = manifest.contributes?.commands ?? [];
    const viewTitleMenus = manifest.contributes?.menus?.["view/title"] ?? [];

    expect(
      commands.some((command) => command.command === "projectArch.refreshArtifactNavigation"),
    ).toBe(true);
    expect(
      commands.some(
        (command) => command.command === "projectArch.refreshArtifactNavigationExperimental",
      ),
    ).toBe(true);

    expect(
      viewTitleMenus.some(
        (menu) =>
          menu.command === "projectArch.refreshArtifactNavigation" &&
          menu.when === "view == projectArch.artifacts",
      ),
    ).toBe(true);
    expect(
      viewTitleMenus.some(
        (menu) =>
          menu.command === "projectArch.refreshArtifactNavigationExperimental" &&
          menu.when === "view == projectArch.artifacts.experimental",
      ),
    ).toBe(true);
  });
});
