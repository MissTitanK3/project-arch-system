"use client";

import { Badge } from "@repo/ui/badge";
import { NavigationMenu } from "@repo/ui/navigation-menu";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  Boxes,
  ListChecks,
  Network,
  Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getDomainDocs } from "../lib/api";
import { GRAPH_VIEW_BEHAVIOR, GraphViewMode } from "../lib/graph-schema";
import { DomainDocsData } from "../lib/types";
import { useInspector } from "./inspector-context";
import { useWorkspace, WorkspaceView } from "./workspace-context";

const viewRoutes: Record<WorkspaceView, string> = {
  "architecture-map": "/work?view=architecture",
  decisions: "/architecture?view=decisions",
  "tasks-roadmap": "/work?view=tasks",
  "project-map": "/work?view=project",
};
const selectableViews: WorkspaceView[] = ["architecture-map", "tasks-roadmap", "project-map"];

const nodeTypeFilters = [
  { key: "domains", label: "Domains" },
  { key: "modules", label: "Modules" },
  { key: "tasks", label: "Tasks" },
  { key: "decisions", label: "Decisions" },
] as const;

const edgeTypeFilters = [
  { key: "dependency", label: "Dependency" },
  { key: "data-flow", label: "Data Flow" },
  { key: "blocking", label: "Blocking" },
] as const;
const authorityFilters = [
  { key: "authoritative", label: "Authoritative" },
  { key: "manual", label: "Manual" },
  { key: "inferred", label: "Inferred" },
] as const;

type TreeNode = {
  key: string;
  label: string;
  kind: "domain-doc" | "folder";
  children?: TreeNode[];
  meta?: string;
  id?: string;
};

function humanizeSegment(value: string): string {
  const cleaned = value.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    const aFolder = !!a.children?.length || a.kind === "folder";
    const bFolder = !!b.children?.length || b.kind === "folder";
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return sorted.map((node) => ({
    ...node,
    children: node.children ? sortTree(node.children) : undefined,
  }));
}

function buildDocNodes(
  scope: DomainDocsData["docs"][number]["scope"],
  docs: DomainDocsData["docs"],
): TreeNode[] {
  const scopedDocs = docs.filter((doc) => doc.scope === scope);
  const roots: TreeNode[] = [];

  for (const doc of scopedDocs) {
    const relativePath = doc.path.startsWith(`${scope}/`)
      ? doc.path.slice(scope.length + 1)
      : doc.path;
    const parts = relativePath.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let cursor = roots;
    let cursorPath: string = scope;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i] ?? "";
      cursorPath = `${cursorPath}/${part}`;
      let folderNode = cursor.find((node) => node.key === `folder:${cursorPath}`);
      if (!folderNode) {
        folderNode = {
          key: `folder:${cursorPath}`,
          label: humanizeSegment(part),
          kind: "folder",
          children: [],
          meta: cursorPath,
        };
        cursor.push(folderNode);
      }
      if (!folderNode.children) folderNode.children = [];
      cursor = folderNode.children;
    }

    const fileName = parts[parts.length - 1] ?? doc.file;
    cursor.push({
      key: `domain-doc:${doc.path}`,
      label: doc.title || humanizeSegment(fileName),
      kind: "domain-doc",
      id: doc.path,
      meta: doc.path,
    });
  }

  return sortTree(roots);
}

