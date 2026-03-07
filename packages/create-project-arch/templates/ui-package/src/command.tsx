import { HTMLAttributes, InputHTMLAttributes } from "react";
import { cn } from "./utils";

export function Command({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-command", className)} {...props} />;
}

export function CommandInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("ui-input", className)} {...props} />;
}

export function CommandList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-command-list", className)} {...props} />;
}

export function CommandItem({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn("ui-command-item", className)} {...props} />;
}
