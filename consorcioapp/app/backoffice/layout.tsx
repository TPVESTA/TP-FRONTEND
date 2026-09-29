import BackofficeShell from "@/components/backoffice-shell";

export default function BackofficeLayout({ children }: { children: React.ReactNode }) {
  return <BackofficeShell>{children}</BackofficeShell>;
}
