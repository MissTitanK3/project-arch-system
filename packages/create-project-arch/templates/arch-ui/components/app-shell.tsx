"use client";

import { MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "./error-boundary";
import { InspectorPanel } from "./inspector";
import { InspectorProvider } from "./inspector-context";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useWorkspace, WorkspaceProvider } from "./workspace-context";

function AppShellContent({ children }: { children: ReactNode }) {
  const collapsedLeftWidth = 56;
  const collapsedRightWidth = 120;
  const minMainWidth = 420;
  const minExpandedLeftWidth = 220;
  const minExpandedRightWidth = 320;
  const resizerWidth = 4;
  const {
    leftCollapsed,
    rightCollapsed,
    leftWidth,
    rightWidth,
    setLeftCollapsed,
    setRightCollapsed,
    setLeftWidth,
    setRightWidth,
    resetLayout,
  } = useWorkspace();
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        setLeftCollapsed(!leftCollapsed);
        return;
      }
      if (key === "i") {
        event.preventDefault();
        setRightCollapsed(!rightCollapsed);
        return;
      }
      if (key === "0") {
        event.preventDefault();
        resetLayout();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [leftCollapsed, resetLayout, rightCollapsed, setLeftCollapsed, setRightCollapsed]);

  const shellStyle = useMemo(() => {
    const leftResizer = leftCollapsed ? 0 : resizerWidth;
    const rightResizer = rightCollapsed ? 0 : resizerWidth;
    let effectiveLeft = leftCollapsed ? collapsedLeftWidth : leftWidth;
    let effectiveRight = rightCollapsed ? collapsedRightWidth : rightWidth;

    if (viewportWidth > 0) {
      const maxSideBudget = Math.max(0, viewportWidth - minMainWidth - leftResizer - rightResizer);
      let overflow = effectiveLeft + effectiveRight - maxSideBudget;

      if (overflow > 0 && !rightCollapsed) {
        const reducible = Math.max(0, effectiveRight - minExpandedRightWidth);
        const reduction = Math.min(reducible, overflow);
        effectiveRight -= reduction;
        overflow -= reduction;
      }

      if (overflow > 0 && !leftCollapsed) {
        const reducible = Math.max(0, effectiveLeft - minExpandedLeftWidth);
        const reduction = Math.min(reducible, overflow);
        effectiveLeft -= reduction;
      }
    }

    return {
      gridTemplateColumns: `${effectiveLeft}px ${leftResizer}px minmax(0, 1fr) ${rightResizer}px ${effectiveRight}px`,
    };
  }, [leftCollapsed, leftWidth, rightCollapsed, rightWidth, viewportWidth]);

  function startResize(side: "left" | "right", event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftWidth : rightWidth;
    function onMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientX - startX;
      if (side === "left") {
        setLeftWidth(startWidth + delta);
      } else {
        setRightWidth(startWidth - delta);
      }
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div className="grid h-dvh min-h-0 overflow-hidden" style={shellStyle}>
      <Sidebar />

      <div
        className={
          leftCollapsed
            ? "w-0 pointer-events-none"
            : "w-1 cursor-col-resize bg-transparent hover:bg-slate-600"
        }
        onMouseDown={(event) => {
          if (!leftCollapsed) startResize("left", event);
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />

      <div className="grid min-h-0 min-w-0 grid-rows-[64px_1fr]">
        <Topbar projectName="testProjectV2" />
        <main className="min-h-0 overflow-auto p-4">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      <div
        className={
          rightCollapsed
            ? "w-0 pointer-events-none"
            : "w-1 cursor-col-resize bg-transparent hover:bg-slate-600"
        }
        onMouseDown={(event) => {
          if (!rightCollapsed) startResize("right", event);
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector"
      />

      <ErrorBoundary>
        <InspectorPanel />
      </ErrorBoundary>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <InspectorProvider>
        <AppShellContent>{children}</AppShellContent>
      </InspectorProvider>
    </WorkspaceProvider>
  );
}
