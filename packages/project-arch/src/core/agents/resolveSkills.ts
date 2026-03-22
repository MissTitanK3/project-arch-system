import { LoadedSkill } from "./loadSkills";

export interface ResolvedSkill {
  id: string;
  source: "builtin" | "user";
  overridden: boolean;
  value: LoadedSkill;
}

export interface ResolveSkillsInput {
  builtin: LoadedSkill[];
  user: LoadedSkill[];
}

export class SkillResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillResolutionError";
  }
}

function assertUniqueWithinSource(skills: LoadedSkill[], source: "builtin" | "user"): void {
  const seen = new Set<string>();
  for (const skill of skills) {
    const id = skill.manifest.id;
    if (seen.has(id)) {
      throw new SkillResolutionError(`Duplicate ${source} skill id: ${id}`);
    }
    seen.add(id);
  }
}

export function resolveSkills(input: ResolveSkillsInput): ResolvedSkill[] {
  const builtin = [...input.builtin].sort((left, right) =>
    left.manifest.id.localeCompare(right.manifest.id),
  );
  const user = [...input.user].sort((left, right) =>
    left.manifest.id.localeCompare(right.manifest.id),
  );

  assertUniqueWithinSource(builtin, "builtin");
  assertUniqueWithinSource(user, "user");

  const resolved = new Map<string, ResolvedSkill>();

  for (const skill of builtin) {
    resolved.set(skill.manifest.id, {
      id: skill.manifest.id,
      source: "builtin",
      overridden: false,
      value: skill,
    });
  }

  for (const skill of user) {
    const id = skill.manifest.id;
    const existing = resolved.get(id);

    if (!existing) {
      resolved.set(id, {
        id,
        source: "user",
        overridden: false,
        value: skill,
      });
      continue;
    }

    if (!skill.manifest.overrides) {
      throw new SkillResolutionError(
        `Duplicate skill id without explicit override: ${id}. Set overrides=true in user skill manifest to override builtin skill.`,
      );
    }

    resolved.set(id, {
      id,
      source: "user",
      overridden: true,
      value: skill,
    });
  }

  return [...resolved.values()].sort((left, right) => left.id.localeCompare(right.id));
}
