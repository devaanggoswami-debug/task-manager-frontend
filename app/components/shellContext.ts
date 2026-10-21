"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Project } from "@/lib/api";

export interface ShellValue {
  /** Id of the sidebar element, for aria-controls; null outside the app shell (e.g. in tests). */
  sidebarId: string | null;
  sidebarExpanded: boolean;
  /** Desktop: collapse or expand the sidebar. Smaller screens: open or close the navigation drawer. */
  toggleSidebar: (() => void) | null;
  sidebarToggleLabel: string;
  /** Every project, for the sidebar; refreshed when projects change. */
  projects: readonly Project[];
  /** Called when a sidebar link is followed, so the drawer closes. */
  onNavigate: () => void;
  globalSearch: ReactNode;
  newMenu: ReactNode;
}

export const ShellContext = createContext<ShellValue>({
  sidebarId: null,
  sidebarExpanded: false,
  toggleSidebar: null,
  sidebarToggleLabel: "",
  projects: [],
  onNavigate: () => {},
  globalSearch: null,
  newMenu: null,
});

export function useShell(): ShellValue {
  return useContext(ShellContext);
}
