import type { ManagedUser } from "./backoffice";
import type { RegisterInput } from "./auth";
import { administrationIds, hasPermission, type PermissionContext } from "./permissions";

export function userPayload(form: FormData, permissions: PermissionContext[], user?: ManagedUser, currentUserId?: number) {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const globalEdit = hasPermission(permissions, "USUARIOS", "EDITAR", undefined, "GLOBAL");
  const globalCreate = hasPermission(permissions, "USUARIOS", "CREAR", undefined, "GLOBAL");
  const ownProfile = !!user && user.id === currentUserId && !globalEdit;
  const identity = !user || globalEdit || ownProfile;
  const body: Partial<RegisterInput> & { administracionId?: number } = { nombre: text("nombre"), apellido: text("apellido"), cuil: text("cuil"), fechaNacimiento: text("fechaNacimiento") };
  if (identity && (!user || text("email") !== user.email)) body.email = text("email");
  const password = String(form.get("password") ?? "");
  if (identity && password) body.password = password;
  if (!user) {
    body.estado = globalCreate ? form.get("estado") === "on" : true;
    if (!globalCreate) {
      const id = Number(form.get("administracionId"));
      if (!administrationIds(permissions, "USUARIOS", "CREAR").includes(id)) throw new Error("Seleccioná una administración en la que puedas crear usuarios.");
      body.administracionId = id;
    }
  } else if (!ownProfile && hasPermission(permissions, "USUARIOS", "DESHABILITAR", undefined, "GLOBAL") && user.id !== currentUserId && (form.get("estado") === "on") !== user.estado) body.estado = form.get("estado") === "on";
  return { body, ownProfile };
}
