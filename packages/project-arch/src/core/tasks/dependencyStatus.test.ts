import { describe, expect, it } from "vitest";
import { getTaskIdentityFromTaskPath } from "./dependencyStatus";

describe("getTaskIdentityFromTaskPath", () => {
  it("parses canonical shared-project task paths", () => {
    const parsed = getTaskIdentityFromTaskPath(
      "/repo/roadmap/projects/shared/phases/phase-1/milestones/milestone-1-setup/tasks/planned/001-task.md",
      "/repo",
    );

    expect(parsed).toEqual({
      phaseId: "phase-1",
      milestoneId: "milestone-1-setup",
    });
  });

  it("retains legacy roadmap/phases compatibility", () => {
    const parsed = getTaskIdentityFromTaskPath(
      "/repo/roadmap/phases/phase-9/milestones/milestone-9-compat/tasks/discovered/101-task.md",
      "/repo",
    );

    expect(parsed).toEqual({
      phaseId: "phase-9",
      milestoneId: "milestone-9-compat",
    });
  });

  it("surfaces canonical-first guidance in invalid-path errors", () => {
    expect(() => getTaskIdentityFromTaskPath("/repo/roadmap/tasks/001-task.md", "/repo")).toThrow(
      "canonical roadmap/projects/<project>/phases",
    );
    expect(() => getTaskIdentityFromTaskPath("/repo/roadmap/tasks/001-task.md", "/repo")).toThrow(
      "legacy compatibility also accepts roadmap/phases",
    );
  });
});
