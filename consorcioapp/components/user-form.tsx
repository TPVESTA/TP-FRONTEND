"use client";
import { useState, type FormEvent } from "react";
import { errorMessage, usersApi, type ManagedUser } from "@/lib/backoffice";
import { administrationIds, hasPermission } from "@/lib/permissions";
import { usePermissions } from "./backoffice-shell";
import Modal from "./modal";
import { userPayload } from "@/lib/user-management";
import PasswordField from "./password-field";

export default function UserForm({ user, currentUserId, onClose, onSaved }: { user?: ManagedUser; currentUserId?: number; onClose: () => void; onSaved: () => void }) {
  const permissions = usePermissions();
  const globalEdit = hasPermission(permissions, "USUARIOS", "EDITAR", undefined, "GLOBAL");
  const globalCreate = hasPermission(permissions, "USUARIOS", "CREAR", undefined, "GLOBAL");
  const disable = hasPermission(permissions, "USUARIOS", "DESHABILITAR", undefined, "GLOBAL");
  const ownProfile = !!user && user.id === currentUserId && !globalEdit;
  const identity = !user || globalEdit || ownProfile;
  const adminIds = administrationIds(permissions, "USUARIOS", "CREAR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmPassword") ?? "");
    if (password !== confirmation && (!user || password || confirmation)) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true); setError("");
    try {
      const { body, ownProfile: saveOwnProfile } = userPayload(form, permissions, user, currentUserId);
      await usersApi.save(body, user?.id, saveOwnProfile);
      onSaved();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <Modal title={user ? "Editar usuario" : "Nuevo usuario"} onClose={onClose} busy={busy}><form onSubmit={submit}>
    {error && <p role="alert" className="bo-alert">{error}</p>}
    <fieldset disabled={busy} className="bo-form-grid">
      <label>Nombre<input name="nombre" required minLength={2} maxLength={100} pattern="[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ '\-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*" title="Usá solo letras, espacios, apóstrofos o guiones." defaultValue={user?.nombre} autoComplete="given-name" /></label>
      <label>Apellido<input name="apellido" required minLength={2} maxLength={100} pattern="[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ '\-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*" title="Usá solo letras, espacios, apóstrofos o guiones." defaultValue={user?.apellido} autoComplete="family-name" /></label>
      <label className="bo-full">Correo electrónico<input name="email" type="email" required maxLength={255} defaultValue={user?.email} readOnly={!identity} autoComplete="email" />{!identity && <small>Los cambios de correo de otra cuenta requieren gestión global.</small>}</label>
      <label>CUIL<input name="cuil" required pattern="[0-9]{11}" maxLength={11} inputMode="numeric" defaultValue={user?.cuil} /></label>
      <label>Fecha de nacimiento<input name="fechaNacimiento" type="date" required max={new Date().toLocaleDateString("en-CA")} defaultValue={user?.fechaNacimiento.slice(0, 10)} /></label>
      {identity && <PasswordField className="bo-full" label={user ? "Nueva contraseña (opcional)" : "Contraseña"} name="password" minLength={6} maxLength={18} required={!user} autoComplete="new-password" />}
      {identity && <PasswordField className="bo-full" label="Confirmar contraseña" name="confirmPassword" minLength={6} maxLength={18} required={!user} autoComplete="new-password" />}
      {!user && !globalCreate && <label className="bo-full">Administración<select name="administracionId" required defaultValue={adminIds.length === 1 ? adminIds[0] : ""}><option value="">Seleccionar…</option>{adminIds.map(id => <option key={id} value={id}>Administración #{id}</option>)}</select></label>}
      {(!user && globalCreate || !!user && disable) && <label className="bo-checkbox bo-full"><input name="estado" type="checkbox" defaultChecked={user?.estado ?? true} disabled={user?.id === currentUserId} /> Usuario activo</label>}
    </fieldset><div className="bo-form-actions"><button type="button" className="bo-button secondary" disabled={busy} onClick={onClose}>Volver</button><button className="bo-button" disabled={busy}>{busy ? "Guardando…" : "Guardar usuario"}</button></div>
  </form></Modal>;
}
