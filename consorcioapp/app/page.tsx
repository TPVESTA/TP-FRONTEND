"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { session, SESSION_EXPIRED_EVENT } from "@/lib/api";
import { auth } from "@/lib/auth";
import PasswordField from "@/components/password-field";

// El personal de gestión (algún rol de administración o global) entra al backoffice; quien solo
// tiene roles de propiedad, a Mi consorcio. Si no se pueden consultar los permisos, Mi consorcio.
async function homePath(signal?: AbortSignal) {
  try {
    const contexts = await auth.permissions(signal);
    return contexts.some(context => context.ambito !== "PROPIEDAD") ? "/backoffice" : "/mi-consorcio";
  } catch {
    return "/mi-consorcio";
  }
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const expired = () => {
      setRedirecting(false);
      setError(session.getExpiredMessage() || "Tu sesión venció. Volvé a iniciar sesión.");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    async function restore() {
      try {
        if (!session.getToken() && session.getExpiredMessage()) setError(session.getExpiredMessage()!);
        if (session.getToken()) {
          await auth.profile(controller.signal);
          const path = await homePath(controller.signal);
          if (!controller.signal.aborted) { setRedirecting(true); router.replace(path); }
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "No se pudo recuperar la sesión.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void restore();
    return () => {
      controller.abort();
      window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
    };
  }, [router]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setLoading(true);
    setError("");
    try {
      await auth.login({ email: String(fields.get("email")).trim(), password: String(fields.get("password")) });
      form.reset();
      setRedirecting(true);
      router.replace(await homePath());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="bo-login">
      <section className="bo-card bo-login-card" aria-busy={loading}>
        <p className="bo-login-brand"><span className="bo-logo" aria-hidden="true">V</span> Vesta</p>
        <p className="bo-eyebrow">ADMINISTRACIÓN DE CONSORCIOS</p>
        <h1>Iniciar sesión</h1>
        {error && <p role="alert" className="bo-alert">{error}</p>}
        {redirecting ? <p className="bo-muted" role="status">Ingresando…</p> : (
          <form onSubmit={login}>
            <fieldset className="bo-form-grid bo-login-fields" disabled={loading}>
              <label className="bo-full">Correo electrónico
                <input name="email" type="email" autoComplete="username" spellCheck={false} required />
              </label>
              <PasswordField className="bo-full" label="Contraseña" name="password" required minLength={6} maxLength={18} autoComplete="current-password" />
            </fieldset>
            <button className="bo-button bo-login-submit" disabled={loading}>{loading ? "Cargando…" : "Ingresar"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
