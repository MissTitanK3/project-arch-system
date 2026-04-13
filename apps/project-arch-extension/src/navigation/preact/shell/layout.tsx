import type { ComponentChildren } from "preact";
import { joinClassNames } from "../primitives";

export type ShellSlot = "header" | "main" | "footer";

interface ShellLayoutProps {
  readonly children: ComponentChildren;
  readonly className?: string;
}

export function ShellLayout(props: ShellLayoutProps) {
  return <div class={joinClassNames("pa-shell-layout", props.className)}>{props.children}</div>;
}

interface ShellRegionProps {
  readonly slot: ShellSlot;
  readonly children: ComponentChildren;
  readonly className?: string;
}

export function ShellRegion(props: ShellRegionProps) {
  return (
    <section
      data-pa-shell-slot={props.slot}
      class={joinClassNames("pa-shell-region", `pa-shell-region-${props.slot}`, props.className)}
    >
      {props.children}
    </section>
  );
}
