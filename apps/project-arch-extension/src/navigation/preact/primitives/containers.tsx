import type { ComponentChildren, JSX } from "preact";

type ClassNameToken = string | false | null | undefined;

export function joinClassNames(...tokens: ClassNameToken[]): string {
  return tokens
    .map((token) => (typeof token === "string" ? token.trim() : ""))
    .filter((token) => token.length > 0)
    .join(" ");
}

interface SurfaceProps {
  readonly children: ComponentChildren;
  readonly className?: string;
}

export function Surface(props: SurfaceProps) {
  return <main class={joinClassNames("pa-surface", props.className)}>{props.children}</main>;
}

interface SurfaceSectionProps {
  readonly title: string;
  readonly titleAction?: ComponentChildren;
  readonly description?: ComponentChildren;
  readonly children?: ComponentChildren;
  readonly className?: string;
  readonly headingLevel?: "h2" | "h3" | "h4";
}

export function SurfaceSection(props: SurfaceSectionProps) {
  const HeadingTag = (props.headingLevel ?? "h3") as keyof JSX.IntrinsicElements;

  return (
    <section class={joinClassNames("pa-section", props.className)}>
      <div class="pa-section-header">
        <HeadingTag class="pa-section-title">{props.title}</HeadingTag>
        {props.titleAction ? <div class="pa-section-header-action">{props.titleAction}</div> : null}
      </div>
      {props.description ? <p class="pa-section-description">{props.description}</p> : null}
      {props.children}
    </section>
  );
}
