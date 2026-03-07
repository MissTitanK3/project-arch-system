"use client";

import { Panel } from "reactflow";
import type { Node } from "reactflow";
import type { ArchNodeData, InspectorNode } from "./graph-types";
import { buildNodeMarkdown, parseNodeId } from "./graph-types";
import { MarkdownViewer } from "../markdown-viewer";

type GraphDocPanelProps = {
  node: Node<ArchNodeData>;
  markdown: string;
  onInspect: (node: InspectorNode) => void;
  onClose: () => void;
};

export function GraphDocPanel({ node, markdown, onInspect, onClose }: GraphDocPanelProps) {
  function openDetail() {
    const parsed = parseNodeId(node.id);
    onInspect({
      type: parsed.kind,
      id: parsed.id,
      title: node.data.label,
      metadata: node.data.metadata,
      markdown: buildNodeMarkdown(node),
    });
  }

  return (
    <Panel position="top-right">
      <div className="graph-doc-panel">
        <div className="row-between">
          <strong>Node Notes</strong>
          <div className="row-wrap">
            <button className="ui-btn ui-btn-outline" type="button" onClick={openDetail}>
              Open Detail
            </button>
            <button className="ui-btn ui-btn-ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <MarkdownViewer markdown={markdown} />
      </div>
    </Panel>
  );
}
