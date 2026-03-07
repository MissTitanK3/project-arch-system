import { DetailsHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "./utils";

export function Accordion({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-accordion", className)} {...props} />;
}

export function AccordionItem({ className, ...props }: DetailsHTMLAttributes<HTMLDetailsElement>) {
  return <details className={cn("ui-accordion-item", className)} {...props} />;
}
