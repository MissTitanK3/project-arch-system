import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "../components/app-shell";

export const metadata = {
  title: "Architecture Control Surface",
  description: "Architecture graph and traceability UI",
};
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="h-dvh overflow-hidden">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
