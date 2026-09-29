"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";
import { errorMessage, list } from "@/lib/backoffice";
import { resources, fieldValue, recordLabel, resourcePayload, type Field, type RecordData } from "@/lib/resources";
import Modal from "./modal";

export default function ResourceManager({ resource }: { resource: string }) {
  const config = resources[resource];
  const [rows, setRows] = useState<RecordData[]>([]);
  const [references, setReferences] = useState<Record<string, RecordData[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<RecordData | "new" | null>(null);
  const [deleting, setDeleting] = useState<RecordData | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const sources = [...new Set(config.fields.flatMap(field => field.source ? [field.source] : []))];
      const [data, refs] = await Promise.all([list<RecordData>(`/${resource}`, signal), Promise.all(sources.map(async source => [source, await list<RecordData>(`/${source}`, signal)] as const))]);
      if (!signal?.aborted) { setRows(data); setReferences(Object.fromEntries(refs)); setError(""); }
    } catch (err) { if (!signal?.aborted) setError(errorMessage(err)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [resource, config]);
  // load updates state only after the API request settles.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  function display(row: RecordData, field: Field) {
    const value = fieldValue(row, field);
    if (field.options) return field.options.find(option => option.value === value)?.label ?? "Sin clasificar";
    if (field.source) { const target = references[field.source]?.find(r => r.id === Number(value)); return target ? recordLabel(target) : value ? `#${value} (no disponible)` : "—"; }
    if (field.type === "datetime-local") return value ? new Date(value).toLocaleString("es-AR") : "—";
    return value || "—";
  }
  const filtered = rows.filter(row => config.fields.some(field => display(row, field).toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFormError("");
    try {
      const form = new FormData(event.currentTarget);
      for (const field of config.fields) {
        if (field.source && field.scope) {
          const selected = references[field.source]?.find(row => row.id === Number(form.get(field.name)));
          if (!selected || selected.ambito !== field.scope) throw new Error(`El campo ${field.label} requiere un registro del ámbito ${field.scope}.`);
        }
      }
      const body = resourcePayload(form, config.fields);
      await apiRequest(editor === "new" ? `/${resource}` : `/${resource}/${(editor as RecordData).id}`, { method: editor === "new" ? "POST" : "PUT", body });
      setEditor(null); setNotice("Cambios guardados correctamente."); await load();
    } catch (err) { setFormError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true); setFormError("");
    try { await apiRequest(`/${resource}/${deleting.id}`, { method: "DELETE" }); setDeleting(null); setNotice("Registro eliminado correctamente."); await load(); }
    catch (err) { setFormError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <><div className="bo-page-heading"><div><p className="bo-eyebrow">ADMINISTRACIÓN GENERAL</p><h1>{config.title}</h1><p>{config.description}</p></div><button className="bo-button" disabled={loading || !!error} onClick={() => { setEditor("new"); setFormError(""); }}>+ Agregar {config.singular}</button></div>
    {notice && <p className="bo-success" role="status">{notice}</p>}{error && <p className="bo-alert" role="alert">{error} <button onClick={() => { setLoading(true); void load(); }}>Reintentar</button></p>}
    <section className="bo-card bo-table-card"><div className="bo-toolbar"><label className="bo-search"><span className="sr-only">Buscar</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={`Buscar en ${config.title.toLocaleLowerCase()}…`} /></label><button className="bo-button secondary" disabled={loading} onClick={() => { setLoading(true); void load(); }}>Actualizar</button></div>
    {loading ? <p className="bo-empty" role="status">Cargando registros…</p> : error ? <p className="bo-empty">No se pudo consultar la información.</p> : !filtered.length ? <div className="bo-empty"><h2>{rows.length ? "Sin coincidencias" : "Todavía no hay registros"}</h2><p>{rows.length ? "Probá con otra búsqueda." : `Agregá ${config.singular} para comenzar.`}</p></div> : <div className="bo-table-scroll"><table><thead><tr><th>ID</th>{config.fields.slice(0, 4).map(field => <th key={field.name}>{field.label}</th>)}<th>Acciones</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td>#{row.id}</td>{config.fields.slice(0, 4).map(field => <td className="bo-cell-content" key={field.name}>{display(row, field)}</td>)}<td><div className="bo-row-actions"><button onClick={() => { setEditor(row); setFormError(""); }}>Ver / editar</button><button className="danger" onClick={() => { setDeleting(row); setFormError(""); }}>{config.softDelete ? "Dar de baja" : "Eliminar"}</button></div></td></tr>)}</tbody></table></div>}<div className="bo-table-footer">{loading ? "Consultando registros" : `${filtered.length} de ${rows.length} registros`}</div></section>
    {editor && <Modal title={`${editor === "new" ? "Agregar" : "Editar"} ${config.singular}`} onClose={() => setEditor(null)} busy={busy}><form onSubmit={save}>{formError && <p className="bo-alert" role="alert">{formError}</p>}<fieldset className="bo-form-grid" disabled={busy}>{config.fields.map(field => {
      const value = editor === "new" ? "" : fieldValue(editor, field);
      const options = field.source ? (references[field.source] ?? []).filter(r => !field.scope || r.ambito === field.scope) : [];
      return <label key={field.name} className={field.type === "textarea" ? "bo-full" : ""}>{field.label}{field.optional ? " (opcional)" : ""}{field.source ? <><select name={field.name} required={!field.optional} defaultValue={value}><option value="">Seleccionar…</option>{value && !options.some(r => String(r.id) === value) && <option value={value} disabled>#{value} (no disponible)</option>}{options.map(row => <option key={row.id} value={row.id}>{recordLabel(row)}</option>)}</select>{!options.length && <small>No hay opciones disponibles. Creá primero el registro relacionado.</small>}</> : field.options ? <select name={field.name} required={!field.optional} defaultValue={value}><option value="">Seleccionar ámbito…</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "textarea" ? <textarea name={field.name} required={!field.optional} defaultValue={value} /> : <input name={field.name} type={field.type ?? "text"} required={!field.optional} defaultValue={value} min={field.type === "number" ? field.min : undefined} max={field.type === "number" ? field.max : undefined} minLength={field.type !== "number" ? field.min : undefined} maxLength={field.type !== "number" ? field.max ?? 255 : undefined} step={field.type === "number" ? field.step ?? "1" : undefined} pattern={field.pattern} />}</label>;
    })}</fieldset><div className="bo-form-actions"><button type="button" className="bo-button secondary" disabled={busy} onClick={() => setEditor(null)}>Cancelar</button><button className="bo-button" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button></div></form></Modal>}
    {deleting && <Modal title={config.softDelete ? "Confirmar baja" : "Confirmar eliminación"} busy={busy} onClose={() => setDeleting(null)}><p>¿Querés {config.softDelete ? "dar de baja" : "eliminar"} {recordLabel(deleting)}?</p><p className="bo-muted">{config.softDelete ? "El registro dejará de aparecer en los listados activos." : "Esta acción es permanente. Si existen relaciones que impiden la eliminación, se mostrará el error del servidor."}</p>{formError && <p className="bo-alert" role="alert">{formError}</p>}<div className="bo-form-actions"><button className="bo-button secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className="bo-button destructive" disabled={busy} onClick={remove}>{busy ? "Procesando…" : "Confirmar"}</button></div></Modal>}
  </>;
}
