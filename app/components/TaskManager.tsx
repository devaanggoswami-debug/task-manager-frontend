"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  statusLabel,
  updateTask,
  type FieldErrors,
  type Task,
  type TaskInput,
  type TaskStatus,
} from "@/lib/api";
import TaskComments from "./TaskComments";
import TaskForm from "./TaskForm";

type LoadState = "loading" | "ready" | "error";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

function fieldErrorsOf(err: unknown): FieldErrors {
  return err instanceof ApiError ? err.fields : {};
}

// Mirrors the backend ordering: due date ascending, then id ascending.
function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) =>
    a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1,
  );
}

function toInput(task: Task): TaskInput {
  return {
    assignee: task.assignee,
    date: task.date,
    description: task.description,
    status: task.status,
  };
}

function rowClassName(task: Task, isSelected: boolean): string | undefined {
  const classes = [isSelected && "selected", task.status === "done" && "done"].filter(Boolean);
  return classes.length > 0 ? classes.join(" ") : undefined;
}

const STATUS_MARKER: Record<TaskStatus, string> = {
  not_started: "○",
  in_progress: "◐",
  blocked: "✕",
  done: "✓",
};

function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span aria-hidden="true">{STATUS_MARKER[status]} </span>
      {statusLabel(status)}
    </span>
  );
}

export default function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [banner, setBanner] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  const [createKey, setCreateKey] = useState(0);

  const [selected, setSelected] = useState<Task | null>(null);
  const [editing, setEditing] = useState(false);
  const [editErrors, setEditErrors] = useState<FieldErrors>({});

  const [busy, setBusy] = useState(false);
  const detailsHeading = useRef<HTMLHeadingElement>(null);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let active = true;
    listTasks()
      .then((data) => {
        if (!active) return;
        setTasks(sortTasks(data));
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (!active) return;
        setBanner(`Could not load tasks: ${errorMessage(err)}`);
        setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const selectedId = selected?.id;
  useEffect(() => {
    if (selectedId !== undefined && !editing) detailsHeading.current?.focus();
  }, [selectedId, editing]);

  function retry() {
    setBanner(null);
    setLoadState("loading");
    setReloadKey((k) => k + 1);
  }

  function removeLocally(id: number) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setSelected((prev) => (prev?.id === id ? null : prev));
    setEditing(false);
  }

  function upsertLocally(task: Task) {
    setTasks((prev) => sortTasks([...prev.filter((t) => t.id !== task.id), task]));
  }

  async function handleCreate(input: TaskInput) {
    setBusy(true);
    setBanner(null);
    setCreateErrors({});
    try {
      const task = await createTask(input);
      upsertLocally(task);
      setCreateKey((k) => k + 1);
      setStatus(`Created task for ${task.assignee}.`);
    } catch (err) {
      setCreateErrors(fieldErrorsOf(err));
      setBanner(`Could not create task: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleView(id: number) {
    setBusy(true);
    setBanner(null);
    setEditing(false);
    setEditErrors({});
    try {
      const task = await getTask(id);
      upsertLocally(task);
      setSelected(task);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) removeLocally(id);
      setBanner(`Could not load task: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(input: TaskInput) {
    if (!selected) return;
    setBusy(true);
    setBanner(null);
    setEditErrors({});
    try {
      const task = await updateTask(selected.id, input);
      upsertLocally(task);
      setSelected(task);
      setEditing(false);
      setStatus(`Saved task for ${task.assignee}.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) removeLocally(selected.id);
      setEditErrors(fieldErrorsOf(err));
      setBanner(`Could not save task: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!window.confirm(`Delete the task for ${selected.assignee}?`)) return;
    const { id, assignee } = selected;
    setBusy(true);
    setBanner(null);
    try {
      await deleteTask(id);
      removeLocally(id);
      setStatus(`Deleted task for ${assignee}.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) removeLocally(id);
      setBanner(`Could not delete task: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>Tasks</h1>

      <div role="alert" className={banner ? "banner" : undefined}>
        {banner}
      </div>
      <p role="status" className="visually-hidden">
        {status}
      </p>

      <section aria-labelledby="task-list-heading">
        <h2 id="task-list-heading">All tasks</h2>
        {loadState === "loading" && <p aria-live="polite">Loading tasks…</p>}
        {loadState === "error" && (
          <button type="button" onClick={retry}>
            Retry loading tasks
          </button>
        )}
        {loadState === "ready" && tasks.length === 0 && <p>No tasks yet. Create one below.</p>}
        {loadState === "ready" && tasks.length > 0 && (
          <table className="task-table">
            <thead>
              <tr>
                <th scope="col">Assignee</th>
                <th scope="col">Due date</th>
                <th scope="col">Description</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr
                  key={task.id}
                  className={rowClassName(task, selected?.id === task.id)}
                  aria-current={selected?.id === task.id ? "true" : undefined}
                >
                  <td>{task.assignee}</td>
                  <td>
                    <time dateTime={task.date}>{task.date}</time>
                  </td>
                  <td className="description-cell">{task.description}</td>
                  <td>
                    <StatusBadge status={task.status} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void handleView(task.id)}
                      disabled={busy}
                    >
                      View<span className="visually-hidden"> task for {task.assignee}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selected && !editing && (
        <section className="panel" aria-labelledby="task-details-heading">
          <h2 id="task-details-heading" ref={detailsHeading} tabIndex={-1}>
            Task details
          </h2>
          <dl className="details">
            <dt>Assignee</dt>
            <dd>{selected.assignee}</dd>
            <dt>Due date</dt>
            <dd>
              <time dateTime={selected.date}>{selected.date}</time>
            </dd>
            <dt>Description</dt>
            <dd className="description-cell">{selected.description}</dd>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={selected.status} />
            </dd>
          </dl>
          <div className="actions">
            <button type="button" onClick={() => setEditing(true)} disabled={busy}>
              Edit
            </button>
            <button type="button" className="danger" onClick={() => void handleDelete()} disabled={busy}>
              Delete
            </button>
            <button type="button" className="secondary" onClick={() => setSelected(null)} disabled={busy}>
              Close
            </button>
          </div>
          <TaskComments taskId={selected.id} />
        </section>
      )}

      {selected && editing && (
        <section className="panel">
          <TaskForm
            key={`edit-${selected.id}`}
            heading="Edit task"
            submitLabel="Save changes"
            initialValues={toInput(selected)}
            fieldErrors={editErrors}
            submitting={busy}
            onSubmit={(input) => void handleUpdate(input)}
            onCancel={() => {
              setEditing(false);
              setEditErrors({});
            }}
          />
        </section>
      )}

      <section className="panel">
        <TaskForm
          key={`create-${createKey}`}
          heading="New task"
          submitLabel="Create task"
          fieldErrors={createErrors}
          submitting={busy}
          onSubmit={(input) => void handleCreate(input)}
        />
      </section>
    </main>
  );
}
