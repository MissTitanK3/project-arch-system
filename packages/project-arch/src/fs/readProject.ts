import fg from "fast-glob";
import { filterGlobPathsBySymlinkPolicy } from "../utils/symlinkPolicy";

export async function readProject(cwd = process.cwd()): Promise<{ files: string[] }> {
  const files = await fg(["**/*", "!.git/**", "!node_modules/**", "!dist/**"], {
    cwd,
    onlyFiles: true,
    dot: true,
    followSymbolicLinks: false,
  });
  const safeFiles = await filterGlobPathsBySymlinkPolicy(files, cwd);
  return { files: safeFiles.sort() };
}
