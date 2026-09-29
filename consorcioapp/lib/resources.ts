export interface RecordData {
  id: number;
  [key: string]: unknown;
}
export interface Field {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "datetime-local" | "textarea";
  source?: string;
  relation?: string;
  optional?: boolean;
  min?: number;
  max?: number;
  step?: string;
  pattern?: string;
  scope?: string;
  options?: { value: string; label: string }[];
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
export const resources: Record<string, Resource> = {
  administraciones: {
    title: "Administraciones de consorcio",
    singular: "administración",
    description: "Organizá las administraciones de los consorcios.",
    softDelete: true,
    fields: [
      name,
      tax,
      { name: "email", label: "Correo electrónico", type: "email", max: 255 },
      { name: "direccion", label: "Dirección", max: 255 },
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
      { name: "capacidad", label: "Capacidad", type: "number", min: 0 },
    ],
  },
  empleados: {
    title: "Empleados",
    singular: "empleo",
    description: "Vinculá usuarios con una administración y su función.",
    fields: [
      ref("usuarioId", "Usuario", "users", "usuario"),
      ref(
        "administracionId",
        "Administración",
        "administraciones",
        "administracion",
      ),
      { ...ref("rolId", "Rol", "roles", "rol"), scope: "ADMINISTRACION" },
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
    fields: [name, { name: "provincia", label: "Provincia", max: 255 }],
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
      { name: "estado", label: "Estado", max: 255 },
      description,
      ref("usuarioId", "Usuario", "users", "usuario"),
      ref("unidadId", "Unidad", "unidades", "unidad"),
      {
        name: "closedAt",
        label: "Fecha de cierre",
        type: "datetime-local",
        optional: true,
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
        label: "Fecha y hora",
        type: "datetime-local",
      },
      { name: "estado", label: "Estado", max: 255 },
      description,
      ref("usuarioId", "Usuario", "users", "usuario"),
      ref("areaComunId", "Área común", "areas-comunes", "areaComun"),
    ],
  },
};

export function recordLabel(row: RecordData): string {
  if (row.nombre)
    return `${row.nombre}${row.apellido ? ` ${row.apellido}` : ""}${row.provincia ? ` · ${row.provincia}` : ""} (#${row.id})`;
  if (row.nroUnidad) return `Unidad ${row.nroUnidad} (#${row.id})`;
  return `#${row.id}`;
}
export function fieldValue(row: RecordData, field: Field): string {
  const value = row[field.relation ?? field.name];
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "id" in value) return String(value.id);
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
export function resourcePayload(form: FormData, fields: Field[]) {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    const value = String(form.get(field.name) ?? "");
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
        : field.type === "datetime-local"
          ? new Date(value).toISOString()
          : value.trim();
  }
  if (body.beginAt && body.endAt && String(body.endAt) < String(body.beginAt))
    throw new Error("La fecha de fin no puede ser anterior a la de inicio.");
  return body;
}
