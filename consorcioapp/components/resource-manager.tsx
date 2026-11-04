"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";
import { errorMessage, list, type Role } from "@/lib/backoffice";
import { resources, resourceFields, fieldValue, recordLabel, unitLabel, resourcePayload, reservationDay, type Field, type RecordData } from "@/lib/resources";
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

type DetailState = { id: number; status: "loading" } | { id: number; status: "error"; message: string };

function recordAuthors(rows: RecordData[]) {
  const authors = new Map<number, string>();
  for (const row of rows) {
    const id = relationId(row, "usuario");
    if (!id) continue;
    const author = row.usuario && typeof row.usuario === "object" ? row.usuario as RecordData : undefined;
    const name = `${author?.nombre ?? ""} ${author?.apellido ?? ""}`.trim();
    if (name || !authors.has(id)) authors.set(id, name || `Usuario ${id}`);
  }
  const nameCounts = new Map<string, number>();
  for (const name of authors.values()) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  return [...authors].map(([id, name]) => ({
    id, label: (nameCounts.get(name) ?? 0) > 1 ? `${name} (usuario ${id})` : name,
  })).sort((a, b) => a.label.localeCompare(b.label, "es") || a.id - b.id);
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [editor, setEditor] = useState<RecordData | "new" | null>(openCreate ? "new" : null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const [deleting, setDeleting] = useState<RecordData | null>(null);
  const [canceling, setCanceling] = useState<RecordData | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState(0);
  const [selectedBuildingId, setSelectedBuildingId] = useState(0);
  const [administrationId, setAdministrationId] = useState(0);
  const editingRow = editor && editor !== "new" ? editor : undefined;
  const canCreate = canResource(permissions, resource, "CREAR");
  const title = personal ? reservation ? "Mis reservas" : "Mis incidencias" : config.title;
  const columns = config.fields;
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
  // Después de guardar alcanza con el listado: ninguna pantalla usa su propio recurso como
  // referencia, así que una mutación no cambia edificios, unidades ni demás opciones.
  const reloadRows = useCallback(async () => {
    try { setRows(await list<RecordData>(`/${resource}`)); setError(""); }
    catch (err) { setRows([]); setError(errorMessage(err)); }
  }, [resource]);
  // Loading completes asynchronously; cleanup prevents updates from older requests.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => () => { detailRequest.current?.abort(); }, []);
  const canChangeState = !!editingRow && incidence && allowed("CAMBIAR_ESTADO", editingRow);
  const fields = resourceFields(resource, editingRow).filter(f => !f.listOnly && !(business && f.name === "usuarioId") && !(f.name === "estado" && (reservation || incidence && !editingRow))).map(f => {
    if (incidence && f.name === "estado" && !canChangeState) return { ...f, readOnly: true };
    if (resource === "empleados" && editingRow && ["usuarioId", "rolId", "administracionId"].includes(f.name)) return { ...f, readOnly: true };
    return f;
  });
  const units = references[reservation ? "areas-comunes" : "unidades"] ?? [];
  const unitField = reservation ? "areaComunId" : "unidadId";
  const selectedUnit = units.find(u => u.id === selectedUnitId);
  const selectedBuilding = selectedUnit && relationId(selectedUnit, "edificio");
  const origins = selectedBuilding ? originPropertyIds(permissions, section, selectedBuilding) : [];
  const needsOrigin = editor === "new" && business && !!selectedBuilding && !managementPermission(permissions, section, "CREAR", { edificioId: selectedBuilding });
  function display(row: RecordData, field: Field) {
    const value = fieldValue(row, field);
    if (field.options) return field.options.find(o => o.value === value)?.label ?? "—";
    if (field.source) {
      const nested = field.relation ? field.relation.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as RecordData)[key] : undefined, row) : undefined;
      const target = references[field.source]?.find(r => r.id === Number(value))
        ?? (nested && typeof nested === "object" && nested !== null ? nested as RecordData : undefined);
      return target ? business && field.name === unitField ? unitLabel(target) : recordLabel(target) : "—";
    }
    if (field.type === "date") return value ? value.split("-").reverse().join("/") : "—";
    if (field.type === "datetime-local") return value ? new Date(value).toLocaleString("es-AR") : "—";
    return value || "—";
  }
  const visible = personal ? rows.filter(row => relationId(row, "usuario") === user?.id) : rows;
  const authors = business && !personal ? recordAuthors(visible) : [];
  const stateOptions = incidence ? config.fields.find(f => f.name === "estado")?.options ?? [] : [];
  const invalidRange = reservation && !!dateFrom && !!dateTo && dateFrom > dateTo;
  const hasFilters = !!(query || dateFrom || dateTo || authorId || stateFilter);
  const filtered = visible.filter(row => {
    if (invalidRange) return false;
    if (reservation && (dateFrom || dateTo)) {
      const day = reservationDay(String(row.fechaReservacion));
      if (!day || (dateFrom && day < dateFrom) || (dateTo && day > dateTo)) return false;
    }
    if (business && authorId && relationId(row, "usuario") !== Number(authorId)) return false;
    if (incidence && stateFilter && row.estado !== stateFilter) return false;
    return columns.some(f => display(row, f).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  });
  function clearFilters() { setQuery(""); setDateFrom(""); setDateTo(""); setAuthorId(""); setStateFilter(""); }
  function closeEditor() {
    detailRequest.current?.abort(); detailRequest.current = null;
    setDetail(null); setEditor(null);
  }
  async function open(row: RecordData | "new") {
    detailRequest.current?.abort(); detailRequest.current = null;
    setEditor(null); setDetail(null); setSelectedUnitId(0); setSelectedBuildingId(0); setAdministrationId(0); setFormError(""); setNotice("");
    if (row === "new") { setEditor("new"); return; }
    const controller = new AbortController();
    detailRequest.current = controller;
    setDetail({ id: row.id, status: "loading" });
    try {
      const { data } = await apiRequest<RecordData>(`/${resource}/${row.id}`, { signal: controller.signal });
      if (controller.signal.aborted || detailRequest.current !== controller) return;
      if (!data || Array.isArray(data) || data.id !== row.id) throw new Error("El servidor no devolvió un detalle válido para este registro.");
      setEditor(data); setDetail(null);
      setSelectedUnitId(relationId(data, reservation ? "areaComun" : "unidad") ?? 0);
      const unit = data[reservation ? "areaComun" : "unidad"];
      setSelectedBuildingId(unit && typeof unit === "object" ? relationId(unit as RecordData, "edificio") ?? 0 : 0);
      setAdministrationId(relationId(data, "administracion") ?? 0);
      setRows(current => current.map(item => item.id === data.id ? data : item));
    } catch (err) {
      if (!controller.signal.aborted && detailRequest.current === controller) setDetail({ id: row.id, status: "error", message: errorMessage(err) });
    } finally {
      if (detailRequest.current === controller) detailRequest.current = null;
    }
  }
  function unitOptions(field: Field) {
    if (business && field.name === "edificioId") return buildingChoices;
    const options = permittedOptions(field);
    // La unidad o el área común se elige dentro del edificio seleccionado.
    return business && field.name === unitField ? options.filter(r => relationId(r, "edificio") === effectiveBuildingId) : options;
  }
  function businessBuildings() {
    const unitDefinition = config.fields.find(f => f.name === unitField);
    const found = new Map<number, RecordData>();
    for (const unit of unitDefinition ? permittedOptions(unitDefinition) : []) {
      const id = relationId(unit, "edificio");
      if (!id || found.has(id)) continue;
      const nested = unit.edificio && typeof unit.edificio === "object" ? unit.edificio as RecordData : undefined;
      found.set(id, references.edificios?.find(b => b.id === id) ?? (nested?.nombre ? nested : { id, nombre: `Edificio ${id}` }));
    }
    return [...found.values()].sort((a, b) => recordLabel(a).localeCompare(recordLabel(b), "es"));
  }
  function permittedOptions(field: Field) {
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
  const buildingChoices = business ? businessBuildings() : [];
  // Con un único edificio disponible no hace falta elegirlo.
  const effectiveBuildingId = selectedBuildingId || (buildingChoices.length === 1 ? buildingChoices[0].id : 0);
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
      setEditor(null); setNotice("Cambios guardados correctamente."); await reloadRows();
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
      setDeleting(null); setCanceling(null); setNotice(cancel ? "Reserva cancelada." : resource === "empleados" ? "Asignación finalizada. Se conserva su historial." : "Registro dado de baja."); await reloadRows();
    } catch (err) { setFormError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <><div className="bo-page-heading"><div><p className="bo-eyebrow">{personal ? "MI CONSORCIO" : "ADMINISTRACIÓN GENERAL"}</p><h1>{title}</h1><p>{config.description}</p></div>{canCreate && <button className="bo-button" disabled={loading || !!error || busy} onClick={() => open("new")}>+ Agregar {config.singular}</button>}</div>
    {notice && <p className="bo-success" role="status">{notice}</p>}{error && <p className="bo-alert" role="alert">{error} <button disabled={loading} onClick={() => { setLoading(true); void load(); }}>Actualizar listado</button></p>}
    {referenceError && <p className="bo-alert" role="alert">El listado está disponible, pero faltan datos para algunos campos. {referenceError} <button disabled={loading} onClick={() => { setLoading(true); void load(); }}>Actualizar referencias</button></p>}
    <section className="bo-card bo-table-card"><div className="bo-toolbar"><label className="bo-search">Buscar<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
      {reservation && <>
        <label className="bo-filter">Desde<input type="date" value={dateFrom} max={dateTo || undefined} aria-invalid={invalidRange} aria-describedby={invalidRange ? "reservation-filter-error" : undefined} onChange={e => setDateFrom(e.target.value)} /></label>
        <label className="bo-filter">Hasta<input type="date" value={dateTo} min={dateFrom || undefined} aria-invalid={invalidRange} aria-describedby={invalidRange ? "reservation-filter-error" : undefined} onChange={e => setDateTo(e.target.value)} /></label>
      </>}
      {business && !personal && <label className="bo-filter">Usuario<select value={authorId} onChange={e => setAuthorId(e.target.value)}><option value="">Todos los usuarios</option>{authorId && !authors.some(author => String(author.id) === authorId) && <option value={authorId}>Usuario sin incidencias disponibles</option>}{authors.map(author => <option key={author.id} value={author.id}>{author.label}</option>)}</select></label>}
      {incidence && <label className="bo-filter">Estado<select value={stateFilter} onChange={e => setStateFilter(e.target.value)}><option value="">Todos los estados</option>{stateOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
      {hasFilters && <button className="bo-button secondary" type="button" onClick={clearFilters}>Limpiar filtros</button>}
      <button className="bo-button secondary" disabled={loading || busy} onClick={() => { setLoading(true); void load(); }}>Actualizar</button></div>
      {invalidRange && <p className="bo-alert" role="alert" id="reservation-filter-error">La fecha desde no puede ser posterior a la fecha hasta.</p>}
      {loading ? <p className="bo-empty" role="status">Cargando registros…</p> : error ? <p className="bo-empty">No se pudo consultar la información.</p> : !filtered.length ? <p className="bo-empty">{invalidRange ? "Corregí el rango de fechas para consultar las reservas." : hasFilters ? "No hay coincidencias." : "No hay registros disponibles en tu ámbito."}</p> : <div className="bo-table-scroll"><table><thead><tr>{columns.map(f => <th key={f.name}>{f.listLabel ?? f.label}</th>)}<th>Acciones</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}>{columns.map(f => <td className="bo-cell-content" key={f.name}>{display(row, f)}</td>)}<td><div className="bo-row-actions"><button disabled={busy} onClick={() => open(row)}>{allowed("EDITAR", row) ? "Ver / editar" : "Ver"}</button>{reservation && allowed("EDITAR", row) && <button disabled={busy} onClick={() => { setCanceling(row); setFormError(""); }}>Cancelar</button>}{!business && allowed("BORRAR", row) && <button className="danger" disabled={busy} onClick={() => { setDeleting(row); setFormError(""); }}>{resource === "empleados" ? "Finalizar asignación" : "Dar de baja"}</button>}</div></td></tr>)}</tbody></table></div>}
      {business && !loading && !error && <p className="bo-table-footer" role="status">Mostrando {filtered.length} de {visible.length} {reservation ? "reservas" : "incidencias"}.</p>}
    </section>
    {(editor || detail) && <Modal title={`${editor === "new" ? "Agregar" : canEdit ? "Editar" : "Ver"} ${config.singular}`} busy={busy} onClose={closeEditor}>{detail ? <>
      {detail.status === "loading" ? <p role="status">Consultando detalle…</p> : <p className="bo-alert" role="alert">{detail.message}</p>}
      <div className="bo-form-actions"><button className="bo-button secondary" type="button" onClick={closeEditor}>Volver</button>{detail.status === "error" && <button className="bo-button" type="button" onClick={() => void open({ id: detail.id })}>Reintentar consulta</button>}</div>
    </> : <form onSubmit={save}>{formError && <p className="bo-alert" role="alert">{formError}</p>}{referenceError && <p className="bo-alert" role="alert">Faltan datos para algunos campos. Cerrá el formulario y actualizá las referencias si faltan opciones.</p>}{editor === "new" && !canCreate ? <p role="alert">No tenés permiso para crear este registro.</p> : <><fieldset className="bo-form-grid" disabled={busy || !canEdit || loading || !!error}>{fields.map(field => {
      const value = editingRow ? fieldValue(editingRow, field) : "";
      const options = field.source ? unitOptions(field) : [];
      return <label key={field.name === "rolId" ? `${field.name}-${administrationId}` : field.name} className={field.type === "textarea" ? "bo-full" : ""}>{field.label}{field.optional ? " (opcional)" : ""}{field.readOnly ? <input readOnly value={editingRow ? display(editingRow, field) : "—"} /> : business && field.name === "edificioId" ? <select name={field.name} required value={effectiveBuildingId || ""} onChange={event => { setSelectedBuildingId(Number(event.target.value)); setSelectedUnitId(0); }}><option value="">Seleccioná un edificio</option>{options.map(r => <option key={r.id} value={r.id}>{recordLabel(r)}</option>)}</select> : field.source ? <select key={business && field.name === unitField ? effectiveBuildingId : undefined} name={field.name} required={!field.optional} disabled={business && field.name === unitField && !effectiveBuildingId} defaultValue={value} onChange={event => { if (["areaComunId", "unidadId"].includes(field.name)) setSelectedUnitId(Number(event.target.value)); if (field.name === "administracionId") setAdministrationId(Number(event.target.value)); }}><option value="">{business && field.name === unitField && !effectiveBuildingId ? "Primero seleccioná un edificio" : "Seleccionar…"}</option>{value && !options.some(r => String(r.id) === value) && <option value={value} disabled>Opción no disponible</option>}{options.map(r => <option key={r.id} value={r.id}>{business && field.name === unitField ? unitLabel(r) : recordLabel(r)}</option>)}</select> : field.options ? <select name={field.name} required={!field.optional} defaultValue={value}><option value="">Seleccionar…</option>{field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : field.type === "textarea" ? <textarea name={field.name} required={!field.optional} maxLength={255} defaultValue={value} /> : <input name={field.name} type={field.type ?? "text"} required={!field.optional} defaultValue={value} min={field.type === "date" ? reservationDay() : field.type === "number" ? field.min : undefined} max={field.type === "number" ? field.max : undefined} minLength={!field.type || field.type === "text" ? field.min : undefined} maxLength={field.type !== "number" ? field.max ?? 255 : undefined} step={field.type === "number" ? field.step ?? "1" : undefined} pattern={field.pattern} />}</label>;
    })}{needsOrigin && <label className="bo-full" key={selectedUnitId}>Propiedad de origen<select name="propiedadId" required defaultValue={origins.length === 1 ? origins[0] : ""}><option value="">Seleccioná tu propiedad</option>{origins.filter(id => !incidence || !(references.propiedades ?? []).some(p => p.id === selectedUnitId) || id === selectedUnitId).map(id => <option key={id} value={id}>{recordLabel((references.propiedades ?? []).find(p => p.id === id) ?? { id })}</option>)}</select></label>}</fieldset>
      {reservation && !!selectedUnitId && !!selectedBuilding && hasPermission(permissions, "RESERVAS", "DISPONIBILIDAD", { edificioId: selectedBuilding }) && <Availability key={selectedUnitId} areaId={selectedUnitId} />}</>}
      <div className="bo-form-actions"><button className="bo-button secondary" type="button" disabled={busy} onClick={closeEditor}>Volver</button>{canEdit && <button className="bo-button" disabled={busy || loading || !!error}>{busy ? "Guardando…" : "Guardar cambios"}</button>}</div></form>}</Modal>}
    {(canceling || deleting) && <Modal title={canceling ? "Cancelar reserva" : "Confirmar baja"} busy={busy} onClose={() => { setCanceling(null); setDeleting(null); }}><p>{canceling ? "¿Querés cancelar esta reserva? No se podrá reactivar." : resource === "empleados" ? "¿Querés finalizar esta asignación? Se conserva el historial." : "¿Querés dar de baja este registro?"}</p>{formError && <p className="bo-alert" role="alert">{formError}</p>}<div className="bo-form-actions"><button className="bo-button secondary" disabled={busy} onClick={() => { setCanceling(null); setDeleting(null); }}>Volver</button><button className="bo-button destructive" disabled={busy} onClick={() => void mutate((canceling ?? deleting)!, !!canceling)}>{busy ? "Procesando…" : "Confirmar"}</button></div></Modal>}
  </>;
}
