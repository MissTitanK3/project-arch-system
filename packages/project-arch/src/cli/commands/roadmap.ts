import { Command } from "commander";
import { runLegacyCleanupPreview } from "../../core/cleanup/legacyCleanupPreview";
import {
  canInitializeReconcileDir,
  writePreservationRecords,
  buildPreservationRecord,
} from "../../core/cleanup/preservationRecords";
import {
  reconfirmDeletionCandidates,
  executeDeletionCandidates,
} from "../../core/cleanup/applyLegacyCleanup";
import { rebuildArchitectureGraph } from "../../core/manifests";
import { formatEnhancedHelp } from "../help/format";

function printGroup(
  label: string,
  entries: Array<{
    relativePath: string;
    reason: string;
    counterpartPath?: string;
    bucket: string;
  }>,
): void {
  console.log(`${label}: ${entries.length}`);
  for (const entry of entries) {
    const counterpartSuffix = entry.counterpartPath ? ` -> ${entry.counterpartPath}` : "";
    console.log(`- ${entry.relativePath} [${entry.bucket}]${counterpartSuffix}`);
    console.log(`  reason: ${entry.reason}`);
  }
}

export function registerRoadmapCommand(program: Command): void {
  const roadmap = program
    .command("roadmap")
    .description("Roadmap maintenance and migration workflows");
  const cleanup = roadmap
    .command("cleanup")
    .description("Preview or apply roadmap cleanup workflows");

  cleanup
    .command("legacy")
    .description("Preview cleanup of legacy roadmap mirror artifacts")
    .option("--dry-run", "Preview cleanup without modifying files", false)
    .option("--apply", "Apply approved cleanup deletions")
    .addHelpText("after", () =>
      formatEnhancedHelp({
        usage: "pa roadmap cleanup legacy [--dry-run] [--apply]",
        description:
          "Preview legacy roadmap cleanup grouped by approved classification outcomes. Dry-run is the default posture; apply behavior is implemented separately.",
        options: [
          { flag: "--dry-run", description: "Preview cleanup without modifying files" },
          { flag: "--apply", description: "Reserved for destructive cleanup execution" },
        ],
        examples: [
          {
            description: "Preview cleanup impact",
            command: "pa roadmap cleanup legacy --dry-run",
          },
        ],
      }),
    )
    .action(async (options: { dryRun?: boolean; apply?: boolean }) => {
      const cwd = process.cwd();
      // Stage 1: Command Mode Resolution (already done via option detection)

      // Stage 2: Inventory and Classification Intake
      const result = await runLegacyCleanupPreview(cwd);

      // Stage 3: Pre-Execution Refusal Screening
      if (options.apply) {
        const canWrite = await canInitializeReconcileDir(cwd);
        if (!canWrite) {
          console.error(
            "ERROR: Cannot initialize preservation records directory .project-arch/reconcile/",
          );
          process.exit(1);
        }
      }

      console.log(`mode: ${result.mode}`);
      console.log(
        `runtime compatibility: ${result.compatibility.mode} (${result.compatibility.supported ? "supported" : "unsupported"})`,
      );
      console.log(`compatibility note: ${result.compatibility.reason}`);
      console.log(
        `canonical root present: ${result.compatibility.canonicalRootExists ? "yes" : "no"}`,
      );
      console.log(`legacy root present: ${result.compatibility.legacyRootExists ? "yes" : "no"}`);

      // Stage 4: Preservation and Manual-Review Record Preparation
      const preservationRecords = result.recordItems.map((item) => {
        const routingSource =
          item.bucket === "preserved.non-matching-paired"
            ? ("exact-mirror-non-matching" as const)
            : item.bucket === "preserved.has-content-legacy-only"
              ? ("empty-scaffold-has-content" as const)
              : item.bucket === "manual-review.pre-condition-failed"
                ? ("classification-pre-condition-failed" as const)
                : ("classification-conflict" as const);

        return buildPreservationRecord(item, routingSource, item.bucket);
      });

      // Stage 5: Preservation Gate Write
      if (options.apply) {
        console.log(`\nwriting ${preservationRecords.length} preservation records...`);
        const writeResult = await writePreservationRecords(preservationRecords, cwd);
        if (!writeResult.wrote) {
          console.error("ERROR: Failed to write preservation records. Refusing all deletions.");
          console.error(
            `Failed records: ${writeResult.failedRecords.map((r) => r.error).join("; ")}`,
          );
          process.exit(1);
        }
        console.log(`wrote ${writeResult.recordCount} records to ${writeResult.recordsPath}`);
      } else {
        console.log(
          `\n[dry-run] would write ${preservationRecords.length} preservation records to .project-arch/reconcile/`,
        );
      }

      if (options.apply) {
        // Stage 6: Runtime Re-Confirmation Of Deletion Candidates
        const reconfirmation = await reconfirmDeletionCandidates(
          cwd,
          result.exactMirrorRemovals,
          result.emptyScaffoldingRemovals,
        );

        const reroutedRecords = reconfirmation.reroutedManualReview.map((item) =>
          buildPreservationRecord(
            item,
            "classification-pre-condition-failed",
            "manual-review.pre-condition-failed",
          ),
        );

        if (reroutedRecords.length > 0) {
          const rerouteWriteResult = await writePreservationRecords(reroutedRecords, cwd);
          if (!rerouteWriteResult.wrote) {
            console.error(
              "ERROR: Failed to write runtime re-confirmation manual-review records. Refusing all deletions.",
            );
            process.exit(1);
          }
          console.log(
            `wrote ${rerouteWriteResult.recordCount} runtime re-confirmation records to ${rerouteWriteResult.recordsPath}`,
          );

          console.error(
            "ERROR: Runtime re-confirmation failed for one or more deletion candidates. Refusing all deletions.",
          );
          process.exit(1);
        }

        // Stage 7: Deletion Execution
        const deletionResult = await executeDeletionCandidates(reconfirmation.deletionQueue);

        console.log(`\napply deletion outcomes:`);
        console.log(`- deleted exact-mirror: ${deletionResult.deletedExactMirror.length}`);
        console.log(`- deleted empty-scaffold: ${deletionResult.deletedEmptyScaffold.length}`);
        console.log(`- skipped missing legacy: ${reconfirmation.skippedMissingLegacy.length}`);
        console.log(
          `- rerouted manual-review.pre-condition-failed: ${reconfirmation.reroutedManualReview.length}`,
        );

        if (deletionResult.failed.length > 0) {
          console.error(`- deletion failures: ${deletionResult.failed.length}`);
          for (const failure of deletionResult.failed) {
            console.error(`  ${failure.item.relativePath}: ${failure.error}`);
          }
          process.exit(1);
        }

        // Stage 8: Post-Cleanup Graph Refresh
        const deletedCount =
          deletionResult.deletedExactMirror.length + deletionResult.deletedEmptyScaffold.length;
        if (deletedCount > 0) {
          await rebuildArchitectureGraph(cwd);
          console.log(`\ngraph state refreshed after ${deletedCount} deletion(s)`);
        } else {
          console.log(`\nno deletions occurred; graph state unchanged`);
        }
      }

      printGroup("exact-mirror removals", result.exactMirrorRemovals);
      printGroup("empty-scaffolding removals", result.emptyScaffoldingRemovals);
      printGroup("preserved legacy content", result.preservedLegacyContent);
      printGroup("manual-review required", result.manualReviewRequired);
      console.log(`canonical-only artifacts: ${result.canonicalOnlyCount}`);
    });
}
