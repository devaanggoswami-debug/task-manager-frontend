"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type FormEvent, type ReactNode, type RefObject } from "react";
import {
  ApiError,
  DATA_CHANGED_EVENT,
  PROJECTS_CHANGED_EVENT,
  SEARCH_MAX,
  createProject,
  createTask,
  listProjects,
  listSprints,
  notifyDataChanged,
  notifyProjectsChanged,
  type FieldErrors,
  type Project,
  type Sprint,
  type TaskInput,
} from "@/lib/api";
import { DESKTOP_QUERY, useDialog, useMediaQuery } from "@/lib/dialog";
import { useStoredFlag } from "@/lib/hooks";
import AssistantPanel from "./AssistantPanel";
import { Toast } from "./display";
import { errorMessage } from "./formHelpers";
import Icon from "./Icon";
import ProjectNameForm from "./ProjectNameForm";
import { ShellContext, type ShellValue } from "./shellContext";
import SlideOver from "./SlideOver";
import TaskForm from "./TaskForm";

/** Every project, refetched when projects or other data change. */
function useAllProjects(): Project[] {
  const [projects, setProjects] = useState<Project[]>([]);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const bump = () => setKey((k) => k + 1);
    window.addEventListener(PROJECTS_CHANGED_EVENT, bump);
    window.addEventListener(DATA_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener(PROJECTS_CHANGED_EVENT, bump);
      window.removeEventListener(DATA_CHANGED_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    let active = true;
    listProjects()
      .then((data) => {
        if (active) setProjects(data);
      })
      .catch(() => {
        // The sidebar keeps its last list; pages report load errors themselves.
      });
    return () => {
      active = false;
    };
  }, [key]);

  return projects;
}

function GlobalSearch() {
  const id = useId();
  const router = useRouter();
  const [text, setText] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = text.trim();
    router.push(q ? `/tasks?q=${encodeURIComponent(q)}` : "/tasks");
  }

  return (
    <form className="global-search" role="search" aria-label="Search all tasks" onSubmit={handleSubmit}>
      <label htmlFor={`${id}-q`} className="visually-hidden">
        Search all tasks
      </label>
      <Icon name="search" size={16} className="global-search-icon" />
      <input
        id={`${id}-q`}
        name="q"
        type="search"
        autoComplete="off"
        maxLength={SEARCH_MAX}
        placeholder="Search tasks…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </form>
  );
}

type CreateKind = "task" | "project";

