"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { GraphViewMode } from "../lib/graph-schema";

export type WorkspaceView = "architecture-map" | "decisions" | "tasks-roadmap" | "project-map";
export type GraphNodeFilter = "domains" | "modules" | "tasks" | "decisions";
export type GraphEdgeFilter = "dependency" | "data-flow" | "blocking";
export type GraphAuthorityFilter = "authoritative" | "manual" | "inferred";

type WorkspaceFilters = {
  nodeTypes: Record<GraphNodeFilter, boolean>;
  edgeTypes: Record<GraphEdgeFilter, boolean>;
  authorityTypes: Record<GraphAuthorityFilter, boolean>;
  hideCompletedTasks: boolean;
  showExternalDependencies: boolean;
  hopDepth: number;
};

type WorkspacePersistedState = {
  splitPane: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  leftWidth: number;
  rightWidth: number;
  filtersByView: Record<GraphViewMode, WorkspaceFilters>;
};

type WorkspaceContextValue = {
  splitPane: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  leftWidth: number;
  rightWidth: number;
  filters: WorkspaceFilters;
  setSplitPane: (next: boolean) => void;
  setLeftCollapsed: (next: boolean) => void;
  setRightCollapsed: (next: boolean) => void;
  setLeftWidth: (next: number) => void;
  setRightWidth: (next: number) => void;
  toggleNodeType: (filter: GraphNodeFilter) => void;
  toggleEdgeType: (filter: GraphEdgeFilter) => void;
  toggleAuthorityType: (filter: GraphAuthorityFilter) => void;
  setHideCompletedTasks: (next: boolean) => void;
  setShowExternalDependencies: (next: boolean) => void;
  setHopDepth: (next: number) => void;
  resetLayout: () => void;
};

const DEFAULT_LEFT_WIDTH = 280;
const DEFAULT_RIGHT_WIDTH = 420;
const STORAGE_KEY = "arch:workspace:v1";

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function defaultFilters(): WorkspaceFilters {
  return {
    nodeTypes: {
      domains: true,
      modules: true,
      tasks: true,
      decisions: true,
    },
    edgeTypes: {
      dependency: true,
      "data-flow": true,
      blocking: true,
    },
    authorityTypes: {
      authoritative: true,
      manual: true,
      inferred: true,
    },
    hideCompletedTasks: false,
    showExternalDependencies: false,
    hopDepth: 1,
  };
}

