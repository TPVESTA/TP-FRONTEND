export interface RecordData {
  id: number;
  [key: string]: unknown;
}
export interface Field {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "date" | "datetime-local" | "textarea";
  source?: string;
  relation?: string;
  optional?: boolean;
  min?: number;
  max?: number;
  step?: string;
  pattern?: string;
  scope?: string;
  options?: { value: string; label: string }[];
  readOnly?: boolean;
  omitUnchanged?: boolean;
  listLabel?: string;
}
export interface Resource {
  title: string;
  singular: string;
  description: string;
  fields: Field[];
  softDelete?: boolean;
}
const name: Field = { name: "nombre", label: "Nombre", min: 2, max: 100 };
const description: Field = {
  name: "descripcion",
  label: "Descripción",
  type: "textarea",
};
const tax: Field = {
  name: "cuit",
  label: "CUIT (11 dígitos)",
  listLabel: "CUIT",
  pattern: "[0-9]{11}",
  max: 11,
};
const ref = (
  name: string,
  label: string,
  source: string,
  relation: string,
): Field => ({ name, label, source, relation });
const period: Field[] = [
  {
    name: "beginAt",
    label: "Inicio de vigencia",
    type: "datetime-local",
    optional: true,
  },
  {
    name: "endAt",
    label: "Fin de vigencia",
    type: "datetime-local",
    optional: true,
  },
];
const unit: Field[] = [
  { name: "nroUnidad", label: "Número de unidad", max: 255 },
  {
    name: "mtCuadrados",
    label: "Superficie (m²)",
    type: "number",
    min: 0,
    step: "0.01",
  },
  description,
  ref("edificioId", "Edificio", "edificios", "edificio"),
  ref("tipoUnidadId", "Tipo de unidad", "tipos-unidad", "tipoUnidad"),
];
const unitFields = (scope: "PRIVADO" | "COMUN") =>
  unit.map((field) =>
    field.name === "tipoUnidadId" ? { ...field, scope } : field,
  );
// Mantener los valores alineados con provinciasArgentinas del backend.
const provinciasArgentinas = [
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Ciudad Autónoma de Buenos Aires",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego, Antártida e Islas del Atlántico Sur",
  "Tucumán",
];
export const resources: Record<string, Resource> = {
  administraciones: {
    title: "Administraciones de consorcio",
    singular: "administración",
    description: "Organizá las administraciones de los consorcios. La dirección es la calle; la localidad se elige aparte.",
    softDelete: true,
    fields: [
      name,
      tax,
      { name: "email", label: "Correo electrónico", type: "email", max: 255 },
      { name: "direccion", label: "Dirección", max: 255 },
      ref("localidadId", "Localidad", "localidades", "localidad"),
    ],
  },
  edificios: {
    title: "Edificios",
    singular: "edificio",
    description: "Gestioná los edificios y su ubicación.",
    softDelete: true,
    fields: [
      name,
      tax,
      { name: "direccion", label: "Dirección", max: 255 },
      ref("localidadId", "Localidad", "localidades", "localidad"),
    ],
  },
  propiedades: {
    title: "Propiedades",
    singular: "propiedad",
    description: "Administrá las unidades privadas de cada edificio.",
    fields: [
      ...unitFields("PRIVADO"),
      {
        name: "copropiedad",
        label: "Copropiedad (%)",
        type: "number",
        min: 0,
        max: 100,
        step: "0.0001",
      },
      { name: "habitaciones", label: "Habitaciones", type: "number", min: 0 },
    ],
  },
  "areas-comunes": {
    title: "Áreas comunes",
    singular: "área común",
    description: "Administrá los espacios compartidos y su capacidad.",
    fields: [
      ...unitFields("COMUN"),
      { name: "capacidad", label: "Capacidad", type: "number", min: 0, optional: true },
    ],
  },
  empleados: {
    title: "Empleados",
    singular: "empleo",
    description: "Vinculá usuarios con una administración y su función.",
    fields: [
      ref("usuarioId", "Usuario", "users", "usuarioRol.usuario"),
      ref(
        "administracionId",
        "Administración",
        "administraciones",
        "administracion",
      ),
      { ...ref("rolId", "Rol", "roles", "usuarioRol.rol"), scope: "ADMINISTRACION" },
      ...period,
    ],
  },
  "admin-edificios": {
    title: "Administración de edificios",
    singular: "vínculo",
    description:
      "Definí qué administración gestiona cada edificio y durante qué período.",
    fields: [
      ref(
        "administracionId",
        "Administración",
        "administraciones",
        "administracion",
      ),
      ref("edificioId", "Edificio", "edificios", "edificio"),
      ...period,
    ],
  },
  localidades: {
    title: "Localidades",
    singular: "localidad",
    description: "Mantené el catálogo de localidades y provincias.",
    fields: [
      name,
      {
        name: "provincia",
        label: "Provincia",
        options: provinciasArgentinas.map((provincia) => ({
          value: provincia,
          label: provincia,
        })),
      },
    ],
  },
  "tipos-unidad": {
    title: "Tipos de unidad",
    singular: "tipo de unidad",
    description:
      "Clasificá los tipos como privados o comunes. Editá los tipos sin clasificar para definir su ámbito.",
    fields: [
      name,
      {
        name: "ambito",
        label: "Ámbito de la unidad",
        listLabel: "Ámbito",
        options: [
          { value: "PRIVADO", label: "Privado" },
          { value: "COMUN", label: "Común" },
        ],
      },
    ],
  },
  incidencias: {
    title: "Incidencias",
    singular: "incidencia",
    description: "Consultá y actualizá los reportes de las unidades.",
    fields: [
      {
        name: "estado",
        label: "Estado",
        omitUnchanged: true,
        options: [
          { value: "Reportado", label: "Reportado" },
          { value: "En revisión", label: "En revisión" },
          { value: "Finalizado", label: "Finalizado" },
        ],
      },
      description,
      ref("usuarioId", "Usuario", "users", "usuario"),
      ref("unidadId", "Unidad", "unidades", "unidad"),
      {
        name: "closedAt",
        label: "Fecha de cierre",
        type: "datetime-local",
        optional: true,
        readOnly: true,
      },
    ],
  },
  reservaciones: {
    title: "Reservas",
    singular: "reserva",
    description: "Gestioná las reservas de las áreas comunes.",
    fields: [
      {
        name: "fechaReservacion",
        label: "Día de la reserva",
        type: "date",
      },
      {
        name: "estado",
        label: "Estado",
        readOnly: true,
        options: [
          { value: "Reservado", label: "Reservado" },
          { value: "Finalizado", label: "Finalizado" },
          { value: "Cancelado", label: "Cancelado" },
        ],
      },
      description,
      ref("usuarioId", "Usuario", "users", "usuario"),
      ref("areaComunId", "Área común", "areas-comunes", "areaComun"),
    ],
  },
};

