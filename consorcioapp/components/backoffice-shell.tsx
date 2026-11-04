"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ApiError, PERMISSIONS_CHANGED_EVENT, SESSION_EXPIRED_EVENT, session } from "@/lib/api";
import { auth, type User } from "@/lib/auth";
import { canVisit, type PermissionContext } from "@/lib/permissions";
import { errorMessage } from "@/lib/backoffice";
import { resources } from "@/lib/resources";

const CurrentUser = createContext<User | null>(null);
export const useCurrentUser = () => useContext(CurrentUser);
const Permissions = createContext<PermissionContext[]>([]);
export const usePermissions = () => useContext(Permissions);
export const refreshPermissions = () => window.dispatchEvent(new Event(PERMISSIONS_CHANGED_EVENT));

// Los permisos se vuelven a consultar al navegar y al recuperar el foco. Si llegan iguales se
// conserva el mismo array, así los componentes que dependen de él no recargan sus datos.
const samePermissions = (current: PermissionContext[], next: PermissionContext[]) => JSON.stringify(current) === JSON.stringify(next);

export default function BackofficeShell({ children, resident = false }: { children: React.ReactNode; resident?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<PermissionContext[]>([]);
  const [verifiedPath, setVerifiedPath] = useState("");
  const [error, setError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const applyPermissions = useCallback((next: PermissionContext[]) => setPermissions(current => samePermissions(current, next) ? current : next), []);
  const expired = useCallback(() => { setUser(null); setPermissions([]); router.replace("/?expired=1"); }, [router]);
  // El perfil se pide una vez al entrar (y al reintentar): navegar no lo cambia.
  useEffect(() => {
    const controller = new AbortController();
    if (!session.getToken()) router.replace("/");
    else auth.profile(controller.signal)
      .then(profile => { if (!controller.signal.aborted) { setUser(profile); setSessionError(""); } })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) expired();
        else setSessionError(errorMessage(err));
      });
    return () => controller.abort();
  }, [router, expired, attempt]);
  // Cada navegación vuelve a verificar los permisos antes de mostrar la página.
  useEffect(() => {
    const controller = new AbortController();
    if (session.getToken()) auth.permissions(controller.signal)
      .then(grants => { if (!controller.signal.aborted) { applyPermissions(grants); setVerifiedPath(pathname); setError(""); } })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) expired();
        else { applyPermissions([]); setError(errorMessage(err)); }
      });
    return () => controller.abort();
  }, [pathname, attempt, applyPermissions, expired]);
  // Al recuperar el foco o tras un 403 se refrescan los permisos; si la sesión vence, se vuelve al ingreso.
  useEffect(() => {
    const controller = new AbortController();
    let refreshing = false;
    async function refresh() {
      if (refreshing || !session.getToken()) return;
      refreshing = true;
      try {
        const grants = await auth.permissions(controller.signal);
        if (!controller.signal.aborted) { applyPermissions(grants); setError(""); }
      } catch (err) {
        if (!controller.signal.aborted) { applyPermissions([]); setError(errorMessage(err)); }
      } finally { refreshing = false; }
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    window.addEventListener(PERMISSIONS_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.removeEventListener(SESSION_EXPIRED_EVENT, expired); window.removeEventListener(PERMISSIONS_CHANGED_EVENT, refresh); window.removeEventListener("focus", refresh); };
  }, [applyPermissions, expired]);
  function logout() { auth.logout(); setUser(null); setPermissions([]); router.replace("/"); }
  const retry = () => setAttempt(a => a + 1);
  const loadingError = sessionError || error;
  if (!user) return <main className="bo-loading"><h1>Vesta</h1>{loadingError ? <><p role="alert">{loadingError}</p><button className="bo-button" onClick={retry}>Reintentar</button><button className="bo-button secondary" onClick={logout}>Volver al ingreso</button></> : <p role="status">Verificando sesión…</p>}</main>;
  const permitted = canVisit(permissions, pathname);
  const residentLinks = [["/mi-consorcio", "Inicio"], ["/mi-consorcio/reservas", "Mis reservas"], ["/mi-consorcio/incidencias", "Mis incidencias"]];
  const generalLinks = [["/backoffice", "Resumen"], ["/backoffice/usuarios", "Usuarios"]];
  // Botón para pasar entre el backoffice y Mi consorcio; el residente sin acceso al backoffice no lo ve.
  const switchView = resident
    ? canVisit(permissions, "/backoffice") && <Link className="bo-button secondary" href="/backoffice">Ir al panel de administración</Link>
    : <Link className="bo-button secondary" href="/mi-consorcio">Ir a mi consorcio</Link>;
  const links = (items: string[][]) => items.filter(([href]) => canVisit(permissions, href)).map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>);
  return <CurrentUser.Provider value={user}><Permissions.Provider value={permissions}><div className="bo-shell">
    <aside className="bo-sidebar">
      <Link className="bo-brand" href={resident ? "/mi-consorcio" : "/backoffice"}><span className="bo-logo">V</span> Vesta<span className="bo-brand-sub">{resident ? "MI CONSORCIO" : "BACKOFFICE"}</span></Link>
      <p className="bo-nav-label">{resident ? "MI CONSORCIO" : "GENERAL"}</p><nav aria-label="Navegación principal">{links(resident ? residentLinks : generalLinks)}</nav>
      {!resident && <><p className="bo-nav-label">GESTIÓN</p><nav aria-label="Gestión del consorcio">{links(Object.entries(resources).map(([key, resource]) => [`/backoffice/${key}`, resource.title]))}</nav></>}
      <div className="bo-sidebar-bottom"><span className="bo-dot" /> {resident ? "Portal de residentes" : "Administración general"}</div>
    </aside>
    <div className="bo-workspace"><header className="bo-header"><div className="bo-header-switch">{switchView}</div><div className="bo-account"><span className="bo-avatar">{user.nombre[0]}{user.apellido[0]}</span><div><strong>{user.nombre} {user.apellido}</strong><small>{user.email}</small></div></div><button className="bo-button secondary" onClick={logout}>Salir</button></header><main className="bo-main">{error ? <div className="bo-alert" role="alert">No pudimos verificar tus permisos: {error} <button onClick={retry}>Reintentar</button></div> : verifiedPath !== pathname ? <p role="status">Verificando permisos…</p> : permitted ? children : <section className="bo-card"><h1>Acceso no disponible</h1><p role="alert">No tenés permiso para acceder a esta sección. Si tus roles cambiaron, actualizá los permisos.</p><button className="bo-button secondary" onClick={refreshPermissions}>Actualizar permisos</button><Link href="/mi-consorcio">Volver al inicio</Link></section>}</main></div>
  </div></Permissions.Provider></CurrentUser.Provider>;
}
