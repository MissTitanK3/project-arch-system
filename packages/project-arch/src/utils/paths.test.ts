import { describe, it, expect } from "vitest";
import path from "path";
import {
  repoRoot,
  projectDocsRoot,
  phasesRoot,
  decisionsRoot,
  phaseDir,
  phaseMilestonesDir,
  milestoneDir,
  milestoneTasksRoot,
  milestoneTaskLaneDir,
  milestoneDecisionsRoot,
  phaseDecisionsRoot,
} from "./paths";

describe("utils/paths", () => {
  const cwd = "/tmp/project-arch";

  it("should resolve root and roadmap paths", () => {
    expect(repoRoot(cwd)).toBe(cwd);
    expect(projectDocsRoot(cwd)).toBe(path.join(cwd, "roadmap"));
    expect(phasesRoot(cwd)).toBe(path.join(cwd, "roadmap", "phases"));
    expect(decisionsRoot(cwd)).toBe(path.join(cwd, "roadmap", "decisions"));
  });

  it("should resolve phase and milestone paths", () => {
    expect(phaseDir("phase-1", cwd)).toBe(path.join(cwd, "roadmap", "phases", "phase-1"));
    expect(phaseMilestonesDir("phase-1", cwd)).toBe(
      path.join(cwd, "roadmap", "phases", "phase-1", "milestones"),
    );
    expect(milestoneDir("phase-1", "m1", cwd)).toBe(
      path.join(cwd, "roadmap", "phases", "phase-1", "milestones", "m1"),
    );
  });

  it("should resolve task and decision directories for milestones/phases", () => {
    expect(milestoneTasksRoot("phase-1", "m1", cwd)).toBe(
      path.join(cwd, "roadmap", "phases", "phase-1", "milestones", "m1", "tasks"),
    );
    expect(milestoneTaskLaneDir("phase-1", "m1", "planned", cwd)).toBe(
      path.join(cwd, "roadmap", "phases", "phase-1", "milestones", "m1", "tasks", "planned"),
    );
    expect(milestoneTaskLaneDir("phase-1", "m1", "discovered", cwd)).toBe(
      path.join(cwd, "roadmap", "phases", "phase-1", "milestones", "m1", "tasks", "discovered"),
    );
    expect(milestoneTaskLaneDir("phase-1", "m1", "backlog", cwd)).toBe(
      path.join(cwd, "roadmap", "phases", "phase-1", "milestones", "m1", "tasks", "backlog"),
    );
    expect(milestoneDecisionsRoot("phase-1", "m1", cwd)).toBe(
      path.join(cwd, "roadmap", "phases", "phase-1", "milestones", "m1", "decisions"),
    );
    expect(phaseDecisionsRoot("phase-1", cwd)).toBe(
      path.join(cwd, "roadmap", "phases", "phase-1", "decisions"),
    );
  });

  it("should default to process.cwd when cwd is omitted", () => {
    const expected = process.cwd();
    expect(repoRoot()).toBe(expected);
    expect(projectDocsRoot()).toBe(path.join(expected, "roadmap"));
  });
});
