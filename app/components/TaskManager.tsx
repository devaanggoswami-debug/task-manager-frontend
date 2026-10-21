"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  CATEGORY_OPTIONS,
  SEARCH_MAX,
  STATUS_OPTIONS,
  UNCLASSIFIED_FILTER,
  categoryLabel,
  createTask,
  getTask,
  listProjects,
  listSprints,
  listTasksPage,
  sprintLabel,
  type CategoryFilter,
  type FieldErrors,
  type PageParams,
  type Project,
  type Sprint,
  type Task,
  type TaskFilters,
  type TaskInput,
  type TaskStatus,
} from "@/lib/api";
import { PHONE_QUERY, useMediaQuery } from "@/lib/dialog";
import { isPageSize, isRefreshing, pageCount, usePagedQuery, usePageSize, useReloadKey } from "@/lib/hooks";
import AddToSprintPicker from "./AddToSprintPicker";
import { Assignee, CategoryTag, DueDate, EmptyState, Skeleton, Toast } from "./display";
import { RefreshingNote, errorMessage } from "./formHelpers";
import Icon from "./Icon";
import PageHeader from "./PageHeader";
import Pagination from "./Pagination";
import SlideOver from "./SlideOver";
import TaskForm from "./TaskForm";
import TaskPanel from "./TaskPanel";
import TaskStatusBadge from "./TaskStatusBadge";

/** Filters and paging as they appear in the URL query. */
export interface TaskQuery extends Omit<TaskFilters, "excludeSprintId"> {
  page: number;
  /** Absent when the URL does not set one; the remembered page size applies then. */
  pageSize?: number;
}

interface QueryReader {
  get(name: string): string | null;
}

function positiveInt(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 && Number.isSafeInteger(n) ? n : undefined;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.find((option) => option === value);
}

const STATUS_VALUES = STATUS_OPTIONS.map((o) => o.value);
const CATEGORY_FILTER_VALUES: CategoryFilter[] = [...CATEGORY_OPTIONS.map((o) => o.value), UNCLASSIFIED_FILTER];

/** Reads the URL query, ignoring values the API would reject. */
export function parseTaskQuery(params: QueryReader): TaskQuery {
  const q = params.get("q")?.trim().slice(0, SEARCH_MAX);
  const pageSize = positiveInt(params.get("pageSize"));
  return {
    projectId: positiveInt(params.get("projectId")),
    sprintId: positiveInt(params.get("sprintId")),
    status: oneOf<TaskStatus>(params.get("status"), STATUS_VALUES),
    category: oneOf<CategoryFilter>(params.get("category"), CATEGORY_FILTER_VALUES),
    q: q ? q : undefined,
    page: positiveInt(params.get("page")) ?? 1,
    pageSize: pageSize !== undefined && isPageSize(pageSize) ? pageSize : undefined,
  };
}

