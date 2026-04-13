import { z } from "zod";
import {
  agentContractSchemaVersionSchema,
  agentIsoDateTimeSchema,
  agentRepoPathSchema,
  agentRunIdSchema,
  agentTaskIdSchema,
} from "./agentContractCommon";

export const agentRuntimeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
export type AgentRuntimeId = z.infer<typeof agentRuntimeIdSchema>;

export const agentRuntimeAdapterOwnershipSchema = z.literal("adapter-managed");
export type AgentRuntimeAdapterOwnership = z.infer<typeof agentRuntimeAdapterOwnershipSchema>;

export const agentRuntimeAdapterRegistrationSchema = z.object({
  schemaVersion: agentContractSchemaVersionSchema,
  runtime: agentRuntimeIdSchema,
  displayName: z.string().min(1),
  launchContract: z.literal("agent-runtime-launch-v1"),
  ownership: agentRuntimeAdapterOwnershipSchema,
  description: z.string().min(1).optional(),
});
export type AgentRuntimeAdapterRegistration = z.infer<typeof agentRuntimeAdapterRegistrationSchema>;

export const agentRuntimeLaunchInputSchema = z.object({
  schemaVersion: agentContractSchemaVersionSchema,
  runtime: agentRuntimeIdSchema,
  runId: agentRunIdSchema,
  taskId: agentTaskIdSchema,
  contractPath: agentRepoPathSchema,
  promptPath: agentRepoPathSchema,
  allowedPaths: z.array(agentRepoPathSchema).min(1),
  requestedAt: agentIsoDateTimeSchema,
  lifecycleBoundary: z.literal("prepare-first"),
});
export type AgentRuntimeLaunchInput = z.infer<typeof agentRuntimeLaunchInputSchema>;

export const agentRuntimeLaunchStatusSchema = z.literal("launch-dispatched");
export type AgentRuntimeLaunchStatus = z.infer<typeof agentRuntimeLaunchStatusSchema>;

export const agentRuntimeLaunchResultSchema = z.object({
  schemaVersion: agentContractSchemaVersionSchema,
  runtime: agentRuntimeIdSchema,
  runId: agentRunIdSchema,
  taskId: agentTaskIdSchema,
  status: agentRuntimeLaunchStatusSchema,
  runHandle: z.string().min(1),
  launchedAt: agentIsoDateTimeSchema,
  lifecycleBoundary: z.literal("prepare-first"),
});
export type AgentRuntimeLaunchResult = z.infer<typeof agentRuntimeLaunchResultSchema>;

export const agentRuntimeLaunchRecordStatusSchema = z.enum(["launch-dispatched", "launch-failed"]);
export type AgentRuntimeLaunchRecordStatus = z.infer<typeof agentRuntimeLaunchRecordStatusSchema>;

export const agentRuntimeLaunchRecordSchema = z
  .object({
    schemaVersion: agentContractSchemaVersionSchema,
    runId: agentRunIdSchema,
    taskId: agentTaskIdSchema,
    runtime: agentRuntimeIdSchema,
    status: agentRuntimeLaunchRecordStatusSchema,
    contractPath: agentRepoPathSchema,
    promptPath: agentRepoPathSchema,
    allowedPaths: z.array(agentRepoPathSchema).min(1),
    requestedAt: agentIsoDateTimeSchema,
    lifecycleBoundary: z.literal("prepare-first"),
    runHandle: z.string().min(1).optional(),
    launchedAt: agentIsoDateTimeSchema.optional(),
    failedAt: agentIsoDateTimeSchema.optional(),
    error: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "launch-dispatched") {
      if (!value.runHandle) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "runHandle is required when status=launch-dispatched",
          path: ["runHandle"],
        });
      }

      if (!value.launchedAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "launchedAt is required when status=launch-dispatched",
          path: ["launchedAt"],
        });
      }
    }

    if (value.status === "launch-failed") {
      if (!value.failedAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "failedAt is required when status=launch-failed",
          path: ["failedAt"],
        });
      }

      if (!value.error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "error is required when status=launch-failed",
          path: ["error"],
        });
      }
    }
  });
export type AgentRuntimeLaunchRecord = z.infer<typeof agentRuntimeLaunchRecordSchema>;
