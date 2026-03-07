import fg from "fast-glob";

export async function readProject(cwd = process.cwd()): Promise<{ files: string[] }> {
  const files = await fg(["**/*", "!.git/**", "!node_modules/**", "!dist/**"], {
    cwd,
    onlyFiles: true,
    dot: true,
  });
  return { files: files.sort() };
}
