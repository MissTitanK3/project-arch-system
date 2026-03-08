import { useCallback } from "react";
import type { Edge, Node, ReactFlowInstance } from "reactflow";
import { ArchNodeData } from "./graph-types";

export function useFlowPersistence(
  setNodes: React.Dispatch<React.SetStateAction<Node<ArchNodeData>[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  setHiddenNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  flowInstance: ReactFlowInstance<ArchNodeData, Edge> | null,
  storageKey: string,
) {
  const saveFlow = useCallback(() => {
    if (typeof window === "undefined" || !flowInstance) return;
    const flow = flowInstance.toObject();
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        nodes: flow.nodes,
        edges: flow.edges,
        viewport: flow.viewport,
      }),
    );
  }, [flowInstance, storageKey]);

  const restoreFlow = useCallback(() => {
    if (typeof window === "undefined") return;
    const payload = window.localStorage.getItem(storageKey);
    if (!payload) return;

    try {
      const parsed = JSON.parse(payload) as {
        nodes: Node<ArchNodeData>[];
        edges: Edge[];
        viewport?: { x: number; y: number; zoom: number };
      };
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
      if (parsed.viewport && flowInstance) {
        flowInstance.setViewport(parsed.viewport);
      }
      setHiddenNodeIds(new Set());
    } catch {
      // Ignore invalid state.
    }
  }, [flowInstance, setEdges, setNodes, setHiddenNodeIds, storageKey]);

  return { saveFlow, restoreFlow };
}
