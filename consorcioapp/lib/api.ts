export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: string[];
  total?: number;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public details: string[] = []) {
    super(message);
    this.name = "ApiError";
  }
}

const TOKEN_KEY = "consorcio.token";
const EXPIRED_MESSAGE_KEY = "consorcio.expired-message";
export const SESSION_EXPIRED_EVENT = "consorcio:session-expired";

// La sesión dura lo que dure la pestaña; nunca se guarda la contraseña.
export const session = {
  getToken: () => typeof window === "undefined" ? null : window.sessionStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => {
    window.sessionStorage.removeItem(EXPIRED_MESSAGE_KEY);
    window.sessionStorage.setItem(TOKEN_KEY, token);
  },
  clear: () => window.sessionStorage.removeItem(TOKEN_KEY),
  getExpiredMessage: () => typeof window === "undefined" ? null : window.sessionStorage.getItem(EXPIRED_MESSAGE_KEY),
};

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown; authenticated?: boolean };

/** Cliente para el navegador. Las rutas son relativas a /api. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("..")) {
    throw new Error("La ruta debe ser relativa a /api");
  }
  const { body, authenticated = true, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const token = authenticated ? session.getToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init, headers, cache: "no-store",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: init.signal ?? AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError("No se pudo conectar con el servidor. Intentá nuevamente.", 0);
  }
  function expire(message: string) {
    if (response.status === 401 && token && session.getToken() === token) {
      session.clear();
      window.sessionStorage.setItem(EXPIRED_MESSAGE_KEY, message);
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
  }
  let result: ApiResponse<T>;
  try {
    result = await response.json();
  } catch {
    expire("Autenticación requerida. Volvé a iniciar sesión.");
    throw new ApiError("El servidor no devolvió una respuesta válida. Verificá que el backend esté disponible.", response.status);
  }
  expire(result?.error || result?.message || "Autenticación requerida. Volvé a iniciar sesión.");
  if (!result || typeof result.success !== "boolean") {
    throw new ApiError("Formato de respuesta inesperado del servidor.", response.status);
  }
  if (!response.ok || !result.success) {
    throw new ApiError(result.error || result.message || "No se pudo completar la solicitud.", response.status, result.errors);
  }
  return result;
}
