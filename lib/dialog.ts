"use client";

import { useEffect, useEffectEvent, useMemo, useSyncExternalStore, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Focusable descendants in DOM order, skipping anything inside a hidden subtree. */
export function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest("[hidden], [inert]"),
  );
}

interface DialogOptions {
  /** Keep Tab and Shift+Tab inside the container (modal dialogs). */
  trapFocus?: boolean;
  /** Element to focus on open; defaults to the first focusable element, then the container. */
  initialFocus?: () => HTMLElement | null | undefined;
  /** Element to focus on close; defaults to whatever had focus when the dialog opened. */
  returnFocus?: () => HTMLElement | null | undefined;
  /** Lock page scrolling while open (full-screen and modal surfaces). */
  lockScroll?: boolean;
}

let scrollLocks = 0;

/**
 * Dialog keyboard behaviour while `open`: moves focus in, closes on Escape, optionally traps Tab,
 * and returns focus to the opener (or `returnFocus`) when it closes or unmounts.
 */
export function useDialog(
  open: boolean,
  container: RefObject<HTMLElement | null>,
  onClose: () => void,
  { trapFocus = false, initialFocus, returnFocus, lockScroll = false }: DialogOptions = {},
): void {
  const close = useEffectEvent(onClose);
  const getInitial = useEffectEvent(() => initialFocus?.());
  const getReturn = useEffectEvent(() => returnFocus?.());
  const shouldTrap = useEffectEvent(() => trapFocus);

  useEffect(() => {
    if (!open) return;
    const root = container.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (getInitial() ?? focusableIn(root)[0] ?? root).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab" || !shouldTrap() || !root) return;
      const items = focusableIn(root);
      if (items.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Pull focus back if it escapes a modal, e.g. after clicking the backdrop.
    function onFocusIn(event: FocusEvent) {
      if (!shouldTrap() || !root || !(event.target instanceof Node) || root.contains(event.target)) return;
      (focusableIn(root)[0] ?? root).focus();
    }

    root.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    if (lockScroll && scrollLocks++ === 0) document.documentElement.classList.add("scroll-locked");
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      if (lockScroll && --scrollLocks === 0) document.documentElement.classList.remove("scroll-locked");
      // Leave focus alone if the user already moved it elsewhere, e.g. by tabbing out of a popover.
      const active = document.activeElement;
      const focusLeft = active !== null && active !== document.body && !root.contains(active);
      const target = getReturn() ?? opener;
      if (!focusLeft && target?.isConnected) target.focus();
    };
  }, [open, container, lockScroll]);
}

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    if (typeof window.matchMedia !== "function") return () => {};
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  };
}

/** Whether a media query matches; `serverValue` is used during prerendering and where matchMedia is missing. */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useMemo(() => subscribeMedia(query), [query]);
  return useSyncExternalStore(
    subscribe,
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}

/** Matches the CSS breakpoint at which the sidebar stops being an off-canvas drawer. */
export const DESKTOP_QUERY = "(min-width: 64rem)";
/** Matches the CSS breakpoint below which panels become full-screen sheets. */
export const PHONE_QUERY = "(max-width: 39.99rem)";
