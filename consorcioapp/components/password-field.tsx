"use client";
import { useState } from "react";

export default function PasswordField({
  label, name, required = false, minLength, maxLength, autoComplete, disabled = false, className = "", inputClassName = "",
}: {
  label: string;
  name: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const [visible, setVisible] = useState(false);
  const action = visible ? "Ocultar contraseña" : "Mostrar contraseña";
  return <label className={className}>{label}<span className="password-field"><input name={name} type={visible ? "text" : "password"} required={required} minLength={minLength} maxLength={maxLength} autoComplete={autoComplete} disabled={disabled} className={inputClassName} /><button type="button" aria-pressed={visible} aria-label={action} disabled={disabled} onClick={() => setVisible(value => !value)}>{visible ? "Ocultar" : "Mostrar"}</button></span></label>;
}
