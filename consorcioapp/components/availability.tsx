"use client";
import { useEffect, useState } from "react";
import { list, errorMessage } from "@/lib/backoffice";
import { reservationDay, type RecordData } from "@/lib/resources";

export default function Availability({ areaId }: { areaId: number }) {
  const [rows, setRows] = useState<RecordData[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    list<RecordData>(`/reservaciones/disponibilidad?areaComunId=${areaId}`, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setRows(data); setError(""); } })
      .catch(err => { if (!controller.signal.aborted) { setRows([]); setError(errorMessage(err)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [areaId, attempt]);
  const occupied = rows.filter(r => r.estado === "Reservado" && reservationDay(String(r.fechaReservacion)) >= reservationDay());
  return <div className="bo-full bo-confirm"><h3>Ocupación del espacio</h3>{loading ? <p role="status">Consultando disponibilidad…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => { setLoading(true); setAttempt(a => a + 1); }}>Reintentar consulta</button></p> : <p>{occupied.length ? occupied.map(r => reservationDay(String(r.fechaReservacion)).split("-").reverse().join("/")).join(" · ") : "No hay reservas próximas registradas."}</p>}</div>;
}
