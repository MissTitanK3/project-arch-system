"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";

type InspectorType = "domain" | "decision" | "phase" | "milestone" | "task" | "file" | "health";

export type InspectorSelection = {
  type: InspectorType;
  title: string;
  id?: string;
  metadata?: Array<{ label: string; value: string }>;
  links?: string[];
  markdown?: string;
};

type InspectorContextValue = {
  selection: InspectorSelection | null;
  setSelection: (selection: InspectorSelection | null) => void;
};

const InspectorContext = createContext<InspectorContextValue | null>(null);

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<InspectorSelection | null>(null);
  const value = useMemo(() => ({ selection, setSelection }), [selection]);
  return <InspectorContext.Provider value={value}>{children}</InspectorContext.Provider>;
}

export function useInspector() {
  const value = useContext(InspectorContext);
  if (!value) {
    throw new Error("useInspector must be used within InspectorProvider");
  }
  return value;
}
