"use client";

import { useId, useRef, useState } from "react";
import { PHONE_QUERY, useDialog, useMediaQuery } from "@/lib/dialog";
import Assistant from "./Assistant";
import Icon from "./Icon";

/**
 * Floating launcher plus a docked chat panel (a full-screen sheet on phones).
 * The panel stays mounted while closed so the chat log survives.
 */
export default function AssistantPanel() {
  const id = useId();
  const [open, setOpen] = useState(false);
  const isPhone = useMediaQuery(PHONE_QUERY, false);
  const panel = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const contentId = `${id}-content`;

  // On phones the sheet covers the page, so it behaves as a modal; on larger screens it docks beside the page.
  useDialog(open, panel, () => setOpen(false), {
    trapFocus: isPhone,
    lockScroll: isPhone,
    initialFocus: () => panel.current?.querySelector<HTMLInputElement>("input[name='message']"),
    returnFocus: () => launcher.current,
  });

  return (
    <>
      <button
        ref={launcher}
        type="button"
        className={open ? "assistant-launcher open" : "assistant-launcher"}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Icon name={open ? "close" : "chat"} />
        <span className="launcher-label">{open ? "Hide assistant" : "Show assistant"}</span>
      </button>
      <div
        ref={panel}
        id={contentId}
        className="assistant-dock"
        role="dialog"
        aria-modal={isPhone ? true : undefined}
        aria-label="Assistant"
        hidden={!open}
      >
        <Assistant
          headerAction={
            <button type="button" className="icon-button" aria-label="Close assistant" onClick={() => setOpen(false)}>
              <Icon name="close" />
            </button>
          }
        />
      </div>
    </>
  );
}
