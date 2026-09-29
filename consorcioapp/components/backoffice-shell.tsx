"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { ApiError, SESSION_EXPIRED_EVENT, session } from "@/lib/api";
import { auth, type User } from "@/lib/auth";
import { errorMessage } from "@/lib/backoffice";
import { resources } from "@/lib/resources";

const CurrentUser = createContext<User | null>(null);
export const useCurrentUser = () => useContext(CurrentUser);

export default function BackofficeShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const expired = () => { setUser(null); router.replace("/?expired=1"); };
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    async function restore() {
      try {
        if (!session.getToken()) { router.replace("/"); return; }
        const profile = await auth.profile(controller.signal);
        if (!controller.signal.aborted) { setUser(profile); setError(""); }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) expired();
        else setError(errorMessage(err));
      }
    }
    void restore();
    return () => { controller.abort(); window.removeEventListener(SESSION_EXPIRED_EVENT, expired); };
  }, [router, attempt]);

  function logout() { auth.logout(); setUser(null); router.replace("/"); }
  if (!user) return <main className="bo-loading"><h1>Consorcio</h1>{error ? <><p role="alert">{error}</p><button className="bo-button" onClick={() => { setError(""); setAttempt(attempt + 1); }}>Reintentar</button><button className="bo-button secondary" onClick={logout}>Volver al ingreso</button></> : <p role="status">Verificando sesión…</p>}</main>;

  return <CurrentUser.Provider value={user}><div className="bo-shell">
    <aside className="bo-sidebar">
      <Link className="bo-brand" href="/backoffice"><span className="bo-logo">C</span> Consorcio<span className="bo-brand-sub">BACKOFFICE</span></Link>
      <p className="bo-nav-label">GENERAL</p>
      <nav aria-label="Navegación principal">{[["/backoffice", "Resumen", "◫"], ["/backoffice/usuarios", "Usuarios", "◎"], ["/backoffice/roles", "Roles", "◇"]].map(([href, label, icon]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}><span aria-hidden="true">{icon}</span>{label}</Link>)}</nav>
      <p className="bo-nav-label">GESTIÓN</p>
      <nav aria-label="Gestión del consorcio">{Object.entries(resources).map(([key, resource]) => <Link key={key} href={`/backoffice/${key}`} aria-current={pathname === `/backoffice/${key}` ? "page" : undefined}>{resource.title}</Link>)}</nav>
      <div className="bo-sidebar-bottom"><span className="bo-dot" /> Administración general</div>
    </aside>
    <div className="bo-workspace"><header className="bo-header"><span>Panel de administración</span><div className="bo-account"><span className="bo-avatar">{user.nombre[0]}{user.apellido[0]}</span><div><strong>{user.nombre} {user.apellido}</strong><small>{user.email}</small></div><button className="bo-button secondary" onClick={logout}>Salir</button></div></header><main className="bo-main">{children}</main></div>
  </div></CurrentUser.Provider>;
}
