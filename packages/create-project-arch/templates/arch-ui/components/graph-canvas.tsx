"use client";

import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import {
  addEdge,
  Background,
  ControlButton,
  Controls,
  Edge,
  MiniMap,
  Node,
  OnConnect,
  ReactFlow,
  ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "reactflow";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GraphDatasetResponse } from "../lib/types";
import { GRAPH_VIEW_BEHAVIOR } from "../lib/graph-schema";

import { nodeTypes } from "./graph/arch-node";
import { buildGraphFromDataset } from "./graph/build-graph-from-dataset";
import { GraphContextMenu } from "./graph/graph-context-menu";
import {
  ArchNodeData,
  GraphEdgeAuthority,
  GraphCanvasViewMode,
  GraphEdgeFilter,
  buildNodeMarkdown,
  ContextMenuState,
  GraphFilter,
  GraphKind,
  GraphTone,
  InspectorNode,
  parseNodeId,
  toneColor,
} from "./graph/graph-types";
import { useAutoLayout } from "./graph/use-auto-layout";
import { isValidArchitectureConnection } from "./graph/use-connection-validation";
import { useFlowPersistence } from "./graph/use-flow-persistence";

import "reactflow/dist/style.css";

type GraphCanvasProps = {
  data: GraphDatasetResponse["dataset"];
  viewMode: GraphCanvasViewMode;
  enabledFilters: GraphFilter[];
  enabledEdgeFilters: GraphEdgeFilter[];
  enabledAuthorityFilters: GraphEdgeAuthority[];
  hopDepth: number;
  onHopDepthChange: (next: number) => void;
  showExternalDependencies: boolean;
  hideCompletedTasks: boolean;
  onNodeSelect: (node: InspectorNode) => void;
};

export { type GraphFilter, type InspectorNode } from "./graph/graph-types";

