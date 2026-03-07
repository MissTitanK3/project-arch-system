import { HTMLAttributes } from "react";
import { cn } from "./utils";

export function Dialog({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-dialog", className)} {...props} />;
}
