import { HTMLAttributes } from "react";
import { cn } from "./utils";

export function DropdownMenu({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-dropdown", className)} {...props} />;
}

export function DropdownMenuItem({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("ui-dropdown-item", className)} {...props} />;
}
