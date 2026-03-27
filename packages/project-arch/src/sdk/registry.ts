import * as tasks from "./tasks";
import * as init from "./init";
import * as phases from "./phases";
import * as milestones from "./milestones";
import * as decisions from "./decisions";
import * as graph from "./graph";
import * as check from "./check";
import * as context from "./context";
import * as learn from "./learn";
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
  context,
  learn,
  next,
  lint,
  report,
  docs,
  agents,
};