export function taskQueryString(query: TaskQuery): string {
  const params = new URLSearchParams();
  if (query.projectId !== undefined) params.set("projectId", String(query.projectId));
  if (query.sprintId !== undefined) params.set("sprintId", String(query.sprintId));
  if (query.status) params.set("status", query.status);
  if (query.category) params.set("category", query.category);
  if (query.q) params.set("q", query.q);
  if (query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
  return params.toString();
}

function fieldErrorsOf(err: unknown): FieldErrors {
  return err instanceof ApiError ? err.fields : {};
}

function namesFor(ids: number[], labelOf: (id: number) => string | undefined, kind: string): string {
  if (ids.length === 0) return "—";
  return ids.map((id) => labelOf(id) ?? `${kind} #${id}`).join(", ");
}

function rowClassName(task: Task, isSelected: boolean): string | undefined {
  const classes = [isSelected && "selected", task.status === "done" && "done"].filter(Boolean);
  return classes.length > 0 ? classes.join(" ") : undefined;
}

function toOptionalId(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

export default function TaskManager() {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = parseTaskQuery(searchParams);
  const [storedPageSize, setStoredPageSize] = usePageSize("tasks");
  const pageSize = query.pageSize ?? storedPageSize;
  const [reloadKey, reload] = useReloadKey();

  const [banner, setBanner] = useState<string | null>(null);
  const [listsError, setListsError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const [loadingTask, setLoadingTask] = useState<number | null>(null);
  const [pickerTaskId, setPickerTaskId] = useState<number | null>(null);
  const isPhone = useMediaQuery(PHONE_QUERY, false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // The search box is edited locally and applied on submit; follow the URL when it changes (e.g. Back).
  const [searchText, setSearchText] = useState(query.q ?? "");
  const [syncedQ, setSyncedQ] = useState(query.q ?? "");
  if (syncedQ !== (query.q ?? "")) {
    setSyncedQ(query.q ?? "");
    setSearchText(query.q ?? "");
  }

  const pageHeading = useRef<HTMLHeadingElement>(null);
  const addTaskButton = useRef<HTMLButtonElement>(null);
  const addButtons = useRef(new Map<number, HTMLButtonElement>());
  const viewButtons = useRef(new Map<number, HTMLButtonElement>());
  // Where focus goes when the details panel closes: the row it was opened from, or the heading once that row is gone.
  const returnFocus = useRef<HTMLElement | null>(null);

  function navigate(next: TaskQuery) {
    const search = taskQueryString(next);
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }

  const filters: TaskFilters = {
    projectId: query.projectId,
    sprintId: query.sprintId,
    status: query.status,
    category: query.category,
    q: query.q,
  };
  const page = query.page;
  const filterKey = JSON.stringify(filters);
  const tasks = usePagedQuery<Task>(
    JSON.stringify([filterKey, page, pageSize, reloadKey]),
    () => listTasksPage({ ...filters, page, pageSize }),
    (result) => {
      setSelected((prev) => (prev ? (result.items.find((t) => t.id === prev.id) ?? prev) : prev));
      const last = pageCount(result.total, pageSize);
      if (result.items.length === 0 && page > last) navigate({ ...query, page: last });
    },
    filterKey,
  );

  useEffect(() => {
    let active = true;
    Promise.all([listSprints(), listProjects()])
      .then(([sprintData, projectData]) => {
        if (!active) return;
        setSprints(sprintData);
        setProjects(projectData);
        setListsError(null);
      })
      .catch((err: unknown) => {
        if (active) setListsError(`Could not load sprints and projects: ${errorMessage(err)}`);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const sprintById = (sprintId: number) => {
    const sprint = sprints.find((s) => s.id === sprintId);
    return sprint && sprintLabel(sprint, projects);
  };
  const projectById = (projectId: number) => projects.find((p) => p.id === projectId)?.name;

  function setFilter(next: Partial<TaskQuery>) {
    navigate({ ...query, ...next, page: 1 });
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilter({ q: searchText.trim() || undefined });
  }

  function handlePaging(next: PageParams) {
    if (next.pageSize !== pageSize) setStoredPageSize(next.pageSize);
    navigate({ ...query, page: next.page, pageSize: next.pageSize });
  }

  function closePanel() {
    setSelected(null);
  }

  function forget(taskId: number) {
    returnFocus.current = pageHeading.current;
    setSelected((prev) => (prev?.id === taskId ? null : prev));
    reload();
  }

  async function handleCreate(input: TaskInput) {
    if (submitting) return;
    setSubmitting(true);
    setCreateError(null);
    setCreateErrors({});
    try {
      const task = await createTask(input);
      setCreating(false);
      reload();
      setStatus(`Created task for ${task.assignee}.`);
    } catch (err) {
      setCreateErrors(fieldErrorsOf(err));
      setCreateError(`Could not create task: ${errorMessage(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleView(taskId: number) {
    if (loadingTask !== null) return;
    returnFocus.current = viewButtons.current.get(taskId) ?? null;
    setLoadingTask(taskId);
    setBanner(null);
    try {
      setSelected(await getTask(taskId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) forget(taskId);
      setBanner(`Could not load task: ${errorMessage(err)}`);
    } finally {
      setLoadingTask(null);
    }
  }

  function closePicker(taskId: number) {
    setPickerTaskId(null);
    addButtons.current.get(taskId)?.focus();
  }

  function handleAddedToSprint(task: Task, sprint: Sprint) {
    setStatus(`Added task for ${task.assignee} to ${sprintLabel(sprint, projects)}.`);
    closePicker(task.id);
    reload();
  }

  const hasFilters = Boolean(query.projectId || query.sprintId || query.status || query.category || query.q);
  const activeFilters = [query.projectId, query.sprintId, query.status, query.category].filter((v) => v !== undefined).length;
  const filtersId = `${id}-filters`;
  const ids = {
    q: `${id}-q`,
    project: `${id}-project`,
    sprint: `${id}-sprint`,
    status: `${id}-status`,
    category: `${id}-category`,
  };

  return (
    <>
      <PageHeader
        title="All tasks"
        hideSearch
        headingRef={pageHeading}
        actions={
          <button ref={addTaskButton} type="button" className="secondary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} />
            Add task
          </button>
        }
      />
      <div className="page">
        <div role="alert" className={banner ? "banner" : undefined}>
          {banner}
        </div>
        {listsError && (
          <p role="alert" className="banner">
            {listsError}
          </p>
        )}
        <Toast message={status} onDismiss={() => setStatus("")} />

        <div className="toolbar">
          <form className="toolbar-search" role="search" aria-label="Search tasks" onSubmit={handleSearch}>
            <div className="field">
              <label htmlFor={ids.q}>Search</label>
              <div className="search-row">
                <input
                  id={ids.q}
                  name="q"
                  type="search"
                  autoComplete="off"
                  maxLength={SEARCH_MAX}
                  placeholder="Assignee or description…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  aria-describedby={`${ids.q}-hint`}
                />
                <button type="submit" className="secondary">
                  <Icon name="search" size={16} />
                  Search
                </button>
              </div>
              <p id={`${ids.q}-hint`} className="visually-hidden">
                Matches assignee or description.
              </p>
            </div>
          </form>
          {isPhone && (
            <button
              type="button"
              className="secondary small filters-toggle"
              aria-expanded={filtersOpen}
              aria-controls={filtersId}
              onClick={() => setFiltersOpen((prev) => !prev)}
            >
              <Icon name="filter" size={16} />
              Filters
              {activeFilters > 0 && (
                <span className="count-pill">
                  {activeFilters}
                  <span className="visually-hidden"> active</span>
                </span>
              )}
              <Icon name={filtersOpen ? "chevronDown" : "chevronRight"} size={16} />
            </button>
          )}
          <div
            id={filtersId}
            className="toolbar-filters"
            role="group"
            aria-label="Filter tasks"
            hidden={isPhone && !filtersOpen}
          >
            <div className="field">
              <label htmlFor={ids.project}>Project</label>
              <select
                id={ids.project}
                value={query.projectId ?? ""}
                onChange={(e) => setFilter({ projectId: toOptionalId(e.target.value) })}
              >
                <option value="">All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={String(project.id)}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={ids.sprint}>Sprint</label>
              <select
                id={ids.sprint}
                value={query.sprintId ?? ""}
                onChange={(e) => setFilter({ sprintId: toOptionalId(e.target.value) })}
              >
                <option value="">All sprints</option>
                {sprints.map((sprint) => (
                  <option key={sprint.id} value={String(sprint.id)}>
                    {sprintLabel(sprint, projects)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={ids.status}>Status</label>
              <select
                id={ids.status}
                value={query.status ?? ""}
                onChange={(e) => setFilter({ status: (e.target.value || undefined) as TaskStatus | undefined })}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={ids.category}>Category</label>
              <select
                id={ids.category}
                value={query.category ?? ""}
                onChange={(e) => setFilter({ category: (e.target.value || undefined) as CategoryFilter | undefined })}
              >
                <option value="">All categories</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value={UNCLASSIFIED_FILTER}>{categoryLabel(null)}</option>
              </select>
            </div>
            {hasFilters && (
              <button type="button" className="ghost small clear-filters" onClick={() => navigate({ page: 1, pageSize: query.pageSize })}>
                <Icon name="close" size={16} />
                Clear filters
              </button>
            )}
          </div>
        </div>

        {!tasks.loaded && tasks.status === "loading" && <Skeleton label="Loading tasks…" rows={6} />}
        {tasks.status === "error" && (
          <div role="alert" className="banner">
            Could not load tasks: {errorMessage(tasks.error)}{" "}
            <button type="button" className="secondary small" onClick={reload}>
              Retry loading tasks
            </button>
          </div>
        )}
        {tasks.loaded && tasks.total === 0 &&
          (hasFilters ? (
            <EmptyState icon="search" title="No tasks match these filters.">
              <p>Try a different search, or clear the filters to see every task.</p>
            </EmptyState>
          ) : (
            <EmptyState
              icon="tasks"
              title="No tasks yet."
              action={
                <button type="button" className="primary" onClick={() => setCreating(true)}>
                  <Icon name="plus" size={16} />
                  Add your first task
                </button>
              }
            >
              <p>Tasks have an assignee, a due date and a status, and can belong to sprints and projects.</p>
            </EmptyState>
          ))}
        <RefreshingNote active={isRefreshing(tasks)} />
        {tasks.loaded && tasks.items.length > 0 && (
          <div className="table-wrap" aria-busy={isRefreshing(tasks)}>
            <table className="task-table">
              <caption className="visually-hidden">Tasks</caption>
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Status</th>
                  <th scope="col">Assignee</th>
                  <th scope="col">Due date</th>
                  <th scope="col">Category</th>
                  <th scope="col">Sprints</th>
                  <th scope="col">Projects</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.items.map((task) => (
                  <Fragment key={task.id}>
                    <tr
                      className={rowClassName(task, selected?.id === task.id)}
                      aria-current={selected?.id === task.id ? "true" : undefined}
                    >
                      <td className="cell-task">
                        <button
                          type="button"
                          className="task-link"
                          ref={(el) => {
                            if (el) viewButtons.current.set(task.id, el);
                            else viewButtons.current.delete(task.id);
                          }}
                          onClick={() => void handleView(task.id)}
                          aria-busy={loadingTask === task.id}
                        >
                          <span className="visually-hidden">View task: </span>
                          <span className="description-cell">{task.description}</span>
                          <span className="visually-hidden">, assigned to {task.assignee}</span>
                        </button>
                      </td>
                      <td data-label="Status">
                        <TaskStatusBadge status={task.status} />
                      </td>
                      <td data-label="Assignee">
                        <Assignee name={task.assignee} />
                      </td>
                      <td data-label="Due date">
                        <DueDate task={task} />
                      </td>
                      <td data-label="Category">
                        <CategoryTag category={task.category} />
                      </td>
                      <td data-label="Sprints">{namesFor(task.sprintIds, sprintById, "Sprint")}</td>
                      <td data-label="Projects">{namesFor(task.projectIds, projectById, "Project")}</td>
                      <td className="cell-actions">
                        <button type="button" className="ghost small stacked-only" onClick={() => void handleView(task.id)}>
                          <Icon name="arrowRight" size={16} />
                          View<span className="visually-hidden"> task for {task.assignee}</span>
                        </button>
                        <button
                          type="button"
                          className="ghost small"
                          ref={(el) => {
                            if (el) addButtons.current.set(task.id, el);
                            else addButtons.current.delete(task.id);
                          }}
                          aria-expanded={pickerTaskId === task.id}
                          onClick={() => setPickerTaskId(pickerTaskId === task.id ? null : task.id)}
                        >
                          <Icon name="plus" size={16} />
                          Add to sprint<span className="visually-hidden"> task for {task.assignee}</span>
                        </button>
                      </td>
                    </tr>
                    {pickerTaskId === task.id && (
                      <tr className="picker-row">
                        <td colSpan={8}>
                          <AddToSprintPicker
                            task={task}
                            sprints={sprints}
                            projects={projects}
                            onAdded={(sprint) => handleAddedToSprint(task, sprint)}
                            onCancel={() => closePicker(task.id)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tasks.loaded && tasks.total > 0 && (
          <Pagination label="Task pages" page={page} pageSize={pageSize} total={tasks.total} onChange={handlePaging} />
        )}
      </div>

      {selected && (
        <SlideOver
          title="Task details"
          onClose={closePanel}
          returnFocus={() => (returnFocus.current?.isConnected ? returnFocus.current : pageHeading.current)}
          closeDisabled={panelBusy}
        >
          <TaskPanel
            key={selected.id}
            task={selected}
            sprints={sprints}
            projects={projects}
            onBusyChange={setPanelBusy}
            onUpdated={(task) => {
              setSelected(task);
              setStatus(`Saved task for ${task.assignee}.`);
              reload();
            }}
            onDeleted={(task) => {
              returnFocus.current = pageHeading.current;
              setSelected(null);
              setStatus(`Deleted task for ${task.assignee}.`);
              reload();
            }}
            onGone={forget}
          />
        </SlideOver>
      )}

      {creating && (
        <SlideOver
          title="New task"
          onClose={() => setCreating(false)}
          returnFocus={() => addTaskButton.current}
          closeDisabled={submitting}
        >
          <div role="alert" className={createError ? "banner" : undefined}>
            {createError}
          </div>
          <TaskForm
            heading="New task"
            headingHidden
            submitLabel="Create task"
            sprints={sprints}
            projects={projects}
            fieldErrors={createErrors}
            submitting={submitting}
            onSubmit={(input) => void handleCreate(input)}
            onCancel={() => setCreating(false)}
          />
        </SlideOver>
      )}
    </>
  );
}
