"use client";

import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@repo/ui/command";
import { Input } from "@repo/ui/input";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getHealth, searchWorkspace } from "../lib/api";
import { SearchResultItem } from "../lib/types";
import { useInspector } from "./inspector-context";
import { useWorkspace } from "./workspace-context";

type HealthState = "OK" | "Warning" | "Drift";

const staticCommands = [
  { id: "architecture", label: "Open Architecture Map", route: "/work?view=architecture" },
  { id: "work", label: "Open Tasks View", route: "/work?view=tasks" },
  { id: "project", label: "Open Project View", route: "/work?view=project" },
  { id: "health", label: "Open Health", route: "/health" },
  { id: "search-task", label: "Open Tasks", route: "/work?view=tasks" },
  { id: "trace-file", label: "Trace File", route: "/health?view=trace" },
  { id: "open-domain", label: "Open Domain View", route: "/work?view=architecture" },
] as const;

export function Topbar({ projectName }: { projectName: string }) {
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [health, setHealth] = useState<HealthState>("OK");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { selection } = useInspector();
  const { splitPane, setSplitPane, rightCollapsed, setRightCollapsed, resetLayout } =
    useWorkspace();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void searchWorkspace(query)
        .then((result) => setSearchResults(result.results))
        .catch(() => setSearchResults([]));
    }, 140);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    void getHealth()
      .then((result) => {
        if (!result.ok) {
          setHealth("Drift");
          return;
        }
        if (result.warnings.length > 0) {
          setHealth("Warning");
          return;
        }
        setHealth("OK");
      })
      .catch(() => setHealth("Drift"));
  }, []);

  const filteredCommands = useMemo(() => {
    if (!query) return staticCommands;
    const q = query.toLowerCase();
    return staticCommands.filter((entry) => entry.label.toLowerCase().includes(q));
  }, [query]);

  const breadcrumbs = useMemo(() => {
    const pathLabel =
      pathname === "/work" ? "Work Graph" : pathname === "/health" ? "Health" : "Workspace";
    const view = searchParams.get("view");
    const secondary =
      view === "docs"
        ? "Repository Docs"
        : view === "decisions"
          ? "Decisions"
          : view === "architecture"
            ? "Architecture"
            : view === "project"
              ? "Project"
              : view === "tasks"
                ? "Tasks"
                : "Map";

    const parts = [pathLabel];
    if (pathname === "/work") parts.push(secondary);
    if (selection?.title) parts.push(selection.title);
    return parts.join(" > ");
  }, [pathname, searchParams, selection?.title]);

  return (
    <header className="grid items-center gap-3 border-b border-slate-800 px-4 py-2 xl:grid-cols-[auto_1fr_auto]">
      <div>
        <p className="m-0 text-[11px] uppercase tracking-[0.1em] text-slate-400">Project</p>
        <p className="m-0 text-base font-semibold">{projectName}</p>
        <p className="mt-0.5 text-xs leading-tight text-slate-400">{breadcrumbs}</p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Search task, file, decision..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setPaletteOpen(true)}
        />
        <Button type="button" variant="outline" onClick={() => setPaletteOpen((prev) => !prev)}>
          ⌘K
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setSplitPane(!splitPane)}>
          {splitPane ? "Single Pane" : "Split Pane"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setRightCollapsed(!rightCollapsed)}>
          {rightCollapsed ? "Show Inspector" : "Hide Inspector"}
        </Button>
        <Button type="button" variant="ghost" onClick={resetLayout}>
          Reset Layout
        </Button>
        <Badge variant={health === "OK" ? "success" : health === "Warning" ? "warning" : "danger"}>
          Health: {health}
        </Badge>
      </div>

      {paletteOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-start bg-black/60 pt-[14vh]"
          role="presentation"
          onClick={() => setPaletteOpen(false)}
        >
          <Command
            className="w-[min(680px,90vw)] rounded-2xl border border-slate-600 bg-slate-950 p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <CommandInput
              placeholder="Type a command"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
            <CommandList>
              {searchResults.map((entry) => (
                <CommandItem
                  key={entry.id}
                  onClick={() => {
                    router.push(entry.route);
                    setPaletteOpen(false);
                  }}
                >
                  {entry.kind}: {entry.title}
                </CommandItem>
              ))}
              {filteredCommands.map((entry) => (
                <CommandItem
                  key={entry.id}
                  onClick={() => {
                    router.push(entry.route);
                    setPaletteOpen(false);
                  }}
                >
                  {entry.label}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </div>
      ) : null}
    </header>
  );
}
