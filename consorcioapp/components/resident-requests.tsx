"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";
import { errorMessage, list } from "@/lib/backoffice";
import { accessibleBuildingIds, allowedSpaces, relationId } from "@/lib/resident-access";
import { canModifyReservation, recordLabel, reservationDate, reservationDay, type RecordData } from "@/lib/resources";
import { useCurrentUser } from "./backoffice-shell";
import Modal from "./modal";

export default function ResidentRequests({ kind, openCreate = false }: { kind: "reservaciones" | "incidencias"; openCreate?: boolean }) {
  const user = useCurrentUser();
  const reservation = kind === "reservaciones";
  const [rows, setRows] = useState<RecordData[]>([]);
  const [spaces, setSpaces] = useState<RecordData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<RecordData | "new" | null>(openCreate ? "new" : null);
  const [canceling, setCanceling] = useState<RecordData | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!user) return;
    try {
      const [data, areas, properties, assignments] = await Promise.all([
        list<RecordData>(`/${kind}`, signal), list<RecordData>("/areas-comunes", signal),
        list<RecordData>("/propiedades", signal), list<RecordData>("/usuarios-roles-propiedad", signal),
      ]);
      if (signal?.aborted) return;
      setRows(data.filter(row => relationId(row, "usuario") === user.id));
      setSpaces(allowedSpaces(areas, accessibleBuildingIds(user.id, assignments, properties)));
      setError("");
    } catch (err) { if (!signal?.aborted) setError(errorMessage(err)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [user, kind]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !editor) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setFormError(""); setNotice("");
    try {
      // Reconsultar la vigencia al enviar: el rol puede haber terminado desde la carga.
      const [assignments, properties, areas] = await Promise.all([
        list<RecordData>("/usuarios-roles-propiedad"), list<RecordData>("/propiedades"), list<RecordData>("/areas-comunes"),
      ]);
      const available = allowedSpaces(areas, accessibleBuildingIds(user.id, assignments, properties));
      setSpaces(available);
      const spaceId = Number(form.get("space"));
      if (!available.some(space => space.id === spaceId)) throw new Error("Necesitás un rol vigente en una propiedad del edificio de este espacio común.");
      const description = String(form.get("descripcion") ?? "").trim();
      if (!description) throw new Error("Ingresá una descripción.");
      if (editor !== "new") {
        const { data } = await apiRequest<RecordData>(`/reservaciones/${editor.id}`);
        if (!data || !canModifyReservation(data, user.id)) throw new Error("La reserva ya no se puede modificar.");
      }
      await apiRequest(`/${kind}${editor === "new" ? "" : `/${editor.id}`}`, {
        method: editor === "new" ? "POST" : "PUT",
        body: { descripcion: description, ...(editor === "new" ? { usuarioId: user.id } : {}),
          ...(reservation ? { areaComunId: spaceId, fechaReservacion: reservationDate(String(form.get("fechaReservacion"))) } : { unidadId: spaceId }) },
      });
      setEditor(null); setNotice(reservation ? "Reserva guardada." : "Incidencia reportada."); await load();
    } catch (err) { setFormError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!canceling || !user) return;
    setBusy(true); setFormError(""); setNotice("");
    try {
      const { data } = await apiRequest<RecordData>(`/reservaciones/${canceling.id}`);
      if (!data || !canModifyReservation(data, user.id)) throw new Error("La reserva ya no se puede cancelar.");
      await apiRequest(`/reservaciones/${canceling.id}`, { method: "PUT", body: { estado: "Cancelado" } });
      setCanceling(null); setNotice("Reserva cancelada."); await load();
    } catch (err) { setFormError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  const title = reservation ? "Mis reservas" : "Mis incidencias";
  return <>
    <div className="bo-page-heading"><div><p className="bo-eyebrow">MI CONSORCIO</p><h1>{title}</h1><p>{reservation ? "Reservá un espacio común de tu edificio." : "Reportá un problema en los espacios comunes y consultá su estado."}</p></div><button className="bo-button" disabled={loading || busy || !!error || !spaces.length} onClick={() => { setEditor("new"); setFormError(""); }}>{reservation ? "+ Nueva reserva" : "+ Reportar incidencia"}</button></div>
    {notice && <p className="bo-success" role="status">{notice}</p>}
    {error && <p className="bo-alert" role="alert">{error}</p>}
    {!loading && !error && !spaces.length && <p className="bo-alert">Para reservar o reportar una incidencia necesitás un rol vigente en una propiedad del edificio. Si ya tenés una propiedad vinculada, consultá a la administración.</p>}
    <section className="bo-card bo-table-card"><div className="bo-toolbar"><h2>{title}</h2><button className="bo-button secondary" disabled={loading || busy} onClick={() => { setLoading(true); void load(); }}>Actualizar</button></div>
      {loading ? <p className="bo-empty" role="status">Cargando…</p> : error ? <p className="bo-empty">No se pudo consultar la información. Intentá actualizar.</p> : !rows.length ? <p className="bo-empty">{reservation ? "Todavía no hiciste reservas." : "Todavía no reportaste incidencias."}</p> : <div className="bo-table-scroll"><table><thead><tr><th>Espacio común</th>{reservation && <th>Día</th>}<th>Descripción</th><th>Estado</th>{reservation && <th>Acciones</th>}</tr></thead><tbody>{rows.map(row => {
        const id = relationId(row, reservation ? "areaComun" : "unidad");
        const space = spaces.find(space => space.id === id);
        return <tr key={row.id}><td>{space ? `${recordLabel(space)} · Edificio #${relationId(space, "edificio")}` : `Espacio #${id ?? "—"}`}</td>{reservation && <td>{reservationDay(String(row.fechaReservacion)).split("-").reverse().join("/")}</td>}<td className="bo-cell-content">{String(row.descripcion ?? "")}</td><td><span className="bo-badge">{String(row.estado ?? "")}</span></td>{reservation && <td><div className="bo-row-actions">{canModifyReservation(row, user?.id) && <>{spaces.some(space => space.id === id) && <button disabled={busy} onClick={() => { setEditor(row); setFormError(""); }}>Editar</button>}<button className="danger" disabled={busy} onClick={() => { setCanceling(row); setFormError(""); }}>Cancelar</button></>}</div></td>}</tr>;
      })}</tbody></table></div>}
    </section>
    {editor && <Modal title={reservation ? editor === "new" ? "Nueva reserva" : "Editar reserva" : "Reportar incidencia"} busy={busy} onClose={() => setEditor(null)}><form onSubmit={save}>{loading && <p className="bo-muted" role="status">Cargando espacios disponibles…</p>}{error && <p className="bo-alert" role="alert">{error}</p>}{!loading && !error && !spaces.length && <p className="bo-alert">No tenés espacios disponibles. Necesitás un rol vigente en una propiedad del edificio.</p>}{formError && <p className="bo-alert" role="alert">{formError}</p>}<fieldset className="bo-form-grid" disabled={busy || loading || !!error}><label className="bo-full">Espacio común<select name="space" required defaultValue={editor === "new" ? "" : relationId(editor, "areaComun")}><option value="">Seleccioná un espacio</option>{spaces.map(space => <option key={space.id} value={space.id}>{recordLabel(space)} · Edificio #{relationId(space, "edificio")}</option>)}</select></label>{reservation && <label className="bo-full">Día de la reserva<input name="fechaReservacion" type="date" required min={reservationDay()} defaultValue={editor === "new" ? "" : reservationDay(String(editor.fechaReservacion))} /></label>}<label className="bo-full">{reservation ? "Descripción de la reserva" : "¿Qué pasó?"}<textarea name="descripcion" required maxLength={255} defaultValue={editor === "new" ? "" : String(editor.descripcion ?? "")} /></label></fieldset><div className="bo-form-actions"><button className="bo-button secondary" type="button" disabled={busy} onClick={() => setEditor(null)}>Volver</button><button className="bo-button" disabled={busy || loading || !!error || !spaces.length}>{busy ? "Guardando…" : reservation ? "Guardar reserva" : "Enviar reporte"}</button></div></form></Modal>}
    {canceling && <Modal title="Cancelar reserva" busy={busy} onClose={() => setCanceling(null)}><p>¿Querés cancelar la reserva #{canceling.id}? No podrás reactivarla.</p>{formError && <p className="bo-alert" role="alert">{formError}</p>}<div className="bo-form-actions"><button className="bo-button secondary" disabled={busy} onClick={() => setCanceling(null)}>Volver</button><button className="bo-button destructive" disabled={busy} onClick={cancel}>{busy ? "Cancelando…" : "Confirmar cancelación"}</button></div></Modal>}
  </>;
}
