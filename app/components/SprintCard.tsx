"use client";

import { useId, useRef, useState } from "react";
import {
  ApiError,
  createTask,
  listTasksPage,
  removeTaskFromSprint,
  updateSprint,
  type FieldErrors,
  type Project,
  type Sprint,
  type Task,
  type TaskInput,
} from "@/lib/api";
import { isRefreshing, useFocusRequest, usePagedList } from "@/lib/hooks";
import { Assignee, CategoryTag, DueDate, Skeleton } from "./display";
import { RefreshingNote, countLabel, errorMessage } from "./formHelpers";
import Icon from "./Icon";
import Pagination from "./Pagination";
import { SprintDates } from "./ProjectsView";
import MenuButton from "./Menu";
import { ScopeStatusAnnouncer, ScopeStatusResult, useScopeStatus } from "./ScopeStatus";
import SprintForm from "./SprintForm";
import TagTasksPicker from "./TagTasksPicker";
import TaskForm from "./TaskForm";
import TaskStatusBadge from "./TaskStatusBadge";

type Panel = "edit" | "newTask" | "tag" | null;

interface SprintCardProps {
  sprint: Sprint;
  project: Project;
  /** All projects and sprints, for the project select and the task form checkboxes. */
  projects: readonly Project[];
  sprints: readonly Sprint[];
  reloadKey: number;
  /** Refetch everything on the page after this card changed data. */
  onChanged: () => void;
  /** The sprint was moved to another project and leaves this page. */
  onMovedAway: () => void;
  announce: (message: string) => void;
  /** Opens a task's details; `opener` gets focus back when they close. */
  onOpenTask: (task: Task, opener: HTMLElement) => void;
}

