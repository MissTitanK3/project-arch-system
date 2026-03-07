import dagre from "dagre";
import { useCallback } from "react";
import type { Edge, Node, ReactFlowInstance } from "reactflow";
import { ArchNodeData, NODE_HEIGHT, NODE_WIDTH } from "./graph-types";

export function useAutoLayout(
    setNodes: React.Dispatch<React.SetStateAction<Node<ArchNodeData>[]>>,
    edges: Edge[],
    hiddenNodeIds: Set<string>,
    flowInstance: ReactFlowInstance<ArchNodeData, Edge> | null,
) {
    return useCallback(() => {
        const currentViewport = flowInstance?.getViewport();

        setNodes((currentNodes) => {
            const graph = new dagre.graphlib.Graph();
            graph.setDefaultEdgeLabel(() => ({}));
            graph.setGraph({
                rankdir: "LR",
                nodesep: 40,
                ranksep: 100,
                marginx: 20,
                marginy: 20,
            });

            const visibleNodeSet = new Set(
                currentNodes.filter((node) => !hiddenNodeIds.has(node.id)).map((node) => node.id),
            );
            currentNodes
                .filter((node) => visibleNodeSet.has(node.id))
                .forEach((node) => {
                    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
                });

            edges
                .filter((edge) => visibleNodeSet.has(edge.source) && visibleNodeSet.has(edge.target))
                .forEach((edge) => {
                    graph.setEdge(edge.source, edge.target);
                });

            dagre.layout(graph);

            return currentNodes.map((node) => {
                if (!visibleNodeSet.has(node.id)) {
                    return node;
                }
                const position = graph.node(node.id) as { x: number; y: number } | undefined;
                if (!position) {
                    return node;
                }
                return {
                    ...node,
                    position: {
                        x: position.x - NODE_WIDTH / 2,
                        y: position.y - NODE_HEIGHT / 2,
                    },
                };
            });
        });
        if (flowInstance && currentViewport) {
            // Preserve user zoom/pan while applying new node positions.
            flowInstance.setViewport(currentViewport, { duration: 0 });
        }
    }, [edges, flowInstance, hiddenNodeIds, setNodes]);
}
