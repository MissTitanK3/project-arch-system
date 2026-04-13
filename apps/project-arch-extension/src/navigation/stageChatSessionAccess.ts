import {
  createStageChatSessionBoundary,
  type StageChatSessionBoundary,
} from "../integration/stageChatSessionBoundary";
import type { StageChatSessionStateStore } from "../integration/stageChatSessionStoreBoundary";

export interface StageChatSessionAccessContext {
  workspaceState: StageChatSessionStateStore;
}

export interface StageChatSessionAccessDependencies {
  boundary?: StageChatSessionBoundary;
}

export function resolveStageChatSessionBoundary(input: {
  context: StageChatSessionAccessContext;
  dependencies?: StageChatSessionAccessDependencies;
}): StageChatSessionBoundary {
  if (input.dependencies?.boundary) {
    return input.dependencies.boundary;
  }

  return createStageChatSessionBoundary({
    stateStore: input.context.workspaceState,
  });
}
