"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  ApiError,
  createSprint,
  getProject,
  listProjects,
  listSprints,
  listSprintsPage,
  notifyProjectsChanged,
  updateProject,
  type Project,
  type Sprint,
  type Task,
} from "@/lib/api";
import { isRefreshing, useFocusRequest, usePagedList, useReloadKey } from "@/lib/hooks";
import BoardView from "./BoardView";
import { EmptyState, ProjectTile, Skeleton, Toast } from "./display";
import { RefreshingNote, countLabel, errorMessage } from "./formHelpers";
import Icon, { type IconName } from "./Icon";
import PageHeader from "./PageHeader";
import Pagination from "./Pagination";
import ProjectNameForm from "./ProjectNameForm";
import ProjectOverview from "./ProjectOverview";
import { tasksHref } from "./ProjectsView";
import { ScopeStatusCheck } from "./ScopeStatus";
import SlideOver from "./SlideOver";
import SprintCard from "./SprintCard";
import SprintForm from "./SprintForm";
import TaskPanel from "./TaskPanel";

type ProjectState =
  | { projectId: number; status: "loading" }
  | { projectId: number; status: "ready"; project: Project }
  | { projectId: number; status: "notFound" }
  | { projectId: number; status: "error"; message: string };

export type ProjectTab = "list" | "board" | "overview";

const TABS: readonly { value: ProjectTab; label: string; icon: IconName }[] = [
  { value: "list", label: "List", icon: "list" },
  { value: "board", label: "Board", icon: "board" },
  { value: "overview", label: "Overview", icon: "overview" },
];

function parseProjectId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

export function parseTab(raw: string | null): ProjectTab {
  return TABS.find((tab) => tab.value === raw)?.value ?? "list";
}

function NotFound() {
  return (
    <>
      <PageHeader title="Project not found" />
      <div className="page">
        <EmptyState icon="folder" title="This project does not exist." action={<Link href="/">Back to all projects</Link>}>
          <p>The link may be wrong or out of date.</p>
        </EmptyState>
      </div>
    </>
  );
}

export default function ProjectView() {
  const params = useParams<{ id: string }>();
  const projectId = parseProjectId(params.id);
  if (projectId === null) return <NotFound />;
  return <ProjectDetails key={projectId} projectId={projectId} />;
}

