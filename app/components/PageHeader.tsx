"use client";

import type { ReactNode, Ref } from "react";
import Icon from "./Icon";
import { useShell } from "./shellContext";

interface PageHeaderProps {
  title: ReactNode;
  /** Shown before the title, e.g. the project tile. */
  leading?: ReactNode;
  /** Page-level actions beside the global search and New menu. */
  actions?: ReactNode;
  /** Hide the global search, e.g. on the Tasks page, which has its own. */
  hideSearch?: boolean;
  /** Rendered under the top bar, e.g. a project's status and view tabs. */
  children?: ReactNode;
  /** The h1, e.g. to move focus to it after the item it was opened from is deleted. */
  headingRef?: Ref<HTMLHeadingElement>;
}

/** The sticky top bar of a page (sidebar toggle, page title as h1, global search, New menu) plus an optional sub-header. */
export default function PageHeader({ title, leading, actions, hideSearch = false, children, headingRef }: PageHeaderProps) {
  const shell = useShell();
  return (
    <>
      <header className={hideSearch ? "topbar no-search" : "topbar"}>
        {shell.toggleSidebar && (
          <button
            type="button"
            className="icon-button topbar-menu"
            aria-label={shell.sidebarToggleLabel}
            aria-expanded={shell.sidebarExpanded}
            aria-controls={shell.sidebarId ?? undefined}
            onClick={shell.toggleSidebar}
          >
            <Icon name="menu" />
          </button>
        )}
        <div className="topbar-title">
          {leading}
          <h1 ref={headingRef} tabIndex={-1}>
            {title}
          </h1>
        </div>
        {!hideSearch && shell.globalSearch && <div className="topbar-search">{shell.globalSearch}</div>}
        {(actions || shell.newMenu) && (
          <div className="topbar-actions">
            {actions}
            {shell.newMenu}
          </div>
        )}
      </header>
      {children && <div className="page-subheader">{children}</div>}
    </>
  );
}
