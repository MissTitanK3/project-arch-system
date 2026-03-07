import { SelectHTMLAttributes } from "react";
import { cn } from "./utils";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("ui-input", className)} {...props} />;
}
