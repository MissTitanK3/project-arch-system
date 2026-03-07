import { HTMLAttributes } from "react";
import { cn } from "./utils";

export function Code({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <code className={cn("ui-code", className)} {...props} />;
}
