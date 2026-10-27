"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";
import { assignmentPath, assignmentRole, assignmentStatus, assignmentUser, scopeLabel, errorMessage, list, referenceId, type ManagedUser, type Role, type Scope, type Assignment, type Property, type Administration } from "@/lib/backoffice";
import { canDelegate, canResource, hasPermission, managementPermission, relationId, type Target } from "@/lib/permissions";
import { refreshPermissions, usePermissions } from "./backoffice-shell";
import Modal from "./modal";

type ScopedAssignment = Assignment & { scope: Scope };
export default function UserRoles({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const permissions = usePermissions();
  const [roles, setRoles] = useState<Role[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [assignments, setAssignments] = useState<ScopedAssignment[]>([]);
  const [roleId, setRoleId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<ScopedAssignment | null>(null);
  const role = roles.find(r => r.id === Number(roleId));
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [rs, ps, ads, prs, employees, globals] = await Promise.all([
        canResource(permissions, "roles", "LEER") ? list<Role>("/roles", signal) : [],
        canResource(permissions, "propiedades", "LEER") ? list<Property>("/propiedades", signal) : [],
        canResource(permissions, "administraciones", "LEER") ? list<Administration>("/administraciones", signal) : [],
        list<Assignment>("/usuarios-roles-propiedad", signal), list<Assignment>("/empleados", signal),
        canResource(permissions, "usuarios-roles", "LEER") ? list<Assignment>("/usuarios-roles", signal) : [],
      ]);
      if (signal?.aborted) return;
      setReady(true); setRoles(rs); setProperties(ps); setAdministrations(ads);
      setAssignments([...globals.map(a => ({ ...a, scope: "GLOBAL" as const })), ...prs.map(a => ({ ...a, scope: "PROPIEDAD" as const })), ...employees.map(a => ({ ...a, scope: "ADMINISTRACION" as const }))].filter(a => referenceId(assignmentUser(a)) === user.id)); setError("");
    } catch (err) { if (!signal?.aborted) { setReady(false); setAssignments([]); setError(errorMessage(err)); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [user.id, permissions]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [load]);
  function target(scope: Scope, id?: number): Target {
    if (scope === "GLOBAL") return {};
    if (scope === "ADMINISTRACION") return { administracionId: id };
    const p = properties.find(p => p.id === id);
    const embedded = assignments.find(a => a.propiedad && referenceId(a.propiedad) === id)?.propiedad;
    const buildingId = p ? referenceId(p.edificio) : typeof embedded === "object" && embedded !== null ? relationId(embedded, "edificio") : undefined;
    return { propiedadId: id, ...(buildingId ? { edificioId: buildingId } : {}) };
  }
  const destinations = (r: Role) => r.ambito === "GLOBAL" ? [] : (r.ambito === "PROPIEDAD" ? properties : administrations).filter(t => canDelegate(permissions, r, target(r.ambito, t.id)));
  const availableRoles = roles.filter(r => r.ambito === "GLOBAL" ? canDelegate(permissions, r, {}) : destinations(r).length > 0);
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role || busy) return;
    const id = Number(targetId);
    setBusy(true); setError(""); setNotice("");
    try {
      if (!canDelegate(permissions, role, target(role.ambito, id)) || role.ambito !== "GLOBAL" && !destinations(role).some(t => t.id === id)) throw new Error("No podés delegar este rol en el destino seleccionado.");
      if (assignments.some(a => a.scope === role.ambito && referenceId(assignmentRole(a)) === role.id && (role.ambito === "GLOBAL" || referenceId(a.propiedad ?? a.administracion!) === id) && assignmentStatus(a) !== "Finalizado")) throw new Error("Este usuario ya tiene ese rol vigente o programado en ese contexto.");
      await apiRequest(assignmentPath(role.ambito), { method: "POST", body: { usuarioId: user.id, rolId: role.id, ...(role.ambito === "GLOBAL" ? {} : role.ambito === "PROPIEDAD" ? { propiedadId: id } : { administracionId: id }) } });
      setRoleId(""); setTargetId(""); setNotice("Rol asignado correctamente."); await load(); refreshPermissions();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  function canRevoke(a: ScopedAssignment) {
    const id = a.scope === "GLOBAL" ? undefined : referenceId(a.propiedad ?? a.administracion!);
    return a.scope === "GLOBAL" ? hasPermission(permissions, "ASIGNACIONES", "REVOCAR", undefined, "GLOBAL") : managementPermission(permissions, "ASIGNACIONES", "REVOCAR", target(a.scope, id));
  }
  async function revoke() {
    if (!removing || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!canRevoke(removing)) throw new Error("Ya no tenés permiso para revocar esta asignación.");
      await apiRequest(`${assignmentPath(removing.scope)}/${removing.id}`, { method: "DELETE" });
      setRemoving(null); setNotice("Asignación finalizada. Se conserva el historial."); await load(); refreshPermissions();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  function targetLabel(a: ScopedAssignment) {
    if (a.scope === "GLOBAL") return "Todo el sistema";
    if (a.propiedad) { const id = referenceId(a.propiedad); const p = properties.find(p => p.id === id); return p ? `Unidad ${p.nroUnidad} · Edificio #${referenceId(p.edificio)}` : `Propiedad #${id}`; }
    const id = a.administracion ? referenceId(a.administracion) : null;
    return administrations.find(ad => ad.id === id)?.nombre ?? `Administración #${id}`;
  }
  return <Modal title={`Roles de ${user.nombre} ${user.apellido}`} onClose={onClose} busy={busy}>
    <p className="bo-muted">Los roles se asignan por propiedad, administración o en todo el sistema.</p>
    {error && <p className="bo-alert" role="alert">{error} <button disabled={busy || loading} onClick={() => { setLoading(true); void load(); }}>Actualizar asignaciones</button></p>}{notice && <p className="bo-success" role="status">{notice}</p>}
    {loading ? <p className="bo-empty" role="status">Cargando asignaciones…</p> : <><div className="bo-assignment-list">{assignments.length ? assignments.map(a => <div className="bo-assignment" key={`${a.scope}-${a.id}`}><div><strong>{roles.find(r => r.id === referenceId(assignmentRole(a)))?.nombre ?? `Rol #${referenceId(assignmentRole(a))}`}</strong><small>{targetLabel(a)}</small><small>Desde {new Date(a.beginAt).toLocaleDateString("es-AR")}{a.endAt ? ` · Hasta ${new Date(a.endAt).toLocaleDateString("es-AR")}` : ""}</small></div><span className="bo-badge">{assignmentStatus(a)}</span>{assignmentStatus(a) !== "Finalizado" && canRevoke(a) && <button className="bo-text-button danger" disabled={busy} onClick={() => setRemoving(a)}>Quitar</button>}</div>) : !error && <p className="bo-empty">No hay roles asignados en tu ámbito de acceso.</p>}</div>
      {removing && <div className="bo-confirm"><p>¿Querés finalizar esta asignación? Se conserva su historial.</p><div className="bo-form-actions"><button className="bo-button secondary" disabled={busy} onClick={() => setRemoving(null)}>Volver</button><button className="bo-button destructive" disabled={busy} onClick={revoke}>{busy ? "Procesando…" : "Quitar rol"}</button></div></div>}
      {!removing && !!availableRoles.length && <form onSubmit={assign}><h3 className="bo-section-title">Asignar un rol</h3><fieldset className="bo-form-grid" disabled={busy || !ready}><label className="bo-full">Rol<select required value={roleId} onChange={e => { setRoleId(e.target.value); setTargetId(""); }}><option value="">Seleccioná un rol</option>{availableRoles.map(r => <option value={r.id} key={r.id}>{r.nombre} · {scopeLabel(r.ambito)}</option>)}</select></label>{role && role.ambito !== "GLOBAL" && <label className="bo-full">{scopeLabel(role.ambito)}<select required value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">Seleccioná un destino</option>{destinations(role).map(t => <option value={t.id} key={t.id}>{"nroUnidad" in t ? `Unidad ${t.nroUnidad} · Propiedad #${t.id}` : t.nombre}</option>)}</select></label>}</fieldset><div className="bo-form-actions"><button className="bo-button" disabled={busy || !role || !ready}>{busy ? "Guardando…" : "Asignar rol"}</button></div></form>}
      {!availableRoles.length && !error && <p className="bo-muted">No hay roles que puedas delegar con tus permisos y destinos actuales.</p>}</>}
  </Modal>;
}
