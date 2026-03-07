"use client";

import { Badge } from "@repo/ui/badge";
import { Code } from "@repo/ui/code";
import { DropdownMenu, DropdownMenuItem } from "@repo/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { TaskNode } from "../lib/types";

function statusVariant(status: string): "default" | "secondary" | "success" {
  if (status === "complete") return "success";
  if (status === "discovered") return "secondary";
  return "default";
}

type WorkTableProps = {
  tasks: TaskNode[];
  onSelectTask: (task: TaskNode) => void;
};

export function WorkTable({ tasks, onSelectTask }: WorkTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Domain</TableHead>
          <TableHead>Files</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow
            className="cursor-pointer"
            key={task.id}
            onClick={() => onSelectTask(task)}
          >
            <TableCell>
              <Code>{task.id}</Code>
            </TableCell>
            <TableCell>{task.title}</TableCell>
            <TableCell>
              <Badge variant={statusVariant(task.lane)}>{task.lane}</Badge>
            </TableCell>
            <TableCell>{task.domain ?? "foundation"}</TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuItem>Open Trace</DropdownMenuItem>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