function NewMenu({ onChoose, buttonRef }: { onChoose: (kind: CreateKind) => void; buttonRef: RefObject<HTMLButtonElement | null> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);

  useDialog(open, wrapper, () => setOpen(false), {
    initialFocus: () => firstItem.current,
    returnFocus: () => buttonRef.current,
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

  function choose(kind: CreateKind) {
    setOpen(false);
    onChoose(kind);
  }

  return (
    <div className="new-menu" ref={wrapper} onBlur={handleBlur}>
      <button
        ref={buttonRef}
        type="button"
        className="primary new-button"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Icon name="plus" size={20} />
        <span className="new-label">New</span>
      </button>
      <div id={`${id}-menu`} className="popover" role="group" aria-label="Create new" hidden={!open}>
        <button ref={firstItem} type="button" className="menu-item" onClick={() => choose("task")}>
          <Icon name="tasks" />
          <span>
            Task
            <span className="menu-hint">Assign work with a due date</span>
          </span>
        </button>
        <button type="button" className="menu-item" onClick={() => choose("project")}>
          <Icon name="folder" />
          <span>
            Project
            <span className="menu-hint">Group sprints and tasks</span>
          </span>
        </button>
      </div>
    </div>
  );
}

function NewTaskDialog({ onClose, onCreated, returnFocus }: { onClose: () => void; onCreated: (message: string) => void; returnFocus: () => HTMLElement | null }) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [listsError, setListsError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([listSprints(), listProjects()])
      .then(([sprintData, projectData]) => {
        if (!active) return;
        setSprints(sprintData);
        setProjects(projectData);
      })
      .catch((err: unknown) => {
        if (active) setListsError(`Could not load sprints and projects: ${errorMessage(err)}`);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(input: TaskInput) {
    if (submitting) return;
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      const task = await createTask(input);
      notifyDataChanged();
      onCreated(`Created task for ${task.assignee}.`);
    } catch (err) {
      setErrors(err instanceof ApiError ? err.fields : {});
      setFormError(`Could not create task: ${errorMessage(err)}`);
      setSubmitting(false);
    }
  }

  return (
    <SlideOver title="New task" onClose={onClose} returnFocus={returnFocus} closeDisabled={submitting}>
      {listsError && (
        <p role="alert" className="banner">
          {listsError}
        </p>
      )}
      <div role="alert" className={formError ? "banner" : undefined}>
        {formError}
      </div>
      <TaskForm
        heading="New task"
        headingHidden
        submitLabel="Create task"
        sprints={sprints}
        projects={projects}
        fieldErrors={errors}
        submitting={submitting}
        onSubmit={(input) => void handleSubmit(input)}
        onCancel={onClose}
      />
    </SlideOver>
  );
}

function NewProjectDialog({ onClose, onCreated, returnFocus }: { onClose: () => void; onCreated: (project: Project) => void; returnFocus: () => HTMLElement | null }) {
  return (
    <SlideOver title="New project" onClose={onClose} returnFocus={returnFocus}>
      <p className="hint">A project groups sprints and tasks. You can rename it later.</p>
      <ProjectNameForm
        formLabel="New project"
        submitLabel="Create project"
        autoFocus
        save={(name) => createProject({ name })}
        onSaved={onCreated}
        onCancel={onClose}
      />
    </SlideOver>
  );
}

function BrandMark() {
  return (
    <svg className="brand-mark" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <rect width="28" height="28" rx="8" fill="currentColor" />
      <path d="M8 14.5l3.8 3.8L20 10" fill="none" stroke="var(--brand-mark-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AppShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  const id = useId();
  const router = useRouter();
  const sidebarId = `${id}-sidebar`;
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);
  const [collapsed, setCollapsed] = useStoredFlag("tm.sidebar.collapsed", false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState<CreateKind | null>(null);
  const [toast, setToast] = useState("");
  const projects = useAllProjects();
  const sidebar = useRef<HTMLElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const toggleButton = useRef<HTMLElement | null>(null);

  const drawerActive = drawerOpen && !isDesktop;
  useDialog(drawerActive, sidebar, () => setDrawerOpen(false), {
    trapFocus: true,
    lockScroll: true,
    returnFocus: () => toggleButton.current,
  });

  const shell = useMemo<ShellValue>(
    () => ({
      sidebarId,
      sidebarExpanded: isDesktop ? !collapsed : drawerOpen,
      sidebarToggleLabel: isDesktop ? (collapsed ? "Show sidebar" : "Hide sidebar") : drawerOpen ? "Close navigation" : "Open navigation",
      toggleSidebar: () => {
        toggleButton.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (isDesktop) setCollapsed(!collapsed);
        else setDrawerOpen((prev) => !prev);
      },
      projects,
      onNavigate: () => setDrawerOpen(false),
      globalSearch: <GlobalSearch />,
      newMenu: <NewMenu buttonRef={newButton} onChoose={setCreating} />,
    }),
    [sidebarId, isDesktop, collapsed, drawerOpen, projects, setCollapsed],
  );

  return (
    <ShellContext.Provider value={shell}>
      <div className="app" data-sidebar={isDesktop ? (collapsed ? "collapsed" : "expanded") : drawerOpen ? "open" : "closed"}>
        <div className="drawer-scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
        <aside
          ref={sidebar}
          id={sidebarId}
          className="sidebar"
          aria-label="Sidebar"
          {...(drawerActive ? { role: "dialog", "aria-modal": true } : {})}
        >
          <div className="sidebar-top">
            <Link href="/" className="brand" onClick={() => setDrawerOpen(false)}>
              <BrandMark />
              <span>Task Manager</span>
            </Link>
            <button
              type="button"
              className="icon-button sidebar-close"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          {nav}
        </aside>
        <div className="app-body">
          <main id="main" className="app-main" tabIndex={-1}>
            {children}
          </main>
        </div>
        <AssistantPanel />
        {creating === "task" && (
          <NewTaskDialog
            onClose={() => setCreating(null)}
            returnFocus={() => newButton.current}
            onCreated={(message) => {
              setCreating(null);
              setToast(message);
            }}
          />
        )}
        {creating === "project" && (
          <NewProjectDialog
            onClose={() => setCreating(null)}
            returnFocus={() => newButton.current}
            onCreated={(project) => {
              setCreating(null);
              setToast(`Created project ${project.name}.`);
              notifyProjectsChanged();
              notifyDataChanged();
              router.push(`/projects/${project.id}`);
            }}
          />
        )}
        <Toast message={toast} onDismiss={() => setToast("")} />
      </div>
    </ShellContext.Provider>
  );
}
