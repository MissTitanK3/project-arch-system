"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { useEffect, useState } from "react";
import { HealthPanel } from "../../components/health-panel";
import { useInspector } from "../../components/inspector-context";
import { getHealth } from "../../lib/api";
import { CheckData } from "../../lib/types";

export default function HealthPage() {
  const [data, setData] = useState<CheckData | null>(null);
  const { setSelection } = useInspector();

  useEffect(() => {
    void getHealth().then(setData);
  }, []);

  return (
    <div className="grid gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Architecture Health</CardTitle>
        </CardHeader>
        <CardContent>
          {data ? (
            <HealthPanel
              health={data}
              onInspect={(label, status) =>
                setSelection({
                  type: "health",
                  title: label,
                  metadata: [
                    { label: "Status", value: status },
                    { label: "Errors", value: String(data.errors.length) },
                    { label: "Warnings", value: String(data.warnings.length) },
                  ],
                  links: [...data.errors, ...data.warnings],
                })
              }
            />
          ) : (
            <p>Loading health checks...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
