import { HTMLAttributes } from "react";
import { cn } from "./utils";

export function ScrollArea({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-scroll-area", className)} {...props} />;
}