function resolveActiveGraphView(pathname: string, searchParams: URLSearchParams): GraphViewMode {
  if (pathname === "/work" && searchParams.get("view") === "project") return "project";
  if (pathname === "/work" && searchParams.get("view") === "architecture") return "architecture-map";
  if (pathname === "/work") return "tasks";
  return "architecture-map";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeGraphView = useMemo(
    () => resolveActiveGraphView(pathname, searchParams),
    [pathname, searchParams],
  );
  const [splitPane, setSplitPane] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [filtersByView, setFiltersByView] = useState<Record<GraphViewMode, WorkspaceFilters>>({
    "architecture-map": defaultFilters(),
    tasks: defaultFilters(),
    project: defaultFilters(),
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        splitPane: boolean;
        leftCollapsed: boolean;
        rightCollapsed: boolean;
        leftWidth: number;
        rightWidth: number;
        filtersByView: Partial<Record<GraphViewMode, Partial<WorkspaceFilters>>>;
      }>;
      if (typeof parsed.splitPane === "boolean") setSplitPane(parsed.splitPane);
      if (typeof parsed.leftCollapsed === "boolean") setLeftCollapsed(parsed.leftCollapsed);
      if (typeof parsed.rightCollapsed === "boolean") setRightCollapsed(parsed.rightCollapsed);
      if (typeof parsed.leftWidth === "number") setLeftWidth(clamp(parsed.leftWidth, 220, 520));
      if (typeof parsed.rightWidth === "number") setRightWidth(clamp(parsed.rightWidth, 320, 720));
      if (parsed.filtersByView) {
        const views: GraphViewMode[] = ["architecture-map", "tasks", "project"];
        const nextByView = { ...filtersByView };
        for (const view of views) {
          const incoming = parsed.filtersByView[view];
          if (!incoming) continue;
          const base = defaultFilters();
          nextByView[view] = {
            nodeTypes: {
              domains: incoming.nodeTypes?.domains ?? base.nodeTypes.domains,
              modules: incoming.nodeTypes?.modules ?? base.nodeTypes.modules,
              tasks: incoming.nodeTypes?.tasks ?? base.nodeTypes.tasks,
              decisions: incoming.nodeTypes?.decisions ?? base.nodeTypes.decisions,
            },
            edgeTypes: {
              dependency: incoming.edgeTypes?.dependency ?? base.edgeTypes.dependency,
              "data-flow": incoming.edgeTypes?.["data-flow"] ?? base.edgeTypes["data-flow"],
              blocking: incoming.edgeTypes?.blocking ?? base.edgeTypes.blocking,
            },
            authorityTypes: {
              authoritative:
                incoming.authorityTypes?.authoritative ?? base.authorityTypes.authoritative,
              manual: incoming.authorityTypes?.manual ?? base.authorityTypes.manual,
              inferred: incoming.authorityTypes?.inferred ?? base.authorityTypes.inferred,
            },
            hideCompletedTasks: incoming.hideCompletedTasks ?? base.hideCompletedTasks,
            showExternalDependencies:
              incoming.showExternalDependencies ?? base.showExternalDependencies,
            hopDepth: clamp(incoming.hopDepth ?? base.hopDepth, 0, 3),
          };
        }
        setFiltersByView(nextByView);
      }
    } catch {
      // Ignore invalid persisted state.
    }
  }, []);

  useEffect(() => {
    const payload = JSON.stringify({
      splitPane,
      leftCollapsed,
      rightCollapsed,
      leftWidth,
      rightWidth,
      filtersByView,
    });
    window.localStorage.setItem(STORAGE_KEY, payload);
  }, [filtersByView, leftCollapsed, leftWidth, rightCollapsed, rightWidth, splitPane]);

  const filters = filtersByView[activeGraphView] ?? defaultFilters();

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      splitPane,
      leftCollapsed,
      rightCollapsed,
      leftWidth,
      rightWidth,
      filters,
      setSplitPane,
      setLeftCollapsed,
      setRightCollapsed,
      setLeftWidth: (next) => setLeftWidth(clamp(next, 220, 520)),
      setRightWidth: (next) => setRightWidth(clamp(next, 320, 720)),
      toggleNodeType: (filter) =>
        setFiltersByView((prev) => ({
          ...prev,
          [activeGraphView]: {
            ...prev[activeGraphView],
            nodeTypes: {
              ...prev[activeGraphView].nodeTypes,
              [filter]: !prev[activeGraphView].nodeTypes[filter],
            },
          },
        })),
      toggleEdgeType: (filter) =>
        setFiltersByView((prev) => ({
          ...prev,
          [activeGraphView]: {
            ...prev[activeGraphView],
            edgeTypes: {
              ...prev[activeGraphView].edgeTypes,
              [filter]: !prev[activeGraphView].edgeTypes[filter],
            },
          },
        })),
      toggleAuthorityType: (filter) =>
        setFiltersByView((prev) => ({
          ...prev,
          [activeGraphView]: {
            ...prev[activeGraphView],
            authorityTypes: {
              ...prev[activeGraphView].authorityTypes,
              [filter]: !prev[activeGraphView].authorityTypes[filter],
            },
          },
        })),
      setHideCompletedTasks: (next) =>
        setFiltersByView((prev) => ({
          ...prev,
          [activeGraphView]: {
            ...prev[activeGraphView],
            hideCompletedTasks: next,
          },
        })),
      setShowExternalDependencies: (next) =>
        setFiltersByView((prev) => ({
          ...prev,
          [activeGraphView]: {
            ...prev[activeGraphView],
            showExternalDependencies: next,
          },
        })),
      setHopDepth: (next) =>
        setFiltersByView((prev) => ({
          ...prev,
          [activeGraphView]: {
            ...prev[activeGraphView],
            hopDepth: clamp(next, 0, 3),
          },
        })),
      resetLayout: () => {
        setSplitPane(false);
        setLeftCollapsed(false);
        setRightCollapsed(false);
        setLeftWidth(DEFAULT_LEFT_WIDTH);
        setRightWidth(DEFAULT_RIGHT_WIDTH);
        setFiltersByView({
          "architecture-map": defaultFilters(),
          tasks: defaultFilters(),
          project: defaultFilters(),
        });
      },
    }),
    [activeGraphView, filters, leftCollapsed, leftWidth, rightCollapsed, rightWidth, splitPane],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return value;
}
