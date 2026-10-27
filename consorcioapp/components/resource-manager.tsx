"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";
import { errorMessage, list, type Role } from "@/lib/backoffice";
import { resources, resourceFields, fieldValue, recordLabel, resourcePayload, reservationDay, type Field, type RecordData } from "@/lib/resources";
import { canDelegate, canResource, canBusiness, hasPermission, managementPermission, originPropertyIds, originPayload, recordTarget, relationId, type Action } from "@/lib/permissions";
import Modal from "./modal";
import Availability from "./availability";
import { useCurrentUser, usePermissions } from "./backoffice-shell";

function employeeRoleId(row: RecordData): number | undefined {
  const link = row.usuarioRol;
  if (link && typeof link === "object") {
    const nested = relationId(link as RecordData, "rol");
    if (nested) return nested;
  }
  return relationId(row, "rol");
}

export default function ResourceManager({ resource, personal = false, openCreate = false }: { resource: string; personal?: boolean; openCreate?: boolean }) {
  const config = resources[resource];
  const user = useCurrentUser();
  const permissions = usePermissions();
  const reservation = resource === "reservaciones";
  const incidence = resource === "incidencias";
  const business = reservation || incidence;
  const section = reservation ? "RESERVAS" : "INCIDENCIAS";
  const [rows, setRows] = useState<RecordData[]>([]);
  const [references, setReferences] = useState<Record<string, RecordData[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [referenceError, setReferenceError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<RecordData | "new" | null>(openCreate ? "new" : null);
  const [deleting, setDeleting] = useState<RecordData | null>(null);
  const [canceling, setCanceling] = useState<RecordData | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState(0);
  const [administrationId, setAdministrationId] = useState(0);
  const editingRow = editor && editor !== "new" ? editor : undefined;
  const canCreate = canResource(permissions, resource, "CREAR");
  const title = personal ? reservation ? "Mis reservas" : "Mis incidencias" : config.title;
  const allowed = (action: Action, row?: RecordData) => row && business ? canBusiness(permissions, section, action, row, user?.id, references) : canResource(permissions, resource, action, row ? recordTarget(row, resource, references) : undefined);
  const canEdit = editor === "new" ? canCreate : !!editingRow && allowed("EDITAR", editingRow) && (resource !== "empleados" || !!references.roles?.some(r => r.id === employeeRoleId(editingRow) && canDelegate(permissions, r as unknown as Role, recordTarget(editingRow, resource, references))));
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const sources = [...new Set(config.fields.flatMap(f => f.source && !(business && f.name === "usuarioId") ? [f.source] : []).concat(business && canResource(permissions, "propiedades", "LEER") ? ["propiedades"] : []))].filter(source => canResource(permissions, source, "LEER"));
      const [data, refs] = await Promise.all([list<RecordData>(`/${resource}`, signal), Promise.allSettled(sources.map(async source => [source, await list<RecordData>(`/${source}`, signal)] as const))]);
      if (signal?.aborted) return;
      const successful = refs.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
      setRows(data); setReferences(Object.fromEntries(successful)); setError("");
      setReferenceError(refs.flatMap((r, i) => r.status === "rejected" ? [`${sources[i]}: ${errorMessage(r.reason)}`] : []).join(". "));
    } catch (err) { if (!signal?.aborted) { setRows([]); setError(errorMessage(err)); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [resource, config, business, permissions]);
  // Loading completes asynchronously; cleanup prevents updates from older requests.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const canChangeState = !!editingRow && incidence && allowed("CAMBIAR_ESTADO", editingRow);
  const fields = resourceFields(resource, editingRow).filter(f => !(business && f.name === "usuarioId") && !(incidence && !editingRow && f.name === "closedAt")).map(f => {
    if (incidence && f.name === "estado" && !canChangeState) return { ...f, readOnly: true };
    if (resource === "empleados" && editingRow && ["usuarioId", "rolId", "administracionId"].includes(f.name)) return { ...f, readOnly: true };
    return f;
  });
  const units = references[reservation ? "areas-comunes" : "unidades"] ?? [];
  const selectedUnit = units.find(u => u.id === selectedUnitId);
  const selectedBuilding = selectedUnit && relationId(selectedUnit, "edificio");
  const origins = selectedBuilding ? originPropertyIds(permissions, section, selectedBuilding) : [];
  const needsOrigin = editor === "new" && business && !!selectedBuilding && !managementPermission(permissions, section, "CREAR", { edificioId: selectedBuilding });
  function display(row: RecordData, field: Field) {
    const value = fieldValue(row, field);
    if (field.options) return field.options.find(o => o.value === value)?.label ?? "—";
    if (field.source) { const target = references[field.source]?.find(r => r.id === Number(value)); return target ? recordLabel(target) : value ? `#${value}` : "—"; }
    if (field.type === "date") return value ? value.split("-").reverse().join("/") : "—";
    if (field.type === "datetime-local") return value ? new Date(value).toLocaleString("es-AR") : "—";
    return value || "—";
  }
  const visible = personal ? rows.filter(row => relationId(row, "usuario") === user?.id) : rows;
  const filtered = visible.filter(row => config.fields.some(f => display(row, f).toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  function open(row: RecordData | "new") {
    setEditor(row); setSelectedUnitId(row === "new" ? 0 : relationId(row, reservation ? "areaComun" : "unidad") ?? 0); setAdministrationId(row === "new" ? 0 : relationId(row, "administracion") ?? 0); setFormError(""); setNotice("");
  }
  function unitOptions(field: Field) {
    return (references[field.source!] ?? []).filter(r => {
      if (field.scope && r.ambito !== field.scope) return false;
      if (resource === "empleados" && field.name === "administracionId") return canResource(permissions, resource, "CREAR", { administracionId: r.id });
      if (resource === "empleados" && field.name === "rolId") return !!administrationId && canDelegate(permissions, r as unknown as Role, { administracionId: administrationId });
      if (field.name === "edificioId") return canResource(permissions, resource, editingRow ? "EDITAR" : "CREAR", { edificioId: r.id });
      if (!business || !["areaComunId", "unidadId"].includes(field.name)) return true;
      const building = relationId(r, "edificio");
      if (!building) return false;
      if (editingRow && reservation && relationId(editingRow, "propiedadOrigen") && building !== recordTarget(editingRow, resource, references).edificioId) return false;
      const target = { edificioId: building, ...(incidence && (references.propiedades ?? []).some(p => p.id === r.id) ? { propiedadId: r.id } : {}) };
      return hasPermission(permissions, section, editingRow ? "EDITAR" : "CREAR", target);
    });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !editor) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setFormError(""); setNotice("");
    try {
      if (!canEdit) throw new Error("Ya no tenés permiso para guardar estos cambios. Actualizá la información.");
      if (business && editingRow) {
        const { data } = await apiRequest<RecordData>(`/${resource}/${editingRow.id}`);
        if (!data || !allowed("EDITAR", data)) throw new Error("El registro cambió o ya no se puede editar. Cerrá el formulario y actualizá el listado.");
      }
      for (const field of fields) {
        if (field.source && !field.readOnly && !unitOptions(field).some(r => r.id === Number(form.get(field.name)))) throw new Error(`Seleccioná una opción disponible para ${field.label}. Si faltan opciones, actualizá las referencias.`);
      }
      const body = resourcePayload(form, fields, editingRow);
      if (business && editor === "new") {
        const unit = units.find(u => u.id === Number(body[reservation ? "areaComunId" : "unidadId"]));
        const buildingId = unit && relationId(unit, "edificio");
        if (!buildingId) throw new Error("No se pudo verificar el edificio de la unidad.");
        const propertyId = Number(form.get("propiedadId"));
        const privateUnit = incidence && (references.propiedades ?? []).some(p => p.id === unit!.id);
        Object.assign(body, originPayload(permissions, section, buildingId, propertyId, privateUnit ? unit!.id : undefined));
      }
      await apiRequest(editor === "new" ? `/${resource}` : `/${resource}/${editor.id}`, { method: editor === "new" ? "POST" : "PUT", body });
      setEditor(null); setNotice("Cambios guardados correctamente."); await load();
    } catch (err) { setFormError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function mutate(row: RecordData, cancel: boolean) {
    if (busy) return;
    setBusy(true); setFormError(""); setNotice("");
    try {
      if (!allowed(cancel ? "EDITAR" : "BORRAR", row)) throw new Error("No tenés permiso para realizar esta operación.");
      if (cancel) {
        const { data } = await apiRequest<RecordData>(`/${resource}/${row.id}`);
        if (!data || !allowed("EDITAR", data)) throw new Error("La reserva ya no se puede cancelar. Actualizá el listado.");
      }
      await apiRequest(`/${resource}/${row.id}`, { method: cancel ? "PUT" : "DELETE", ...(cancel ? { body: { estado: "Cancelado" } } : {}) });
      setDeleting(null); setCanceling(null); setNotice(cancel ? "Reserva cancelada." : resource === "empleados" ? "Asignación finalizada. Se conserva su historial." : "Registro dado de baja."); await load();
    } catch (err) { setFormError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <><div className="bo-page-heading"><div><p className="bo-eyebrow">{personal ? "MI CONSORCIO" : "ADMINISTRACIÓN GENERAL"}</p><h1>{title}</h1><p>{config.description}</p></div>{canCreate && <button className="bo-button" disabled={loading || !!error || busy} onClick={() => open("new")}>+ Agregar {config.singular}</button>}</div>
    {notice && <p className="bo-success" role="status">{notice}</p>}{error && <p className="bo-alert" role="alert">{error} <button disabled={loading} onClick={() => { setLoading(true); void load(); }}>Actualizar listado</button></p>}
    {referenceError && <p className="bo-alert" role="alert">El listado está disponible, pero faltan datos para algunos campos. {referenceError} <button disabled={loading} onClick={() => { setLoading(true); void load(); }}>Actualizar referencias</button></p>}
    <section className="bo-card bo-table-card"><div className="bo-toolbar"><label className="bo-search">Buscar<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label><button className="bo-button secondary" disabled={loading || busy} onClick={() => { setLoading(true); void load(); }}>Actualizar</button></div>
      {loading ? <p className="bo-empty" role="status">Cargando registros…</p> : error ? <p className="bo-empty">No se pudo consultar la información.</p> : !filtered.length ? <p className="bo-empty">{query ? "No hay coincidencias." : "No hay registros disponibles en tu ámbito."}</p> : <div className="bo-table-scroll"><table><thead><tr><th>ID</th>{config.fields.slice(0, 4).map(f => <th key={f.name}>{f.label}</th>)}<th>Acciones</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td>#{row.id}</td>{config.fields.slice(0, 4).map(f => <td className="bo-cell-content" key={f.name}>{display(row, f)}</td>)}<td><div className="bo-row-actions"><button disabled={busy} onClick={() => open(row)}>{allowed("EDITAR", row) ? "Ver / editar" : "Ver"}</button>{reservation && allowed("EDITAR", row) && <button disabled={busy} onClick={() => { setCanceling(row); setFormError(""); }}>Cancelar</button>}{allowed("BORRAR", row) && <button className="danger" disabled={busy} onClick={() => { setDeleting(row); setFormError(""); }}>{resource === "empleados" ? "Finalizar asignación" : "Dar de baja"}</button>}</div></td></tr>)}</tbody></table></div>}</section>
    {editor && <Modal title={`${editor === "new" ? "Agregar" : canEdit ? "Editar" : "Ver"} ${config.singular}`} busy={busy} onClose={() => setEditor(null)}><form onSubmit={save}>{formError && <p className="bo-alert" role="alert">{formError}</p>}{referenceError && <p className="bo-alert" role="alert">Faltan datos para algunos campos. Cerrá el formulario y actualizá las referencias si faltan opciones.</p>}{editor === "new" && !canCreate ? <p role="alert">No tenés permiso para crear este registro.</p> : <><fieldset className="bo-form-grid" disabled={busy || !canEdit || loading || !!error}>{fields.map(field => {
      const value = editingRow ? fieldValue(editingRow, field) : "";
      const options = field.source ? unitOptions(field) : [];
      return <label key={field.name === "rolId" ? `${field.name}-${administrationId}` : field.name} className={field.type === "textarea" ? "bo-full" : ""}>{field.label}{field.optional ? " (opcional)" : ""}{field.readOnly ? <input readOnly value={editingRow ? display(editingRow, field) : field.name === "estado" ? reservation ? "Reservado" : "Reportado" : "—"} /> : field.source ? <select name={field.name} required={!field.optional} defaultValue={value} onChange={event => { if (["areaComunId", "unidadId"].includes(field.name)) setSelectedUnitId(Number(event.target.value)); if (field.name === "administracionId") setAdministrationId(Number(event.target.value)); }}><option value="">Seleccionar…</option>{value && !options.some(r => String(r.id) === value) && <option value={value} disabled>#{value} (no disponible)</option>}{options.map(r => <option key={r.id} value={r.id}>{recordLabel(r)}</option>)}</select> : field.options ? <select name={field.name} required={!field.optional} defaultValue={value}><option value="">Seleccionar…</option>{field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : field.type === "textarea" ? <textarea name={field.name} required={!field.optional} maxLength={255} defaultValue={value} /> : <input name={field.name} type={field.type ?? "text"} required={!field.optional} defaultValue={value} min={field.type === "date" ? reservationDay() : field.type === "number" ? field.min : undefined} max={field.type === "number" ? field.max : undefined} minLength={!field.type || field.type === "text" ? field.min : undefined} maxLength={field.type !== "number" ? field.max ?? 255 : undefined} step={field.type === "number" ? field.step ?? "1" : undefined} pattern={field.pattern} />}</label>;
    })}{needsOrigin && <label className="bo-full" key={selectedUnitId}>Propiedad de origen<select name="propiedadId" required defaultValue={origins.length === 1 ? origins[0] : ""}><option value="">Seleccioná tu propiedad</option>{origins.filter(id => !incidence || !(references.propiedades ?? []).some(p => p.id === selectedUnitId) || id === selectedUnitId).map(id => <option key={id} value={id}>{recordLabel((references.propiedades ?? []).find(p => p.id === id) ?? { id })}</option>)}</select></label>}</fieldset>
      {reservation && !!selectedUnitId && !!selectedBuilding && hasPermission(permissions, "RESERVAS", "DISPONIBILIDAD", { edificioId: selectedBuilding }) && <Availability key={selectedUnitId} areaId={selectedUnitId} />}</>}
      <div className="bo-form-actions"><button className="bo-button secondary" type="button" disabled={busy} onClick={() => setEditor(null)}>Volver</button>{canEdit && <button className="bo-button" disabled={busy || loading || !!error}>{busy ? "Guardando…" : "Guardar cambios"}</button>}</div></form></Modal>}
    {(canceling || deleting) && <Modal title={canceling ? "Cancelar reserva" : "Confirmar baja"} busy={busy} onClose={() => { setCanceling(null); setDeleting(null); }}><p>{canceling ? "¿Querés cancelar esta reserva? No se podrá reactivar." : resource === "empleados" ? "¿Querés finalizar esta asignación? Se conserva el historial." : "¿Querés dar de baja este registro?"}</p>{formError && <p className="bo-alert" role="alert">{formError}</p>}<div className="bo-form-actions"><button className="bo-button secondary" disabled={busy} onClick={() => { setCanceling(null); setDeleting(null); }}>Volver</button><button className="bo-button destructive" disabled={busy} onClick={() => void mutate((canceling ?? deleting)!, !!canceling)}>{busy ? "Procesando…" : "Confirmar"}</button></div></Modal>}
  </>;
}
