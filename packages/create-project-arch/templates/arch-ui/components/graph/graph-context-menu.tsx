"use client";

import type { Node, ReactFlowInstance } from "reactflow";
import type { ArchNodeData, ContextMenuState, InspectorNode } from "./graph-types";
import { buildNodeMarkdown, parseNodeId } from "./graph-types";

type GraphContextMenuProps = {
  contextMenu: ContextMenuState;
  node: Node<ArchNodeData>;
  flowInstance: ReactFlowInstance<ArchNodeData> | null;
  onInspect: (node: InspectorNode) => void;
  onHideNode: (nodeId: string) => void;
  onShowAll: () => void;
  onClose: () => void;
};

export function GraphContextMenu({
  contextMenu,
  node,
  flowInstance,
  onInspect,
  onHideNode,
  onShowAll,
  onClose,
}: GraphContextMenuProps) {
  function inspect() {
    const parsed = parseNodeId(node.id);
    onInspect({
      type: parsed.kind,
      id: parsed.id,
      title: node.data.label,
      metadata: node.data.metadata,
      markdown: buildNodeMarkdown(node),
    });
    onClose();
  }

  return (
    <div
      className="fixed z-[100] grid min-w-40 gap-1 rounded-lg border border-slate-600 bg-slate-950 p-1.5"
      style={{ top: contextMenu.y, left: contextMenu.x }}
    >
      <button
        type="button"
        className="cursor-pointer rounded-md border border-transparent px-2 py-1.5 text-left text-sm hover:border-slate-600 hover:bg-slate-800"
        onClick={inspect}
      >
        Inspect node
      </button>
      <button
        type="button"
        className="cursor-pointer rounded-md border border-transparent px-2 py-1.5 text-left text-sm hover:border-slate-600 hover:bg-slate-800"
        onClick={() => {
          if (flowInstance) {
            flowInstance.fitView({ nodes: [{ id: node.id }], duration: 300 });
          }
          onClose();
        }}
      >
        Center node
      </button>
      <button
        type="button"
        className="cursor-pointer rounded-md border border-transparent px-2 py-1.5 text-left text-sm hover:border-slate-600 hover:bg-slate-800"
        onClick={() => {
          onHideNode(node.id);
          onClose();
        }}
      >
        Hide node
      </button>
      <button
        type="button"
        className="cursor-pointer rounded-md border border-transparent px-2 py-1.5 text-left text-sm hover:border-slate-600 hover:bg-slate-800"
        onClick={() => {
          onShowAll();
          onClose();
        }}
      >
        Show all nodes
      </button>
    </div>
  );
}