function viewModeForWorkspaceView(view: WorkspaceView): GraphViewMode {
  if (view === "tasks-roadmap") return "tasks";
  if (view === "project-map") return "project";
  return "architecture-map";
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setSelection } = useInspector();
  const {
    leftCollapsed,
    setLeftCollapsed,
    filters,
    toggleNodeType,
    toggleEdgeType,
    toggleAuthorityType,
    setHideCompletedTasks,
    setShowExternalDependencies,
    setHopDepth,
  } = useWorkspace();
  const [domainDocs, setDomainDocs] = useState<DomainDocsData["docs"]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    new Set([
      "domain-docs-root",
      "arch-model-docs-root",
      "architecture-docs-root",
      "roadmap-docs-root",
    ]),
  );

  useEffect(() => {
    void getDomainDocs()
      .then((result) => setDomainDocs(result.docs))
      .catch(() => setDomainDocs([]));
  }, []);

  const activeView = useMemo<WorkspaceView>(() => {
    if (pathname === "/work" && searchParams.get("view") === "architecture")
      return "architecture-map";
    if (pathname === "/work" && searchParams.get("view") === "project") return "project-map";
    if (pathname === "/work") return "tasks-roadmap";
    const view = searchParams.get("view");
    if (pathname === "/architecture" && view === "decisions") return "decisions";
    return "architecture-map";
  }, [pathname, searchParams]);

  const activeGraphView = useMemo(() => viewModeForWorkspaceView(activeView), [activeView]);
  const hopDepthBounds = useMemo(() => {
    const allowed = GRAPH_VIEW_BEHAVIOR[activeGraphView].allowedHopDepths;
    return {
      min: Math.min(...allowed),
      max: Math.max(...allowed),
    };
  }, [activeGraphView]);

  useEffect(() => {
    if (filters.hopDepth < hopDepthBounds.min) {
      setHopDepth(hopDepthBounds.min);
      return;
    }
    if (filters.hopDepth > hopDepthBounds.max) {
      setHopDepth(hopDepthBounds.max);
    }
  }, [filters.hopDepth, hopDepthBounds.max, hopDepthBounds.min, setHopDepth]);

  const tree = useMemo<TreeNode[]>(() => {
    const domainDocNodes = buildDocNodes("arch-domains", domainDocs);
    const modelDocNodes = buildDocNodes("arch-model", domainDocs);
    const architectureDocNodes = buildDocNodes("architecture", domainDocs);
    const roadmapDocNodes = buildDocNodes("roadmap", domainDocs);

    return [
      {
        key: "domain-docs-root",
        label: "Domain Docs",
        kind: "folder",
        children: domainDocNodes,
      },
      {
        key: "arch-model-docs-root",
        label: "Arch Model",
        kind: "folder",
        children: modelDocNodes,
      },
      {
        key: "architecture-docs-root",
        label: "Architecture Docs",
        kind: "folder",
        children: architectureDocNodes,
      },
      {
        key: "roadmap-docs-root",
        label: "Roadmap",
        kind: "folder",
        children: roadmapDocNodes,
      },
    ];
  }, [domainDocs]);

  useEffect(() => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (!tree.some((node) => next.has(node.key))) {
        tree.forEach((node) => {
          if (node.children?.length) next.add(node.key);
        });
      }
      return next;
    });
  }, [tree]);

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function selectTreeNode(node: TreeNode) {
    if (node.kind === "folder" || (node.children?.length && !node.id)) {
      toggleExpanded(node.key);
      return;
    }
    if (node.kind === "domain-doc") {
      setSelection({
        type: "file",
        title: node.label,
        id: node.id ?? node.label,
        metadata: [{ label: "Path", value: node.meta ?? "arch-domains" }],
      });
      return;
    }
  }

  function iconForNode(node: TreeNode, expanded: boolean) {
    if (node.kind === "folder") {
      return expanded ? <FolderOpen size={14} /> : <Folder size={14} />;
    }
    if (node.kind === "domain-doc") return <FileText size={14} />;
    return <FileText size={14} />;
  }

  function renderTree(nodes: TreeNode[], depth = 0) {
    return nodes.map((node) => (
      <div key={node.key} className="grid gap-0.5" style={{ paddingLeft: `${depth * 0.5}px` }}>
        <div className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-800/70">
          {node.children?.length ? (
            <button
              type="button"
              className="grid h-4 w-4 place-items-center text-slate-400 hover:text-slate-200"
              onClick={(event) => {
                event.stopPropagation();
                toggleExpanded(node.key);
              }}
              aria-label={`Toggle ${node.label}`}
            >
              {expandedKeys.has(node.key) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="h-4 w-4" />
          )}
          <span className="text-slate-300">{iconForNode(node, expandedKeys.has(node.key))}</span>
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-[12px] text-slate-200"
            onClick={() => selectTreeNode(node)}
            title={node.meta ? `${node.label} - ${node.meta}` : node.label}
          >
            {node.label}
          </button>
          {node.meta ? (
            <span className="max-w-[40%] truncate text-[10px] text-slate-500">{node.meta}</span>
          ) : null}
        </div>
        {node.children?.length && expandedKeys.has(node.key) ? (
          <div className="ml-1 border-l border-slate-700/70 pl-1">
            {renderTree(node.children, depth + 1)}
          </div>
        ) : null}
      </div>
    ));
  }

  if (leftCollapsed) {
    return (
      <aside className="grid h-full min-h-0 content-start justify-items-center gap-2 overflow-y-auto border-r border-slate-800 bg-slate-950/85 p-2">
        <button
          className="rounded-lg border border-slate-600 px-3 py-5 text-sm"
          type="button"
          onClick={() => setLeftCollapsed(false)}
          title="Expand sidebar (Ctrl/Cmd+B)"
        >
          <FolderTree size={14} />
        </button>
        {selectableViews.map((view) => {
          const isActive = activeView === view;
          return (
            <Link
              key={view}
              href={viewRoutes[view]}
              title={
                view === "architecture-map"
                  ? "Architecture Map"
                  : view === "tasks-roadmap"
                    ? "Tasks / Roadmap"
                    : view === "project-map"
                      ? "Project"
                      : "Decisions"
              }
              className={
                isActive
                  ? "rounded-lg border border-blue-700 bg-slate-800 p-2 text-slate-100"
                  : "rounded-lg border border-transparent p-2 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
              }
            >
              {view === "architecture-map" ? <Network size={16} /> : null}
              {view === "tasks-roadmap" ? <ListChecks size={16} /> : null}
              {view === "project-map" ? <Boxes size={16} /> : null}
            </Link>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="h-full min-h-0 overflow-y-auto border-r border-slate-800 bg-slate-950/85 p-4">
      <div className="mb-4">
        <p className="m-0 text-[11px] uppercase tracking-[0.1em] text-slate-400">Architecture</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="m-0 text-base font-semibold">Control Panel</p>
          <button
            className="rounded-lg border border-transparent px-3 py-1.5 text-sm hover:border-slate-700"
            type="button"
            title="Collapse sidebar (Ctrl/Cmd+B)"
            onClick={() => setLeftCollapsed(true)}
          >
            Collapse
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl border border-slate-700 bg-slate-900/90 p-3">
        <p className="m-0 text-[11px] uppercase tracking-[0.1em] text-slate-400">Views</p>
        <div className="flex flex-wrap gap-2">
          {selectableViews.map((view) => (
            <Link
              key={view}
              href={viewRoutes[view]}
              className={
                activeView === view
                  ? "flex items-center gap-2 rounded-lg border border-blue-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
                  : "flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm text-slate-300 hover:border-slate-700 hover:bg-slate-900"
              }
            >
              {view === "architecture-map" ? <Network size={14} /> : null}
              {view === "tasks-roadmap" ? <ListChecks size={14} /> : null}
              {view === "project-map" ? <Boxes size={14} /> : null}
              <span>
                {view === "architecture-map"
                  ? "Architecture Map"
                  : view === "tasks-roadmap"
                    ? "Tasks / Roadmap"
                    : view === "project-map"
                      ? "Project"
                      : "Decisions"}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <NavigationMenu>
        <section className="mb-4">
          <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-400">
            Unified Explorer
          </p>
          {tree.length > 0 ? (
            renderTree(tree)
          ) : (
            <p className="text-sm text-slate-400">Loading explorer...</p>
          )}
        </section>
        <section className="mb-4">
          <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-400">Node Filters</p>
          <div className="flex flex-wrap gap-2">
            {nodeTypeFilters.map(({ key, label }) => (
              <button
                key={key}
                className={
                  filters.nodeTypes[key]
                    ? "rounded-lg border border-blue-700 bg-blue-700 px-3 py-2 text-sm"
                    : "rounded-lg border border-slate-600 px-3 py-2 text-sm"
                }
                type="button"
                onClick={() => toggleNodeType(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <section className="mb-4">
          <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-400">Status</p>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={filters.hideCompletedTasks}
              onChange={(event) => setHideCompletedTasks(event.target.checked)}
            />
            Hide Completed Tasks
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={filters.showExternalDependencies}
              onChange={(event) => setShowExternalDependencies(event.target.checked)}
            />
            Show External Dependencies
          </label>
          <label className="mt-2 grid gap-1 text-sm text-slate-400">
            <span>Hop Depth</span>
            <input
              type="range"
              min={hopDepthBounds.min}
              max={hopDepthBounds.max}
              value={filters.hopDepth}
              onChange={(event) => setHopDepth(Number(event.target.value))}
            />
            <span className="text-xs text-slate-500">
              Current: {filters.hopDepth} (allowed {hopDepthBounds.min}-{hopDepthBounds.max})
            </span>
          </label>
        </section>
        <section className="mb-4">
          <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-400">Edge Filters</p>
          <div className="flex flex-wrap gap-2">
            {edgeTypeFilters.map(({ key, label }) => (
              <button
                key={key}
                className={
                  filters.edgeTypes[key]
                    ? "rounded-lg border border-slate-700 bg-slate-700 px-3 py-2 text-sm"
                    : "rounded-lg border border-slate-600 px-3 py-2 text-sm"
                }
                type="button"
                onClick={() => toggleEdgeType(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <Badge variant="secondary">
            {pathname === "/work" ? "Applied in active view" : "Stored for active view"}
          </Badge>
        </section>
        <section className="mb-4">
          <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-400">
            Edge Authority
          </p>
          <div className="flex flex-wrap gap-2">
            {authorityFilters.map(({ key, label }) => (
              <button
                key={key}
                className={
                  filters.authorityTypes[key]
                    ? "rounded-lg border border-slate-700 bg-slate-700 px-3 py-2 text-sm"
                    : "rounded-lg border border-slate-600 px-3 py-2 text-sm"
                }
                type="button"
                onClick={() => toggleAuthorityType(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <section className="mb-4">
          <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-400">Quick Links</p>
          <div className="grid gap-1">
            <Link
              href="/work?view=architecture"
              className={
                pathname === "/work" && searchParams.get("view") === "architecture"
                  ? "flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                  : "flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm hover:border-slate-700 hover:bg-slate-900"
              }
            >
              <Network size={14} />
              <span>Map</span>
            </Link>
            <Link
              href="/health?view=trace"
              className="flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm hover:border-slate-700 hover:bg-slate-900"
            >
              <Search size={14} />
              <span>Trace</span>
            </Link>
          </div>
        </section>
      </NavigationMenu>
    </aside>
  );
}
