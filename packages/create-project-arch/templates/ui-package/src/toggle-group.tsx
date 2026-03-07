import { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "./utils";

export function ToggleGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-toggle-group", className)} {...props} />;
}

export function ToggleGroupItem({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn("ui-toggle-item", className)} {...props} />;
}
