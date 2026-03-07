import { describe, it, expect } from "vitest";
import * as sdk from "./index";

describe("project-arch SDK", () => {
  it("exports main domains", () => {
    expect(sdk.tasks).toBeDefined();
    expect(sdk.init).toBeDefined();
    expect(sdk.phases).toBeDefined();
    expect(sdk.milestones).toBeDefined();
    expect(sdk.decisions).toBeDefined();
    expect(sdk.graph).toBeDefined();
    expect(sdk.check).toBeDefined();
    expect(sdk.report).toBeDefined();
    expect(sdk.docs).toBeDefined();
    expect(sdk.registry).toBeDefined();
    expect(sdk.commandMetadata).toBeDefined();
  });
});
