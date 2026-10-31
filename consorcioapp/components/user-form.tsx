"use client";
import { useEffect, useState, type FormEvent } from "react";
import { errorMessage, list, referenceId, scopeLabel, usersApi, type Administration, type Building, type ManagedUser, type Property, type Role } from "@/lib/backoffice";
import { canDelegate, hasPermission } from "@/lib/permissions";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(user?.estado ?? true);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [roleId, setRoleId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(!user);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [catalogError, setCatalogError] = useState("");
  const turningOff = !!user && user.estado && !active && user.id !== currentUserId;
  const selectedRole = roles.find(role => role.id === Number(roleId));
  useEffect(() => {
    if (user) return;
    const controller = new AbortController();
    Promise.all([
      list<Role>("/roles", controller.signal),
      Promise.allSettled([
        list<Property>("/propiedades", controller.signal),
        list<Administration>("/administraciones", controller.signal),
        list<Building>("/edificios", controller.signal),
      ]),
    ]).then(([loadedRoles, [loadedProperties, loadedAdministrations, loadedBuildings]]) => {
      if (controller.signal.aborted) return;
      setRoles(loadedRoles);
      setProperties(loadedProperties.status === "fulfilled" ? loadedProperties.value : []);
      setAdministrations(loadedAdministrations.status === "fulfilled" ? loadedAdministrations.value : []);
      setBuildings(loadedBuildings.status === "fulfilled" ? loadedBuildings.value : []);
      setCatalogError([loadedProperties, loadedAdministrations, loadedBuildings].flatMap((result, index) => result.status === "rejected" ? [`${["Propiedades", "Administraciones", "Edificios"][index]}: ${errorMessage(result.reason)}`] : []).join(". "));
    }).catch(err => { if (!controller.signal.aborted) setCatalogError(errorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [user, catalogAttempt]);
  function delegableProperties(role: Role) {
    return properties.filter(item => buildings.some(building => building.id === referenceId(item.edificio)) && canDelegate(permissions, role, { propiedadId: item.id, edificioId: referenceId(item.edificio) }));
  }
  function roleOptions(role: Role) {
    if (role.ambito === "GLOBAL") return canDelegate(permissions, role, {}) ? [{ id: 0, label: "Todo el sistema" }] : [];
    if (role.ambito === "ADMINISTRACION") return administrations.filter(item => canDelegate(permissions, role, { administracionId: item.id })).map(item => ({ id: item.id, label: item.nombre }));
    return delegableProperties(role).map(item => ({ id: item.id, label: `Unidad ${item.nroUnidad}` }));
  }
  const assignable = roles.filter(role => roleOptions(role).length > 0);
  const destination = selectedRole && selectedRole.ambito !== "GLOBAL" ? roleOptions(selectedRole) : [];
  const eligibleProperties = selectedRole?.ambito === "PROPIEDAD" ? delegableProperties(selectedRole) : [];
  const buildingOptions = buildings.filter(building => eligibleProperties.some(property => referenceId(property.edificio) === building.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const propertyOptions = eligibleProperties.filter(property => referenceId(property.edificio) === Number(buildingId));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (!user && catalogLoading)) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmPassword") ?? "");
    if (password !== confirmation && (!user || password || confirmation)) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (turningOff && confirmEmail.trim().toLowerCase() !== "desactivar") {
      setError("Escribí desactivar para confirmar.");
      return;
    }
    setBusy(true); setError("");
    try {
      if (!user) {
        if (!selectedRole || !assignable.some(role => role.id === selectedRole.id)) throw new Error("Seleccioná un rol disponible.");
        if (selectedRole.ambito === "PROPIEDAD") {
          if (!buildingOptions.some(building => building.id === Number(buildingId))) throw new Error("Seleccioná un edificio disponible.");
          if (!propertyOptions.some(property => property.id === Number(form.get("propiedadId")))) throw new Error("Seleccioná una propiedad del edificio elegido.");
        }
      }
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
      {!user && <>
        <input type="hidden" name="rolAmbito" value={selectedRole?.ambito ?? ""} />
        <label className="bo-full">Rol<select name="rolId" required disabled={catalogLoading} value={roleId} onChange={event => { setRoleId(event.target.value); setBuildingId(""); setPropertyId(""); }}><option value="">Seleccioná un rol</option>{assignable.map(role => <option key={role.id} value={role.id}>{role.descripcion} · {scopeLabel(role.ambito)}</option>)}</select></label>
        {selectedRole?.ambito === "ADMINISTRACION" && <label className="bo-full">Administración<select key={selectedRole.id} name="administracionId" required defaultValue={destination.length === 1 ? destination[0].id : ""}><option value="">Seleccionar…</option>{destination.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
        {selectedRole?.ambito === "PROPIEDAD" && <>
          <label className="bo-full">Edificio<select name="edificioId" required value={buildingId} disabled={catalogLoading} onChange={event => { setBuildingId(event.target.value); setPropertyId(""); }}><option value="">Seleccioná un edificio</option>{buildingOptions.map(building => <option key={building.id} value={building.id}>{building.nombre}</option>)}</select></label>
          <label className="bo-full">Propiedad<select name="propiedadId" required value={propertyId} disabled={!buildingId || catalogLoading} onChange={event => setPropertyId(event.target.value)}><option value="">{buildingId ? "Seleccioná una propiedad" : "Primero seleccioná un edificio"}</option>{propertyOptions.map(property => <option key={property.id} value={property.id}>Unidad {property.nroUnidad}</option>)}</select></label>
        </>}
        {catalogLoading && <p className="bo-muted bo-full" role="status">Cargando opciones…</p>}
        {catalogError && <p className="bo-alert bo-full" role="alert">{catalogError} <button type="button" disabled={catalogLoading} onClick={() => { setCatalogLoading(true); setCatalogError(""); setCatalogAttempt(value => value + 1); }}>Actualizar opciones</button></p>}
      </>}
      {(!user && globalCreate || !!user && disable) && <label className="bo-checkbox bo-full"><input name="estado" type="checkbox" checked={active} disabled={user?.id === currentUserId} onChange={event => { setActive(event.target.checked); setConfirmEmail(""); }} /> Usuario activo</label>}
      {turningOff && <label className="bo-full">Para desactivar, escribí desactivar<input value={confirmEmail} onChange={event => setConfirmEmail(event.target.value)} autoComplete="off" required /></label>}
    </fieldset><div className="bo-form-actions"><button type="button" className="bo-button secondary" disabled={busy} onClick={onClose}>Volver</button><button className="bo-button" disabled={busy || (!user && catalogLoading)}>{busy ? "Guardando…" : "Guardar usuario"}</button></div>
  </form></Modal>;
}
