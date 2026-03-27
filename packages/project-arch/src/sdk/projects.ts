import { createProject } from "../core/projects/createProject";
import { ProjectManifest, projectTypeSchema } from "../schemas/project";
import { OperationResult } from "../types/result";
import { assertSafeId } from "../utils/safeId";
import { wrap } from "./_utils";

export async function projectCreate(input: {
  id: string;
  title?: string;
  type?: ProjectManifest["type"];
  summary?: string;
  ownedPaths?: string[];
  sharedDependencies?: string[];
  tags?: string[];
  cwd?: string;
}): Promise<
  OperationResult<{
    id: string;
    title: string;
    type: ProjectManifest["type"];
    ownedPaths: string[];
  }>
> {
  return wrap(async () => {
    assertSafeId(input.id, "projectId");
    if (input.type) {
      projectTypeSchema.parse(input.type);
    }
    const manifest = await createProject(input, input.cwd);
    return {
      id: manifest.id,
      title: manifest.title,
      type: manifest.type,
      ownedPaths: manifest.ownedPaths,
    };
  });
}
