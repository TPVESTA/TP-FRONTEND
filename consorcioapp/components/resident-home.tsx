"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, list } from "@/lib/backoffice";
import { buildingRequests, currentPropertyAssignments, relationId } from "@/lib/resident-access";
import { reservationDay, type RecordData } from "@/lib/resources";
import { useCurrentUser } from "./backoffice-shell";

interface HomeData {
  reservations: RecordData[];
  reports: RecordData[];
  assignments: RecordData[];
  properties: RecordData[];
  buildings: RecordData[];
  roles: RecordData[];
  spaces: RecordData[];
}

function related(row: RecordData, name: string, records: RecordData[]) {
  const match = records.find(record => record.id === relationId(row, name));
  const embedded = row[name];
  return match ?? (typeof embedded === "object" && embedded !== null ? embedded as RecordData : undefined);
}

function ActionIcon({ report = false }: { report?: boolean }) {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {report ? <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 9v4m0 3h.01" /></> : <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18m-13 5h3" /></>}
  </svg>;
}

export default function ResidentHome() {
  const user = useCurrentUser();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!user) return;
    try {
      const [reservations, reports, assignments, properties, buildings, roles, spaces] = await Promise.all(
        ["/reservaciones", "/incidencias", "/usuarios-roles-propiedad", "/propiedades", "/edificios", "/roles", "/areas-comunes"].map(path => list<RecordData>(path, signal)),
      );
      if (signal?.aborted) return;
      setData({ reservations, reports, assignments, properties, buildings, roles, spaces });
      setError("");
    } catch (err) {
      if (!signal?.aborted) setError(errorMessage(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [user]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const assignments = data && user ? currentPropertyAssignments(user.id, data.assignments) : [];
  const properties = Array.from(new Set(assignments.map(assignment => relationId(assignment, "propiedad"))))
    .flatMap(id => {
      const assignment = assignments.find(assignment => relationId(assignment, "propiedad") === id)!;
      const property = related(assignment, "propiedad", data!.properties);
      return property ? [property] : [];
    });
  const selectedProperty = properties.find(property => property.id === selectedPropertyId) ?? properties[0];
  const buildingId = selectedProperty && relationId(selectedProperty, "edificio");
  const building = selectedProperty && related(selectedProperty, "edificio", data?.buildings ?? []);
  const buildingLabel = String(building?.nombre ?? (buildingId ? `Edificio #${buildingId}` : "Edificio sin información"));
  const units = [...(data?.spaces ?? []), ...(data?.properties ?? [])];
  const today = reservationDay();
  const reservations = buildingRequests(data?.reservations ?? [], "areaComun", data?.spaces ?? [], buildingId)
    .filter(row => row.estado === "Reservado" && reservationDay(String(row.fechaReservacion)) >= today)
    .sort((a, b) => String(a.fechaReservacion).localeCompare(String(b.fechaReservacion)) || a.id - b.id);
  const reports = buildingRequests(data?.reports ?? [], "unidad", units, buildingId)
    .filter(row => row.estado === "Reportado" || row.estado === "En revisión");

  function spaceLabel(row: RecordData, name: string) {
    const space = related(row, name, units);
    if (!space) return `Espacio #${relationId(row, name) ?? "—"}`;
    const building = related(space, "edificio", data?.buildings ?? []);
    return `${space.nombre ?? space.nroUnidad ?? `Espacio #${space.id}`}${building ? ` · ${building.nombre ?? `Edificio #${building.id}`}` : ""}`;
  }

  return <>
    <div className="bo-page-heading"><div><p className="bo-eyebrow">MI CONSORCIO · INICIO</p><h1>Hola, {user?.nombre}</h1><p>¿Qué necesitás hacer hoy?</p></div></div>
    <div className="resident-properties" aria-label="Tus roles y propiedades">
      {loading ? <p className="bo-muted" role="status">Consultando tus propiedades…</p> : error ? <p className="bo-muted">No se pudieron consultar tus propiedades.</p> : properties.length ? <>
        <label className="resident-property-picker" htmlFor="resident-property">Tu propiedad
          <select id="resident-property" value={selectedProperty?.id ?? ""} onChange={event => setSelectedPropertyId(Number(event.target.value))}>
            {properties.map(property => {
              const roles = assignments.filter(assignment => relationId(assignment, "propiedad") === property.id)
                .map(assignment => String(related(assignment, "rol", data!.roles)?.nombre ?? `Rol #${relationId(assignment, "rol")}`));
              const building = related(property, "edificio", data!.buildings);
              return <option key={property.id} value={property.id}>{Array.from(new Set(roles)).join(" / ")} del {String(property.nroUnidad ?? `inmueble #${property.id}`)} del edificio {String(building?.nombre ?? `#${relationId(property, "edificio") ?? "—"}`)}</option>;
            })}
          </select>
        </label>
        <p className="bo-muted" role="status">Reservas próximas y reportes abiertos de {buildingLabel}.</p>
      </> : <p className="bo-muted">Todavía no tenés un rol vigente en una propiedad. Consultá a la administración para vincularla.</p>}
    </div>
    <div className="resident-actions">
      <Link href="/mi-consorcio/reservas?nueva=1" className="resident-action"><span className="resident-action-icon"><ActionIcon /></span><h2>Reservar un espacio</h2><p>Elegí un espacio común y el día de tu reserva.</p><strong>Crear reserva <span aria-hidden="true">→</span></strong></Link>
      <Link href="/mi-consorcio/incidencias?nueva=1" className="resident-action report"><span className="resident-action-icon"><ActionIcon report /></span><h2>Reportar un problema</h2><p>Contanos qué pasó para que podamos resolverlo.</p><strong>Enviar reporte <span aria-hidden="true">→</span></strong></Link>
    </div>
    {error && <p className="bo-alert" role="alert">No pudimos cargar tu resumen: {error} <button disabled={loading} onClick={() => { setLoading(true); void load(); }}>Reintentar</button></p>}
    <div className="resident-summary" aria-busy={loading}>
      <section className="bo-card"><div className="resident-section-heading"><h2>Reservas del edificio{!loading && !error ? ` (${reservations.length})` : ""}</h2><Link href="/mi-consorcio/reservas">Ver mis reservas →</Link></div>
        {loading ? <p className="bo-empty" role="status">Cargando reservas…</p> : error ? <p className="bo-empty">No se pudieron consultar las reservas.</p> : !selectedProperty ? <p className="bo-empty">Necesitás una propiedad vinculada para consultar las reservas de su edificio.</p> : reservations.length ? <ul className="resident-reports">{reservations.map(reservation => <li key={reservation.id}><div><h3>{spaceLabel(reservation, "areaComun")}</h3><span className="bo-badge active">{String(reservation.estado)}</span></div><p className="resident-date">{new Intl.DateTimeFormat("es-AR", { dateStyle: "full", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(String(reservation.fechaReservacion)))}</p><p>{String(reservation.descripcion ?? "")}</p></li>)}</ul> : <div className="bo-empty"><h3>No hay reservas próximas en este edificio</h3><p>Las reservas vigentes desde hoy aparecerán acá.</p></div>}
      </section>
      <section className="bo-card"><div className="resident-section-heading"><h2>Reportes abiertos del edificio{!loading && !error ? ` (${reports.length})` : ""}</h2><Link href="/mi-consorcio/incidencias">Ver mis reportes →</Link></div>
        {loading ? <p className="bo-empty" role="status">Cargando reportes…</p> : error ? <p className="bo-empty">No se pudieron consultar los reportes.</p> : !selectedProperty ? <p className="bo-empty">Necesitás una propiedad vinculada para consultar los reportes de su edificio.</p> : reports.length ? <ul className="resident-reports">{reports.map(report => <li key={report.id}><div><h3>{spaceLabel(report, "unidad")}</h3><span className="bo-badge">{String(report.estado)}</span></div><p>{String(report.descripcion ?? "")}</p></li>)}</ul> : <div className="bo-empty"><h3>No hay reportes abiertos en este edificio</h3><p>Los problemas reportados o en revisión aparecerán acá.</p></div>}
      </section>
    </div>
  </>;
}
