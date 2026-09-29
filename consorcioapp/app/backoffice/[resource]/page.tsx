import { notFound } from "next/navigation";
import ResourceManager from "@/components/resource-manager";
import { resources } from "@/lib/resources";

export default async function ResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  if (!Object.hasOwn(resources, resource)) notFound();
  return <ResourceManager key={resource} resource={resource} />;
}
