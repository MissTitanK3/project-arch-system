import type { Node } from "reactflow";

export type GraphFilter = "domains" | "modules" | "tasks" | "decisions";
export type GraphEdgeFilter = "dependency" | "data-flow" | "blocking";
export type GraphEdgeAuthority = "authoritative" | "manual" | "inferred";
export type GraphCanvasViewMode = "architecture-map" | "tasks" | "project";
export type GraphKind = "domain" | "decision" | "phase" | "milestone" | "task" | "file";
export type GraphTone = "domain" | "decision" | "phase" | "task" | "file";

export type InspectorNode = {
    type: string;
    id: string;
    title: string;
    metadata: Array<{ label: string; value: string }>;
    markdown?: string;
};

export type ArchNodeData = {
    kind: GraphKind;
    tone: GraphTone;
    label: string;
    subtitle?: string;
    canonicalType?: string;
    metadata: Array<{ label: string; value: string }>;
};

export type ArchEdgeData = {
    edgeType: GraphEdgeFilter;
    authority: GraphEdgeAuthority;
};

export type ContextMenuState = {
    nodeId: string;
    x: number;
    y: number;
};

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 100;

export const toneColor: Record<GraphTone, string> = {
    domain: "#3b82f6",
    decision: "#7c3aed",
    phase: "#22c55e",
    task: "#f59e0b",
    file: "#6b7280",
};

export function parseNodeId(nodeId: string): { kind: GraphKind; id: string } {
    const [scope = "file", type = "file", ...rest] = nodeId.split(":");
    if (scope === "roadmap" && type === "task") return { kind: "task", id: rest.join(":") };
    if (scope === "roadmap" && type === "story") return { kind: "milestone", id: rest.join(":") };
    if (scope === "roadmap" && type === "epic") return { kind: "phase", id: rest.join(":") };
    if (scope === "arch" && type === "domain") return { kind: "domain", id: rest.join(":") };
    if (scope === "arch" && type === "doc") return { kind: "domain", id: rest.join(":") };
    if (scope === "arch" && type === "model") return { kind: "decision", id: rest.join(":") };
    if (scope === "project") return { kind: "file", id: rest.join(":") };
    const kind = (scope as GraphKind) || "file";
    return { kind, id: [type, ...rest].filter(Boolean).join(":") };
}

export function buildNodeMarkdown(node: Node<ArchNodeData>): string {
    const { kind, label, subtitle, metadata } = node.data;
    const identity = parseNodeId(node.id);
    const metadataMarkdown =
        metadata.length > 0
            ? metadata.map((item) => `- **${item.label}**: ${item.value}`).join("\n")
            : "- No metadata available";

    return [
        `## ${label}`,
        "",
        `- **Type**: ${kind}`,
        `- **ID**: \`${identity.id}\``,
        subtitle ? `- **Subtitle**: ${subtitle}` : "",
        "",
        "### Metadata",
        metadataMarkdown,
    ]
        .filter(Boolean)
        .join("\n");
}
