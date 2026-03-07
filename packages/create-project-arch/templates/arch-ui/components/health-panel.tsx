"use client";

import { Accordion, AccordionItem } from "@repo/ui/accordion";
import { Badge } from "@repo/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { CheckData } from "../lib/types";

type HealthPanelProps = {
  health: CheckData;
  onInspect: (label: string, status: string) => void;
};

const checks = ["Domains", "Modules", "Imports", "Tasks", "Decisions", "Graph Schema"] as const;

export function HealthPanel({ health, onInspect }: HealthPanelProps) {
  const status = health.ok ? (health.warnings.length > 0 ? "Warning" : "OK") : "Drift";

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {checks.map((check) => (
        <Card key={check} className="cursor-pointer" onClick={() => onInspect(check, status)}>
          <CardHeader>
            <CardTitle>{check}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant={status === "OK" ? "success" : status === "Warning" ? "warning" : "danger"}
            >
              Status: {status}
            </Badge>
          </CardContent>
        </Card>
      ))}

      {health.warnings.length > 0 ? (
        <Accordion>
          <AccordionItem>
            <summary>Warnings ({health.warnings.length})</summary>
            <div className="mt-1 grid gap-1.5">
              {health.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}
