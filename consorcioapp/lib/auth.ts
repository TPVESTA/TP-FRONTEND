import { apiRequest, session } from "./api";
import { validContexts, type PermissionContext } from "./permissions";
export { isSystemAdmin, type PermissionContext } from "./permissions";

export interface User {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  fechaNacimiento: string;
  estado: boolean;
}
export interface LoginInput { email: string; password: string }
export interface RegisterInput extends LoginInput {
  cuil: string;
  nombre: string;
  apellido: string;
  telefono: string;
  fechaNacimiento: string;
  estado: boolean;
}
interface AuthData { user: User; token: string }

async function authenticate(path: string, body: LoginInput | RegisterInput) {
  const { data } = await apiRequest<AuthData>(path, { method: "POST", body, authenticated: false });
  if (!data?.token || !data.user) throw new Error("La respuesta no contiene una sesión válida.");
  session.setToken(data.token);
  return data.user;
}

export const auth = {
  async permissions(signal?: AbortSignal) {
    const { data } = await apiRequest<{ contextos: PermissionContext[] }>("/auth/permisos", { signal });
    if (!data || !validContexts(data.contextos)) throw new Error("No se pudieron verificar los permisos. Intentá actualizar la sesión.");
    return data.contextos;
  },
  login: (input: LoginInput) => authenticate("/auth/login", input),
  async profile(signal?: AbortSignal) {
    const { data } = await apiRequest<User>("/auth/profile", { signal });
    if (!data) throw new Error("No se recibió el perfil.");
    return data;
  },
  logout: () => session.clear(),
};
