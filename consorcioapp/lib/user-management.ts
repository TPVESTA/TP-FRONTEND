import type { ManagedUser } from "./backoffice";
import type { RegisterInput } from "./auth";
import { administrationIds, hasPermission, type PermissionContext } from "./permissions";

const personName = /^[\p{L}]+(?:[ '\-][\p{L}]+)*$/u;

export function userPayload(form: FormData, permissions: PermissionContext[], user?: ManagedUser, currentUserId?: number) {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const person = (value: string, label: string) => {
    if (!personName.test(value)) throw new Error(`${label} solo puede contener letras, espacios, apóstrofos y guiones.`);
    return value;
  };
  const phone = (value: string) => {
    if (!/^\d{8,15}$/.test(value)) throw new Error("El teléfono debe tener entre 8 y 15 dígitos, sin espacios ni guiones.");
    return value;
  };
  const globalEdit = hasPermission(permissions, "USUARIOS", "EDITAR", undefined, "GLOBAL");
  const globalCreate = hasPermission(permissions, "USUARIOS", "CREAR", undefined, "GLOBAL");
  const ownProfile = !!user && user.id === currentUserId && !globalEdit;
  const identity = !user || globalEdit || ownProfile;
  const body: Partial<RegisterInput> & { administracionId?: number; rolId?: number; propiedadId?: number } = {
    nombre: person(text("nombre"), "El nombre"),
    apellido: person(text("apellido"), "El apellido"),
    cuil: text("cuil"),
    telefono: phone(text("telefono")),
    fechaNacimiento: text("fechaNacimiento"),
  };
  if (identity && (!user || text("email") !== user.email)) body.email = text("email");
  const password = String(form.get("password") ?? "");
  if (identity && password) body.password = password;
  if (!user) {
    body.estado = globalCreate ? form.get("estado") === "on" : true;
    const rolId = Number(form.get("rolId"));
    if (!Number.isSafeInteger(rolId) || rolId <= 0) throw new Error("Seleccioná un rol.");
    body.rolId = rolId;
    const ambito = text("rolAmbito");
    if (ambito === "ADMINISTRACION") {
      const id = Number(form.get("administracionId"));
      if (!globalCreate && !administrationIds(permissions, "USUARIOS", "CREAR").includes(id)) throw new Error("Seleccioná una administración en la que puedas crear usuarios.");
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Seleccioná una administración.");
      body.administracionId = id;
    } else if (ambito === "PROPIEDAD") {
      const id = Number(form.get("propiedadId"));
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Seleccioná una propiedad.");
      body.propiedadId = id;
    } else if (ambito !== "GLOBAL") throw new Error("Seleccioná un rol.");
  } else if (!ownProfile && hasPermission(permissions, "USUARIOS", "DESHABILITAR", undefined, "GLOBAL") && user.id !== currentUserId && (form.get("estado") === "on") !== user.estado) body.estado = form.get("estado") === "on";
  return { body, ownProfile };
}
