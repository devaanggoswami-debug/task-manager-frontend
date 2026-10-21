"use client";

import { useRef, useState } from "react";
import {
  ApiError,
  deleteTask,
  sprintLabel,
  toTaskInput,
  updateTask,
  type FieldErrors,
  type Project,
  type Sprint,
  type Task,
  type TaskInput,
} from "@/lib/api";
import { useFocusRequest } from "@/lib/hooks";
import { Assignee, CategoryTag, DueDate, ProjectDot } from "./display";
import { errorMessage } from "./formHelpers";
import Icon from "./Icon";
import TaskComments from "./TaskComments";
import TaskForm from "./TaskForm";
import TaskStatusBadge from "./TaskStatusBadge";

interface TaskPanelProps {
  task: Task;
  sprints: readonly Sprint[];
  projects: readonly Project[];
  onUpdated: (task: Task) => void;
  onDeleted: (task: Task) => void;
  /** The task no longer exists on the server (404). */
  onGone: (taskId: number) => void;
  /** Reports whether a save or delete is in flight, e.g. to block closing the panel. */
  onBusyChange?: (busy: boolean) => void;
}

/** Task details with edit, delete and the Updates thread; rendered inside a SlideOver. */
export default function TaskPanel({ task, sprints, projects, onUpdated, onDeleted, onGone, onBusyChange }: TaskPanelProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusyState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const editButton = useRef<HTMLButtonElement>(null);
  const requestFocus = useFocusRequest();

  function stopEditing() {
    setEditing(false);
    requestFocus(() => editButton.current);
  }

  function setBusy(next: boolean) {
    setBusyState(next);
    onBusyChange?.(next);
  }

  async function handleUpdate(input: TaskInput) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const saved = await updateTask(task.id, input);
      stopEditing();
      onUpdated(saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) onGone(task.id);
      setFieldErrors(err instanceof ApiError ? err.fields : {});
      setError(`Could not save task: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (busy) return;
    if (!window.confirm(`Delete the task for ${task.assignee}? Its updates are deleted too.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTask(task.id);
      setBusy(false);
      onDeleted(task);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 404) onGone(task.id);
      setError(`Could not delete task: ${errorMessage(err)}`);
    }
  }

  const sprintNames = task.sprintIds.map((sprintId) => {
    const sprint = sprints.find((s) => s.id === sprintId);
    return { id: sprintId, label: sprint ? sprintLabel(sprint, projects) : `Sprint #${sprintId}` };
  });
  const projectNames = task.projectIds.map((projectId) => ({
    id: projectId,
    label: projects.find((p) => p.id === projectId)?.name ?? `Project #${projectId}`,
  }));

  return (
    <div className="task-panel">
      <div role="alert" className={error ? "banner" : undefined}>
        {error}
      </div>

      {editing ? (
        <TaskForm
          key={`edit-${task.id}`}
          heading="Edit task"
          headingLevel={3}
          submitLabel="Save changes"
          initialValues={toTaskInput(task)}
          sprints={sprints}
          projects={projects}
          fieldErrors={fieldErrors}
          submitting={busy}
          onSubmit={(input) => void handleUpdate(input)}
          onCancel={() => {
            stopEditing();
            setFieldErrors({});
            setError(null);
          }}
        />
      ) : (
        <>
          <p className="task-title">{task.description}</p>
          <div className="task-panel-actions">
            <button ref={editButton} type="button" onClick={() => setEditing(true)} disabled={busy}>
              <Icon name="edit" size={16} />
              Edit
            </button>
            <button type="button" className="danger" onClick={() => void handleDelete()} disabled={busy}>
              <Icon name="trash" size={16} />
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
          <dl className="details">
            <div>
              <dt>Status</dt>
              <dd>
                <TaskStatusBadge status={task.status} />
              </dd>
            </div>
            <div>
              <dt>Assignee</dt>
              <dd>
                <Assignee name={task.assignee} />
              </dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>
                <DueDate task={task} withYear />
              </dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>
                <CategoryTag category={task.category} />
              </dd>
            </div>
            <div>
              <dt>Sprints</dt>
              <dd>
                {sprintNames.length === 0 ? (
                  <span className="muted">None</span>
                ) : (
                  <ul className="chip-list">
                    {sprintNames.map((s) => (
                      <li key={s.id} className="chip">
                        <Icon name="sprint" size={16} />
                        {s.label}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div>
              <dt>Projects</dt>
              <dd>
                {projectNames.length === 0 ? (
                  <span className="muted">None</span>
                ) : (
                  <ul className="chip-list">
                    {projectNames.map((p) => (
                      <li key={p.id} className="chip">
                        <ProjectDot id={p.id} />
                        {p.label}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </>
      )}

      <TaskComments taskId={task.id} />
    </div>
  );
}

