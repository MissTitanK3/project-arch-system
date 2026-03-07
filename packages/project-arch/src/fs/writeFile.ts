import fs from "fs-extra";
import path from "path";

export async function writeFile(targetPath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, content, "utf8");
}
