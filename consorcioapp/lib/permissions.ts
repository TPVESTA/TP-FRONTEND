import type { RecordData } from "./resources";

export const sections = [
  "RESERVAS",
  "INCIDENCIAS",
  "EXPENSAS",
  "USUARIOS",
  "ROLES",
  "ASIGNACIONES",
  "ESTRUCTURA",
  "PROPIEDADES",
  "CATALOGOS",
  "ADMINISTRACIONES",
] as const;
export const actions = [
  "CREAR",
  "LEER",
  "EDITAR",
  "BORRAR",
  "DISPONIBILIDAD",
  "CAMBIAR_ESTADO",
  "EMITIR",
  "ANULAR",
  "REGISTRAR_PAGO",
  "ASIGNAR",
  "REVOCAR",
  "DESHABILITAR",
] as const;
export type Section = (typeof sections)[number];
export type Action = (typeof actions)[number];
export type Scope = "GLOBAL" | "PROPIEDAD" | "ADMINISTRACION";
export interface Permission {
  seccion: Section;
  crear: boolean;
  leer: boolean;
  editar: boolean;
  borrar: boolean;
  acciones: Action[];
}
export interface PermissionContext {
  rolId: number;
  rolCodigo: string | null;
  ambito: Scope;
  propiedadId?: number;
  administracionId?: number;
  edificioIds: number[];
  permisos: Permission[];
}
export interface Target {
  propiedadId?: number;
  administracionId?: number;
  edificioId?: number;
}
export const isSystemAdmin = (contexts: PermissionContext[]) =>
  contexts.some(
    (c) =>
      c.ambito === "GLOBAL" &&
      ["SUPERADMIN", "SYSADMIN"].includes(c.rolCodigo ?? ""),
  );
export function permissionAllows(p: Permission, action: Action): boolean {
  if (action === "CREAR") return p.crear === true;
  if (action === "LEER") return p.leer === true;
  if (action === "EDITAR") return p.editar === true;
  if (action === "BORRAR") return p.borrar === true;
  return p.acciones.includes(action);
}
export function matchingGrants(
  contexts: PermissionContext[],
  section: Section,
  action: Action,
  target?: Target,
  scope?: Scope,
): PermissionContext[] {
  if (!sections.includes(section) || !actions.includes(action)) return [];
  if (
    target &&
    Object.values(target).some(
      (id) => id !== undefined && (!Number.isSafeInteger(id) || id <= 0),
    )
  )
    return [];
  return contexts.filter((c) => {
    if (isSystemAdmin([c])) return true;
    if (scope && c.ambito !== scope) return false;
    if (
      !c.permisos.some(
        (p) => p.seccion === section && permissionAllows(p, action),
      )
    )
      return false;
    if (!target || c.ambito === "GLOBAL") return true;
    if (c.ambito === "PROPIEDAD")
      return (
        target.administracionId === undefined &&
        (target.propiedadId !== undefined
          ? target.propiedadId === c.propiedadId &&
            (target.edificioId === undefined ||
              c.edificioIds.includes(target.edificioId))
          : target.edificioId !== undefined &&
            c.edificioIds.includes(target.edificioId))
      );
    return (
      (target.administracionId === undefined ||
        target.administracionId === c.administracionId) &&
      (target.edificioId !== undefined
        ? c.edificioIds.includes(target.edificioId)
        : target.administracionId !== undefined &&
          target.administracionId === c.administracionId)
    );
  });
}
export const hasPermission = (
  contexts: PermissionContext[],
  section: Section,
  action: Action,
  target?: Target,
  scope?: Scope,
) => matchingGrants(contexts, section, action, target, scope).length > 0;
export const managementPermission = (
  contexts: PermissionContext[],
  section: Section,
  action: Action,
  target?: Target,
) =>
  matchingGrants(contexts, section, action, target).some(
    (c) => c.ambito !== "PROPIEDAD",
  );
