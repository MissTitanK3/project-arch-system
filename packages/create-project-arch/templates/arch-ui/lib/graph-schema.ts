export const GRAPH_SCHEMA_VERSION = "2.0.0" as const;

export type GraphViewMode = "architecture-map" | "tasks" | "project";

export type GraphNodeType =
  | "arch_folder"
  | "domain_doc"
  | "architecture_doc"
  | "architecture_model"
  | "roadmap_folder"
  | "roadmap_epic"
  | "roadmap_story"
  | "roadmap_task"
  | "project_folder"
  | "app"
  | "package"
  | "module"
  | "component";

export type GraphEdgeType =
  | "references"
  | "depends_on"
  | "implements"
  | "owned_by"
  | "contains"
  | "uses"
  | "documents";

export type GraphEdgeAuthority = "authoritative" | "manual" | "inferred";

export type GraphNodeId = string;
export type GraphEdgeId = string;

export type GraphNodeSource = {
  path: string;
  scope: "arch-domains" | "arch-model" | "architecture" | "roadmap" | "apps" | "packages";
};

export type GraphNode = {
  id: GraphNodeId;
  type: GraphNodeType;
  title: string;
  description?: string;
  tags?: string[];
  views: GraphViewMode[];
  source: GraphNodeSource;
  metadata: Record<string, string | number | boolean | null | string[]>;
};

export type GraphEdge = {
  id: GraphEdgeId;
  type: GraphEdgeType;
  source: GraphNodeId;
  target: GraphNodeId;
  authority: GraphEdgeAuthority;
  confidence?: number;
  evidence?: string[];
  metadata?: Record<string, string | number | boolean | null | string[]>;
};

