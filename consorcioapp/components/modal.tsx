"use client";
import { useEffect, useRef } from "react";

export default function Modal({ title, children, onClose, busy = false }: { title: string; children: React.ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog className="bo-modal" ref={ref} aria-labelledby="modal-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><div className="bo-modal-heading"><h2 id="modal-title">{title}</h2><button type="button" aria-label="Cerrar" className="bo-icon-button" disabled={busy} onClick={onClose}>×</button></div>{children}</dialog>;
}