/** One sprint as a collapsible section of task rows, Asana-style, with its edit, add and tag panels. */
export default function SprintCard({
  sprint,
  project,
  projects,
  sprints,
  reloadKey,
  onChanged,
  onMovedAway,
  announce,
  onOpenTask,
}: SprintCardProps) {
  const id = useId();
  const [expanded, setExpanded] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const requestFocus = useFocusRequest();
  const toggle = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement | null>(null);
  const newTaskToggle = useRef<HTMLButtonElement>(null);
  const health = useScopeStatus("sprint", sprint.id, sprint.name, true, reloadKey);

  const tasks = usePagedList<Task>({
    listKey: "sprintTasks",
    filterKey: String(sprint.id),
    reloadKey,
    load: (params) => listTasksPage({ sprintId: sprint.id, ...params }),
  });

  function openPanel(next: Exclude<Panel, null>) {
    setExpanded(true);
    setPanel(next);
    setCreateErrors({});
    setCreateError(null);
  }

  function closePanel(from: Exclude<Panel, null>) {
    setPanel(null);
    requestFocus(() => (from === "newTask" ? newTaskToggle.current : menuButton.current));
  }

  async function handleCreateTask(input: TaskInput) {
    if (creating) return;
    setCreating(true);
    setCreateErrors({});
    setCreateError(null);
    try {
      const task = await createTask(input);
      announce(`Created task for ${task.assignee}${task.sprintIds.includes(sprint.id) ? ` in sprint ${sprint.name}` : ""}.`);
      closePanel("newTask");
      onChanged();
    } catch (err) {
      setCreateErrors(err instanceof ApiError ? err.fields : {});
      setCreateError(`Could not create task: ${errorMessage(err)}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleRemove(task: Task) {
    if (removing !== null) return;
    setRemoving(task.id);
    setRemoveError(null);
    try {
      await removeTaskFromSprint(sprint.id, task.id);
      announce(`Removed task for ${task.assignee} from sprint ${sprint.name}.`);
      // The row's own button disappears; keep focus on this sprint's section.
      toggle.current?.focus();
      onChanged();
    } catch (err) {
      setRemoveError(`Could not remove task from sprint: ${errorMessage(err)}`);
      if (err instanceof ApiError && err.status === 404) onChanged();
    } finally {
      setRemoving(null);
    }
  }

  const headingId = `${id}-heading`;
  const bodyId = `${id}-body`;

  return (
    <li className="sprint-section">
      <article aria-labelledby={headingId}>
        <header className="sprint-header">
          <h3 id={headingId} className="sprint-title">
            <button
              ref={toggle}
              type="button"
              className="section-toggle"
              aria-expanded={expanded}
              aria-controls={bodyId}
              onClick={() => setExpanded((prev) => !prev)}
            >
              <Icon name={expanded ? "chevronDown" : "chevronRight"} size={16} />
              {sprint.name}
            </button>
          </h3>
          <p className="meta sprint-meta">
            <SprintDates sprint={sprint} />
            <span className="meta-item">
              <Icon name="tasks" size={16} />
              {countLabel(sprint.taskCount, "task")}
            </span>
          </p>
          <div className="sprint-health">
            <ScopeStatusResult check={health.check} truncate />
          </div>
          <MenuButton
            label={`Actions for sprint ${sprint.name}`}
            triggerLabel={`Actions for sprint ${sprint.name}`}
            trigger={<Icon name="more" />}
            triggerRef={(el) => {
              menuButton.current = el;
            }}
            busy={health.check?.state === "loading"}
            items={[
              { label: "Edit sprint", icon: "edit", onSelect: () => openPanel("edit") },
              { label: "Tag existing tasks", icon: "link", onSelect: () => openPanel("tag") },
              {
                label: "Refresh status",
                icon: "refresh",
                onSelect: health.run,
                disabled: health.check?.state === "loading",
              },
            ]}
          />
          <ScopeStatusAnnouncer text={health.announcement} />
        </header>

        <div id={bodyId} className="sprint-body" hidden={!expanded}>
          {panel === "edit" && (
            <div className="card-panel">
              <SprintForm
                heading="Edit sprint"
                headingLevel={4}
                submitLabel="Save sprint"
                sprint={sprint}
                projects={projects.some((p) => p.id === project.id) ? projects : [project, ...projects]}
                autoFocus
                save={(input) => updateSprint(sprint.id, input)}
                onSaved={(saved) => {
                  if (saved.projectId === project.id) {
                    announce(`Saved sprint ${saved.name}.`);
                    closePanel("edit");
                  } else {
                    const target = projects.find((p) => p.id === saved.projectId);
                    announce(`Saved sprint ${saved.name} and moved it to ${target ? `project ${target.name}` : "another project"}.`);
                    onMovedAway();
                  }
                  onChanged();
                }}
                onCancel={() => closePanel("edit")}
              />
            </div>
          )}

          {panel === "tag" && (
            <div className="card-panel">
              <h4 className="form-heading">Tag existing tasks</h4>
              <TagTasksPicker
                sprint={sprint}
                reloadKey={reloadKey}
                onAdded={(count) => {
                  announce(`Added ${countLabel(count, "task")} to sprint ${sprint.name}.`);
                  onChanged();
                }}
              />
              <div className="actions">
                <button type="button" className="secondary small" onClick={() => closePanel("tag")}>
                  Done
                </button>
              </div>
            </div>
          )}

          <div role="alert" className={removeError ? "banner" : undefined}>
            {removeError}
          </div>
          {!tasks.loaded && tasks.status === "loading" && <Skeleton label="Loading tasks…" rows={2} />}
          {tasks.status === "error" && (
            <p role="alert" className="banner">
              Could not load tasks: {errorMessage(tasks.error)}
            </p>
          )}
          {tasks.loaded && tasks.total === 0 && panel !== "newTask" && (
            <p className="empty-inline">No tasks in this sprint yet.</p>
          )}
          <RefreshingNote active={isRefreshing(tasks)} />
          {tasks.loaded && tasks.items.length > 0 && (
            <ul className="task-rows" aria-label={`Tasks in ${sprint.name}`} aria-busy={isRefreshing(tasks)}>
              {tasks.items.map((task) => (
                <li key={task.id} className={task.status === "done" ? "task-row done" : "task-row"}>
                  <TaskStatusBadge status={task.status} />
                  <button
                    type="button"
                    className="task-link"
                    onClick={(e) => onOpenTask(task, e.currentTarget)}
                  >
                    <span className="visually-hidden">View task: </span>
                    <span className="description-cell">{task.description}</span>
                  </button>
                  <span className="task-row-meta">
                    <Assignee name={task.assignee} compact />
                    <DueDate task={task} />
                    <CategoryTag category={task.category} />
                  </span>
                  <button
                    type="button"
                    className="icon-button danger-hover"
                    title="Remove from sprint"
                    onClick={() => void handleRemove(task)}
                    disabled={removing !== null}
                  >
                    <Icon name="minusCircle" />
                    <span className="visually-hidden">Remove from sprint task for {task.assignee}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {panel === "newTask" ? (
            <div className="card-panel">
              <div role="alert" className={createError ? "banner" : undefined}>
                {createError}
              </div>
              <TaskForm
                heading={`New task in ${sprint.name}`}
                headingLevel={4}
                submitLabel="Create task"
                sprints={sprints}
                projects={projects}
                defaultMemberships={{ sprintIds: [sprint.id], projectIds: [project.id] }}
                fieldErrors={createErrors}
                submitting={creating}
                onSubmit={(input) => void handleCreateTask(input)}
                onCancel={() => closePanel("newTask")}
              />
            </div>
          ) : (
            <button
              type="button"
              className="add-row"
              ref={newTaskToggle}
              aria-expanded={false}
              onClick={() => openPanel("newTask")}
            >
              <Icon name="plus" size={16} />
              Add new task<span className="visually-hidden"> to {sprint.name}</span>
            </button>
          )}

          {tasks.loaded && tasks.total > 0 && (
            <Pagination
              label={`Pages of tasks in ${sprint.name}`}
              page={tasks.page}
              pageSize={tasks.pageSize}
              total={tasks.total}
              onChange={tasks.setPaging}
            />
          )}
        </div>
      </article>
    </li>
  );
}
