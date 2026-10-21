"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { useStoredFlag } from "@/lib/hooks";
import { ProjectDot } from "./display";
import Icon from "./Icon";
import { useShell } from "./shellContext";

/** How many projects the sidebar lists before linking to the full, paginated list. */
export const SIDEBAR_PROJECT_LIMIT = 12;

function currentFor(href: string, pathname: string | null): "page" | undefined {
  return pathname !== null && pathname === href ? "page" : undefined;
}

/** Sidebar navigation; `pathname` is null while the current URL is not yet known. */
export function SidebarNav({ pathname }: { pathname: string | null }) {
  const id = useId();
  const { projects, onNavigate } = useShell();
  const [collapsed, setCollapsed] = useStoredFlag("tm.sidebar.projectsCollapsed", false);
  const listId = `${id}-projects`;
  const shown = projects.slice(0, SIDEBAR_PROJECT_LIMIT);

  return (
    <nav className="sidebar-nav" aria-label="Main">
      <ul className="nav-list">
        <li>
          <Link href="/" className="nav-link" aria-current={currentFor("/", pathname)} onClick={onNavigate}>
            <Icon name="home" />
            All projects
          </Link>
        </li>
        <li>
          <Link href="/tasks" className="nav-link" aria-current={currentFor("/tasks", pathname)} onClick={onNavigate}>
            <Icon name="tasks" />
            All tasks
          </Link>
        </li>
      </ul>

      <div className="nav-section">
        <div className="nav-heading">
          <button
            type="button"
            className="nav-section-toggle"
            aria-expanded={!collapsed}
            aria-controls={listId}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon name={collapsed ? "chevronRight" : "chevronDown"} size={16} />
            Projects
          </button>
        </div>
        <ul id={listId} className="nav-list" hidden={collapsed}>
          {shown.length === 0 && <li className="nav-empty">No projects yet</li>}
          {shown.map((project) => {
            const href = `/projects/${project.id}`;
            return (
              <li key={project.id}>
                <Link href={href} className="nav-link" aria-current={currentFor(href, pathname)} onClick={onNavigate}>
                  <ProjectDot id={project.id} />
                  <span className="nav-label">{project.name}</span>
                </Link>
              </li>
            );
          })}
          {projects.length > shown.length && (
            <li>
              <Link href="/" className="nav-link nav-more" onClick={onNavigate}>
                View all {projects.length} projects
              </Link>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}

export default function CurrentSidebarNav() {
  return <SidebarNav pathname={usePathname()} />;
}
