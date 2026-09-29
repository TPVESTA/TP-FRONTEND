"use client";
import { useEffect, useState, useCallback } from "react";
import { useCurrentUser } from "@/components/backoffice-shell";
import UserForm from "@/components/user-form";
import UserRoles from "@/components/user-roles";
import Modal from "@/components/modal";
import { errorMessage, usersApi, type ManagedUser } from "@/lib/backoffice";

export default function UsersPage() {
  const currentUser = useCurrentUser();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editor, setEditor] = useState<ManagedUser | "new" | null>(null);
  const [rolesUser, setRolesUser] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const data = await usersApi.list(signal); if (!signal?.aborted) setUsers(data); }
    catch (err) { if (!signal?.aborted) setError(errorMessage(err)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  // load updates state only after the API request settles.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const filtered = users.filter(user => `${user.nombre} ${user.apellido} ${user.email} ${user.cuil}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (status === "all" || user.estado === (status === "active")));
  async function remove() {
    if (!deleting) return;
    setBusy(true); setDeleteError("");
    try { await usersApi.remove(deleting.id); setDeleting(null); setNotice("Usuario dado de baja."); await load(); }
    catch (err) { setDeleteError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <><div className="bo-page-heading"><div><p className="bo-eyebrow">ADMINISTRACIÓN GENERAL</p><h1>Usuarios</h1><p>Administrá los perfiles y sus asignaciones de roles.</p></div><button className="bo-button" onClick={() => setEditor("new")}>+ Nuevo usuario</button></div>
    {notice && <p className="bo-success" role="status">{notice}</p>}
    {error && <p className="bo-alert" role="alert">{error} <button onClick={() => { setLoading(true); void load(); }}>Reintentar</button></p>}
    <section className="bo-card bo-table-card"><div className="bo-toolbar"><label className="bo-search"><span className="sr-only">Buscar usuarios</span><input type="search" placeholder="Buscar por nombre, correo o CUIL…" value={search} onChange={e => setSearch(e.target.value)} /></label><label><span className="sr-only">Estado</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label><button className="bo-button secondary" disabled={loading} onClick={() => { setLoading(true); void load(); }}>Actualizar</button></div>
      {loading ? <p className="bo-empty" role="status">Cargando usuarios…</p> : error ? <p className="bo-empty">No se pudo actualizar el listado.</p> : !filtered.length ? <div className="bo-empty"><h2>{users.length ? "Sin coincidencias" : "Todavía no hay usuarios"}</h2><p>{users.length ? "Probá con otra búsqueda o estado." : "Creá un usuario para comenzar."}</p></div> : <div className="bo-table-scroll"><table><thead><tr><th>Usuario</th><th>CUIL</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map(user => <tr key={user.id}><td><div className="bo-person"><span className="bo-avatar">{user.nombre[0]}{user.apellido[0]}</span><div><strong>{user.nombre} {user.apellido}{user.id === currentUser?.id ? " (vos)" : ""}</strong><small>{user.email}</small></div></div></td><td>{user.cuil}</td><td><span className={`bo-badge ${user.estado ? "active" : ""}`}>{user.estado ? "Activo" : "Inactivo"}</span></td><td><div className="bo-row-actions"><button onClick={() => setEditor(user)}>Editar</button><button onClick={() => setRolesUser(user)}>Roles</button><button className="danger" disabled={user.id === currentUser?.id} title={user.id === currentUser?.id ? "No podés dar de baja tu propia cuenta desde el panel" : undefined} onClick={() => { setDeleting(user); setDeleteError(""); }}>Dar de baja</button></div></td></tr>)}</tbody></table></div>}
      <div className="bo-table-footer">{loading ? "Consultando registros" : `${filtered.length} de ${users.length} usuarios`}</div>
    </section>
    {editor && <UserForm user={editor === "new" ? undefined : editor} currentUserId={currentUser?.id} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice("Usuario guardado correctamente."); void load(); }} />}
    {rolesUser && <UserRoles user={rolesUser} onClose={() => setRolesUser(null)} />}
    {deleting && <Modal title="Dar de baja al usuario" busy={busy} onClose={() => setDeleting(null)}><p>¿Querés dar de baja a <strong>{deleting.nombre} {deleting.apellido}</strong>?</p><p className="bo-muted">No podrá iniciar sesión y dejará de aparecer en este listado. Sus datos se conservarán en el historial.</p>{deleteError && <p className="bo-alert" role="alert">{deleteError}</p>}<div className="bo-form-actions"><button className="bo-button secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className="bo-button destructive" disabled={busy} onClick={remove}>{busy ? "Procesando…" : "Confirmar baja"}</button></div></Modal>}
  </>;
}
