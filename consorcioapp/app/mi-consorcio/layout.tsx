import type { Metadata } from "next";
import BackofficeShell from "@/components/backoffice-shell";

export const metadata: Metadata = { title: "Mi consorcio" };
export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  return <BackofficeShell resident>{children}</BackofficeShell>;
}
