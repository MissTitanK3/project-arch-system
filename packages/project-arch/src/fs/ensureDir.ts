import { ensureDir as ensureDirFs } from "../utils/fs";

export async function ensureDir(dirPath: string): Promise<void> {
  await ensureDirFs(dirPath);
}
