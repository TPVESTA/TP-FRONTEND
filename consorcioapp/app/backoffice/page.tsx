"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/backoffice-shell";
import { errorMessage, list, type ManagedUser, type Role } from "@/lib/backoffice";

export default function Dashboard() {
  const user = useCurrentUser();
  const [stats, setStats] = useState<{ users: number; active: number; roles: number } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([list<ManagedUser>("/users", controller.signal), list<Role>("/roles", controller.signal)])
      .then(([users, roles]) => { if (!controller.signal.aborted) { setStats({ users: users.length, active: users.filter(u => u.estado).length, roles: roles.length }); setError(""); } })
      .catch(err => { if (!controller.signal.aborted) setError(errorMessage(err)); });
    return () => controller.abort();
  }, [attempt]);
  return <><div className="bo-page-heading"><div><p className="bo-eyebrow">VISTA GENERAL</p><h1>Hola, {user?.nombre}</h1><p>Gestioná las personas y los roles de tu comunidad.</p></div><Link href="/backoffice/usuarios" className="bo-button">Gestionar usuarios →</Link></div>
    {error && <div className="bo-alert" role="alert">{error} <button onClick={() => setAttempt(attempt + 1)}>Reintentar</button></div>}
    <div className="bo-stats">{[["Usuarios registrados", stats?.users], ["Usuarios activos", stats?.active], ["Roles disponibles", stats?.roles]].map(([label, value]) => <section className="bo-card" key={label}><p>{label}</p><strong>{value ?? "—"}</strong><small>{stats ? "Datos actuales del sistema" : "Consultando información…"}</small></section>)}</div>
    <section className="bo-card"><h2>Gestión del sistema</h2><p className="bo-muted">Todo lo necesario para empezar a organizar los accesos.</p><div className="bo-shortcuts"><Link href="/backoffice/usuarios"><span className="bo-shortcut-icon">◎</span><h3>Usuarios</h3><p>Creá perfiles, actualizá sus datos y asigná roles.</p><strong>Administrar usuarios →</strong></Link><Link href="/backoffice/roles"><span className="bo-shortcut-icon">◇</span><h3>Catálogo de roles</h3><p>Definí los roles y el ámbito al que pertenecen.</p><strong>Ver roles →</strong></Link></div></section>
    <p className="bo-footnote">En esta etapa, el panel está disponible para todos los usuarios autenticados. La asignación de roles todavía no restringe el acceso.</p>
  </>;
}