export function recordLabel(row: RecordData): string {
  if (row.nombre)
    return `${row.nombre}${row.apellido ? ` ${row.apellido}` : ""}${row.provincia ? ` · ${row.provincia}` : ""}`;
  if (typeof row.descripcion === "string" && row.descripcion) return row.descripcion;
  if (row.nroUnidad) {
    const building = row.edificio;
    const buildingName = building && typeof building === "object" && "nombre" in building ? String(building.nombre) : "";
    return buildingName ? `Unidad ${row.nroUnidad} · ${buildingName}` : `Unidad ${row.nroUnidad}`;
  }
  if (row.email) return String(row.email);
  return "Sin nombre";
}
function readRelation(row: RecordData, relation: string): unknown {
  if (!relation.includes(".")) return row[relation];
  return relation.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as RecordData)[key];
  }, row);
}
export function fieldValue(row: RecordData, field: Field): string {
  const value = (field.relation ? readRelation(row, field.relation) : undefined) ?? row[field.name];
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "id" in value) return String(value.id);
  if (field.type === "date") return reservationDay(String(value));
  if (field.type === "datetime-local") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? ""
      : new Date(date.getTime() - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
  }
  return String(value);
}
export function resourceFields(resource: string, row?: RecordData): Field[] {
  return resources[resource].fields.map((field) => {
    if (["reservaciones", "incidencias"].includes(resource) &&
      (field.name === "usuarioId" || (resource === "incidencias" && !!row && field.name === "unidadId"))) {
      return { ...field, readOnly: true };
    }
    if (resource === "reservaciones" && row) {
      return {
        ...field,
        readOnly:
          field.readOnly ||
          field.name === "usuarioId" ||
          row.estado !== "Reservado",
      };
    }
    if (resource !== "incidencias" || field.name !== "estado") return field;
    if (!row) return { ...field, readOnly: true };
    const index = field.options!.findIndex(
      (option) => option.value === row.estado,
    );
    return {
      ...field,
      readOnly: index < 0 || index === field.options!.length - 1,
      options:
        index < 0 ? field.options : field.options!.slice(index, index + 2),
    };
  });
}

export function resourcePayload(
  form: FormData,
  fields: Field[],
  row?: RecordData,
) {
  const reservation = fields.some((field) => field.name === "fechaReservacion");
  if (reservation && row && row.estado !== "Reservado")
    throw new Error("Solo se puede modificar una reserva en estado Reservado.");
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    if (
      reservation &&
      (field.name === "estado" || (row && field.name === "usuarioId"))
    )
      continue;
    if (field.readOnly) continue;
    const value = String(form.get(field.name) ?? "");
    if (field.omitUnchanged && row && value === row[field.name]) continue;
    if (
      field.options &&
      !field.options.some((option) => option.value === value)
    )
      throw new Error(`Seleccioná una opción válida para ${field.label}.`);
    if (!value && field.optional) {
      if (field.name !== "beginAt") body[field.name] = null;
      continue;
    }
    body[field.name] =
      field.source || field.type === "number"
        ? Number(value)
        : field.type === "date"
          ? reservationDate(value)
          : field.type === "datetime-local"
            ? new Date(value).toISOString()
            : value.trim();
  }
  if (body.beginAt && body.endAt && String(body.endAt) < String(body.beginAt))
    throw new Error("La fecha de fin no puede ser anterior a la de inicio.");
  return body;
}

export const RESERVATION_TIME_ZONE = "America/Argentina/Buenos_Aires";

export function reservationDay(value: string | Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESERVATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function reservationDate(day: string, now = new Date()): string {
  // Medianoche de Buenos Aires: la conversión a UTC conserva el día elegido.
  const iso = `${day}T00:00:00-03:00`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || reservationDay(iso) !== day)
    throw new Error("Seleccioná un día válido para la reserva.");
  if (day < reservationDay(now))
    throw new Error("No se puede reservar un día que ya terminó.");
  return iso;
}

/** @deprecated Use canBusiness from permissions.ts for authorization by context. */
export function canModifyReservation(
  row: RecordData,
  userId?: number,
  systemAdmin = false,
): boolean {
  const owner = row.usuario ?? row.usuarioId;
  const ownerId =
    typeof owner === "object" && owner !== null && "id" in owner
      ? owner.id
      : owner;
  return (
    userId !== undefined &&
    (systemAdmin || Number(ownerId) === userId) &&
    row.estado === "Reservado"
  );
}
