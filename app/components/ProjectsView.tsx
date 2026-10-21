"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  createProject,
  listProjects,
  listProjectsPage,
  listSprintsPage,
  notifyProjectsChanged,
  updateProject,
  updateSprint,
  type Project,
  type Sprint,
} from "@/lib/api";
import { formatDateRange } from "@/lib/format";
import { isRefreshing, useFocusRequest, usePagedList, useReloadKey } from "@/lib/hooks";
import { EmptyState, ProjectTile, Skeleton, Toast } from "./display";
import { RefreshingNote, countLabel, errorMessage } from "./formHelpers";
import Icon from "./Icon";
import PageHeader from "./PageHeader";
import Pagination from "./Pagination";
import ProjectNameForm from "./ProjectNameForm";
import MenuButton from "./Menu";
import { ScopeStatusAnnouncer, ScopeStatusCheck, ScopeStatusResult, useScopeStatus } from "./ScopeStatus";
import SprintForm from "./SprintForm";

export function tasksHref(projectId: number): string {
  return `/tasks?projectId=${encodeURIComponent(String(projectId))}`;
}

export function SprintDates({ sprint }: { sprint: Pick<Sprint, "startDate" | "endDate"> }) {
  return (
    <span className="meta-item">
      <Icon name="calendar" size={16} />
      <span>{formatDateRange(sprint.startDate, sprint.endDate)}</span>
    </span>
  );
}

interface ProjectRowProps {
  project: Project;
  reloadKey: number;
  editing: boolean;
  renameForm: ReactNode;
  onRename: () => void;
  menuRef: (el: HTMLButtonElement | null) => void;
}

/** A project on the home page: name, counts, done/total progress and health, with its actions in a menu. */
function ProjectRow({ project, reloadKey, editing, renameForm, onRename, menuRef }: ProjectRowProps) {
  const { check, run, announcement } = useScopeStatus("project", project.id, project.name, true, reloadKey);
  const result = check?.state === "ready" ? check.result : null;
  const percent = result && result.total > 0 ? Math.round((result.done / result.total) * 100) : 0;

  return (
    <li className="project-row">
      <ProjectTile id={project.id} name={project.name} size="lg" />
      <div className="project-row-main">
        <h3 className="project-name">
          <Link href={`/projects/${project.id}`}>{project.name}</Link>
        </h3>
        <p className="meta">
          <span className="meta-item">
            <Icon name="tasks" size={16} />
            {countLabel(project.taskCount, "task")}
          </span>
          <span className="meta-item">
            <Icon name="sprint" size={16} />
            {countLabel(project.sprintCount, "sprint")}
          </span>
        </p>
        {editing && renameForm}
      </div>
      <div className="project-row-progress">
        {result ? (
          <>
            <span className="progress-label">
              {result.done} of {result.total} done
            </span>
            <span className="progress-track" aria-hidden="true">
              <span className="progress-fill" style={{ width: `${percent}%` }} />
            </span>
          </>
        ) : (
          <span className="progress-label muted">{check?.state === "error" ? "Progress unavailable" : "Loading progress…"}</span>
        )}
      </div>
      <div className="project-row-status">
        <ScopeStatusResult check={check} badgeOnly />
      </div>
      <div className="row-actions">
        <Link className="button-link ghost small" href={tasksHref(project.id)}>
          <Icon name="list" size={16} />
          <span className="row-action-label">See all tasks</span>
          <span className="visually-hidden"> in {project.name}</span>
        </Link>
        <MenuButton
          label={`Actions for project ${project.name}`}
          triggerLabel={`Actions for project ${project.name}`}
          trigger={<Icon name="more" />}
          triggerRef={menuRef}
          busy={check?.state === "loading"}
          items={[
            { label: "Rename project", icon: "edit", onSelect: onRename, disabled: editing },
            { label: "Check status", icon: "info", onSelect: run, disabled: check?.state === "loading" },
          ]}
        />
      </div>
      <ScopeStatusAnnouncer text={announcement} />
    </li>
  );
}

