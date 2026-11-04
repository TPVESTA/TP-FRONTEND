import ResourceManager from "@/components/resource-manager";
export default async function Page({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  return <ResourceManager key="reservaciones" resource="reservaciones" personal openCreate={(await searchParams).nueva === "1"} />;
}
