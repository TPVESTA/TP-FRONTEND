"use client";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";
import { errorMessage, type Role } from "@/lib/backoffice";
import { actions, sections, hasPermission, permissionPayload, validPermissions, type Permission, type Action, type Section } from "@/lib/permissions";
import { refreshPermissions, usePermissions } from "./backoffice-shell";
import Modal from "./modal";

const labels: Record<Section, string> = { RESERVAS: "Reservas", INCIDENCIAS: "Incidencias", EXPENSAS: "Expensas (módulo pendiente)", USUARIOS: "Usuarios", ROLES: "Roles", ASIGNACIONES: "Asignaciones", ESTRUCTURA: "Estructura", PROPIEDADES: "Propiedades", CATALOGOS: "Catálogos", ADMINISTRACIONES: "Administraciones" };
const special: Partial<Record<Section, Action[]>> = { RESERVAS: ["DISPONIBILIDAD"], INCIDENCIAS: ["CAMBIAR_ESTADO"], EXPENSAS: ["EMITIR", "ANULAR", "REGISTRAR_PAGO"], USUARIOS: ["DESHABILITAR"], ASIGNACIONES: ["ASIGNAR", "REVOCAR"] };
const empty = (seccion: Section): Permission => ({ seccion, crear: false, leer: false, editar: false, borrar: false, acciones: [] });

export default function RolePermissions({ role, onClose, onSaved }: { role: Role; onClose: () => void; onSaved: () => void }) {
  const permissions = usePermissions();
  const fixed = role.ambito === "GLOBAL" && (["SUPERADMIN", "SYSADMIN"].includes(role.codigo ?? "") || !role.codigo && role.nombre.trim().toLowerCase() === "sysadmin");
  const editable = !fixed && hasPermission(permissions, "ROLES", "EDITAR", undefined, "GLOBAL");
  const [matrix, setMatrix] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Role>(`/roles/${role.id}`, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      if (!data || !validPermissions(data.permisos)) throw new Error("No se recibió una matriz válida para este rol.");
      setMatrix(sections.map(s => ({ ...(data.permisos!.find(p => p.seccion === s) ?? empty(s)) }))); setError("");
    }).catch(err => { if (!controller.signal.aborted) { setMatrix([]); setError(errorMessage(err)); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [role.id, attempt]);
  function toggle(section: Section, key: "crear" | "leer" | "editar" | "borrar" | Action) {
    setMatrix(rows => rows.map(p => p.seccion !== section ? p : ["crear", "leer", "editar", "borrar"].includes(key) ? { ...p, [key]: !p[key as "crear"] } : { ...p, acciones: p.acciones.includes(key as Action) ? p.acciones.filter(a => a !== key) : [...p.acciones, key as Action] }));
  }
  const payload = matrix.filter(p => p.crear || p.leer || p.editar || p.borrar || p.acciones.length);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || !editable || !matrix.length) return;
    setBusy(true); setError("");
    try {
      await apiRequest(`/roles/${role.id}/permisos`, { method: "PUT", body: { permisos: permissionPayload(payload) } });
      onSaved(); refreshPermissions();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <Modal title={`Permisos de ${role.nombre}`} busy={busy} onClose={onClose}><form onSubmit={save}>
    <p>Los permisos se combinan dentro de cada contexto. Un permiso ausente deniega la operación.</p>
    {fixed && <p className="bo-muted">El administrador del sistema tiene acceso completo por definición del backend.</p>}
    {error && <p className="bo-alert" role="alert">{error} <button type="button" disabled={busy || loading} onClick={() => { setLoading(true); setAttempt(a => a + 1); }}>Volver a consultar la matriz</button></p>}
    {loading ? <p role="status">Cargando permisos…</p> : !!matrix.length && <fieldset disabled={busy || !editable}><div className="bo-table-scroll"><table><thead><tr><th>Sección</th>{["Crear", "Leer", "Editar", "Borrar"].map(label => <th key={label}>{label}</th>)}<th>Operaciones específicas</th></tr></thead><tbody>{matrix.map(p => <tr key={p.seccion}><td>{labels[p.seccion]}</td>{(["crear", "leer", "editar", "borrar"] as const).map(key => <td key={key}><input type="checkbox" aria-label={`${labels[p.seccion]}: ${key}`} checked={p[key]} onChange={() => toggle(p.seccion, key)} /></td>)}<td>{actions.filter(a => (special[p.seccion] ?? []).includes(a) || p.acciones.includes(a)).map(a => <label className="bo-checkbox" key={a}><input type="checkbox" checked={p.acciones.includes(a)} onChange={() => toggle(p.seccion, a)} />{a.replaceAll("_", " ").toLocaleLowerCase("es-AR")}</label>)}</td></tr>)}</tbody></table></div></fieldset>}
    {!loading && !!matrix.length && !payload.length && editable && <p className="bo-alert">Guardar esta matriz vacía revoca todos los permisos del rol.</p>}
    <div className="bo-form-actions"><button type="button" className="bo-button secondary" disabled={busy} onClick={onClose}>Volver</button>{editable && <button className={`bo-button ${payload.length ? "" : "destructive"}`} disabled={busy || loading || !matrix.length}>{busy ? "Guardando…" : payload.length ? "Guardar permisos" : "Revocar todos los permisos"}</button>}</div>
  </form></Modal>;
}
