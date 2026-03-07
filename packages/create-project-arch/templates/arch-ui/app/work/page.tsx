"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Select } from "@repo/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GraphCanvas } from "../../components/graph-canvas";
import { GraphEdgeFilter } from "../../components/graph/graph-types";
import { useInspector } from "../../components/inspector-context";
import { WorkTable } from "../../components/work-table";
import { useWorkspace } from "../../components/workspace-context";
import { getGraphDataset, getPhases, getTasks } from "../../lib/api";
import { GraphDatasetResponse, GraphValidationData, TaskNode } from "../../lib/types";

const defaultFilters = ["domains", "modules", "tasks", "decisions"] as Array<
  "domains" | "modules" | "tasks" | "decisions"
>;

export default function WorkPage() {
  const [phases, setPhases] = useState<Array<{ id: string; active: boolean }>>([]);
  const [tasks, setTasks] = useState<TaskNode[]>([]);
  const [graphData, setGraphData] = useState<GraphDatasetResponse["dataset"] | null>(null);
  const [graphValidation, setGraphValidation] = useState<GraphValidationData | null>(null);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [phase, setPhase] = useState("all");
  const [query, setQuery] = useState("");
  const { setSelection } = useInspector();
  const { filters, setHopDepth } = useWorkspace();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    void Promise.allSettled([getPhases(), getTasks(), getGraphDataset()]).then((results) => {
      if (cancelled) return;

      const [phaseResult, taskResult, graphResult] = results;
      const errors: string[] = [];

      if (phaseResult.status === "fulfilled") {
        setPhases(phaseResult.value);
      } else {
        setPhases([]);
        errors.push(`Phases unavailable: ${phaseResult.reason instanceof Error ? phaseResult.reason.message : "Unknown error"}`);
      }

      if (taskResult.status === "fulfilled") {
        setTasks(taskResult.value.tasks);
      } else {
        setTasks([]);
        errors.push(`Tasks unavailable: ${taskResult.reason instanceof Error ? taskResult.reason.message : "Unknown error"}`);
      }

      if (graphResult.status === "fulfilled") {
        setGraphData(graphResult.value.dataset);
        setGraphValidation(graphResult.value.validation);
        if (!graphResult.value.validation.valid) {
          errors.push(
            ...graphResult.value.validation.errors.map((issue) => `Graph schema error: ${issue.message}`),
          );
        }
      } else {
        setGraphData(null);
        setGraphValidation(null);
        errors.push(
          `Graph unavailable: ${
            graphResult.reason instanceof Error ? graphResult.reason.message : "Unknown error"
          }`,
        );
      }

      setLoadErrors(errors);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const viewParam = searchParams.get("view");
  const view = viewParam === "project" ? "project" : viewParam === "architecture" ? "architecture" : "tasks";

  const milestones = useMemo(() => {
    const milestoneSet = new Set<string>();
    for (const task of tasks) {
      if (phase !== "all" && !task.milestone.startsWith(`${phase}/`)) continue;
      milestoneSet.add(task.milestone);
    }
    return [...milestoneSet];
  }, [tasks, phase]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const inPhase = phase === "all" || task.milestone.startsWith(`${phase}/`);
      if (!inPhase) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return task.id.toLowerCase().includes(q) || task.title.toLowerCase().includes(q);
    });
  }, [phase, query, tasks]);

  const activeFilters = useMemo(
    () => defaultFilters.filter((filter) => filters.nodeTypes[filter]),
    [filters.nodeTypes],
  );
  const activeEdgeFilters = useMemo(
    () =>
      (Object.entries(filters.edgeTypes) as Array<[keyof typeof filters.edgeTypes, boolean]>)
        .filter(([, enabled]) => enabled)
        .map(([filter]) => filter as GraphEdgeFilter),
    [filters.edgeTypes],
  );
  const activeAuthorityFilters = useMemo(
    () =>
      (Object.entries(filters.authorityTypes) as Array<
        [keyof typeof filters.authorityTypes, boolean]
      >)
        .filter(([, enabled]) => enabled)
        .map(([filter]) => filter),
    [filters.authorityTypes],
  );

  return (
    <div className="grid gap-3">
      {loadErrors.length > 0 ? (
        <div className="rounded-xl border border-amber-700 bg-amber-950/60 p-3 text-sm text-amber-200">
          {loadErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Work Views</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs>
            <TabsList>
              <TabsTrigger
                className={view === "architecture" ? "border border-blue-700 bg-slate-800 text-slate-100" : ""}
                onClick={() => router.push("/work?view=architecture")}
              >
                Architecture
              </TabsTrigger>
              <TabsTrigger
                className={view === "tasks" ? "border border-blue-700 bg-slate-800 text-slate-100" : ""}
                onClick={() => router.push("/work?view=tasks")}
              >
                Tasks
              </TabsTrigger>
              <TabsTrigger
                className={view === "project" ? "border border-blue-700 bg-slate-800 text-slate-100" : ""}
                onClick={() => router.push("/work?view=project")}
              >
                Project
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {graphValidation && graphValidation.errors.length > 0 ? (
        <div className="rounded-xl border border-red-700 bg-red-950/60 p-3 text-sm text-red-200">
          <p className="font-medium">Graph activation blocked by schema validation errors.</p>
          {graphValidation.errors.map((issue, index) => (
            <p key={`${issue.ruleId}:${index}`}>[{issue.ruleId}] {issue.message}</p>
          ))}
        </div>
      ) : graphData ? (
        <GraphCanvas
          data={graphData}
          viewMode={view === "project" ? "project" : view === "architecture" ? "architecture-map" : "tasks"}
          enabledFilters={activeFilters}
          enabledEdgeFilters={activeEdgeFilters}
          enabledAuthorityFilters={activeAuthorityFilters}
          hopDepth={filters.hopDepth}
          onHopDepthChange={setHopDepth}
          showExternalDependencies={filters.showExternalDependencies}
          hideCompletedTasks={filters.hideCompletedTasks}
          onNodeSelect={(node) =>
            setSelection({
              type: node.type as "domain" | "decision" | "phase" | "milestone" | "task" | "file" | "health",
              title: node.title,
              id: node.id,
              metadata: node.metadata,
              markdown: node.markdown,
            })
          }
        />
      ) : (
        <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
          Loading graph...
        </div>
      )}
      {graphValidation && graphValidation.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-700 bg-amber-950/60 p-3 text-sm text-amber-200">
          <p className="font-medium">Graph warnings</p>
          {graphValidation.warnings.map((issue, index) => (
            <p key={`${issue.ruleId}:${index}`}>[{issue.ruleId}] {issue.message}</p>
          ))}
        </div>
      ) : null}

      {view !== "architecture" ? (
      <Card>
        <CardHeader>
          <CardTitle>Roadmap Work</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Select value={phase} onChange={(event) => setPhase(event.target.value)}>
              <option value="all">All phases</option>
              {phases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} {item.active ? "(active)" : ""}
                </option>
              ))}
            </Select>
            <Input
              placeholder="Search task..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="grid gap-1 text-slate-400">
            {milestones.map((milestone) => (
              <span key={milestone}>{milestone}</span>
            ))}
          </div>
        </CardContent>
      </Card>
      ) : null}

      {view !== "architecture" ? (
      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkTable
            tasks={filteredTasks}
            onSelectTask={(task) =>
              setSelection({
                type: "task",
                title: task.title,
                id: task.id,
                metadata: [
                  { label: "Phase", value: task.milestone.split("/")[0] ?? "unknown" },
                  { label: "Milestone", value: task.milestone },
                  { label: "Status", value: task.lane },
                  { label: "Domain", value: task.domain ?? "foundation" },
                ],
              })
            }
          />
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
