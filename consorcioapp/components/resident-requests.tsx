"use client";
import ResourceManager from "./resource-manager";

export default function ResidentRequests({ kind, openCreate = false }: { kind: "reservaciones" | "incidencias"; openCreate?: boolean }) {
  return <ResourceManager key={kind} resource={kind} personal openCreate={openCreate} />;
}
