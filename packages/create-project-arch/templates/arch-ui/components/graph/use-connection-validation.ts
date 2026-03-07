import { addEdge, Connection, Edge, getOutgoers, Node } from "reactflow";
import type { ArchNodeData, GraphKind } from "./graph-types";

function nodeAllowsOutgoing(kind: GraphKind): GraphKind[] {
    switch (kind) {
        case "decision":
            return ["domain"];
        case "phase":
            return ["milestone"];
        case "milestone":
            return ["task"];
        case "task":
            return ["file", "decision"];
        case "domain":
            return ["file"];
        case "file":
        default:
            return [];
    }
}

export function isValidArchitectureConnection(
    connection: Connection,
    nodes: Node<ArchNodeData>[],
    edges: Edge[],
) {
    if (!connection.source || !connection.target || connection.source === connection.target) {
        return false;
    }

    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) {
        return false;
    }

    const allowedTargets = nodeAllowsOutgoing(sourceNode.data.kind);
    if (!allowedTargets.includes(targetNode.data.kind)) {
        return false;
    }

    const nextEdges = addEdge({ ...connection, type: "smoothstep" }, edges);
    const hasCycle = (node: Node<ArchNodeData>, visited = new Set<string>()): boolean => {
        if (visited.has(node.id)) {
            return false;
        }
        visited.add(node.id);

        const outgoers = getOutgoers(node, nodes, nextEdges);
        for (const outgoer of outgoers) {
            if (outgoer.id === connection.source) {
                return true;
            }
            if (hasCycle(outgoer as Node<ArchNodeData>, visited)) {
                return true;
            }
        }
        return false;
    };

    return !hasCycle(targetNode);
}
