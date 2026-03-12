import { describe, expect, it } from "vitest";
import { validateProjectName } from "./projectNameValidation";

describe("validateProjectName", () => {
  it("accepts valid lowercase project names", () => {
    expect(() => validateProjectName("project-arch")).not.toThrow();
    expect(() => validateProjectName("project_arch_2")).not.toThrow();
  });

  it("rejects uppercase names with actionable guidance", () => {
    expect(() => validateProjectName("testProject")).toThrow(
      "Use lowercase to produce a valid npm package name",
    );
  });

  it("rejects invalid characters", () => {
    expect(() => validateProjectName("my project")).toThrow(
      "Only alphanumeric characters, dashes, and underscores are allowed.",
    );
  });

  it("rejects npm reserved names", () => {
    expect(() => validateProjectName("node_modules")).toThrow(
      "It must be a valid npm package name.",
    );
  });
});
