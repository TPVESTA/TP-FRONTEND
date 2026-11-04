import type { Metadata } from "next";
import BackofficeShell from "@/components/backoffice-shell";

export const metadata: Metadata = { title: "Backoffice" };

export default function BackofficeLayout({ children }: { children: React.ReactNode }) {
  return <BackofficeShell>{children}</BackofficeShell>;
}
