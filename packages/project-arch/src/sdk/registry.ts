import * as tasks from "./tasks";
import * as init from "./init";
import * as phases from "./phases";
import * as milestones from "./milestones";
import * as decisions from "./decisions";
import * as graph from "./graph";
import * as check from "./check";
import * as next from "./next";
import * as lint from "./lint";
import * as report from "./report";
import * as docs from "./docs";
import * as agents from "./agents";

export const registry = {
  init,
  tasks,
  phases,
  milestones,
  decisions,
  graph,
  check,
  next,
  lint,
  report,
  docs,
  agents,
};
