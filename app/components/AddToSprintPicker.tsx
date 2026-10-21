"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { addTasksToSprint, sprintLabel, type Project, type Sprint, type Task } from "@/lib/api";
import { errorMessage } from "./formHelpers";

interface AddToSprintPickerProps {
  task: Task;
  sprints: readonly Sprint[];
  projects: readonly Project[];
  onAdded: (sprint: Sprint) => void;
  onCancel: () => void;
}

/** Inline form that tags one task to a sprint it is not in yet. */
export default function AddToSprintPicker({ task, sprints, projects, onAdded, onCancel }: AddToSprintPickerProps) {
  const id = useId();
  const choices = sprints.filter((sprint) => !task.sprintIds.includes(sprint.id));
  const [sprintId, setSprintId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const select = useRef<HTMLSelectElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (select.current ?? cancel.current)?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (sprintId === "") {
      setError("Choose a sprint.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      onAdded(await addTasksToSprint(Number(sprintId), [task.id]));
    } catch (err) {
      setError(`Could not add to sprint: ${errorMessage(err)}`);
      setSubmitting(false);
    }
  }

  const selectId = `${id}-sprint`;

  return (
    <form
      className="task-form inline-picker"
      onSubmit={(e) => void handleSubmit(e)}
      aria-label={`Add task for ${task.assignee} to a sprint`}
    >
      <div id={`${id}-error`} role="alert" className={error ? "banner" : undefined}>
        {error}
      </div>
      {choices.length === 0 ? (
        <p className="hint">This task is already in every sprint.</p>
      ) : (
        <div className="field">
          <label htmlFor={selectId}>Sprint for task by {task.assignee}</label>
          <select
            ref={select}
            id={selectId}
            value={sprintId}
            onChange={(e) => setSprintId(e.target.value)}
            {...(error ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {})}
          >
            <option value="">Choose a sprint</option>
            {choices.map((sprint) => (
              <option key={sprint.id} value={String(sprint.id)}>
                {sprintLabel(sprint, projects)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="actions">
        {choices.length > 0 && (
          <button type="submit" disabled={submitting}>
            {submitting ? "Adding…" : "Add to sprint"}
          </button>
        )}
        <button ref={cancel} type="button" className="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}
