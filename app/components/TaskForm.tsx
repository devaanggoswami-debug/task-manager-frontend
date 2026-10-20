"use client";

import { useId, useState, type FormEvent } from "react";
import {
  DEFAULT_STATUS,
  STATUS_OPTIONS,
  type FieldErrors,
  type TaskInput,
  type TaskStatus,
} from "@/lib/api";

export const ASSIGNEE_MAX = 100;
export const DESCRIPTION_MAX = 1000;

const EMPTY: TaskInput = { assignee: "", date: "", description: "", status: DEFAULT_STATUS };

interface TaskFormProps {
  heading: string;
  submitLabel: string;
  initialValues?: TaskInput;
  fieldErrors?: FieldErrors;
  submitting?: boolean;
  onSubmit: (input: TaskInput) => void;
  onCancel?: () => void;
}

export default function TaskForm({
  heading,
  submitLabel,
  initialValues = EMPTY,
  fieldErrors = {},
  submitting = false,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const id = useId();
  const [values, setValues] = useState<TaskInput>(initialValues);

  function update<K extends keyof TaskInput>(key: K, value: TaskInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(values);
  }

  const fieldIds = {
    assignee: `${id}-assignee`,
    date: `${id}-date`,
    description: `${id}-description`,
    status: `${id}-status`,
  };

  function errorProps(name: keyof TaskInput) {
    const message = fieldErrors[name];
    return message
      ? { "aria-invalid": true, "aria-describedby": `${fieldIds[name]}-error` }
      : {};
  }

  function renderError(name: keyof TaskInput) {
    const message = fieldErrors[name];
    if (!message) return null;
    return (
      <p id={`${fieldIds[name]}-error`} className="field-error">
        {message}
      </p>
    );
  }

  return (
    <form className="task-form" onSubmit={handleSubmit} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{heading}</h2>

      <div className="field">
        <label htmlFor={fieldIds.assignee}>Assignee</label>
        <input
          id={fieldIds.assignee}
          name="assignee"
          type="text"
          required
          maxLength={ASSIGNEE_MAX}
          value={values.assignee}
          onChange={(e) => update("assignee", e.target.value)}
          {...errorProps("assignee")}
        />
        {renderError("assignee")}
      </div>

      <div className="field">
        <label htmlFor={fieldIds.date}>Due date</label>
        <input
          id={fieldIds.date}
          name="date"
          type="date"
          required
          value={values.date}
          onChange={(e) => update("date", e.target.value)}
          {...errorProps("date")}
        />
        {renderError("date")}
      </div>

      <div className="field">
        <label htmlFor={fieldIds.description}>Description</label>
        <textarea
          id={fieldIds.description}
          name="description"
          required
          maxLength={DESCRIPTION_MAX}
          rows={4}
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          {...errorProps("description")}
        />
        {renderError("description")}
      </div>

      <div className="field">
        <label htmlFor={fieldIds.status}>Status</label>
        <select
          id={fieldIds.status}
          name="status"
          required
          value={values.status}
          onChange={(e) => update("status", e.target.value as TaskStatus)}
          {...errorProps("status")}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {renderError("status")}
      </div>

      <div className="actions">
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
