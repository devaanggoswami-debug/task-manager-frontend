import type { ReactNode } from "react";
import { ApiError, type FieldErrors } from "@/lib/api";

export const NAME_MAX = 100;

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** Maps a failed save to inline field errors, or a form-level message when no field applies. A 409 belongs to the name. */
export function toFormErrors(err: unknown, fieldNames: string[]): { fields: FieldErrors; message: string | null } {
  if (err instanceof ApiError && err.status === 409) {
    return { fields: { name: err.message }, message: null };
  }
  const fields: FieldErrors = {};
  if (err instanceof ApiError) {
    for (const name of fieldNames) {
      if (err.fields[name]) fields[name] = err.fields[name];
    }
  }
  return { fields, message: Object.keys(fields).length > 0 ? null : errorMessage(err) };
}

export function invalidProps(fieldId: string, error: string | undefined) {
  return error ? { "aria-invalid": true, "aria-describedby": `${fieldId}-error` } : {};
}

export function FieldError({ fieldId, error }: { fieldId: string; error: string | undefined }) {
  if (!error) return null;
  return (
    <p id={`${fieldId}-error`} className="field-error">
      {error}
    </p>
  );
}

export type HeadingLevel = 2 | 3 | 4;

export function Heading({
  level,
  id,
  hidden = false,
  children,
}: {
  level: HeadingLevel;
  id?: string;
  /** Keep the heading for assistive technology only, e.g. when a dialog title already shows it. */
  hidden?: boolean;
  children: ReactNode;
}) {
  const Tag = `h${level}` as const;
  return (
    <Tag id={id} className={hidden ? "visually-hidden" : "form-heading"}>
      {children}
    </Tag>
  );
}

export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Announces that a list already on screen is being replaced by newer results. */
export function RefreshingNote({ active }: { active: boolean }) {
  return (
    <p aria-live="polite" className="hint refreshing-note">
      {active ? "Updating…" : ""}
    </p>
  );
}
