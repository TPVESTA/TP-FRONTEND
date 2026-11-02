"use client";
import { useEffect, useState, useCallback, type FormEvent } from "react";
import { refreshPermissions, useCurrentUser, usePermissions } from "@/components/backoffice-shell";
import UserForm from "@/components/user-form";
import UserRoles from "@/components/user-roles";
import Modal from "@/components/modal";
import { errorMessage, usersApi, type ManagedUser } from "@/lib/backoffice";
import { canResource, hasPermission } from "@/lib/permissions";

export default function UsersPage() {
  const currentUser = useCurrentUser();
  const permissions = usePermissions();
  const globalDisable = hasPermission(permissions, "USUARIOS", "DESHABILITAR", undefined, "GLOBAL");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editor, setEditor] = useState<ManagedUser | "new" | null>(null);
  const [rolesUser, setRolesUser] = useState<ManagedUser | null>(null);
  const [statusUser, setStatusUser] = useState<ManagedUser | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const data = await usersApi.list(signal); if (!signal?.aborted) { setUsers(data); setError(""); } }
    catch (err) { if (!signal?.aborted) { setUsers([]); setError(errorMessage(err)); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [load, permissions]);
  const filtered = users.filter(u => `${u.nombre} ${u.apellido} ${u.email} ${u.cuil} ${u.telefono ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (status === "all" || u.estado === (status === "active")));
  async function changeStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statusUser || busy) return;
    const next = !statusUser.estado;
    if (!next && confirmEmail.trim().toLowerCase() !== "desactivar") {
      setOperationError("Escribí desactivar para confirmar.");
      return;
    }
    setBusy(true); setOperationError("");
    try {
      await usersApi.save({ estado: next }, statusUser.id);
      setStatusUser(null); setConfirmEmail("");
      setNotice(next ? "Usuario activado. Ya puede iniciar sesión." : "Usuario desactivado. La cuenta sigue en el sistema.");
      await load(); refreshPermissions();
    } catch (err) { setOperationError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <><div className="bo-page-heading"><div><p className="bo-eyebrow">ADMINISTRACIÓN GENERAL</p><h1>Usuarios</h1><p>Administrá los perfiles dentro de tu ámbito.</p></div>{canResource(permissions, "users", "CREAR") && <button className="bo-button" disabled={loading || !!error} onClick={() => setEditor("new")}>+ Nuevo usuario</button>}</div>
    {notice && <p className="bo-success" role="status">{notice}</p>}{error && <p className="bo-alert" role="alert">{error} <button disabled={loading} onClick={() => { setLoading(true); void load(); }}>Reintentar consulta</button></p>}
    <section className="bo-card bo-table-card"><div className="bo-toolbar"><label className="bo-search">Buscar<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label><label>Estado<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label><button className="bo-button secondary" disabled={loading || busy} onClick={() => { setLoading(true); void load(); }}>Actualizar</button></div>
      {loading ? <p className="bo-empty" role="status">Cargando usuarios…</p> : error ? <p className="bo-empty">No se pudo consultar el listado.</p> : !filtered.length ? <p className="bo-empty">No hay usuarios que coincidan en tu ámbito.</p> : <div className="bo-table-scroll"><table><thead><tr><th>Usuario</th><th>CUIL</th><th>Teléfono</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map(u => <tr key={u.id}><td><strong>{u.nombre} {u.apellido}{u.id === currentUser?.id ? " (vos)" : ""}</strong><p>{u.email}</p></td><td>{u.cuil}</td><td>{u.telefono || "—"}</td><td>{u.estado ? "Activo" : "Inactivo"}</td><td><div className="bo-row-actions">{canResource(permissions, "users", "EDITAR") && <button disabled={busy} onClick={() => setEditor(u)}>Editar</button>}{canResource(permissions, "empleados", "LEER") && <button disabled={busy} onClick={() => setRolesUser(u)}>Roles</button>}{globalDisable && <button className={u.estado ? "danger" : ""} disabled={busy || u.id === currentUser?.id} onClick={() => { setStatusUser(u); setConfirmEmail(""); setOperationError(""); }}>{u.estado ? "Desactivar" : "Activar"}</button>}</div></td></tr>)}</tbody></table></div>}
    </section>
    {editor && <UserForm user={editor === "new" ? undefined : editor} currentUserId={currentUser?.id} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice("Usuario guardado correctamente."); void load(); }} />}
    {rolesUser && <UserRoles user={rolesUser} onClose={() => setRolesUser(null)} />}
    {statusUser && <Modal title={statusUser.estado ? "Desactivar usuario" : "Activar usuario"} busy={busy} onClose={() => setStatusUser(null)}><form onSubmit={changeStatus}><p>{statusUser.estado ? "La cuenta permanece guardada, pero no podrá iniciar sesión hasta que la actives." : "La cuenta volverá a poder iniciar sesión."}</p><p><strong>{statusUser.nombre} {statusUser.apellido}</strong><br />{statusUser.email}</p>{statusUser.estado && <label className="bo-full">Escribí desactivar para confirmar<input value={confirmEmail} onChange={event => setConfirmEmail(event.target.value)} autoComplete="off" required /></label>}{operationError && <p className="bo-alert" role="alert">{operationError}</p>}<div className="bo-form-actions"><button type="button" className="bo-button secondary" disabled={busy} onClick={() => setStatusUser(null)}>Volver</button><button className={statusUser.estado ? "bo-button destructive" : "bo-button"} disabled={busy || (statusUser.estado && confirmEmail.trim().toLowerCase() !== "desactivar")}>{busy ? "Procesando…" : statusUser.estado ? "Desactivar" : "Activar"}</button></div></form></Modal>}
  </>;
}
