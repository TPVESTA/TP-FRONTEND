"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";
import { errorMessage, list, scopeLabel, type Role } from "@/lib/backoffice";
import Modal from "@/components/modal";
import RolePermissions from "@/components/role-permissions";
import { usePermissions } from "@/components/backoffice-shell";
import { hasPermission } from "@/lib/permissions";

export default function RolesPage() {
  const permissions = usePermissions();
  const create = hasPermission(permissions, "ROLES", "CREAR", undefined, "GLOBAL");
  const edit = hasPermission(permissions, "ROLES", "EDITAR", undefined, "GLOBAL");
  const [matrixRole, setMatrixRole] = useState<Role | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Role | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const data = await list<Role>("/roles", signal); if (!signal?.aborted) { setRoles(data); setError(""); } }
    catch (err) { if (!signal?.aborted) setError(errorMessage(err)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  // load updates state only after the API request settles.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, permissions]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (editor === "new" ? !create : !edit)) return;
    const form = new FormData(event.currentTarget);
    const body = { nombre: String(form.get("nombre")).trim(), descripcion: String(form.get("descripcion")).trim(), ...(editor === "new" ? { ambito: form.get("ambito") } : {}) };
    setBusy(true); setFormError("");
    try { await apiRequest(editor === "new" ? "/roles" : `/roles/${(editor as Role).id}`, { method: editor === "new" ? "POST" : "PUT", body }); setEditor(null); setNotice("Rol guardado correctamente."); await load(); }
    catch (err) { setFormError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <><div className="bo-page-heading"><div><p className="bo-eyebrow">CONFIGURACIÓN</p><h1>Roles</h1><p>Consultá las funciones y sus permisos por contexto.</p></div>{create && <button className="bo-button" disabled={loading || !!error} onClick={() => { setEditor("new"); setFormError(""); }}>+ Nuevo rol</button>}</div>
    {notice && <p className="bo-success" role="status">{notice}</p>}{error && <p className="bo-alert" role="alert">{error} <button onClick={() => { setLoading(true); void load(); }}>Reintentar</button></p>}
    <section className="bo-card bo-table-card">{loading ? <p className="bo-empty" role="status">Cargando roles…</p> : error ? <p className="bo-empty">No se pudo consultar el catálogo.</p> : !roles.length ? <p className="bo-empty">No hay roles disponibles.</p> : <div className="bo-table-scroll"><table><thead><tr><th>Rol</th><th>Descripción</th><th>Ámbito</th><th>Acciones</th></tr></thead><tbody>{roles.map(role => <tr key={role.id}><td><strong>{role.nombre}</strong><small>{role.codigo}</small></td><td>{role.descripcion}</td><td><span className="bo-badge">{scopeLabel(role.ambito)}</span></td><td><div className="bo-row-actions">{edit && <button onClick={() => { setEditor(role); setFormError(""); }}>Editar</button>}<button onClick={() => setMatrixRole(role)}>Permisos</button></div></td></tr>)}</tbody></table></div>}</section>
    <p className="bo-footnote">Los roles se asignan desde la sección Usuarios. Su ámbito no se puede modificar una vez creados.</p>
    {matrixRole && <RolePermissions role={matrixRole} onClose={() => setMatrixRole(null)} onSaved={() => { setMatrixRole(null); setNotice("Permisos actualizados. El cambio rige desde la próxima solicitud."); void load(); }} />}
    {editor && <Modal title={editor === "new" ? "Nuevo rol" : "Editar rol"} busy={busy} onClose={() => setEditor(null)}><form onSubmit={save}>{formError && <p className="bo-alert" role="alert">{formError}</p>}<fieldset disabled={busy} className="bo-form-grid"><label className="bo-full">Nombre<input name="nombre" required minLength={2} maxLength={100} defaultValue={editor === "new" ? "" : editor.nombre} /></label><label className="bo-full">Descripción<textarea name="descripcion" required maxLength={255} defaultValue={editor === "new" ? "" : editor.descripcion} /></label><label className="bo-full">Ámbito<select name="ambito" disabled={editor !== "new"} defaultValue={editor === "new" ? "PROPIEDAD" : editor.ambito}><option value="GLOBAL">Global</option><option value="PROPIEDAD">Propiedad</option><option value="ADMINISTRACION">Administración</option></select><small>Global: SysAdmin. Propiedad: propietario o inquilino. Administración: funciones dentro de una administración.</small></label></fieldset><div className="bo-form-actions"><button type="button" className="bo-button secondary" disabled={busy} onClick={() => setEditor(null)}>Cancelar</button><button className="bo-button" disabled={busy}>{busy ? "Guardando…" : "Guardar rol"}</button></div></form></Modal>}
  </>;
}
