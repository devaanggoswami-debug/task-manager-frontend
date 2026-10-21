"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { FieldErrors, Project } from "@/lib/api";
import { FieldError, Heading, NAME_MAX, invalidProps, toFormErrors, type HeadingLevel } from "./formHelpers";

interface ProjectNameFormProps {
  /** Visible heading; when omitted the form is named by `formLabel`. */
  heading?: string;
  headingLevel?: HeadingLevel;
  formLabel?: string;
  submitLabel: string;
  /** Present when renaming; the field is cleared after each save otherwise. */
  initialName?: string;
  save: (name: string) => Promise<Project>;
  onSaved: (project: Project) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export default function ProjectNameForm({
  heading,
  headingLevel = 2,
  formLabel,
  submitLabel,
  initialName,
  save,
  onSaved,
  onCancel,
  autoFocus = false,
}: ProjectNameFormProps) {
  const id = useId();
  const [name, setName] = useState(initialName ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    input.current?.focus();
    input.current?.select();
  }, [autoFocus]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      const project = await save(name);
      if (initialName === undefined) setName("");
      onSaved(project);
    } catch (err) {
      const { fields, message } = toFormErrors(err, ["name"]);
      setErrors(fields);
      setFormError(message && `Could not save project: ${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const nameId = `${id}-name`;
  const labelling = heading ? { "aria-labelledby": `${id}-heading` } : { "aria-label": formLabel };

  return (
    <form className="task-form" onSubmit={(e) => void handleSubmit(e)} {...labelling}>
      {heading && (
        <Heading level={headingLevel} id={`${id}-heading`}>
          {heading}
        </Heading>
      )}
      <div role="alert" className={formError ? "banner" : undefined}>
        {formError}
      </div>
      <div className="field">
        <label htmlFor={nameId}>Project name</label>
        <input
          ref={input}
          id={nameId}
          name="name"
          type="text"
          autoComplete="off"
          required
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          {...invalidProps(nameId, errors.name)}
        />
        <FieldError fieldId={nameId} error={errors.name} />
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
