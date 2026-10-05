import ResidentRequests from "@/components/resident-requests";
export default async function Page({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  return <ResidentRequests kind="reservaciones" openCreate={(await searchParams).nueva === "1"} />;
}
