"use client";
import Link from "next/link";
import { useCurrentUser, usePermissions } from "@/components/backoffice-shell";
import { canVisit } from "@/lib/permissions";
import { resources } from "@/lib/resources";

export default function BackofficeHome() {
  const user = useCurrentUser();
  const permissions = usePermissions();
  const links = [["usuarios", "Usuarios", "Gestioná perfiles y asignaciones."], ["roles", "Roles y permisos", "Consultá los roles y su matriz de permisos."], ...Object.entries(resources).map(([key, r]) => [key, r.title, r.description])].filter(([key]) => canVisit(permissions, `/backoffice/${key}`));
  return <><div className="bo-page-heading"><div><p className="bo-eyebrow">VISTA GENERAL</p><h1>Hola, {user?.nombre}</h1><p>Estas son las secciones disponibles para tus permisos actuales.</p></div></div><section className="bo-card"><div className="bo-shortcuts">{links.map(([key, title, description]) => <Link key={key} href={`/backoffice/${key}`}><h3>{title}</h3><p>{description}</p><strong>Abrir →</strong></Link>)}</div></section></>;
}
