"use client";
import { useCallback } from "react";
import { list } from "@/lib/backoffice";
import { reservationDay, type RecordData } from "@/lib/resources";
import { useApiData } from "@/lib/use-api-data";

export default function Availability({ areaId }: { areaId: number }) {
  const load = useCallback((signal: AbortSignal) => list<RecordData>(`/reservaciones/disponibilidad?areaComunId=${areaId}`, signal), [areaId]);
  const { data: rows, loading, error, reload } = useApiData(load, [] as RecordData[]);
  const occupied = rows.filter(r => r.estado === "Reservado" && reservationDay(String(r.fechaReservacion)) >= reservationDay());
  return <div className="bo-full bo-confirm"><h3>Ocupación del espacio</h3>{loading ? <p role="status">Consultando disponibilidad…</p> : error ? <p role="alert">{error} <button type="button" onClick={reload}>Reintentar consulta</button></p> : <p>{occupied.length ? occupied.map(r => reservationDay(String(r.fechaReservacion)).split("-").reverse().join("/")).join(" · ") : "No hay reservas próximas registradas."}</p>}</div>;
}
