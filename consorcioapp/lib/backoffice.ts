import { apiRequest, ApiError } from "./api";
import type { User, RegisterInput } from "./auth";

export interface ManagedUser extends User { cuil: string }
export type Scope = "PROPIEDAD" | "ADMINISTRACION" | "GLOBAL";
export interface Role { id: number; nombre: string; descripcion: string; ambito: Scope }
export type Reference = number | { id: number };
export interface Assignment {
  id: number; usuario: Reference; rol: Reference;
  propiedad?: Reference; administracion?: Reference;
  beginAt: string; endAt: string | null;
}
export interface Property { id: number; nroUnidad: string; edificio: Reference }
export interface Administration { id: number; nombre: string }
export const referenceId = (value: Reference) => typeof value === "number" ? value : value.id;
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
  save: (data: Omit<RegisterInput, "password"> & { password?: string }, id?: number) =>
    apiRequest<ManagedUser>(id ? `/users/${id}` : "/users", { method: id ? "PUT" : "POST", body: data }),
  remove: (id: number) => apiRequest<ManagedUser>(`/users/${id}`, { method: "DELETE" }),
};

export const scopeLabel = (scope: Scope) => ({ GLOBAL: "Global", PROPIEDAD: "Propiedad", ADMINISTRACION: "Administración" })[scope];
