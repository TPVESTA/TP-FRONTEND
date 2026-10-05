import BackofficeShell from "@/components/backoffice-shell";
export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  return <BackofficeShell resident>{children}</BackofficeShell>;
}
