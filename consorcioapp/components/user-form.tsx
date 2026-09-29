"use client";
import { useState, type FormEvent } from "react";
import { errorMessage, usersApi, type ManagedUser } from "@/lib/backoffice";
import Modal from "./modal";

export default function UserForm({ user, currentUserId, onClose, onSaved }: { user?: ManagedUser; currentUserId?: number; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const password = String(form.get("password") ?? "");
    setBusy(true); setError("");
    try {
      await usersApi.save({ nombre: text("nombre"), apellido: text("apellido"), cuil: text("cuil"), email: text("email"), fechaNacimiento: text("fechaNacimiento"), estado: user && user.id === currentUserId ? user.estado : form.get("estado") === "on", ...(password ? { password } : {}) }, user?.id);
      onSaved();
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  }
  return <Modal title={user ? "Editar usuario" : "Nuevo usuario"} onClose={onClose} busy={busy}><form onSubmit={submit}>
    <p className="bo-muted">{user ? "Actualizá los datos del perfil." : "Creá el perfil y luego asignale los roles que correspondan."}</p>
    {error && <p role="alert" className="bo-alert">{error}</p>}
    <fieldset disabled={busy} className="bo-form-grid">
      <label>Nombre<input name="nombre" required minLength={2} maxLength={100} defaultValue={user?.nombre} autoComplete="given-name" /></label>
      <label>Apellido<input name="apellido" required minLength={2} maxLength={100} defaultValue={user?.apellido} autoComplete="family-name" /></label>
      <label className="bo-full">Correo electrónico<input name="email" type="email" required maxLength={255} defaultValue={user?.email} autoComplete="email" /></label>
      <label>CUIL<input name="cuil" required pattern="[0-9]{11}" maxLength={11} inputMode="numeric" defaultValue={user?.cuil} placeholder="11 dígitos sin guiones" /></label>
      <label>Fecha de nacimiento<input name="fechaNacimiento" type="date" required max={new Date().toLocaleDateString("en-CA")} defaultValue={user?.fechaNacimiento.slice(0, 10)} /></label>
      <label className="bo-full">{user ? "Nueva contraseña (opcional)" : "Contraseña"}<input name="password" type="password" minLength={6} maxLength={18} required={!user} autoComplete="new-password" /><small>{user ? "Dejá este campo vacío para conservar la contraseña." : "Entre 6 y 18 caracteres."}</small></label>
      <label className="bo-checkbox bo-full"><input name="estado" type="checkbox" defaultChecked={user?.estado ?? true} disabled={user?.id === currentUserId} /> Usuario activo</label>
      {user?.id === currentUserId && <p className="bo-muted bo-full">Tu cuenta debe permanecer activa mientras la estás utilizando.</p>}
    </fieldset><div className="bo-form-actions"><button type="button" className="bo-button secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="bo-button" disabled={busy}>{busy ? "Guardando…" : "Guardar usuario"}</button></div>
  </form></Modal>;
}
