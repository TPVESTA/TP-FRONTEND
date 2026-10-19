"use client";
import { useEffect, useState, useCallback, type FormEvent } from "react";
import { refreshPermissions, useCurrentUser, usePermissions } from "@/components/backoffice-shell";
import UserForm from "@/components/user-form";
import UserRoles from "@/components/user-roles";
import Modal from "@/components/modal";
import { errorMessage, usersApi, list, type ManagedUser, type Administration } from "@/lib/backoffice";
import { administrationIds, canResource, hasPermission } from "@/lib/permissions";

export default function UsersPage() {
  const currentUser = useCurrentUser();
  const permissions = usePermissions();
  const globalDisable = hasPermission(permissions, "USUARIOS", "DESHABILITAR", undefined, "GLOBAL");
  const globalCreate = hasPermission(permissions, "USUARIOS", "CREAR", undefined, "GLOBAL");
  const unlinkIds = administrationIds(permissions, "USUARIOS", "BORRAR");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editor, setEditor] = useState<ManagedUser | "new" | null>(null);
  const [rolesUser, setRolesUser] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [linking, setLinking] = useState<ManagedUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const data = await usersApi.list(signal); if (!signal?.aborted) { setUsers(data); setError(""); } }
    catch (err) { if (!signal?.aborted) { setUsers([]); setError(errorMessage(err)); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [load, permissions]);
  const filtered = users.filter(u => `${u.nombre} ${u.apellido} ${u.email} ${u.cuil}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (status === "all" || u.estado === (status === "active")));
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleting || busy) return;
    const adminId = Number(new FormData(event.currentTarget).get("administracionId"));
    setBusy(true); setOperationError("");
    try {
      if (globalDisable) await usersApi.remove(deleting.id);
      else {
        if (!unlinkIds.includes(adminId)) throw new Error("Seleccioná una administración autorizada.");
        await usersApi.unlink(deleting.id, adminId);
      }
      setDeleting(null); setNotice(globalDisable ? "Usuario dado de baja." : "Usuario desvinculado de la administración seleccionada."); await load(); refreshPermissions();
    } catch (err) { setOperationError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function openLink(user: ManagedUser) {
    setLinking(user); setOperationError(""); setBusy(true);
    try { setAdministrations(await list<Administration>("/administraciones")); }
    catch (err) { setAdministrations([]); setOperationError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linking || busy) return;
    const id = Number(new FormData(event.currentTarget).get("administracionId"));
    setBusy(true); setOperationError("");
    try {
      if (!administrations.some(a => a.id === id)) throw new Error("Seleccioná una administración disponible.");
      await usersApi.link(linking.id, id); setLinking(null); setNotice("Usuario vinculado a la administración."); await load();
    } catch (err) { setOperationError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <><div className="bo-page-heading"><div><p className="bo-eyebrow">ADMINISTRACIÓN GENERAL</p><h1>Usuarios</h1><p>Administrá los perfiles dentro de tu ámbito.</p></div>{canResource(permissions, "users", "CREAR") && <button className="bo-button" disabled={loading || !!error} onClick={() => setEditor("new")}>+ Nuevo usuario</button>}</div>
    {notice && <p className="bo-success" role="status">{notice}</p>}{error && <p className="bo-alert" role="alert">{error} <button disabled={loading} onClick={() => { setLoading(true); void load(); }}>Reintentar consulta</button></p>}
    <section className="bo-card bo-table-card"><div className="bo-toolbar"><label className="bo-search">Buscar<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label><label>Estado<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label><button className="bo-button secondary" disabled={loading || busy} onClick={() => { setLoading(true); void load(); }}>Actualizar</button></div>
      {loading ? <p className="bo-empty" role="status">Cargando usuarios…</p> : error ? <p className="bo-empty">No se pudo consultar el listado.</p> : !filtered.length ? <p className="bo-empty">No hay usuarios que coincidan en tu ámbito.</p> : <div className="bo-table-scroll"><table><thead><tr><th>Usuario</th><th>CUIL</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map(u => <tr key={u.id}><td><strong>{u.nombre} {u.apellido}{u.id === currentUser?.id ? " (vos)" : ""}</strong><p>{u.email}</p></td><td>{u.cuil}</td><td>{u.estado ? "Activo" : "Inactivo"}</td><td><div className="bo-row-actions">{canResource(permissions, "users", "EDITAR") && <button disabled={busy} onClick={() => setEditor(u)}>Editar</button>}{canResource(permissions, "empleados", "LEER") && <button disabled={busy} onClick={() => setRolesUser(u)}>Roles</button>}{globalCreate && canResource(permissions, "administraciones", "LEER") && <button disabled={busy} onClick={() => void openLink(u)}>Vincular a administración</button>}{(globalDisable || !!unlinkIds.length) && <button className="danger" disabled={busy || u.id === currentUser?.id} onClick={() => { setDeleting(u); setOperationError(""); }}>{globalDisable ? "Dar de baja" : "Desvincular"}</button>}</div></td></tr>)}</tbody></table></div>}
    </section>
    {editor && <UserForm user={editor === "new" ? undefined : editor} currentUserId={currentUser?.id} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice("Usuario guardado correctamente."); void load(); }} />}
    {rolesUser && <UserRoles user={rolesUser} onClose={() => setRolesUser(null)} />}
    {deleting && <Modal title={globalDisable ? "Dar de baja al usuario" : "Desvincular usuario"} busy={busy} onClose={() => setDeleting(null)}><form onSubmit={remove}><p>{globalDisable ? "La cuenta dejará de poder iniciar sesión en todo el sistema." : "Se finalizará el vínculo de gestión y los empleos de la administración seleccionada. La cuenta y sus vínculos con otras administraciones se conservan; los roles de propiedad se revocan por separado."}</p><p><strong>{deleting.nombre} {deleting.apellido}</strong></p>{!globalDisable && <label>Administración<select name="administracionId" required defaultValue={unlinkIds.length === 1 ? unlinkIds[0] : ""}><option value="">Seleccionar…</option>{unlinkIds.map(id => <option key={id} value={id}>Administración #{id}</option>)}</select></label>}{operationError && <p className="bo-alert" role="alert">{operationError}</p>}<div className="bo-form-actions"><button type="button" className="bo-button secondary" disabled={busy} onClick={() => setDeleting(null)}>Volver</button><button className="bo-button destructive" disabled={busy}>{busy ? "Procesando…" : "Confirmar"}</button></div></form></Modal>}
    {linking && <Modal title="Vincular usuario a administración" busy={busy} onClose={() => setLinking(null)}><form onSubmit={link}><p>{linking.nombre} {linking.apellido}</p>{operationError && <p className="bo-alert" role="alert">{operationError} <button type="button" disabled={busy} onClick={() => void openLink(linking)}>Actualizar administraciones</button></p>}<label>Administración<select name="administracionId" required disabled={busy}><option value="">Seleccionar…</option>{administrations.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><div className="bo-form-actions"><button type="button" className="bo-button secondary" disabled={busy} onClick={() => setLinking(null)}>Volver</button><button className="bo-button" disabled={busy || !administrations.length}>Vincular</button></div></form></Modal>}
  </>;
}
