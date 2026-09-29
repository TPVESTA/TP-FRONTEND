import { apiRequest, session } from "./api";

export interface User {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  fechaNacimiento: string;
  estado: boolean;
}
export interface LoginInput { email: string; password: string }
export interface RegisterInput extends LoginInput {
  cuil: string;
  nombre: string;
  apellido: string;
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
  login: (input: LoginInput) => authenticate("/auth/login", input),
  register: (input: RegisterInput) => authenticate("/auth/register", input),
  async profile(signal?: AbortSignal) {
    const { data } = await apiRequest<User>("/auth/profile", { signal });
    if (!data) throw new Error("No se recibió el perfil.");
    return data;
  },
  verify: () => apiRequest<{ valid: boolean; user: User }>("/auth/verify"),
  logout: () => session.clear(),
};
