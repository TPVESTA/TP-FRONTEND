import ResourceManager from "@/components/resource-manager";
export default async function Page({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  return <ResourceManager key="incidencias" resource="incidencias" personal openCreate={(await searchParams).nueva === "1"} />;
}
