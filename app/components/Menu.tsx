"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { useDialog } from "@/lib/dialog";
import Icon, { type IconName } from "./Icon";

export type MenuEntry =
  | { kind?: "action"; label: string; icon?: IconName; onSelect: () => void; disabled?: boolean; danger?: boolean }
  | { kind: "radio"; label: string; icon?: IconName; checked: boolean; onSelect: () => void; className?: string }
  | { kind: "link"; label: string; icon?: IconName; href: string };

interface MenuButtonProps {
  /** Accessible name of the menu, e.g. "Actions for sprint Sprint 1". */
  label: string;
  /** Visible content of the trigger. */
  trigger: ReactNode;
  /** Accessible name of the trigger when its visible content is not enough (icon-only triggers). */
  triggerLabel?: string;
  triggerClassName?: string;
  /** Extra text for the trigger's accessible name, kept visually hidden. */
  triggerHint?: string;
  items: readonly MenuEntry[];
  align?: "start" | "end";
  disabled?: boolean;
  busy?: boolean;
  triggerRef?: (el: HTMLButtonElement | null) => void;
}

/**
 * A button that opens a menu of actions (WAI-ARIA menu button pattern):
 * arrow keys, Home and End move between items, Escape closes and returns focus, Tab closes.
 */
export default function MenuButton({
  label,
  trigger,
  triggerLabel,
  triggerClassName = "icon-button",
  triggerHint,
  items,
  align = "end",
  disabled = false,
  busy = false,
  triggerRef,
}: MenuButtonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const menuId = `${id}-menu`;

  const menuItems = () => Array.from(menu.current?.querySelectorAll<HTMLElement>("[role^='menuitem']:not([aria-disabled='true'])") ?? []);

  useDialog(open, menu, () => setOpen(false), {
    initialFocus: () => {
      const all = menuItems();
      return all.find((el) => el.getAttribute("aria-checked") === "true") ?? all[0];
    },
    returnFocus: () => button.current,
  });

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (open && !(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setOpen(false);
  }

  function handleMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const all = menuItems();
    if (all.length === 0) return;
    const index = all.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (event.key === "ArrowDown") next = all[(index + 1) % all.length];
    else if (event.key === "ArrowUp") next = all[(index - 1 + all.length) % all.length];
    else if (event.key === "Home") next = all[0];
    else if (event.key === "End") next = all[all.length - 1];
    else if (event.key === "Tab") setOpen(false);
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }

  function handleTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function choose(entry: MenuEntry) {
    setOpen(false);
    if (entry.kind !== "link") entry.onSelect();
  }

  return (
    <div className="menu-button" ref={wrapper} onBlur={handleBlur}>
      <button
        ref={(el) => {
          button.current = el;
          triggerRef?.(el);
        }}
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={triggerLabel}
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKey}
      >
        {trigger}
        {triggerHint && <span className="visually-hidden">{triggerHint}</span>}
      </button>
      <div
        ref={menu}
        id={menuId}
        role="menu"
        aria-label={label}
        className={align === "start" ? "popover menu-popover align-start" : "popover menu-popover"}
        hidden={!open}
        tabIndex={-1}
        onKeyDown={handleMenuKey}
      >
        {items.map((entry) => {
          const content = (
            <>
              {entry.icon ? <Icon name={entry.icon} size={16} /> : <span className="menu-icon-spacer" aria-hidden="true" />}
              <span className="menu-label">{entry.label}</span>
              {entry.kind === "radio" && entry.checked && <Icon name="check" size={16} className="menu-check" />}
            </>
          );
          if (entry.kind === "link") {
            return (
              <Link key={entry.label} role="menuitem" tabIndex={-1} className="menu-row" href={entry.href} onClick={() => setOpen(false)}>
                {content}
              </Link>
            );
          }
          const isRadio = entry.kind === "radio";
          const disabledItem = !isRadio && entry.disabled;
          return (
            <button
              key={entry.label}
              type="button"
              role={isRadio ? "menuitemradio" : "menuitem"}
              aria-checked={isRadio ? entry.checked : undefined}
              aria-disabled={disabledItem || undefined}
              tabIndex={-1}
              className={[
                "menu-row",
                isRadio && entry.className,
                !isRadio && entry.danger && "menu-danger",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (!disabledItem) choose(entry);
              }}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
