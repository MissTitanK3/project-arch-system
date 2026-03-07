import { HTMLAttributes } from "react";
import { cn } from "./utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "secondary";

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span className={cn("ui-badge", `ui-badge-${variant}`, className)} {...props} />;
}
