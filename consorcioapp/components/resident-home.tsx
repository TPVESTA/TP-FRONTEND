"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { errorMessage, list } from "@/lib/backoffice";
import { canResource, hasPermission, relationId } from "@/lib/permissions";
import { recordLabel, reservationDay, type RecordData } from "@/lib/resources";
import { useCurrentUser, usePermissions } from "./backoffice-shell";
import Availability from "./availability";
import { useApiData } from "@/lib/use-api-data";

const noRows: RecordData[] = [];
const emptyHome = { properties: noRows, spaces: noRows, errors: [] as string[] };

function Summary({ resource, propertyId }: { resource: "reservaciones" | "incidencias"; propertyId?: number }) {
  const permissions = usePermissions();
  const user = useCurrentUser();
  const load = useCallback((signal: AbortSignal) => list<RecordData>(`/${resource}`, signal), [resource]);
  // Si cambian los permisos, el listado visible puede cambiar: se vuelve a pedir.
  const { data: rows, loading, error, reload } = useApiData(load, noRows, permissions);
  const reservation = resource === "reservaciones";
  const filtered = rows.filter(r => relationId(r, "usuario") === user?.id && (!propertyId || relationId(r, "propiedadOrigen") === propertyId || !reservation && !relationId(r, "propiedadOrigen") && relationId(r, "unidad") === propertyId))
    .filter(r => reservation ? r.estado === "Reservado" && reservationDay(String(r.fechaReservacion)) >= reservationDay() : ["Reportado", "En revisión"].includes(String(r.estado)));
  return <section className="bo-card"><div className="resident-section-heading"><h2>{reservation ? "Tus próximas reservas" : "Tus incidencias abiertas"}</h2><Link href={reservation ? "/mi-consorcio/reservas" : "/mi-consorcio/incidencias"}>Ver todas →</Link></div>{loading ? <p role="status">Cargando…</p> : error ? <p className="bo-alert" role="alert">{error} <button onClick={reload}>Reintentar consulta</button></p> : filtered.length ? <ul className="resident-reports">{filtered.map(r => <li key={r.id}><strong>#{r.id} · {String(r.estado)}</strong>{reservation && <p>{reservationDay(String(r.fechaReservacion)).split("-").reverse().join("/")}</p>}<p>{String(r.descripcion ?? "")}</p></li>)}</ul> : <p className="bo-empty">No hay registros pendientes para este contexto.</p>}</section>;
}

export default function ResidentHome() {
  const user = useCurrentUser();
  const permissions = usePermissions();
  const [selectedId, setSelectedId] = useState(0);
  const [spaceId, setSpaceId] = useState(0);
  // Propiedades y áreas comunes se piden juntas; si una falla, la otra se muestra igual.
  const load = useCallback(async (signal: AbortSignal) => {
    const paths = ["propiedades", "areas-comunes"].filter(r => canResource(permissions, r, "LEER"));
    const results = await Promise.allSettled(paths.map(r => list<RecordData>(`/${r}`, signal)));
    return {
      properties: results.flatMap((r, i) => paths[i] === "propiedades" && r.status === "fulfilled" ? r.value : []),
      spaces: results.flatMap((r, i) => paths[i] === "areas-comunes" && r.status === "fulfilled" ? r.value : []),
      errors: results.flatMap((r, i) => r.status === "rejected" ? [`${paths[i]}: ${errorMessage(r.reason)}`] : []),
    };
  }, [permissions]);
  const { data: { properties, spaces, errors }, loading, reload } = useApiData(load, emptyHome);
  const propertyIds = [...new Set(permissions.filter(p => p.ambito === "PROPIEDAD").flatMap(p => p.propiedadId ? [p.propiedadId] : []))];
  const selected = propertyIds.includes(selectedId) ? selectedId : propertyIds[0];
  const grants = permissions.filter(p => p.propiedadId === selected);
  const target = selected ? { propiedadId: selected, edificioId: grants[0]?.edificioIds[0] } : undefined;
  const buildingId = target?.edificioId;
  const available = spaces.filter(s => {
    const building = relationId(s, "edificio");
    return building && (!buildingId || building === buildingId) && hasPermission(permissions, "RESERVAS", "DISPONIBILIDAD", { edificioId: building });
  });
  const selectedSpace = available.find(s => s.id === spaceId) ?? available[0];
  return <><div className="bo-page-heading"><div><p className="bo-eyebrow">MI CONSORCIO</p><h1>Hola, {user?.nombre}</h1><p>Consultá las acciones disponibles para tus permisos actuales.</p></div></div>
    <div className="resident-properties">{loading ? <p role="status">Consultando tus propiedades…</p> : propertyIds.length ? <label>Tu propiedad<select value={selected} onChange={e => setSelectedId(Number(e.target.value))}>{propertyIds.map(id => <option key={id} value={id}>{recordLabel(properties.find(p => p.id === id) ?? { id })} · {permissions.filter(p => p.propiedadId === id).map(p => p.rolCodigo ?? "Rol personalizado").join(" / ")}</option>)}</select></label> : <p>No tenés propiedades vinculadas. Si necesitás acceso como residente, consultá a la administración.</p>}</div>
    {!!errors.length && <div className="bo-alert" role="alert">{errors.join(". ")} <button disabled={loading} onClick={reload}>Actualizar datos</button></div>}
    <div className="resident-actions">{hasPermission(permissions, "RESERVAS", "CREAR", target) && <Link href="/mi-consorcio/reservas?nueva=1" className="resident-action"><h2>Reservar un espacio</h2><p>Elegí un espacio común y el día de tu reserva.</p></Link>}{hasPermission(permissions, "INCIDENCIAS", "CREAR", target) && <Link href="/mi-consorcio/incidencias?nueva=1" className="resident-action report"><h2>Reportar un problema</h2><p>Reportá una incidencia en tu propiedad o un espacio común.</p></Link>}</div>
    <div className="resident-summary">{hasPermission(permissions, "RESERVAS", "LEER", target) && <Summary resource="reservaciones" propertyId={selected} />}{hasPermission(permissions, "INCIDENCIAS", "LEER", target) && <Summary resource="incidencias" propertyId={selected} />}</div>
    {selectedSpace && <section className="bo-card"><h2>Disponibilidad sin datos personales</h2><label>Espacio común<select value={selectedSpace.id} onChange={e => setSpaceId(Number(e.target.value))}>{available.map(s => <option key={s.id} value={s.id}>{recordLabel(s)}</option>)}</select></label><Availability key={selectedSpace.id} areaId={selectedSpace.id} /></section>}
    {!permissions.length && <p className="bo-alert" role="status">Tu cuenta está activa y todavía no tiene permisos de negocio. Consultá a la administración.</p>}
  </>;
}