function ProjectDetails({ projectId }: { projectId: number }) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("view"));
  const [reloadKey, reload] = useReloadKey();
  const [state, setState] = useState<ProjectState>({ projectId, status: "loading" });
  const [renaming, setRenaming] = useState(false);
  const [addingSprint, setAddingSprint] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allSprints, setAllSprints] = useState<Sprint[]>([]);
  const [listsError, setListsError] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const requestFocus = useFocusRequest();
  const renameButton = useRef<HTMLButtonElement>(null);
  const addSprintButton = useRef<HTMLButtonElement>(null);
  const sprintsHeading = useRef<HTMLHeadingElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const tabButtons = useRef(new Map<ProjectTab, HTMLButtonElement>());
  const taskOpener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then((project) => {
        if (active) setState({ projectId, status: "ready", project });
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) setState({ projectId, status: "notFound" });
        else setState((prev) => (prev.status === "ready" ? prev : { projectId, status: "error", message: errorMessage(err) }));
      });
    return () => {
      active = false;
    };
  }, [projectId, reloadKey]);

  // The task form and the sprint project select offer every sprint and project, not just this page.
  useEffect(() => {
    let active = true;
    Promise.all([listProjects(), listSprints()])
      .then(([projectData, sprintData]) => {
        if (!active) return;
        setAllProjects(projectData);
        setAllSprints(sprintData);
        setListsError(null);
      })
      .catch((err: unknown) => {
        if (active) setListsError(`Could not load sprints and projects: ${errorMessage(err)}`);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const sprints = usePagedList<Sprint>({
    listKey: "projectSprints",
    filterKey: String(projectId),
    reloadKey,
    load: (params) => listSprintsPage({ projectId, ...params }),
  });

  if (state.status === "notFound") return <NotFound />;
  if (state.status === "loading") {
    return (
      <>
        <PageHeader title="Project" />
        <div className="page">
          <Skeleton label="Loading project…" rows={4} variant="card" />
        </div>
      </>
    );
  }
  if (state.status === "error") {
    return (
      <>
        <PageHeader title="Project" />
        <div className="page">
          <div role="alert" className="banner">
            Could not load project: {state.message}{" "}
            <button type="button" className="secondary small" onClick={reload}>
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  const { project } = state;

  function closeRename() {
    setRenaming(false);
    requestFocus(() => renameButton.current);
  }

  function closeAddSprint() {
    setAddingSprint(false);
    requestFocus(() => addSprintButton.current);
  }

  function selectTab(next: ProjectTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "list") params.delete("view");
    else params.set("view", next);
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.value === tab);
    const next =
      event.key === "ArrowRight"
        ? TABS[(index + 1) % TABS.length]
        : event.key === "ArrowLeft"
          ? TABS[(index - 1 + TABS.length) % TABS.length]
          : event.key === "Home"
            ? TABS[0]
            : event.key === "End"
              ? TABS[TABS.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    selectTab(next.value);
    tabButtons.current.get(next.value)?.focus();
  }

  function openTaskPanel(task: Task, opener: HTMLElement) {
    taskOpener.current = opener;
    setOpenTask(task);
  }

  const tabId = (value: ProjectTab) => `${id}-tab-${value}`;
  const panelId = `${id}-panel`;

  return (
    <>
      <PageHeader
        title={project.name}
        headingRef={pageHeading}
        leading={<ProjectTile id={project.id} name={project.name} size="md" />}
      >
        <div className="project-bar">
          <div className="project-summary" aria-label="Project summary" role="group">
            <span className="meta-item">
              <Icon name="tasks" size={16} />
              {countLabel(project.taskCount, "task")}
            </span>
            <span className="meta-item">
              <Icon name="sprint" size={16} />
              {countLabel(project.sprintCount, "sprint")}
            </span>
            <ScopeStatusCheck kind="project" scopeId={project.id} name={project.name} autoLoad reloadKey={reloadKey} truncate />
          </div>
          {!renaming && (
            <div className="row-actions">
              <button type="button" className="ghost small" ref={renameButton} onClick={() => setRenaming(true)}>
                <Icon name="edit" size={16} />
                Edit name<span className="visually-hidden"> of project {project.name}</span>
              </button>
              <Link className="button-link ghost small" href={tasksHref(project.id)}>
                <Icon name="list" size={16} />
                See all tasks<span className="visually-hidden"> in {project.name}</span>
              </Link>
            </div>
          )}
        </div>
        {renaming && (
          <div className="rename-bar">
            <ProjectNameForm
              formLabel={`Rename project ${project.name}`}
              submitLabel="Save name"
              initialName={project.name}
              autoFocus
              save={(name) => updateProject(project.id, { name })}
              onSaved={(saved) => {
                setState({ projectId, status: "ready", project: saved });
                setAnnouncement(`Renamed project to ${saved.name}.`);
                notifyProjectsChanged();
                closeRename();
                reload();
              }}
              onCancel={closeRename}
            />
          </div>
        )}
        <div className="tabs" role="tablist" aria-label="Project views">
          {TABS.map((t) => (
            <button
              key={t.value}
              ref={(el) => {
                if (el) tabButtons.current.set(t.value, el);
                else tabButtons.current.delete(t.value);
              }}
              id={tabId(t.value)}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === t.value}
              aria-controls={panelId}
              tabIndex={tab === t.value ? 0 : -1}
              onClick={() => selectTab(t.value)}
              onKeyDown={handleTabKey}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="page">
        <Toast message={announcement} onDismiss={() => setAnnouncement("")} />
        {listsError && (
          <p role="alert" className="banner">
            {listsError}
          </p>
        )}

        <div id={panelId} role="tabpanel" aria-labelledby={tabId(tab)} className="tab-panel">
          {tab === "list" && (
            <section aria-labelledby={`${id}-sprints`}>
              <div className="section-heading">
                <h2 id={`${id}-sprints`} ref={sprintsHeading} tabIndex={-1}>
                  Sprints
                </h2>
                {sprints.loaded && <span className="count-pill">{sprints.total}</span>}
                <button
                  ref={addSprintButton}
                  type="button"
                  className="secondary small push-end"
                  aria-expanded={addingSprint}
                  onClick={() => (addingSprint ? closeAddSprint() : setAddingSprint(true))}
                >
                  <Icon name="plus" size={16} />
                  Add sprint
                </button>
              </div>

              {addingSprint && (
                <div className="panel create-panel">
                  <SprintForm
                    heading="New sprint"
                    headingLevel={3}
                    submitLabel="Create sprint"
                    projectId={project.id}
                    autoFocus
                    save={createSprint}
                    onSaved={(sprint) => {
                      setAnnouncement(`Created sprint ${sprint.name}.`);
                      closeAddSprint();
                      reload();
                    }}
                    onCancel={closeAddSprint}
                  />
                </div>
              )}

              {!sprints.loaded && sprints.status === "loading" && <Skeleton label="Loading sprints…" rows={2} variant="card" />}
              {sprints.status === "error" && (
                <p role="alert" className="banner">
                  Could not load sprints: {errorMessage(sprints.error)}
                </p>
              )}
              {sprints.loaded && sprints.total === 0 && !addingSprint && (
                <EmptyState
                  icon="sprint"
                  title="No sprints in this project yet."
                  action={
                    <button type="button" className="primary" onClick={() => setAddingSprint(true)}>
                      <Icon name="plus" size={16} />
                      Add the first sprint
                    </button>
                  }
                >
                  <p>Sprints are time boxes for tasks. Add one, then add or tag tasks to it.</p>
                </EmptyState>
              )}
              <RefreshingNote active={isRefreshing(sprints)} />
              {sprints.loaded && sprints.items.length > 0 && (
                <ul className="sprint-list" aria-label={`Sprints in ${project.name}`} aria-busy={isRefreshing(sprints)}>
                  {sprints.items.map((sprint) => (
                    <SprintCard
                      key={sprint.id}
                      sprint={sprint}
                      project={project}
                      projects={allProjects}
                      sprints={allSprints}
                      reloadKey={reloadKey}
                      onChanged={reload}
                      onMovedAway={() => requestFocus(() => sprintsHeading.current)}
                      announce={setAnnouncement}
                      onOpenTask={openTaskPanel}
                    />
                  ))}
                </ul>
              )}
              {sprints.loaded && sprints.total > 0 && (
                <Pagination
                  label="Sprint pages"
                  page={sprints.page}
                  pageSize={sprints.pageSize}
                  total={sprints.total}
                  onChange={sprints.setPaging}
                />
              )}
            </section>
          )}
          {tab === "board" && (
            <BoardView
              project={project}
              reloadKey={reloadKey}
              onChanged={reload}
              announce={setAnnouncement}
              onOpenTask={openTaskPanel}
            />
          )}
          {tab === "overview" && <ProjectOverview project={project} reloadKey={reloadKey} />}
        </div>
      </div>

      {openTask && (
        <SlideOver
          title="Task details"
          onClose={() => setOpenTask(null)}
          returnFocus={() => (taskOpener.current?.isConnected ? taskOpener.current : pageHeading.current)}
          closeDisabled={panelBusy}
        >
          <TaskPanel
            key={openTask.id}
            task={openTask}
            sprints={allSprints}
            projects={allProjects}
            onBusyChange={setPanelBusy}
            onUpdated={(task) => {
              setOpenTask(task);
              setAnnouncement(`Saved task for ${task.assignee}.`);
              reload();
            }}
            onDeleted={(task) => {
              taskOpener.current = pageHeading.current;
              setOpenTask(null);
              setAnnouncement(`Deleted task for ${task.assignee}.`);
              reload();
            }}
            onGone={() => {
              taskOpener.current = pageHeading.current;
              setOpenTask(null);
              reload();
            }}
          />
        </SlideOver>
      )}
    </>
  );
}
