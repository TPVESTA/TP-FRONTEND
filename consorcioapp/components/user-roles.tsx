"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { assignmentPath, assignmentStatus, scopeLabel, errorMessage, list, referenceId, type ManagedUser, type Role, type Scope, type Assignment, type Property, type Administration } from "@/lib/backoffice";
import Modal from "./modal";

type ScopedAssignment = Assignment & { scope: Scope };
export default function UserRoles({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [assignments, setAssignments] = useState<ScopedAssignment[]>([]);
  const [roleId, setRoleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<ScopedAssignment | null>(null);
  const role = roles.find(r => r.id === Number(roleId));
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [roles, properties, administrations, propertyRoles, employees, globalRoles] = await Promise.all([
        list<Role>("/roles", signal), list<Property>("/propiedades", signal), list<Administration>("/administraciones", signal), list<Assignment>("/usuarios-roles-propiedad", signal), list<Assignment>("/empleados", signal), list<Assignment>("/usuarios-roles", signal),
      ]);
      if (signal?.aborted) return;
      setReady(true); setRoles(roles); setProperties(properties); setAdministrations(administrations);
      setAssignments([...globalRoles.map(a => ({ ...a, scope: "GLOBAL" as const })), ...propertyRoles.map(a => ({ ...a, scope: "PROPIEDAD" as const })), ...employees.map(a => ({ ...a, scope: "ADMINISTRACION" as const }))].filter(a => referenceId(a.usuario) === user.id));
      setError("");
    } catch (err) { if (!signal?.aborted) { setReady(false); setError(errorMessage(err)); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [user.id]);
  // load updates state only after the API request settles.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const targetId = Number(data.get("target"));
    if (assignments.some(a => referenceId(a.rol) === role.id && (role.ambito === "GLOBAL" || referenceId(a.propiedad ?? a.administracion!) === targetId) && assignmentStatus(a) !== "Finalizado")) {
      setError("Este usuario ya tiene ese rol vigente o programado en el destino seleccionado."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(assignmentPath(role.ambito), { method: "POST", body: { usuarioId: user.id, rolId: role.id, ...(role.ambito === "GLOBAL" ? {} : role.ambito === "PROPIEDAD" ? { propiedadId: targetId } : { administracionId: targetId }) } });
      form.reset(); setRoleId(""); setNotice("Rol asignado correctamente."); await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function revoke() {
    if (!removing) return;
    setBusy(true); setError(""); setNotice("");
    try {
      // Se conserva el historial cerrando la vigencia; una asignación futura se cancela.
      const future = assignmentStatus(removing) === "Programado";
      await apiRequest(`${assignmentPath(removing.scope)}/${removing.id}`, { method: future ? "DELETE" : "PUT", ...(future ? {} : { body: { endAt: new Date().toISOString() } }) });
      setRemoving(null); setNotice("Asignación finalizada."); await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  function targetLabel(a: ScopedAssignment) {
    if (a.scope === "GLOBAL") return "Todo el sistema";
    if (a.propiedad) { const id = referenceId(a.propiedad); const property = properties.find(p => p.id === id); return property ? `Unidad ${property.nroUnidad} · Edificio #${referenceId(property.edificio)}` : `Propiedad #${id}`; }
    const id = a.administracion ? referenceId(a.administracion) : null;
    return administrations.find(admin => admin.id === id)?.nombre ?? `Administración #${id}`;
  }
  return <Modal title={`Roles de ${user.nombre} ${user.apellido}`} onClose={onClose} busy={busy}>
    <p className="bo-muted">Una persona puede tener distintos roles según la propiedad o administración.</p>
    {error && <p className="bo-alert" role="alert">{error} <button disabled={busy} onClick={() => { setLoading(true); void load(); }}>Volver a consultar</button></p>}{notice && <p className="bo-success" role="status">{notice}</p>}
    {loading ? <p className="bo-empty" role="status">Cargando asignaciones…</p> : <>
      <div className="bo-assignment-list">{assignments.length ? assignments.map(a => <div className="bo-assignment" key={`${a.scope}-${a.id}`}><div><strong>{roles.find(r => r.id === referenceId(a.rol))?.nombre ?? `Rol #${referenceId(a.rol)}`}</strong><small>{targetLabel(a)}</small><small>Desde {new Date(a.beginAt).toLocaleDateString("es-AR")}{a.endAt ? ` · Hasta ${new Date(a.endAt).toLocaleDateString("es-AR")}` : ""}</small></div><span className={`bo-badge ${assignmentStatus(a) === "Vigente" ? "active" : ""}`}>{assignmentStatus(a)}</span>{assignmentStatus(a) !== "Finalizado" && <button className="bo-text-button danger" disabled={busy} onClick={() => setRemoving(a)}>Quitar</button>}</div>) : <p className="bo-empty">Este usuario todavía no tiene roles asignados.</p>}</div>
      {removing && <div className="bo-confirm" role="group" aria-label="Confirmar retiro de rol"><p>¿Confirmás que querés quitar esta asignación?</p><div className="bo-form-actions"><button className="bo-button secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancelar</button><button className="bo-button destructive" disabled={busy} onClick={revoke}>{busy ? "Procesando…" : "Quitar rol"}</button></div></div>}
      {!removing && <form onSubmit={assign}><h3 className="bo-section-title">Asignar un rol</h3>{!roles.length ? <p className="bo-muted">Primero creá un rol en el <Link href="/backoffice/roles" onClick={onClose}>catálogo de roles</Link>.</p> : <><fieldset className="bo-form-grid" disabled={busy || !ready}><label className="bo-full">Rol<select name="role" required value={roleId} onChange={e => setRoleId(e.target.value)}><option value="">Seleccioná un rol</option>{roles.map(r => <option value={r.id} key={r.id}>{r.nombre} · {scopeLabel(r.ambito)}</option>)}</select></label>{role && role.ambito !== "GLOBAL" && <label className="bo-full" key={role.ambito}>{scopeLabel(role.ambito)}<select name="target" required defaultValue=""><option value="">Seleccioná un destino</option>{role.ambito === "PROPIEDAD" ? properties.map(p => <option value={p.id} key={p.id}>Unidad {p.nroUnidad} · Edificio #{referenceId(p.edificio)} · Propiedad #{p.id}</option>) : administrations.map(a => <option value={a.id} key={a.id}>{a.nombre}</option>)}</select>{!(role.ambito === "PROPIEDAD" ? properties : administrations).length && <small>No hay destinos disponibles. Deben existir para asignar este rol.</small>}</label>}</fieldset><div className="bo-form-actions"><button className="bo-button" disabled={busy || !role || !ready}>{busy ? "Guardando…" : "Asignar rol"}</button></div></>}</form>}
    </>}
  </Modal>;
}