export function GraphCanvas({
  data,
  viewMode,
  enabledFilters,
  enabledEdgeFilters,
  enabledAuthorityFilters,
  hopDepth,
  onHopDepthChange,
  showExternalDependencies,
  hideCompletedTasks,
  onNodeSelect,
}: GraphCanvasProps) {
  const SELECTED_NODE_KEY = "arch:graph:selected-node:v1";
  const hasAppliedInitialView = useRef(false);
  const rememberedPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pinnedNodeIds, setPinnedNodeIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [viewportZoom, setViewportZoom] = useState(1);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<ArchNodeData, Edge> | null>(
    null,
  );
  const storageKey = `arch:graph:view:${viewMode}:v1`;

  const initialGraph = useMemo(
    () => buildGraphFromDataset(data, viewMode),
    [data, viewMode],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<ArchNodeData>(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);

  useEffect(() => {
    setNodes((currentNodes) => {
      const currentPositions = new Map(currentNodes.map((node) => [node.id, node.position] as const));
      return initialGraph.nodes.map((node) => {
        const remembered = rememberedPositions.current.get(node.id);
        const current = currentPositions.get(node.id);
        if (!remembered && !current) return node;
        return { ...node, position: remembered ?? current ?? node.position };
      });
    });
    setEdges(initialGraph.edges);
    setHiddenNodeIds((prev) => {
      const validIds = new Set(initialGraph.nodes.map((node) => node.id));
      return new Set([...prev].filter((id) => validIds.has(id)));
    });
    setSelectedNodeId((current) => {
      if (!current) return null;
      return initialGraph.nodes.some((node) => node.id === current) ? current : null;
    });
    setPinnedNodeIds((current) => {
      const validIds = new Set(initialGraph.nodes.map((node) => node.id));
      return new Set([...current].filter((id) => validIds.has(id)));
    });
  }, [initialGraph, setEdges, setNodes]);

  useEffect(() => {
    rememberedPositions.current = new Map(
      nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }] as const),
    );
  }, [nodes]);

  const behavior = GRAPH_VIEW_BEHAVIOR[viewMode];
  const viewCanonicalTypes: Record<GraphCanvasViewMode, string[]> = {
    "architecture-map": ["arch_folder", "domain_doc", "architecture_doc", "architecture_model"],
    tasks: ["roadmap_folder", "roadmap_epic", "roadmap_story", "roadmap_task"],
    project: ["project_folder", "app", "package", "module", "component"],
  };
  const effectiveHopDepth = useMemo(() => {
    const min = Math.min(...behavior.allowedHopDepths);
    const max = Math.max(...behavior.allowedHopDepths);
    const next = Math.max(min, Math.min(max, hopDepth));
    return behavior.allowedHopDepths.includes(next) ? next : behavior.defaultHopDepth;
  }, [behavior, hopDepth]);

  const neighborhoodIds = useMemo(() => {
    if (!selectedNodeId || effectiveHopDepth <= 0) {
      return new Set<string>(selectedNodeId ? [selectedNodeId] : []);
    }
    const ids = new Set<string>([selectedNodeId]);
    let frontier = new Set<string>([selectedNodeId]);
    for (let depth = 0; depth < effectiveHopDepth; depth++) {
      const nextFrontier = new Set<string>();
      edges.forEach((edge) => {
        if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) return;
        if (frontier.has(edge.source) && !ids.has(edge.target)) {
          ids.add(edge.target);
          nextFrontier.add(edge.target);
        }
        if (frontier.has(edge.target) && !ids.has(edge.source)) {
          ids.add(edge.source);
          nextFrontier.add(edge.source);
        }
      });
      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }
    return ids;
  }, [edges, effectiveHopDepth, hiddenNodeIds, selectedNodeId]);

  const visibleNodes = useMemo(() => {
    const viewKinds: Record<GraphCanvasViewMode, GraphKind[]> = {
      "architecture-map": ["domain", "decision"],
      tasks: ["phase", "milestone", "task"],
      project: ["file"],
    };
    const baseNodeIds = new Set(
      nodes
        .filter((node) => {
          if (hiddenNodeIds.has(node.id)) return false;
          if (!viewKinds[viewMode].includes(node.data.kind)) return false;
          const typeLabel = (node.data.canonicalType ?? "").toLowerCase();
          if (
            typeLabel.includes("arch_folder") &&
            !enabledFilters.includes("domains")
          ) {
            return false;
          }
          if (
            (typeLabel.includes("domain") || typeLabel.includes("architecture_doc")) &&
            !enabledFilters.includes("domains")
          ) {
            return false;
          }
          if (typeLabel.includes("architecture_model") && !enabledFilters.includes("decisions")) {
            return false;
          }
          if (typeLabel.includes("roadmap_") && !enabledFilters.includes("tasks")) {
            return false;
          }
          if (
            typeLabel.includes("project_folder") &&
            !enabledFilters.includes("modules")
          ) {
            return false;
          }
          if (
            (typeLabel.includes("app") ||
              typeLabel.includes("package") ||
              typeLabel.includes("module") ||
              typeLabel.includes("component")) &&
            !enabledFilters.includes("modules")
          ) {
            return false;
          }
          if (hideCompletedTasks && typeLabel === "roadmap_task") {
            const lane = node.data.metadata.find((entry) => entry.label === "lane")?.value;
            if (lane === "complete") return false;
          }
          if (viewMode === "project" && !showExternalDependencies) {
            if (typeLabel.includes("project_folder")) {
              return true;
            }
            const source =
              node.data.metadata.find((entry) => entry.label === "Source")?.value ??
              node.data.label;
            if (!source.startsWith("apps/") && !source.startsWith("packages/")) return false;
          }
          return true;
        })
        .map((node) => node.id),
    );

    const lowered = searchQuery.trim().toLowerCase();
    const matchesSearch = (node: Node<ArchNodeData>) => {
      if (!lowered) return true;
      const haystack = [
        node.id,
        node.data.label,
        node.data.subtitle ?? "",
        ...node.data.metadata.map((entry) => entry.value),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(lowered);
    };

    // Global search mode: search across all nodes in the active view scope, not only focus context.
    if (lowered) {
      return nodes.filter((node) => baseNodeIds.has(node.id) && matchesSearch(node));
    }

    if (viewMode === "tasks" && !selectedNodeId) {
      const phaseIds = new Set(
        nodes
          .filter(
            (node) =>
              baseNodeIds.has(node.id) &&
              (node.data.canonicalType ?? "").toLowerCase() === "roadmap_folder" &&
              node.data.metadata.some(
                (entry) => entry.label.toLowerCase() === "level" && entry.value === "root",
              ),
          )
          .map((node) => node.id),
      );

      if (phaseIds.size > 0) {
        const topGraphIds = new Set(phaseIds);
        // Fixed +1 hop boot state from all phases when nothing is selected.
        edges.forEach((edge) => {
          if (phaseIds.has(edge.source) && baseNodeIds.has(edge.target)) {
            topGraphIds.add(edge.target);
          }
          if (phaseIds.has(edge.target) && baseNodeIds.has(edge.source)) {
            topGraphIds.add(edge.source);
          }
        });
        return nodes.filter((node) => topGraphIds.has(node.id));
      }
    }

    if (viewMode === "architecture-map" && !selectedNodeId) {
      const domainRootIds = new Set(
        nodes
          .filter(
            (node) =>
              baseNodeIds.has(node.id) &&
              (node.data.canonicalType ?? "").toLowerCase() === "arch_folder" &&
              node.data.metadata.some(
                (entry) => entry.label.toLowerCase() === "level" && entry.value === "root",
              ),
          )
          .map((node) => node.id),
      );

      if (domainRootIds.size > 0) {
        const topGraphIds = new Set(domainRootIds);
        // Match tasks boot behavior: roots +1 hop when nothing is selected.
        edges.forEach((edge) => {
          if (domainRootIds.has(edge.source) && baseNodeIds.has(edge.target)) {
            topGraphIds.add(edge.target);
          }
          if (domainRootIds.has(edge.target) && baseNodeIds.has(edge.source)) {
            topGraphIds.add(edge.source);
          }
        });
        return nodes.filter((node) => topGraphIds.has(node.id));
      }
    }

    if (viewMode === "project" && !selectedNodeId) {
      const projectRootIds = new Set(
        nodes
          .filter((node) => {
            if (!baseNodeIds.has(node.id)) return false;
            const canonical = (node.data.canonicalType ?? "").toLowerCase();
            if (canonical !== "project_folder") return false;
            return node.data.metadata.some(
              (entry) => entry.label.toLowerCase() === "level" && entry.value === "root",
            );
          })
          .map((node) => node.id),
      );

      if (projectRootIds.size > 0) {
        const topGraphIds = new Set(projectRootIds);
        // Match tasks/architecture boot behavior: roots +1 hop when nothing is selected.
        edges.forEach((edge) => {
          if (projectRootIds.has(edge.source) && baseNodeIds.has(edge.target)) {
            topGraphIds.add(edge.target);
          }
          if (projectRootIds.has(edge.target) && baseNodeIds.has(edge.source)) {
            topGraphIds.add(edge.source);
          }
        });
        return nodes.filter((node) => topGraphIds.has(node.id));
      }
    }

    if (!selectedNodeId) {
      return nodes.filter((node) => baseNodeIds.has(node.id));
    }

    const selectedNode = nodes.find((node) => node.id === selectedNodeId);
    if (!selectedNode || hiddenNodeIds.has(selectedNode.id)) {
      return nodes.filter((node) => baseNodeIds.has(node.id));
    }

    return nodes.filter((node) => {
      const inScope = neighborhoodIds.has(node.id) || pinnedNodeIds.has(node.id);
      if (!inScope) return false;
      return matchesSearch(node);
    });
  }, [edges, enabledFilters, hideCompletedTasks, hiddenNodeIds, neighborhoodIds, nodes, pinnedNodeIds, searchQuery, selectedNodeId, showExternalDependencies, viewMode]);
  const visibleEdges = useMemo(
    () => {
      const allowedEdgeTypes = new Set(enabledEdgeFilters);
      const allowedAuthorities = new Set(enabledAuthorityFilters);
      const baseEdges = edges.filter(
        (edge) =>
          !hiddenNodeIds.has(edge.source) &&
          !hiddenNodeIds.has(edge.target) &&
          allowedEdgeTypes.has((edge.data?.edgeType as GraphEdgeFilter | undefined) ?? "dependency") &&
          allowedAuthorities.has(
            (edge.data?.authority as GraphEdgeAuthority | undefined) ?? "authoritative",
          ),
      );
      const precedence = new Map<string, number>([
        ["authoritative", 3],
        ["manual", 2],
        ["inferred", 1],
      ]);
      const dedupedByRelation = new Map<string, Edge>();
      baseEdges.forEach((edge) => {
        const key = `${edge.source}|${edge.target}|${edge.data?.edgeType ?? "dependency"}`;
        const incomingScore = precedence.get(edge.data?.authority ?? "authoritative") ?? 0;
        const existing = dedupedByRelation.get(key);
        if (!existing) {
          dedupedByRelation.set(key, edge);
          return;
        }
        const existingScore = precedence.get(existing.data?.authority ?? "authoritative") ?? 0;
        if (incomingScore > existingScore) {
          dedupedByRelation.set(key, edge);
        }
      });
      const resolvedEdges = [...dedupedByRelation.values()];
      if (!selectedNodeId) {
        if (viewMode === "project" && searchQuery.trim().length === 0) {
          const visibleNodeIdSet = new Set(visibleNodes.map((node) => node.id));
          return resolvedEdges.filter(
            (edge) => visibleNodeIdSet.has(edge.source) && visibleNodeIdSet.has(edge.target),
          );
        }
        if (viewMode === "architecture-map" && searchQuery.trim().length === 0) {
          const visibleNodeIdSet = new Set(visibleNodes.map((node) => node.id));
          return resolvedEdges.filter(
            (edge) => visibleNodeIdSet.has(edge.source) && visibleNodeIdSet.has(edge.target),
          );
        }
        if (viewMode === "tasks" && searchQuery.trim().length === 0) {
          const visibleNodeIdSet = new Set(visibleNodes.map((node) => node.id));
          return resolvedEdges.filter(
            (edge) => visibleNodeIdSet.has(edge.source) && visibleNodeIdSet.has(edge.target),
          );
        }
        if (pinnedNodeIds.size === 0) return [];
        return resolvedEdges.filter(
          (edge) => pinnedNodeIds.has(edge.source) && pinnedNodeIds.has(edge.target),
        );
      }
      const visibleNodeIdSet = new Set(visibleNodes.map((node) => node.id));
      return resolvedEdges.filter(
        (edge) => visibleNodeIdSet.has(edge.source) && visibleNodeIdSet.has(edge.target),
      );
    },
    [edges, enabledAuthorityFilters, enabledEdgeFilters, hiddenNodeIds, pinnedNodeIds, searchQuery, selectedNodeId, viewMode, visibleNodes],
  );
  const renderedEdges = useMemo(
    () =>
      visibleEdges.map((edge) => ({
        ...edge,
        animated:
          edge.source === selectedNodeId ||
          edge.target === selectedNodeId ||
          (pinnedNodeIds.has(edge.source) && pinnedNodeIds.has(edge.target)),
      })),
    [pinnedNodeIds, selectedNodeId, visibleEdges],
  );
  const renderedNodes = useMemo(() => {
    if (visibleNodes.length === 0) return visibleNodes;
    if (viewportZoom <= 1) return visibleNodes;

    const minX = Math.min(...visibleNodes.map((node) => node.position.x));
    const spreadFactor = Math.min(1.8, 1 + (viewportZoom - 1) * 0.45);

    return visibleNodes.map((node) => ({
      ...node,
      position: {
        ...node.position,
        x: minX + (node.position.x - minX) * spreadFactor,
      },
    }));
  }, [viewportZoom, visibleNodes]);

  const onConnect: OnConnect = useCallback(
    (connection) => {
      setEdges((existingEdges) => {
        const candidateNodes = nodes.filter((node) => !hiddenNodeIds.has(node.id));
        const candidateEdges = existingEdges.filter(
          (edge) => !hiddenNodeIds.has(edge.source) && !hiddenNodeIds.has(edge.target),
        );
        if (!isValidArchitectureConnection(connection, candidateNodes, candidateEdges)) {
          return existingEdges;
        }
        return addEdge(
          {
            ...connection,
            type: "smoothstep",
            animated: true,
            data: { edgeType: "dependency", authority: "manual" as GraphEdgeAuthority },
          },
          existingEdges,
        );
      });
    },
    [hiddenNodeIds, nodes, setEdges],
  );

  const { saveFlow, restoreFlow } = useFlowPersistence(
    setNodes,
    setEdges,
    setHiddenNodeIds,
    flowInstance,
    storageKey,
  );
  const autoLayout = useAutoLayout(setNodes, edges, hiddenNodeIds, flowInstance);

  useEffect(() => {
    if (hasAppliedInitialView.current) return;
    if (!flowInstance || typeof window === "undefined") return;

    hasAppliedInitialView.current = true;
    const hasSavedView = !!window.localStorage.getItem(storageKey);

    if (hasSavedView) {
      restoreFlow();
      return;
    }

    window.requestAnimationFrame(() => {
      autoLayout();
    });
  }, [autoLayout, flowInstance, restoreFlow, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SELECTED_NODE_KEY);
    if (!stored) return;
    if (selectedNodeId) return;
    const selected = nodes.find((node) => node.id === stored);
    if (selected && viewCanonicalTypes[viewMode].includes(selected.data.canonicalType ?? "")) {
      setSelectedNodeId(stored);
      return;
    }
    const mapped = edges.find((edge) => edge.source === stored || edge.target === stored);
    if (!mapped) return;
    const candidateId = mapped.source === stored ? mapped.target : mapped.source;
    const candidateNode = nodes.find((node) => node.id === candidateId);
    if (!candidateNode) return;
    if (!viewCanonicalTypes[viewMode].includes(candidateNode.data.canonicalType ?? "")) return;
    setSelectedNodeId(candidateId);
  }, [edges, nodes, selectedNodeId, viewMode]);

  const resetGraph = useCallback(() => {
    setNodes(initialGraph.nodes);
    setEdges(initialGraph.edges);
    setHiddenNodeIds(new Set());
    setSelectedNodeId(null);
    setPinnedNodeIds(new Set());
    setSearchQuery("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SELECTED_NODE_KEY);
    }
    flowInstance?.fitView();
  }, [flowInstance, initialGraph, setEdges, setNodes]);

  const contextNode = useMemo(() => {
    if (!contextMenu) return null;
    return nodes.find((node) => node.id === contextMenu.nodeId) ?? null;
  }, [contextMenu, nodes]);

  function selectNodeForInspector(node: Node<ArchNodeData>) {
    const parsed = parseNodeId(node.id);
    const hasVisibleLinks = visibleEdges.some((edge) => edge.source === node.id || edge.target === node.id);
    const metadata = [...node.data.metadata];
    if (viewMode === "architecture-map" && !hasVisibleLinks) {
      metadata.push({
        label: "Link Status",
        value: "No linked tasks or project components yet.",
      });
    }
    onNodeSelect({
      type: parsed.kind,
      id: parsed.id,
      title: node.data.label,
      metadata,
      markdown: buildNodeMarkdown(node),
    });
  }

  return (
    <Card className="min-h-[520px]">
      <CardHeader>
        <CardTitle>
          {viewMode === "architecture-map"
            ? "Architecture Map"
            : viewMode === "tasks"
              ? "Tasks Graph"
              : "Project Graph"}
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Input
            className="w-[220px]"
            placeholder="Search id/title/path/tags..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={effectiveHopDepth <= Math.min(...behavior.allowedHopDepths)}
            onClick={() => onHopDepthChange(effectiveHopDepth - 1)}
          >
            Hop -
          </Button>
          <Button
            variant="outline"
            disabled={effectiveHopDepth >= Math.max(...behavior.allowedHopDepths)}
            onClick={() => onHopDepthChange(effectiveHopDepth + 1)}
          >
            Hop +
          </Button>
          <span className="grid place-items-center rounded border border-slate-700 px-3 text-xs text-slate-300">
            Hop: {effectiveHopDepth}
          </span>
          <Button
            variant="outline"
            disabled={!selectedNodeId}
            onClick={() => setPinnedNodeIds(new Set(neighborhoodIds))}
          >
            Pin Focus
          </Button>
          <Button variant="outline" onClick={() => setPinnedNodeIds(new Set())}>
            Clear Pins
          </Button>
          <Button variant="outline" onClick={autoLayout}>
            Auto Layout
          </Button>
          <Button variant="outline" onClick={saveFlow}>
            Save View
          </Button>
          <Button variant="outline" onClick={restoreFlow}>
            Restore View
          </Button>
          <Button variant="ghost" onClick={resetGraph}>
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="relative h-[540px]">
        <ReactFlow
          fitView
          nodes={renderedNodes}
          edges={renderedEdges}
          nodeTypes={nodeTypes}
          onInit={setFlowInstance}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneClick={() => {
            setContextMenu(null);
            setSelectedNodeId(null);
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(SELECTED_NODE_KEY);
            }
          }}
          isValidConnection={(connection) =>
            isValidArchitectureConnection(connection, visibleNodes, visibleEdges)
          }
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
          }}
          onMove={(_, viewport) => {
            setViewportZoom(viewport.zoom);
          }}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(SELECTED_NODE_KEY, node.id);
            }
            selectNodeForInspector(node as Node<ArchNodeData>);
            setContextMenu(null);
          }}
        >
          <Background />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) =>
              toneColor[((node.data as ArchNodeData).tone ?? "file") as GraphTone]
            }
            nodeStrokeWidth={2}
          />
          <Controls showInteractive>
            <ControlButton onClick={() => setHiddenNodeIds(new Set())} title="Show hidden nodes">
              Show All
            </ControlButton>
          </Controls>
        </ReactFlow>

        {contextMenu && contextNode ? (
          <GraphContextMenu
            contextMenu={contextMenu}
            node={contextNode}
            flowInstance={flowInstance}
            onInspect={onNodeSelect}
            onHideNode={(id) => setHiddenNodeIds((prev) => new Set(prev).add(id))}
            onShowAll={() => setHiddenNodeIds(new Set())}
            onClose={() => setContextMenu(null)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
