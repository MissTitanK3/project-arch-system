import { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "./utils";

export function Tabs({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-tabs", className)} {...props} />;
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-tabs-list", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn("ui-tabs-trigger", className)} {...props} />;
}
