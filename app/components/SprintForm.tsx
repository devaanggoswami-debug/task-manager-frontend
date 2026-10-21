"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { FieldErrors, Project, Sprint, SprintInput } from "@/lib/api";
import { FieldError, Heading, NAME_MAX, invalidProps, toFormErrors, type HeadingLevel } from "./formHelpers";

interface SprintFormProps {
  heading: string;
  headingLevel?: HeadingLevel;
  submitLabel: string;
  /** Present when editing; the form is cleared after each save otherwise. */
  sprint?: Sprint;
  /** Fixes the project and hides the project select. */
  projectId?: number;
  /** Options for the project select, shown when `projectId` is not given. */
  projects?: readonly Project[];
  save: (input: SprintInput) => Promise<Sprint>;
  onSaved: (sprint: Sprint) => void;
  onCancel?: () => void;
  /** Focus the name field on mount, e.g. when opened from an Edit button. */
  autoFocus?: boolean;
}

interface Values {
  name: string;
  startDate: string;
  endDate: string;
  projectId: string;
}

const FIELDS = ["name", "startDate", "endDate", "projectId"];

function initialValues(sprint: Sprint | undefined, projectId: number | undefined): Values {
  const project = projectId ?? sprint?.projectId;
  return {
    name: sprint?.name ?? "",
    startDate: sprint?.startDate ?? "",
    endDate: sprint?.endDate ?? "",
    projectId: project == null ? "" : String(project),
  };
}

export default function SprintForm({
  heading,
  headingLevel = 2,
  submitLabel,
  sprint,
  projectId,
  projects = [],
  save,
  onSaved,
  onCancel,
  autoFocus = false,
}: SprintFormProps) {
  const id = useId();
  const [values, setValues] = useState<Values>(() => initialValues(sprint, projectId));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) nameInput.current?.focus();
  }, [autoFocus]);

  function update(key: keyof Values, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setErrors({});
    setFormError(null);
    if (values.projectId === "") {
      setErrors({ projectId: "is required" });
      return;
    }
    setSubmitting(true);
    try {
      const saved = await save({
        name: values.name,
        startDate: values.startDate,
        endDate: values.endDate,
        projectId: Number(values.projectId),
      });
      if (!sprint) setValues(initialValues(undefined, projectId));
      onSaved(saved);
    } catch (err) {
      const { fields, message } = toFormErrors(err, FIELDS);
      setErrors(fields);
      // Without a project select, a project error can only be shown at form level.
      const hiddenProjectError = projectId !== undefined && fields.projectId ? `project ${fields.projectId}` : null;
      const formMessage = message ?? hiddenProjectError;
      setFormError(formMessage && `Could not save sprint: ${formMessage}`);
    } finally {
      setSubmitting(false);
    }
  }

  const ids = {
    name: `${id}-name`,
    startDate: `${id}-start`,
    endDate: `${id}-end`,
    projectId: `${id}-project`,
  };
  const showProjectSelect = projectId === undefined;

  return (
    <form className="task-form" onSubmit={(e) => void handleSubmit(e)} aria-labelledby={`${id}-heading`}>
      <Heading level={headingLevel} id={`${id}-heading`}>
        {heading}
      </Heading>
      <div role="alert" className={formError ? "banner" : undefined}>
        {formError}
      </div>
      <div className="field">
        <label htmlFor={ids.name}>Sprint name</label>
        <input
          ref={nameInput}
          id={ids.name}
          name="name"
          type="text"
          autoComplete="off"
          required
          maxLength={NAME_MAX}
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          {...invalidProps(ids.name, errors.name)}
        />
        <FieldError fieldId={ids.name} error={errors.name} />
      </div>
      <div className="field">
        <label htmlFor={ids.startDate}>Start date</label>
        <input
          id={ids.startDate}
          name="startDate"
          type="date"
          required
          value={values.startDate}
          onChange={(e) => update("startDate", e.target.value)}
          {...invalidProps(ids.startDate, errors.startDate)}
        />
        <FieldError fieldId={ids.startDate} error={errors.startDate} />
      </div>
      <div className="field">
        <label htmlFor={ids.endDate}>End date</label>
        <input
          id={ids.endDate}
          name="endDate"
          type="date"
          required
          value={values.endDate}
          onChange={(e) => update("endDate", e.target.value)}
          {...invalidProps(ids.endDate, errors.endDate)}
        />
        <FieldError fieldId={ids.endDate} error={errors.endDate} />
      </div>
      {showProjectSelect && (
        <div className="field">
          <label htmlFor={ids.projectId}>Project</label>
          <select
            id={ids.projectId}
            name="projectId"
            required
            value={values.projectId}
            onChange={(e) => update("projectId", e.target.value)}
            {...invalidProps(ids.projectId, errors.projectId)}
          >
            <option value="" disabled>
              Choose a project
            </option>
            {projects.map((project) => (
              <option key={project.id} value={String(project.id)}>
                {project.name}
              </option>
            ))}
          </select>
          <FieldError fieldId={ids.projectId} error={errors.projectId} />
        </div>
      )}
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
