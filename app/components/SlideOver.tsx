"use client";

import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/lib/dialog";
import Icon from "./Icon";

interface SlideOverProps {
  /** Visible title; also the dialog's accessible name. */
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Where focus goes on close; defaults to the element that had focus when the panel opened. */
  returnFocus?: () => HTMLElement | null | undefined;
  initialFocus?: () => HTMLElement | null | undefined;
  /** Disables the close controls, e.g. while a save is in flight. */
  closeDisabled?: boolean;
}

/** A modal panel that slides in from the right; full-screen on phones. Mount it only while open. */
export default function SlideOver({ title, onClose, children, returnFocus, initialFocus, closeDisabled = false }: SlideOverProps) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const requestClose = () => {
    if (!closeDisabled) onClose();
  };
  useDialog(true, panel, requestClose, {
    trapFocus: true,
    lockScroll: true,
    returnFocus,
    initialFocus: () => initialFocus?.() ?? closeButton.current,
  });

  return createPortal(
    <div className="overlay">
      <div className="scrim" aria-hidden="true" onClick={requestClose} />
      <div
        ref={panel}
        className="slide-over"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
      >
        <header className="slide-over-header">
          <h2 id={`${id}-title`} className="slide-over-title">
            {title}
          </h2>
          <button
            ref={closeButton}
            type="button"
            className="icon-button"
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={requestClose}
            disabled={closeDisabled}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="slide-over-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
