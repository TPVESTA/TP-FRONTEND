import { apiRequest, ApiError } from "./api";
import type { User, RegisterInput } from "./auth";
import type { Permission } from "./permissions";

export interface ManagedUser extends User { cuil: string }
export type Scope = "PROPIEDAD" | "ADMINISTRACION" | "GLOBAL";
export interface Role { id: number; nombre: string; descripcion: string; ambito: Scope; codigo?: string | null; permisos?: Permission[] }
export type Reference = number | { id: number };
export interface Assignment {
  id: number; usuario?: Reference; rol?: Reference;
  usuarioRol?: { id: number; usuario: Reference; rol: Reference; beginAt: string; endAt: string | null };
  propiedad?: Reference; administracion?: Reference;
  beginAt: string; endAt: string | null;
}
export const assignmentUser = (assignment: Assignment): Reference | null | undefined => assignment.usuarioRol?.usuario ?? assignment.usuario;
export const assignmentRole = (assignment: Assignment): Reference | null | undefined => assignment.usuarioRol?.rol ?? assignment.rol;
export interface Property { id: number; nroUnidad: string; edificio: Reference }
export interface Building { id: number; nombre: string }
export interface Administration { id: number; nombre: string }
export const referenceId = (value: Reference | null | undefined): number | undefined => {
  if (value == null) return undefined;
  return typeof value === "number" ? value : value.id;
};
export const assignmentPath = (scope: Scope) => scope === "GLOBAL" ? "/usuarios-roles" : scope === "PROPIEDAD" ? "/usuarios-roles-propiedad" : "/empleados";
export function assignmentStatus(assignment: Pick<Assignment, "beginAt" | "endAt">, now = Date.now()) {
  if (new Date(assignment.beginAt).getTime() > now) return "Programado";
  if (assignment.endAt && new Date(assignment.endAt).getTime() <= now) return "Finalizado";
  return "Vigente";
}
export function errorMessage(error: unknown) {
  return error instanceof ApiError && error.details.length ? error.details.join(". ") : error instanceof Error ? error.message : "No se pudo completar la operación.";
}
export async function list<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const response = await apiRequest<T[]>(path, { signal });
  if (!Array.isArray(response.data)) throw new Error("El servidor no devolvió un listado válido.");
  return response.data;
}
export const usersApi = {
  list: (signal?: AbortSignal) => list<ManagedUser>("/users", signal),
  save: (data: Partial<RegisterInput> & { administracionId?: number }, id?: number, ownProfile = false) =>
    apiRequest<ManagedUser>(ownProfile ? "/auth/profile" : id ? `/users/${id}` : "/users", { method: id ? "PUT" : "POST", body: data }),
  remove: (id: number) => apiRequest<ManagedUser>(`/users/${id}`, { method: "DELETE" }),
};

export const scopeLabel = (scope: Scope) => ({ GLOBAL: "Global", PROPIEDAD: "Propiedad", ADMINISTRACION: "Administración" })[scope];
