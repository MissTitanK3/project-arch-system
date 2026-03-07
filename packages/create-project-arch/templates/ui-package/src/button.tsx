import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

type ButtonVariant = "default" | "secondary" | "ghost" | "outline";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  appName?: string;
};

const variantClass: Record<ButtonVariant, string> = {
  default: "ui-btn ui-btn-default",
  secondary: "ui-btn ui-btn-secondary",
  ghost: "ui-btn ui-btn-ghost",
  outline: "ui-btn ui-btn-outline",
};

export function Button({
  children,
  className,
  variant = "default",
  appName,
  ...props
}: ButtonProps) {
  void appName;
  return (
    <button className={cn(variantClass[variant], className)} {...props}>
      {children}
    </button>
  );
}
