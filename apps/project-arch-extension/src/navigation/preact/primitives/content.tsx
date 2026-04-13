import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { joinClassNames } from "./containers";

interface EmptyStateProps {
  readonly children: ComponentChildren;
  readonly className?: string;
}

export function EmptyState(props: EmptyStateProps) {
  return <p class={joinClassNames("pa-empty-state", props.className)}>{props.children}</p>;
}

interface CodeTextProps {
  readonly children: ComponentChildren;
}

export function CodeText(props: CodeTextProps) {
  return <code class="pa-code-text">{props.children}</code>;
}

interface ActionRowProps {
  readonly children: ComponentChildren;
  readonly className?: string;
}

export function ActionRow(props: ActionRowProps) {
  return <p class={joinClassNames("pa-action-row", props.className)}>{props.children}</p>;
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "icon";

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ComponentChildren;
  readonly variant?: ButtonVariant;
  readonly className?: string;
  readonly fullWidth?: boolean;
}

export function Button(props: ButtonProps) {
  const {
    children,
    variant = "secondary",
    className,
    fullWidth = false,
    class: classToken,
    ...buttonProps
  } = props;

  const resolvedClassToken = typeof classToken === "string" ? classToken : undefined;

  return (
    <button
      {...buttonProps}
      class={joinClassNames(
        "pa-button",
        `pa-button-${variant}`,
        fullWidth ? "pa-button-full-width" : undefined,
        resolvedClassToken,
        className,
      )}
    >
      {children}
    </button>
  );
}

interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  readonly className?: string;
}

export function Input(props: InputProps) {
  const {
    className,
    class: classToken,
    ...inputProps
  } = props;

  const resolvedClassToken = typeof classToken === "string" ? classToken : undefined;

  return (
    <input
      {...inputProps}
      class={joinClassNames("pa-input", resolvedClassToken, className)}
    />
  );
}

interface SelectProps extends JSX.SelectHTMLAttributes<HTMLSelectElement> {
  readonly children: ComponentChildren;
  readonly className?: string;
}

export function Select(props: SelectProps) {
  const {
    children,
    className,
    class: classToken,
    ...selectProps
  } = props;

  const resolvedClassToken = typeof classToken === "string" ? classToken : undefined;

  return (
    <select
      {...selectProps}
      class={joinClassNames("pa-select", resolvedClassToken, className)}
    >
      {children}
    </select>
  );
}

export interface BreadcrumbItem {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
}

interface BreadcrumbTrailProps {
  readonly items: readonly BreadcrumbItem[];
  readonly className?: string;
  readonly ariaLabel?: string;
}

export function BreadcrumbTrail(props: BreadcrumbTrailProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const lastItemId = props.items[props.items.length - 1]?.id;

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) {
      return;
    }

    rail.scrollLeft = rail.scrollWidth;
  }, [props.items.length, lastItemId]);

  return (
    <div
      ref={railRef}
      class={joinClassNames("pa-breadcrumb-trail", props.className)}
      role="navigation"
      aria-label={props.ariaLabel ?? "Breadcrumb navigation"}
    >
      {props.items.map((item, index) => (
        <span key={item.id} class="pa-breadcrumb-item">
          {index > 0 ? (
            <span class="pa-breadcrumb-separator" aria-hidden="true">
              /
            </span>
          ) : null}
          <Button type="button" variant="ghost" class="pa-breadcrumb-button" onClick={item.onSelect}>
            <span class="pa-code-text">{item.label}</span>
          </Button>
        </span>
      ))}
    </div>
  );
}
