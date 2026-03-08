import type { Edge, Node } from "reactflow";
import type {
  GraphDataset,
  GraphEdgeType,
  GraphNodeType,
  GraphViewMode,
} from "../../lib/graph-schema";
import type {
  ArchEdgeData,
  ArchNodeData,
  GraphEdgeFilter,
  GraphKind,
  GraphTone,
} from "./graph-types";

function mapNodeTypeToKind(type: GraphNodeType): GraphKind {
  switch (type) {
    case "arch_folder":
    case "domain_doc":
    case "architecture_doc":
      return "domain";
    case "roadmap_folder":
      return "phase";
    case "architecture_model":
      return "decision";
    case "roadmap_epic":
      return "phase";
    case "roadmap_story":
      return "milestone";
    case "roadmap_task":
      return "task";
    case "project_folder":
    case "app":
    case "package":
    case "module":
    case "component":
    default:
      return "file";
  }
}

function mapNodeTypeToTone(type: GraphNodeType): GraphTone {
  switch (type) {
    case "arch_folder":
    case "domain_doc":
    case "architecture_doc":
      return "domain";
    case "architecture_model":
      return "decision";
    case "roadmap_folder":
    case "roadmap_epic":
    case "roadmap_story":
      return "phase";
    case "roadmap_task":
      return "task";
    default:
      return "file";
  }
}

function mapEdgeTypeToFilter(type: GraphEdgeType): GraphEdgeFilter {
  switch (type) {
    case "references":
    case "documents":
      return "data-flow";
    case "implements":
      return "blocking";
    default:
      return "dependency";
  }
}

const typeColumn: Record<GraphNodeType, number> = {
  arch_folder: 0,
  domain_doc: 1,
  architecture_doc: 2,
  architecture_model: 3,
  roadmap_folder: 0,
  roadmap_epic: 1,
  roadmap_story: 2,
  roadmap_task: 3,
  project_folder: 0,
  app: 1,
  package: 2,
  module: 3,
  component: 4,
};

function estimateNodeHeight(node: GraphDataset["nodes"][number]): number {
  // Keep estimates stable and deterministic so structure remains predictable.
  const base = 92;
  const titleLines = Math.max(1, Math.ceil(node.title.length / 26));
  const subtitleLines = node.description ? Math.max(1, Math.ceil(node.description.length / 36)) : 0;
  const metadataLines = Math.min(3, Math.max(1, Object.keys(node.metadata).length));
  return base + titleLines * 16 + subtitleLines * 14 + metadataLines * 12;
}

function estimateNodeWidth(node: GraphDataset["nodes"][number]): number {
  const base = 220;
  const titleWidth = node.title.length * 7.2;
  const subtitleWidth = (node.description ?? "").length * 6.4;
  const metadataStrings = Object.entries(node.metadata).map(([key, value]) => {
    const normalized = Array.isArray(value) ? value.join(", ") : String(value);
    return `${key}: ${normalized}`;
  });
  const metadataWidth = metadataStrings.reduce(
    (max, value) => Math.max(max, value.length * 6.8),
    0,
  );
  const estimated = base + Math.max(titleWidth, subtitleWidth, metadataWidth) * 0.58;
  return Math.max(240, Math.min(estimated, 760));
}

export function buildGraphFromDataset(
  dataset: GraphDataset,
  _viewMode: GraphViewMode,
): { nodes: Node<ArchNodeData>[]; edges: Edge<ArchEdgeData>[] } {
  const indexByType = new Map<GraphNodeType, number>();
  const columnCursorY = new Map<number, number>();
  const columnMaxWidth = new Map<number, number>();
  const columnX = new Map<number, number>();
  const VERTICAL_GAP = 34;
  const MIN_HORIZONTAL_GAP = 110;
  const START_Y = 40;
  const START_X = 120;

  dataset.nodes.forEach((node) => {
    const column = typeColumn[node.type];
    const width = estimateNodeWidth(node);
    const currentMax = columnMaxWidth.get(column) ?? 0;
    if (width > currentMax) columnMaxWidth.set(column, width);
  });

  const columns = [...new Set(dataset.nodes.map((node) => typeColumn[node.type]))].sort(
    (a, b) => a - b,
  );
  let cursorX = START_X;
  columns.forEach((column, index) => {
    columnX.set(column, cursorX);
    const currentWidth = columnMaxWidth.get(column) ?? 260;
    const nextColumn = columns[index + 1];
    const nextWidth =
      nextColumn === undefined ? currentWidth : (columnMaxWidth.get(nextColumn) ?? 260);
    const adaptiveGap = Math.max(
      MIN_HORIZONTAL_GAP,
      Math.round(Math.max(currentWidth, nextWidth) * 0.24),
    );
    cursorX += currentWidth + adaptiveGap;
  });

  const nodes: Node<ArchNodeData>[] = dataset.nodes.map((node) => {
    const count = indexByType.get(node.type) ?? 0;
    indexByType.set(node.type, count + 1);
    const column = typeColumn[node.type];
    const currentY = columnCursorY.get(column) ?? START_Y;
    const height = estimateNodeHeight(node);
    columnCursorY.set(column, currentY + height + VERTICAL_GAP);

    return {
      id: node.id,
      type: "archNode",
      position: {
        x: columnX.get(column) ?? START_X + column * 320,
        y: currentY,
      },
      data: {
        kind: mapNodeTypeToKind(node.type),
        tone: mapNodeTypeToTone(node.type),
        label: node.title,
        subtitle: node.description,
        canonicalType: node.type,
        metadata: [
          { label: "Node Type", value: node.type },
          { label: "Source", value: node.source.path },
          { label: "Scope", value: node.source.scope },
          ...Object.entries(node.metadata).map(([key, value]) => ({
            label: key,
            value: Array.isArray(value) ? value.join(", ") : String(value),
          })),
        ],
      },
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: Edge<ArchEdgeData>[] = dataset.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      data: {
        edgeType: mapEdgeTypeToFilter(edge.type),
        authority: edge.authority,
      },
    }));

  return { nodes, edges };
}
