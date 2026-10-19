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
    this.details = Array.isArray(details) ? details.filter(d => typeof d === "string") : [];
    this.name = "ApiError";
  }
}

const TOKEN_KEY = "consorcio.token";
const EXPIRED_MESSAGE_KEY = "consorcio.expired-message";
export const SESSION_EXPIRED_EVENT = "consorcio:session-expired";
export const PERMISSIONS_CHANGED_EVENT = "consorcio:permissions-changed";
const statusMessage = (status: number) => status === 401 ? "Tu sesión venció. Volvé a ingresar." : status === 403 ? "No tenés permiso para realizar esta operación en el contexto seleccionado." : status === 404 ? "El registro ya no está disponible o quedó fuera de tu ámbito de acceso. Actualizá el listado." : status === 409 ? "Los datos cambiaron o la operación entra en conflicto con otro registro. Actualizá la información." : status === 429 ? "Se realizaron demasiadas solicitudes. Esperá un momento antes de reintentar." : status >= 500 ? "El servidor no pudo completar la solicitud. Intentá nuevamente en unos momentos." : "No se pudo completar la solicitud.";

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
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (typeof error === "object" && error !== null && "name" in error && error.name === "TimeoutError") throw new ApiError("El servidor tardó demasiado en responder. Actualizá la información antes de volver a enviar cambios.", 0);
    throw new ApiError(init.method && !["GET", "HEAD"].includes(init.method.toUpperCase()) ? "No se pudo confirmar la operación. Actualizá el listado antes de volver a enviar cambios." : "No se pudo conectar con el servidor. Intentá nuevamente.", 0);
  }
  function expire(message: string) {
    if (response.status === 401 && token && session.getToken() === token) {
      session.clear();
      window.sessionStorage.setItem(EXPIRED_MESSAGE_KEY, message);
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
  }
  if (response.status === 403 && token && path !== "/auth/permisos") window.dispatchEvent(new Event(PERMISSIONS_CHANGED_EVENT));
  let result: ApiResponse<T>;
  try {
    result = await response.json();
  } catch {
    expire("Autenticación requerida. Volvé a iniciar sesión.");
    throw new ApiError(response.ok ? "El servidor no devolvió una respuesta válida." : statusMessage(response.status), response.status);
  }
  expire(typeof result?.error === "string" ? result.error : typeof result?.message === "string" ? result.message : "Autenticación requerida. Volvé a iniciar sesión.");
  if (!result || typeof result.success !== "boolean") {
    throw new ApiError("Formato de respuesta inesperado del servidor.", response.status);
  }
  if (!response.ok || !result.success) {
    const message = typeof result.error === "string" ? result.error : typeof result.message === "string" ? result.message : statusMessage(response.status);
    throw new ApiError(response.status >= 500 ? statusMessage(response.status) : message, response.status, response.status >= 500 ? [] : result.errors);
  }
  return result;
}
