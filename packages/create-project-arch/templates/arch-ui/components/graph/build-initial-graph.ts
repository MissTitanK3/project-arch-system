import type { Edge, Node } from "reactflow";
import type { ArchitectureMapData } from "../../lib/types";
import type {
    ArchEdgeData,
    ArchNodeData,
    GraphFilter,
    GraphKind,
    GraphTone,
} from "./graph-types";

function createGraphNode(
    kind: GraphKind,
    id: string,
    x: number,
    y: number,
    label: string,
    tone: GraphTone,
    subtitle?: string,
    metadata: Array<{ label: string; value: string }> = [],
): Node<ArchNodeData> {
    return {
        id: `${kind}:${id}`,
        type: "archNode",
        position: { x, y },
        data: { kind, tone, label, subtitle, metadata },
    };
}

export function buildInitialGraph(
    data: ArchitectureMapData,
    enabledFilters: GraphFilter[],
    hideCompletedTasks = false,
): { nodes: Node<ArchNodeData>[]; edges: Edge[] } {
    const includeDomains = enabledFilters.includes("domains");
    const includeModules = enabledFilters.includes("modules");
    const includeTasks = enabledFilters.includes("tasks");
    const includeDecisions = enabledFilters.includes("decisions");

    const milestoneTaskCount = new Map<string, number>();
    data.edges.milestoneToTask.forEach((edge) => {
        milestoneTaskCount.set(edge.milestone, (milestoneTaskCount.get(edge.milestone) ?? 0) + 1);
    });

    const decisionTaskCount = new Map<string, number>();
    data.edges.taskToDecision.forEach((edge) => {
        decisionTaskCount.set(edge.decision, (decisionTaskCount.get(edge.decision) ?? 0) + 1);
    });

    const moduleTaskCount = new Map<string, number>();
    data.edges.taskToModule.forEach((edge) => {
        moduleTaskCount.set(edge.module, (moduleTaskCount.get(edge.module) ?? 0) + 1);
    });

    const domainDecisionCount = new Map<string, number>();
    data.edges.decisionToDomain.forEach((edge) => {
        domainDecisionCount.set(edge.domain, (domainDecisionCount.get(edge.domain) ?? 0) + 1);
    });

    const nodes: Node<ArchNodeData>[] = [];
    const edges: Edge<ArchEdgeData>[] = [];

    if (includeDomains) {
        data.nodes.domains.forEach((domain, index) => {
            nodes.push(
                createGraphNode(
                    "domain",
                    domain.name,
                    40,
                    40 + index * 140,
                    domain.name,
                    "domain",
                    domain.description,
                    [
                        { label: "Description", value: domain.description ?? "n/a" },
                        { label: "Decisions", value: String(domainDecisionCount.get(domain.name) ?? 0) },
                        { label: "Graph Node", value: `domain:${domain.name}` },
                    ],
                ),
            );
        });
    }

    if (includeDecisions) {
        data.nodes.decisions.forEach((decision, index) => {
            nodes.push(
                createGraphNode(
                    "decision",
                    decision.id,
                    280,
                    40 + index * 140,
                    decision.id,
                    "decision",
                    decision.title,
                    [
                        { label: "Title", value: decision.title ?? decision.id },
                        { label: "Status", value: decision.status ?? "open" },
                        { label: "Linked Tasks", value: String(decisionTaskCount.get(decision.id) ?? 0) },
                        { label: "Graph Node", value: `decision:${decision.id}` },
                    ],
                ),
            );
        });
    }

    const phases = [...new Set(data.nodes.milestones.map((item) => item.phaseId))];
    phases.forEach((phase, index) => {
        const phaseMilestones = data.nodes.milestones.filter(
            (milestone) => milestone.phaseId === phase,
        ).length;
        nodes.push(
            createGraphNode("phase", phase, 520, 40 + index * 140, phase, "phase", undefined, [
                { label: "Milestones", value: String(phaseMilestones) },
                { label: "Graph Node", value: `phase:${phase}` },
            ]),
        );
    });

    data.nodes.milestones.forEach((milestone, index) => {
        nodes.push(
            createGraphNode(
                "milestone",
                milestone.id,
                760,
                40 + index * 140,
                milestone.id,
                "phase",
                milestone.phaseId,
                [
                    { label: "Phase", value: milestone.phaseId },
                    { label: "Milestone", value: milestone.milestoneId },
                    { label: "Tasks", value: String(milestoneTaskCount.get(milestone.id) ?? 0) },
                    { label: "Graph Node", value: `milestone:${milestone.id}` },
                ],
            ),
        );
        edges.push({
            id: `phase-milestone:${milestone.phaseId}-${milestone.id}`,
            source: `phase:${milestone.phaseId}`,
            target: `milestone:${milestone.id}`,
            type: "smoothstep",
            data: { edgeType: "blocking", authority: "authoritative" },
        });
    });

    const visibleTasks = data.nodes.tasks.filter(
        (task) => !(hideCompletedTasks && task.lane === "complete"),
    );

    if (includeTasks) {
        visibleTasks.forEach((task, index) => {
            nodes.push(
                createGraphNode("task", task.id, 1020, 40 + index * 120, task.title, "task", task.id, [
                    { label: "ID", value: task.id },
                    { label: "Milestone", value: task.milestone },
                    { label: "Lane", value: task.lane },
                    { label: "Status", value: task.status },
                    { label: "Domain", value: task.domain ?? "unassigned" },
                    { label: "Graph Node", value: `task:${task.id}` },
                ]),
            );
        });
    }

    if (includeModules) {
        data.nodes.modules.forEach((moduleRef, index) => {
            nodes.push(
                createGraphNode(
                    "file",
                    moduleRef.name,
                    1280,
                    40 + index * 100,
                    moduleRef.name,
                    "file",
                    moduleRef.type,
                    [
                        { label: "Name", value: moduleRef.name },
                        { label: "Type", value: moduleRef.type ?? "module" },
                        { label: "Description", value: moduleRef.description ?? "n/a" },
                        { label: "Linked Tasks", value: String(moduleTaskCount.get(moduleRef.name) ?? 0) },
                        { label: "Graph Node", value: `file:${moduleRef.name}` },
                    ],
                ),
            );
        });
    }

    if (includeTasks) {
        data.edges.milestoneToTask.forEach((edge) => {
            if (!visibleTasks.some((task) => task.id === edge.task)) return;
            edges.push({
                id: `milestone-task:${edge.milestone}-${edge.task}`,
                source: `milestone:${edge.milestone}`,
                target: `task:${edge.task}`,
                type: "smoothstep",
                data: { edgeType: "blocking", authority: "authoritative" },
            });
        });
    }

    if (includeDecisions && includeDomains) {
        data.edges.decisionToDomain.forEach((edge) => {
            edges.push({
                id: `decision-domain:${edge.decision}-${edge.domain}`,
                source: `decision:${edge.decision}`,
                target: `domain:${edge.domain}`,
                type: "smoothstep",
                data: { edgeType: "data-flow", authority: "authoritative" },
            });
        });
    }

    if (includeTasks && includeModules) {
        data.edges.taskToModule.forEach((edge) => {
            if (!visibleTasks.some((task) => task.id === edge.task)) return;
            edges.push({
                id: `task-module:${edge.task}-${edge.module}`,
                source: `task:${edge.task}`,
                target: `file:${edge.module}`,
                type: "smoothstep",
                data: { edgeType: "dependency", authority: "authoritative" },
            });
        });
    }

    if (includeTasks && includeDecisions) {
        data.edges.taskToDecision.forEach((edge) => {
            if (!visibleTasks.some((task) => task.id === edge.task)) return;
            edges.push({
                id: `task-decision:${edge.task}-${edge.decision}`,
                source: `task:${edge.task}`,
                target: `decision:${edge.decision}`,
                type: "smoothstep",
                data: { edgeType: "blocking", authority: "authoritative" },
            });
        });
    }

    edges.forEach((edge) => {
        if (!edge.data) {
            edge.data = { edgeType: "dependency", authority: "authoritative" };
        }
    });

    return { nodes, edges };
}
