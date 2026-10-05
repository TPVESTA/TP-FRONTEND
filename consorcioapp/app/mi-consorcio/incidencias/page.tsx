import ResidentRequests from "@/components/resident-requests";
export default async function Page({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  return <ResidentRequests kind="incidencias" openCreate={(await searchParams).nueva === "1"} />;
}
