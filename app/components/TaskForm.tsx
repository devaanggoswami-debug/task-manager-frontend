"use client";

import { useId, useState, type FormEvent } from "react";
import {
  AUTO_CATEGORY,
  CATEGORY_OPTIONS,
  DEFAULT_STATUS,
  STATUS_OPTIONS,
  sprintLabel,
  type Category,
  type FieldErrors,
  type Project,
  type Sprint,
  type TaskInput,
  type TaskStatus,
} from "@/lib/api";
import { Heading, type HeadingLevel } from "./formHelpers";

export const ASSIGNEE_MAX = 100;
export const DESCRIPTION_MAX = 1000;

/** Select value for a task that has no category yet; submitting it omits category so it is preserved. */
const UNCLASSIFIED = "";

type CategoryChoice = Category | typeof AUTO_CATEGORY | typeof UNCLASSIFIED;

interface FormValues {
  assignee: string;
  date: string;
  description: string;
  status: TaskStatus;
  category: CategoryChoice;
  sprintIds: number[];
  projectIds: number[];
}

type FieldName = "assignee" | "date" | "description" | "status" | "category" | "sprintIds" | "projectIds";

interface TaskFormProps {
  heading: string;
  headingLevel?: HeadingLevel;
  /** Visually hide the heading when a surrounding dialog title already shows it. */
  headingHidden?: boolean;
  submitLabel: string;
  /** Present when editing an existing task. */
  initialValues?: TaskInput;
  /** Preselected memberships for a new task, e.g. the sprint and project it is created from. */
  defaultMemberships?: { sprintIds?: number[]; projectIds?: number[] };
  sprints?: readonly Sprint[];
  projects?: readonly Project[];
  fieldErrors?: FieldErrors;
  submitting?: boolean;
  onSubmit: (input: TaskInput) => void;
  onCancel?: () => void;
}

function toFormValues(
  initial: TaskInput | undefined,
  defaults: TaskFormProps["defaultMemberships"],
): FormValues {
  if (!initial) {
    return {
      assignee: "",
      date: "",
      description: "",
      status: DEFAULT_STATUS,
      category: AUTO_CATEGORY,
      sprintIds: [...(defaults?.sprintIds ?? [])].sort((a, b) => a - b),
      projectIds: [...(defaults?.projectIds ?? [])].sort((a, b) => a - b),
    };
  }
  return {
    assignee: initial.assignee,
    date: initial.date,
    description: initial.description,
    status: initial.status,
    category: initial.category ?? UNCLASSIFIED,
    sprintIds: initial.sprintIds ?? [],
    projectIds: initial.projectIds ?? [],
  };
}

function toggle(ids: number[], id: number, checked: boolean): number[] {
  const rest = ids.filter((existing) => existing !== id);
  return checked ? [...rest, id].sort((a, b) => a - b) : rest;
}

export default function TaskForm({
  heading,
  headingLevel = 2,
  headingHidden = false,
  submitLabel,
  initialValues,
  defaultMemberships,
  sprints = [],
  projects = [],
  fieldErrors = {},
  submitting = false,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const id = useId();
  const isEdit = initialValues !== undefined;
  const [values, setValues] = useState<FormValues>(() => toFormValues(initialValues, defaultMemberships));

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { category, ...rest } = values;
    onSubmit({ ...rest, ...(category !== UNCLASSIFIED ? { category } : {}) });
  }

  const fieldIds: Record<FieldName, string> = {
    assignee: `${id}-assignee`,
    date: `${id}-date`,
    description: `${id}-description`,
    status: `${id}-status`,
    category: `${id}-category`,
    sprintIds: `${id}-sprints`,
    projectIds: `${id}-projects`,
  };

  function errorProps(name: FieldName) {
    const message = fieldErrors[name];
    return message
      ? { "aria-invalid": true, "aria-describedby": `${fieldIds[name]}-error` }
      : {};
  }

  function describedBy(name: FieldName) {
    return fieldErrors[name] ? { "aria-describedby": `${fieldIds[name]}-error` } : {};
  }

  function renderError(name: FieldName) {
    const message = fieldErrors[name];
    if (!message) return null;
    return (
      <p id={`${fieldIds[name]}-error`} className="field-error">
        {message}
      </p>
    );
  }

  function renderMembership(
    name: "sprintIds" | "projectIds",
    legend: string,
    items: { id: number; label: string }[],
    emptyText: string,
  ) {
    return (
      <fieldset className="field checkbox-group" id={fieldIds[name]} {...describedBy(name)}>
        <legend>{legend}</legend>
        {items.length === 0 && <p className="hint">{emptyText}</p>}
        <div className="checkbox-list">
          {items.map((item) => {
            const checkboxId = `${fieldIds[name]}-${item.id}`;
            return (
              <div key={item.id} className="checkbox-option">
                <input
                  id={checkboxId}
                  type="checkbox"
                  name={name}
                  value={item.id}
                  checked={values[name].includes(item.id)}
                  onChange={(e) => update(name, toggle(values[name], item.id, e.target.checked))}
                />
                <label htmlFor={checkboxId}>{item.label}</label>
              </div>
            );
          })}
        </div>
        {renderError(name)}
      </fieldset>
    );
  }

  return (
    <form className="task-form" onSubmit={handleSubmit} aria-labelledby={`${id}-heading`}>
      <Heading level={headingLevel} id={`${id}-heading`} hidden={headingHidden}>
        {heading}
      </Heading>

      <div className="field">
        <label htmlFor={fieldIds.description}>Description</label>
        <textarea
          id={fieldIds.description}
          name="description"
          required
          maxLength={DESCRIPTION_MAX}
          rows={3}
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          {...errorProps("description")}
        />
        {renderError("description")}
      </div>

      <div className="form-grid">
      <div className="field">
        <label htmlFor={fieldIds.assignee}>Assignee</label>
        <input
          id={fieldIds.assignee}
          name="assignee"
          type="text"
          autoComplete="off"
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

      <div className="field">
        <label htmlFor={fieldIds.category}>Category</label>
        <select
          id={fieldIds.category}
          name="category"
          value={values.category}
          onChange={(e) => update("category", e.target.value as CategoryChoice)}
          {...errorProps("category")}
        >
          {!isEdit && <option value={AUTO_CATEGORY}>Auto-classify</option>}
          {isEdit && initialValues?.category === undefined && (
            <option value={UNCLASSIFIED}>Unclassified</option>
          )}
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {renderError("category")}
      </div>
      </div>

      {renderMembership(
        "sprintIds",
        "Sprints",
        sprints.map((sprint) => ({ id: sprint.id, label: sprintLabel(sprint, projects) })),
        "No sprints yet. Create one on a project page.",
      )}
      {renderMembership(
        "projectIds",
        "Projects",
        projects.map((project) => ({ id: project.id, label: project.name })),
        "No projects yet. Create one on the Projects page.",
      )}

      <div className="actions form-actions">
        {/* Not disabled while saving, so focus is kept; callers ignore a second submit. */}
        <button type="submit" aria-disabled={submitting}>
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
