"use client";

/**
 * Shared modal/dialog overlay component.
 *
 * Handles: backdrop render, ESC-to-close, backdrop-click-to-close.
 * Does NOT manage open state — callers own `open` and `onClose`.
 *
 * Usage:
 *   <Modal open={open} onClose={() => setOpen(false)}>
 *     <div className="w-full max-w-xl rounded-2xl ...">...</div>
 *   </Modal>
 */

import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, onClose, children }: ModalProps) {
  // ESC key closes the modal
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      // Clicking the backdrop (not the inner card) closes the modal
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
