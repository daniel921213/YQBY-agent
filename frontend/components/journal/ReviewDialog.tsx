"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import s from "./reviews.module.css";

export function ReviewDialog({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    container.current?.querySelector<HTMLElement>("button, select, textarea, input")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab") return;
      const nodes = Array.from(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),textarea:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? []);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", key); previous?.focus(); };
  }, []);
  return createPortal(<div className={s.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div ref={container} role="dialog" aria-modal="true" aria-label={label} className={s.modal}>{children}</div></div>, document.body);
}
