import { HTMLAttributes } from "react";
import { cn } from "./utils";

export function Sheet({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-sheet", className)} {...props} />;
}
