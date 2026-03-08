"use client";

import { Badge } from "@repo/ui/badge";
import { Handle, NodeProps, NodeToolbar, Position, useStore } from "reactflow";
import type { ArchNodeData } from "./graph-types";

export function ArchNode({ data, selected }: NodeProps<ArchNodeData>) {
  const zoom = useStore((state) => state.transform[2]);
  const detailLevel = zoom < 0.85 ? 0 : zoom < 1.1 ? 1 : 2;
  const titleStyle =
    detailLevel === 0
      ? {
          whiteSpace: "nowrap" as const,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }
      : detailLevel === 1
        ? {
            display: "-webkit-box",
            WebkitBoxOrient: "vertical" as const,
            WebkitLineClamp: 2,
            overflow: "hidden",
            lineHeight: "1.2",
          }
        : {
            whiteSpace: "normal" as const,
            lineHeight: "1.25",
          };
  const toneClass =
    data.tone === "domain"
      ? "bg-blue-900/90"
      : data.tone === "decision"
        ? "bg-violet-900/90"
        : data.tone === "phase"
          ? "bg-green-900/90"
          : data.tone === "task"
            ? "bg-amber-900/90"
            : "bg-slate-700";

  const metadataPreviewCount = detailLevel === 0 ? 1 : detailLevel === 1 ? 2 : 4;

  return (
    <div
      className={`w-[280px] rounded-xl border border-slate-600 px-2.5 py-2 text-slate-100 shadow ${toneClass}`}
    >
      <NodeToolbar isVisible={selected} position={Position.Top}>
        <div className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-950 px-2 py-1">
          <Badge variant="secondary">{data.kind}</Badge>
          <span className="text-xs text-slate-400">drag, connect</span>
        </div>
      </NodeToolbar>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border !border-slate-900 !bg-slate-200"
      />
      <div className="mb-1 text-[13px] font-semibold" style={titleStyle}>
        {data.label}
      </div>
      {detailLevel > 0 && data.subtitle ? (
        <div className="mb-1.5 text-xs leading-tight text-slate-300">{data.subtitle}</div>
      ) : null}
      {data.metadata.length > 0 ? (
        <div
          className="text-[11px] leading-tight text-slate-400"
          style={{
            whiteSpace: detailLevel === 2 ? ("normal" as const) : ("nowrap" as const),
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {data.metadata
            .slice(0, metadataPreviewCount)
            .map((item) => `${item.label}: ${item.value}`)
            .join(" · ")}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border !border-slate-900 !bg-slate-200"
      />
    </div>
  );
}

export const nodeTypes = { archNode: ArchNode };