export type GraphDataset = {
  schemaVersion: typeof GRAPH_SCHEMA_VERSION;
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphValidationIssue = {
  ruleId: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type GraphValidationResult = {
  valid: boolean;
  errors: GraphValidationIssue[];
  warnings: GraphValidationIssue[];
};

export const VIEW_NODE_TYPES: Record<GraphViewMode, GraphNodeType[]> = {
  "architecture-map": ["arch_folder", "domain_doc", "architecture_doc", "architecture_model"],
  tasks: ["roadmap_folder", "roadmap_epic", "roadmap_story", "roadmap_task"],
  project: ["project_folder", "app", "package", "module", "component"],
};

export const EDGE_TYPE_RULES: Record<
  GraphEdgeType,
  {
    from: GraphNodeType[];
    to: GraphNodeType[];
  }
> = {
  references: {
    from: [
      "roadmap_task",
      "roadmap_story",
      "roadmap_epic",
      "roadmap_folder",
      "architecture_doc",
      "architecture_model",
      "arch_folder",
    ],
    to: ["domain_doc", "architecture_doc", "architecture_model"],
  },
  depends_on: {
    from: ["project_folder", "app", "package", "module", "component"],
    to: ["project_folder", "app", "package", "module", "component"],
  },
  implements: {
    from: ["project_folder", "app", "package", "module", "component"],
    to: [
      "roadmap_folder",
      "roadmap_task",
      "roadmap_story",
      "roadmap_epic",
      "architecture_model",
      "architecture_doc",
      "arch_folder",
    ],
  },
  owned_by: {
    from: ["component", "module", "package", "app", "project_folder"],
    to: ["project_folder", "app", "package", "module"],
  },
  contains: {
    from: [
      "arch_folder",
      "roadmap_folder",
      "project_folder",
      "app",
      "package",
      "module",
      "roadmap_epic",
      "roadmap_story",
    ],
    to: [
      "arch_folder",
      "domain_doc",
      "architecture_doc",
      "architecture_model",
      "roadmap_folder",
      "roadmap_epic",
      "roadmap_story",
      "roadmap_task",
      "project_folder",
      "app",
      "package",
      "module",
      "component",
    ],
  },
  uses: {
    from: ["project_folder", "component", "module", "app", "package", "roadmap_task"],
    to: [
      "project_folder",
      "component",
      "module",
      "package",
      "architecture_model",
      "architecture_doc",
      "arch_folder",
    ],
  },
  documents: {
    from: ["arch_folder", "domain_doc", "architecture_doc", "architecture_model"],
    to: [
      "project_folder",
      "app",
      "package",
      "module",
      "component",
      "roadmap_folder",
      "roadmap_task",
      "roadmap_story",
      "roadmap_epic",
    ],
  },
};

export const NODE_ID_PATTERN = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*(?::[a-z0-9._/:-]+)?$/;

export const GRAPH_VALIDATION_RULES = [
  {
    id: "schema-version",
    severity: "error",
    description: `schemaVersion must equal ${GRAPH_SCHEMA_VERSION}.`,
  },
  {
    id: "node-id-format",
    severity: "error",
    description: "Every node ID must follow namespaced format <scope>:<kind>[:<path-or-id>].",
  },
  {
    id: "unique-node-id",
    severity: "error",
    description: "Node IDs must be globally unique.",
  },
  {
    id: "node-view-membership",
    severity: "error",
    description: "A node must appear in at least one view and use valid node types for each view.",
  },
  {
    id: "edge-endpoint-exists",
    severity: "error",
    description: "Every edge source and target must reference an existing node.",
  },
  {
    id: "edge-type-compatibility",
    severity: "error",
    description: "Edge type must be valid for source and target node types.",
  },
  {
    id: "duplicate-edge",
    severity: "warning",
    description: "Duplicate edges (same type/source/target) should be deduplicated.",
  },
  {
    id: "inferred-confidence",
    severity: "warning",
    description: "Inferred edges should include a confidence score between 0 and 1.",
  },
  {
    id: "source-path-exists",
    severity: "warning",
    description: "Node source paths should be present and non-empty.",
  },
] as const;

function pushIssue(
  output: GraphValidationResult,
  issue: GraphValidationIssue,
) {
  if (issue.severity === "error") output.errors.push(issue);
  else output.warnings.push(issue);
}

function hasNonEmptyString(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateGraphDataset(dataset: GraphDataset): GraphValidationResult {
  const result: GraphValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  if (dataset.schemaVersion !== GRAPH_SCHEMA_VERSION) {
    pushIssue(result, {
      ruleId: "schema-version",
      severity: "error",
      message: `Expected schemaVersion=${GRAPH_SCHEMA_VERSION}, received ${dataset.schemaVersion}.`,
    });
  }

  const nodesById = new Map<string, GraphNode>();

  for (const node of dataset.nodes) {
    if (!NODE_ID_PATTERN.test(node.id)) {
      pushIssue(result, {
        ruleId: "node-id-format",
        severity: "error",
        message: `Invalid node id format: ${node.id}`,
        nodeId: node.id,
      });
    }

    if (nodesById.has(node.id)) {
      pushIssue(result, {
        ruleId: "unique-node-id",
        severity: "error",
        message: `Duplicate node id: ${node.id}`,
        nodeId: node.id,
      });
    } else {
      nodesById.set(node.id, node);
    }

    if (!Array.isArray(node.views) || node.views.length === 0) {
      pushIssue(result, {
        ruleId: "node-view-membership",
        severity: "error",
        message: `Node ${node.id} must belong to at least one view.`,
        nodeId: node.id,
      });
    } else {
      for (const view of node.views) {
        const allowedTypes = VIEW_NODE_TYPES[view];
        if (!allowedTypes.includes(node.type)) {
          pushIssue(result, {
            ruleId: "node-view-membership",
            severity: "error",
            message: `Node ${node.id} has type ${node.type} which is invalid for view ${view}.`,
            nodeId: node.id,
          });
        }
      }
    }

    if (!hasNonEmptyString(node.source.path)) {
      pushIssue(result, {
        ruleId: "source-path-exists",
        severity: "warning",
        message: `Node ${node.id} is missing source.path.`,
        nodeId: node.id,
      });
    }
  }

  const seenEdgeSignatures = new Map<string, string>();

  for (const edge of dataset.edges) {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);

    if (!sourceNode || !targetNode) {
      pushIssue(result, {
        ruleId: "edge-endpoint-exists",
        severity: "error",
        message: `Edge ${edge.id} references missing endpoint(s): ${edge.source} -> ${edge.target}.`,
        edgeId: edge.id,
      });
      continue;
    }

    const compatibility = EDGE_TYPE_RULES[edge.type];
    const validSource = compatibility.from.includes(sourceNode.type);
    const validTarget = compatibility.to.includes(targetNode.type);

    if (!validSource || !validTarget) {
      pushIssue(result, {
        ruleId: "edge-type-compatibility",
        severity: "error",
        message: `Edge ${edge.id} type ${edge.type} is not compatible with ${sourceNode.type} -> ${targetNode.type}.`,
        edgeId: edge.id,
      });
    }

    const signature = `${edge.type}|${edge.source}|${edge.target}`;
    const existingId = seenEdgeSignatures.get(signature);
    if (existingId) {
      pushIssue(result, {
        ruleId: "duplicate-edge",
        severity: "warning",
        message: `Edge ${edge.id} duplicates ${existingId} (${signature}).`,
        edgeId: edge.id,
      });
    } else {
      seenEdgeSignatures.set(signature, edge.id);
    }

    if (edge.authority === "inferred") {
      const confidence = edge.confidence;
      if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
        pushIssue(result, {
          ruleId: "inferred-confidence",
          severity: "warning",
          message: `Inferred edge ${edge.id} should include confidence in [0,1].`,
          edgeId: edge.id,
        });
      }
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

export type GraphSelectionDirection = "upstream" | "downstream" | "both";

export type GraphViewBehaviorContract = {
  view: GraphViewMode;
  defaultEdgeVisibility: "none" | "all" | "selection-only";
  defaultHopDepth: number;
  allowedHopDepths: number[];
  carriesSelectionAcrossViews: boolean;
  supportsExternalDependencies: boolean;
};

export const GRAPH_VIEW_BEHAVIOR: Record<GraphViewMode, GraphViewBehaviorContract> = {
  "architecture-map": {
    view: "architecture-map",
    defaultEdgeVisibility: "none",
    defaultHopDepth: 0,
    allowedHopDepths: [0, 1],
    carriesSelectionAcrossViews: true,
    supportsExternalDependencies: false,
  },
  tasks: {
    view: "tasks",
    defaultEdgeVisibility: "selection-only",
    defaultHopDepth: 1,
    allowedHopDepths: [1, 2],
    carriesSelectionAcrossViews: true,
    supportsExternalDependencies: false,
  },
  project: {
    view: "project",
    defaultEdgeVisibility: "selection-only",
    defaultHopDepth: 1,
    allowedHopDepths: [1, 2, 3],
    carriesSelectionAcrossViews: true,
    supportsExternalDependencies: true,
  },
};
