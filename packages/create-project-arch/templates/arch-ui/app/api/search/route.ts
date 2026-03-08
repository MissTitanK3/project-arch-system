import { NextRequest, NextResponse } from "next/server";
import { readArchitectureMap } from "../../../lib/arch-model";
import { getProjectRoot } from "../../../lib/project-root";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const root = getProjectRoot();
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const lowerQuery = query.toLowerCase();
  const map = await readArchitectureMap(root);

  const results = [
    ...map.nodes.tasks.map((task) => ({
      id: `task:${task.id}`,
      kind: "task" as const,
      title: task.title,
      subtitle: task.id,
      route: "/work",
    })),
    ...map.nodes.decisions.map((decision) => ({
      id: `decision:${decision.id}`,
      kind: "decision" as const,
      title: decision.title ?? decision.id,
      subtitle: decision.id,
      route: "/architecture?view=decisions",
    })),
    ...map.nodes.domains.map((domain) => ({
      id: `domain:${domain.name}`,
      kind: "domain" as const,
      title: domain.name,
      subtitle: domain.description,
      route: "/architecture",
    })),
    ...map.nodes.modules.map((moduleRef) => ({
      id: `module:${moduleRef.name}`,
      kind: "module" as const,
      title: moduleRef.name,
      subtitle: moduleRef.type ?? "module",
      route: "/architecture",
    })),
  ].filter((item) => {
    if (!lowerQuery) return true;
    return (
      item.title.toLowerCase().includes(lowerQuery) ||
      item.subtitle?.toLowerCase().includes(lowerQuery) ||
      item.kind.toLowerCase().includes(lowerQuery)
    );
  });

  return NextResponse.json({
    query,
    results: results.slice(0, 30),
  });
}
