import { describe, it, expect } from "vitest";
import * as sdk from "./index";

describe("sdk/index", () => {
  it("exports sdk domains and metadata", () => {
    expect(sdk.tasks).toBeDefined();
    expect(sdk.init).toBeDefined();
    expect(sdk.phases).toBeDefined();
    expect(sdk.milestones).toBeDefined();
    expect(sdk.decisions).toBeDefined();
    expect(sdk.graph).toBeDefined();
    expect(sdk.check).toBeDefined();
    expect(sdk.next).toBeDefined();
    expect(sdk.lint).toBeDefined();
    expect(sdk.report).toBeDefined();
    expect(sdk.policy).toBeDefined();
    expect(sdk.docs).toBeDefined();
    expect(sdk.agents).toBeDefined();
    expect(sdk.registry).toBeDefined();
    expect(sdk.commandMetadata).toBeDefined();
  });
});
