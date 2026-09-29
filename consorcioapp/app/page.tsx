"use client";

import { useEffect, useState, type FormEvent } from "react";
import { session, SESSION_EXPIRED_EVENT } from "@/lib/api";
import { auth, type User } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const expired = () => {
      setUser(null);
      setError("Tu sesión venció. Volvé a iniciar sesión.");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    async function restore() {
      try {
        if (session.getToken()) {
          const profile = await auth.profile(controller.signal);
          if (!controller.signal.aborted) { setUser(profile); router.replace("/backoffice"); }
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
      setUser(await auth.login({ email: String(fields.get("email")).trim(), password: String(fields.get("password")) }));
      form.reset();
      router.replace("/backoffice");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-100 px-6 py-16 text-slate-900">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm" aria-busy={loading}>
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-teal-700">Consorcio</p>
        <h1 className="mb-6 text-2xl font-semibold">{user ? `Hola, ${user.nombre}` : "Iniciar sesión"}</h1>
        {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {user ? (
          <div className="space-y-5">
            <p>Sesión iniciada como <strong>{user.email}</strong>.</p>
            <button className="w-full rounded-lg bg-teal-700 p-3 font-medium text-white" onClick={() => { auth.logout(); setUser(null); setError(""); }}>Cerrar sesión</button>
          </div>
        ) : (
          <form onSubmit={login} className="space-y-5">
            <label className="block text-sm font-medium">Correo electrónico
              <input name="email" type="email" autoComplete="username" required disabled={loading} className="mt-2 w-full rounded-lg border border-slate-300 p-3" />
            </label>
            <label className="block text-sm font-medium">Contraseña
              <input name="password" type="password" autoComplete="current-password" required minLength={6} maxLength={18} disabled={loading} className="mt-2 w-full rounded-lg border border-slate-300 p-3" />
            </label>
            <button disabled={loading} className="w-full rounded-lg bg-teal-700 p-3 font-medium text-white disabled:opacity-50">{loading ? "Cargando…" : "Ingresar"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
