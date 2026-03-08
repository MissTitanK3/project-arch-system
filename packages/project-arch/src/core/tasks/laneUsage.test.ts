import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestProject, type TestProjectContext } from "../../test/helpers";
import { createPhase } from "../phases/createPhase";
import { createMilestone } from "../milestones/createMilestone";
import { createTask } from "./createTask";
import { getLaneUsage } from "./laneUsage";

describe("getLaneUsage", () => {
  let context: TestProjectContext;
  let tempDir: string;

  beforeEach(async () => {
    context = await createTestProject(process.cwd(), undefined, { setCwd: false });
    tempDir = context.tempDir;
    await createPhase("phase-2", tempDir);
    await createMilestone("phase-2", "milestone-1-foundation", tempDir);
  }, 60_000);

  afterEach(async () => {
    await context.cleanup();
  }, 60_000);

  it("returns default ranges and next IDs for an empty milestone", async () => {
    const usage = await getLaneUsage("phase-2", "milestone-1-foundation", tempDir);

    expect(usage).toHaveLength(3);

    const planned = usage.find((entry) => entry.lane === "planned");
    const discovered = usage.find((entry) => entry.lane === "discovered");
    const backlog = usage.find((entry) => entry.lane === "backlog");

    expect(planned?.range).toBe("001-099");
    expect(planned?.used).toBe(0);
    expect(planned?.nextAvailableId).toBe("001");

    expect(discovered?.range).toBe("101-199");
    expect(discovered?.used).toBe(0);
    expect(discovered?.nextAvailableId).toBe("101");

    expect(backlog?.range).toBe("901-999");
    expect(backlog?.used).toBe(0);
    expect(backlog?.nextAvailableId).toBe("901");
  });

  it("tracks used IDs and next available per lane", async () => {
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-1-foundation",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-1-foundation",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-1-foundation",
      lane: "discovered",
      discoveredFromTask: "001",
      cwd: tempDir,
    });
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-1-foundation",
      lane: "backlog",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const usage = await getLaneUsage("phase-2", "milestone-1-foundation", tempDir);
    const planned = usage.find((entry) => entry.lane === "planned");
    const discovered = usage.find((entry) => entry.lane === "discovered");
    const backlog = usage.find((entry) => entry.lane === "backlog");

    expect(planned?.usedIds).toEqual(["001", "002"]);
    expect(planned?.used).toBe(2);
    expect(planned?.nextAvailableId).toBe("003");

    expect(discovered?.usedIds).toEqual(["101"]);
    expect(discovered?.used).toBe(1);
    expect(discovered?.nextAvailableId).toBe("102");

    expect(backlog?.usedIds).toEqual(["901"]);
    expect(backlog?.used).toBe(1);
    expect(backlog?.nextAvailableId).toBe("902");
  });

  it("ignores tasks from other milestones/phases", async () => {
    await createMilestone("phase-2", "milestone-2-other", tempDir);
    await createTask({
      phaseId: "phase-2",
      milestoneId: "milestone-2-other",
      lane: "planned",
      discoveredFromTask: null,
      cwd: tempDir,
    });

    const usage = await getLaneUsage("phase-2", "milestone-1-foundation", tempDir);
    expect(usage.every((entry) => entry.used === 0)).toBe(true);
  });
});
