import { HTMLAttributes } from "react";
import { cn } from "./utils";

export function NavigationMenu({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <nav className={cn("ui-nav-menu", className)} {...props} />;
}