export function relationId(row: RecordData, key: string): number | undefined {
  const ref = row[key] ?? row[`${key}Id`];
  const id = Number(
    typeof ref === "object" && ref !== null && "id" in ref ? ref.id : ref,
  );
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
export function recordTarget(
  row: RecordData,
  resource: string,
  refs: Record<string, RecordData[]> = {},
): Target {
  if (resource === "edificios") return { edificioId: row.id };
  if (resource === "administraciones") return { administracionId: row.id };
  const relation =
    resource === "reservaciones"
      ? "areaComun"
      : resource === "incidencias"
        ? "unidad"
        : undefined;
  let building = relationId(row, "edificio");
  if (relation) {
    const embedded = row[relation];
    const unit = (
      refs[relation === "areaComun" ? "areas-comunes" : "unidades"] ?? []
    ).find((u) => u.id === relationId(row, relation));
    building = unit
      ? relationId(unit, "edificio")
      : typeof embedded === "object" && embedded !== null
        ? relationId(embedded as RecordData, "edificio")
        : undefined;
  }
  const property =
    resource === "propiedades"
      ? row.id
      : (relationId(row, "propiedadOrigen") ??
        (resource === "incidencias" &&
        (refs.propiedades ?? []).some((p) => p.id === relationId(row, "unidad"))
          ? relationId(row, "unidad")
          : undefined));
  return {
    ...(building ? { edificioId: building } : {}),
    ...(property ? { propiedadId: property } : {}),
    ...(relationId(row, "administracion")
      ? { administracionId: relationId(row, "administracion") }
      : {}),
  };
}
export function canBusiness(
  contexts: PermissionContext[],
  section: "RESERVAS" | "INCIDENCIAS",
  action: Action,
  row: RecordData,
  userId?: number,
  refs: Record<string, RecordData[]> = {},
): boolean {
  const target = recordTarget(
    row,
    section === "RESERVAS" ? "reservaciones" : "incidencias",
    refs,
  );
  if (
    section === "RESERVAS" &&
    action === "EDITAR" &&
    row.estado !== "Reservado"
  )
    return false;
  // A missing relation must never turn a row check into general route access.
  if (
    !target.edificioId &&
    !hasPermission(contexts, section, action, undefined, "GLOBAL")
  )
    return false;
  if (managementPermission(contexts, section, action, target)) return true;
  if (
    action === "CAMBIAR_ESTADO" ||
    relationId(row, "usuario") !== userId ||
    !target.propiedadId
  )
    return false;
  if (
    section === "INCIDENCIAS" &&
    action === "EDITAR" &&
    row.estado !== "Reportado"
  )
    return false;
  return hasPermission(contexts, section, action, target, "PROPIEDAD");
}
export const originPropertyIds = (
  contexts: PermissionContext[],
  section: Section,
  buildingId: number,
) => [
  ...new Set(
    matchingGrants(
      contexts,
      section,
      "CREAR",
      { edificioId: buildingId },
      "PROPIEDAD",
    )
      .filter((c) => c.ambito === "PROPIEDAD")
      .flatMap((c) => (c.propiedadId ? [c.propiedadId] : [])),
  ),
];
export const administrationIds = (
  contexts: PermissionContext[],
  section: Section,
  action: Action,
) => [
  ...new Set(
    matchingGrants(contexts, section, action).flatMap((c) =>
      c.administracionId ? [c.administracionId] : [],
    ),
  ),
];

export const resourceSections: Record<string, Section> = {
  reservaciones: "RESERVAS",
  incidencias: "INCIDENCIAS",
  users: "USUARIOS",
  roles: "ROLES",
  empleados: "ASIGNACIONES",
  "usuarios-roles": "ASIGNACIONES",
  "usuarios-roles-propiedad": "ASIGNACIONES",
  propiedades: "PROPIEDADES",
  edificios: "ESTRUCTURA",
  "areas-comunes": "ESTRUCTURA",
  unidades: "ESTRUCTURA",
  administraciones: "ADMINISTRACIONES",
  "admin-edificios": "ADMINISTRACIONES",
  localidades: "CATALOGOS",
  "tipos-unidad": "CATALOGOS",
};
export function canResource(
  contexts: PermissionContext[],
  resource: string,
  action: Action,
  target?: Target,
): boolean {
  let section = resourceSections[resource];
  if (!section) return false;
  if (resource === "unidades" && action === "LEER")
    return (
      hasPermission(contexts, "ESTRUCTURA", "LEER", target) ||
      hasPermission(contexts, "PROPIEDADES", "LEER", target)
    );
  if (resource === "roles" && action === "LEER")
    return (
      hasPermission(contexts, "ROLES", action, target, "GLOBAL") ||
      hasPermission(contexts, "ASIGNACIONES", "LEER", target, "ADMINISTRACION")
    );
  if (resource === "usuarios-roles" || resource === "roles")
    return hasPermission(contexts, section, action, target, "GLOBAL");
  if (section === "ASIGNACIONES")
    return action === "EDITAR"
      ? managementPermission(contexts, section, "REVOCAR", target) &&
          managementPermission(contexts, section, "ASIGNAR", target)
      : managementPermission(
          contexts,
          section,
          action === "CREAR"
            ? "ASIGNAR"
            : action === "BORRAR"
              ? "REVOCAR"
              : action,
          target,
        );
  if (section === "USUARIOS")
    return managementPermission(contexts, section, action, target);
  if (
    action !== "LEER" &&
    [
      "administraciones",
      "propiedades",
      "edificios",
      "areas-comunes",
      "admin-edificios",
    ].includes(resource)
  )
    section = "ESTRUCTURA";
  const global =
    (section === "CATALOGOS" && action !== "LEER") ||
    (action !== "LEER" &&
      (resource === "admin-edificios" ||
        (action === "CREAR" &&
          ["administraciones", "edificios"].includes(resource))));
  return (
    hasPermission(
      contexts,
      section,
      action,
      target,
      global
        ? "GLOBAL"
        : action !== "LEER" && section === "ESTRUCTURA"
          ? "ADMINISTRACION"
          : undefined,
    ) ||
    (!global && hasPermission(contexts, section, action, target, "GLOBAL"))
  );
}
export function canVisit(contexts: PermissionContext[], path: string): boolean {
  if (path === "/mi-consorcio") return true;
  if (path.startsWith("/mi-consorcio/reservas"))
    return hasPermission(contexts, "RESERVAS", "LEER");
  if (path.startsWith("/mi-consorcio/incidencias"))
    return hasPermission(contexts, "INCIDENCIAS", "LEER");
  if (path === "/backoffice")
    return Object.keys(resourceSections).some((r) =>
      canResource(contexts, r, "LEER"),
    );
  const resource = path.split("/")[2];
  return canResource(
    contexts,
    resource === "usuarios" ? "users" : resource,
    "LEER",
  );
}

export function validPermissions(value: unknown): value is Permission[] {
  return (
    Array.isArray(value) &&
    value.every(
      (p: Permission) =>
        p &&
        sections.includes(p.seccion) &&
        [p.crear, p.leer, p.editar, p.borrar].every(
          (v) => typeof v === "boolean",
        ) &&
        Array.isArray(p.acciones) &&
        p.acciones.every(
          (a) =>
            actions.includes(a) &&
            !["CREAR", "LEER", "EDITAR", "BORRAR"].includes(a),
        ),
    )
  );
}
export function validContexts(value: unknown): value is PermissionContext[] {
  return (
    Array.isArray(value) &&
    value.every(
      (c) =>
        c &&
        Number.isSafeInteger(c.rolId) &&
        c.rolId > 0 &&
        ["GLOBAL", "PROPIEDAD", "ADMINISTRACION"].includes(c.ambito) &&
        (c.ambito !== "PROPIEDAD" || c.propiedadId > 0) &&
        (c.ambito !== "ADMINISTRACION" || c.administracionId > 0) &&
        (c.rolCodigo === null || typeof c.rolCodigo === "string") &&
        [c.propiedadId, c.administracionId].every(
          (id) => id === undefined || (Number.isSafeInteger(id) && id > 0),
        ) &&
        Array.isArray(c.edificioIds) &&
        c.edificioIds.every(
          (id: number) => Number.isSafeInteger(id) && id > 0,
        ) &&
        validPermissions(c.permisos),
    )
  );
}

export function originPayload(
  contexts: PermissionContext[],
  section: "RESERVAS" | "INCIDENCIAS",
  buildingId: number,
  propertyId?: number,
  privateUnitId?: number,
): { propiedadId?: number } {
  if (
    managementPermission(contexts, section, "CREAR", { edificioId: buildingId })
  )
    return {};
  if (
    !propertyId ||
    !originPropertyIds(contexts, section, buildingId).includes(propertyId) ||
    (privateUnitId !== undefined && privateUnitId !== propertyId)
  )
    throw new Error("Seleccioná la propiedad que habilita esta operación.");
  return { propiedadId: propertyId };
}

interface DelegableRole {
  ambito: Scope;
  codigo?: string | null;
  permisos?: Permission[];
}
const propertyCaps: Record<string, Partial<Record<Section, Action[]>>> = {
  RESIDENTE: {
    RESERVAS: ["CREAR", "LEER", "EDITAR", "DISPONIBILIDAD"],
    INCIDENCIAS: ["CREAR", "LEER", "EDITAR"],
    EXPENSAS: ["LEER"],
    PROPIEDADES: ["LEER"],
    ESTRUCTURA: ["LEER"],
    CATALOGOS: ["LEER"],
  },
  PROPIETARIO: {
    INCIDENCIAS: ["CREAR", "LEER"],
    EXPENSAS: ["LEER"],
    PROPIEDADES: ["LEER"],
    ESTRUCTURA: ["LEER"],
    CATALOGOS: ["LEER"],
  },
};
export function canDelegate(
  contexts: PermissionContext[],
  role: DelegableRole,
  target: Target,
): boolean {
  if (!managementPermission(contexts, "ASIGNACIONES", "ASIGNAR", target))
    return false;
  if (hasPermission(contexts, "ASIGNACIONES", "ASIGNAR", undefined, "GLOBAL"))
    return true;
  if (role.ambito === "GLOBAL" || !Array.isArray(role.permisos)) return false;
  const cap = propertyCaps[role.codigo ?? ""];
  if (role.ambito === "PROPIEDAD" && !cap) return false;
  return role.permisos.every((p) =>
    actions
      .filter((a) => permissionAllows(p, a))
      .every((a) =>
        role.ambito === "PROPIEDAD"
          ? cap[p.seccion]?.includes(a)
          : hasPermission(contexts, p.seccion, a, target, "ADMINISTRACION"),
      ),
  );
}