export default function ProjectsView() {
  const id = useId();
  const [reloadKey, reload] = useReloadKey();
  const [announcement, setAnnouncement] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [editingProject, setEditingProject] = useState<number | null>(null);
  const [editingSprint, setEditingSprint] = useState<number | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allProjectsError, setAllProjectsError] = useState<string | null>(null);
  const requestFocus = useFocusRequest();
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const projectsHeading = useRef<HTMLHeadingElement>(null);
  const unassignedHeading = useRef<HTMLHeadingElement>(null);
  const focusAfterReload = useRef<number | null>(null);

  const projects = usePagedList<Project>({
    listKey: "projects",
    filterKey: "",
    reloadKey,
    load: (params) => listProjectsPage(params),
  });
  const unassigned = usePagedList<Sprint>({
    listKey: "unassignedSprints",
    filterKey: "",
    reloadKey,
    load: (params) => listSprintsPage({ unassigned: true, ...params }),
  });

  // Every project is a choice when assigning a legacy sprint, not just the visible page.
  useEffect(() => {
    let active = true;
    listProjects()
      .then((data) => {
        if (!active) return;
        setAllProjects(data);
        setAllProjectsError(null);
      })
      .catch((err: unknown) => {
        if (active) setAllProjectsError(`Could not load projects for the sprint form: ${errorMessage(err)}`);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // A rename re-sorts the list, so the renamed project's Edit button may move or leave the page.
  useEffect(() => {
    const projectId = focusAfterReload.current;
    if (projectId === null || projects.status === "loading") return;
    focusAfterReload.current = null;
    (editButtons.current.get(`project-${projectId}`) ?? projectsHeading.current)?.focus();
  }, [projects.status, projects.items]);

  function editButtonRef(key: string) {
    return (el: HTMLButtonElement | null) => {
      if (el) editButtons.current.set(key, el);
      else editButtons.current.delete(key);
    };
  }

  function closeProjectEdit(projectId: number) {
    setEditingProject(null);
    requestFocus(() => editButtons.current.get(`project-${projectId}`));
  }

  function closeSprintEdit(sprintId: number) {
    setEditingSprint(null);
    requestFocus(() => editButtons.current.get(`sprint-${sprintId}`));
  }

  function closeCreate() {
    setCreatingProject(false);
    requestFocus(() => projectsHeading.current);
  }

  const showUnassigned = unassigned.loaded && unassigned.total > 0;

  return (
    <>
      <PageHeader title="Projects" />
      <div className="page">
        <Toast message={announcement} onDismiss={() => setAnnouncement("")} />

        <div hidden={!creatingProject} className="panel create-panel">
          {creatingProject && (
            <ProjectNameForm
              heading="New project"
              submitLabel="Create project"
              autoFocus
              save={(name) => createProject({ name })}
              onSaved={(project) => {
                setAnnouncement(`Created project ${project.name}.`);
                notifyProjectsChanged();
                closeCreate();
                reload();
              }}
              onCancel={closeCreate}
            />
          )}
        </div>

        <section aria-labelledby={`${id}-projects`} className="page-section">
          <div className="section-heading">
            <h2 id={`${id}-projects`} ref={projectsHeading} tabIndex={-1}>
              All projects
            </h2>
            {projects.loaded && <span className="count-pill">{projects.total}</span>}
          </div>
          {!projects.loaded && projects.status === "loading" && <Skeleton label="Loading projects…" rows={3} />}
          {projects.status === "error" && (
            <div role="alert" className="banner">
              Could not load projects: {errorMessage(projects.error)}{" "}
              <button type="button" className="secondary small" onClick={reload}>
                Retry
              </button>
            </div>
          )}
          {projects.loaded && projects.total === 0 && (
            <EmptyState
              icon="folder"
              title="No projects yet"
              action={
                <button type="button" className="primary" onClick={() => setCreatingProject(true)}>
                  <Icon name="plus" size={16} />
                  Create your first project
                </button>
              }
            >
              <p>Projects group sprints and tasks so you can see how the work is going.</p>
            </EmptyState>
          )}
          <RefreshingNote active={isRefreshing(projects)} />
          {projects.loaded && projects.items.length > 0 && (
            <ul className="project-list" aria-label="Projects" aria-busy={isRefreshing(projects)}>
              {projects.items.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  reloadKey={reloadKey}
                  editing={editingProject === project.id}
                  menuRef={editButtonRef(`project-${project.id}`)}
                  onRename={() => setEditingProject(project.id)}
                  renameForm={
                    <ProjectNameForm
                      formLabel={`Rename project ${project.name}`}
                      submitLabel="Save name"
                      initialName={project.name}
                      autoFocus
                      save={(name) => updateProject(project.id, { name })}
                      onSaved={(saved) => {
                        setAnnouncement(`Renamed project to ${saved.name}.`);
                        setEditingProject(null);
                        focusAfterReload.current = project.id;
                        notifyProjectsChanged();
                        reload();
                      }}
                      onCancel={() => closeProjectEdit(project.id)}
                    />
                  }
                />
              ))}
            </ul>
          )}
          {projects.loaded && projects.total > 0 && (
            <Pagination
              label="Projects pages"
              page={projects.page}
              pageSize={projects.pageSize}
              total={projects.total}
              onChange={projects.setPaging}
            />
          )}
        </section>

        {unassigned.status === "error" && (
          <p role="alert" className="banner">
            Could not load unassigned sprints: {errorMessage(unassigned.error)}
          </p>
        )}
        {showUnassigned && (
          <section aria-labelledby={`${id}-unassigned`} className="page-section">
            <div className="section-heading">
              <h2 id={`${id}-unassigned`} ref={unassignedHeading} tabIndex={-1}>
                Unassigned sprints
              </h2>
              <span className="count-pill">{unassigned.total}</span>
            </div>
            <p className="hint">
              These sprints were created before sprints belonged to a project. Edit one to choose its project.
            </p>
            {allProjectsError && (
              <p role="alert" className="banner">
                {allProjectsError}
              </p>
            )}
            <RefreshingNote active={isRefreshing(unassigned)} />
            <ul className="project-list" aria-label="Unassigned sprints" aria-busy={isRefreshing(unassigned)}>
              {unassigned.items.map((sprint) => (
                <li key={sprint.id} className="project-row">
                  <span className="project-tile tile-lg tile-neutral" aria-hidden="true">
                    <Icon name="sprint" />
                  </span>
                  <div className="project-row-main">
                    <h3 className="project-name">{sprint.name}</h3>
                    <p className="meta">
                      <SprintDates sprint={sprint} />
                      <span className="meta-item">
                        <Icon name="tasks" size={16} />
                        {countLabel(sprint.taskCount, "task")}
                      </span>
                    </p>
                    {editingSprint === sprint.id && (
                      <SprintForm
                        heading={`Edit sprint ${sprint.name}`}
                        headingLevel={4}
                        submitLabel="Save sprint"
                        sprint={sprint}
                        projects={allProjects}
                        autoFocus
                        save={(input) => updateSprint(sprint.id, input)}
                        onSaved={(saved) => {
                          const project = allProjects.find((p) => p.id === saved.projectId);
                          setAnnouncement(`Saved sprint ${saved.name}${project ? ` in project ${project.name}` : ""}.`);
                          setEditingSprint(null);
                          // An assigned sprint leaves this list; the section disappears with its last sprint.
                          const lastOne = unassigned.total <= 1;
                          requestFocus(() => (lastOne ? projectsHeading.current : unassignedHeading.current));
                          reload();
                        }}
                        onCancel={() => closeSprintEdit(sprint.id)}
                      />
                    )}
                  </div>
                  <div className="project-row-status">
                    <ScopeStatusCheck kind="sprint" scopeId={sprint.id} name={sprint.name} />
                  </div>
                  {editingSprint !== sprint.id && (
                    <div className="row-actions">
                      <button
                        type="button"
                        className="ghost small"
                        ref={editButtonRef(`sprint-${sprint.id}`)}
                        onClick={() => setEditingSprint(sprint.id)}
                      >
                        <Icon name="edit" size={16} />
                        Edit sprint<span className="visually-hidden"> {sprint.name}</span>
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination
              label="Unassigned sprints pages"
              page={unassigned.page}
              pageSize={unassigned.pageSize}
              total={unassigned.total}
              onChange={unassigned.setPaging}
            />
          </section>
        )}
      </div>
    </>
  );
}
