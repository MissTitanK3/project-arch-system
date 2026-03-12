const npmPackageNamePattern = /^[a-z0-9-~][a-z0-9-._~]*$/;
const npmReservedNames = new Set(["node_modules", "favicon.ico"]);

function toNpmNameSuggestion(projectName: string): string {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-");
}

export function validateProjectName(projectName: string): void {
  if (!/^[a-zA-Z0-9-_]+$/.test(projectName)) {
    throw new Error(
      "Invalid project name. Only alphanumeric characters, dashes, and underscores are allowed.",
    );
  }

  if (projectName !== projectName.toLowerCase()) {
    throw new Error(
      `Invalid project name '${projectName}'. Use lowercase to produce a valid npm package name (for example: '${toNpmNameSuggestion(projectName)}').`,
    );
  }

  if (projectName.length > 214) {
    throw new Error("Invalid project name. npm package names must be 214 characters or fewer.");
  }

  if (!npmPackageNamePattern.test(projectName) || npmReservedNames.has(projectName)) {
    throw new Error(`Invalid project name '${projectName}'. It must be a valid npm package name.`);
  }
}
