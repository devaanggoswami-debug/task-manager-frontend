"use client";

import { useEffect, useEffectEvent, type ReactNode } from "react";
import { categoryLabel, type Category, type Task } from "@/lib/api";
import { formatDate, initials, isOverdue, nameSwatch, projectSwatch } from "@/lib/format";
import Icon, { type IconName } from "./Icon";

/** Initials in a coloured circle beside the person's name. */
export function Assignee({ name, compact = false }: { name: string; compact?: boolean }) {
  return (
    <span className="assignee">
      <span className={`avatar swatch-${nameSwatch(name)}`} aria-hidden="true">
        {initials(name)}
      </span>
      <span className={compact ? "assignee-name compact" : "assignee-name"}>{name}</span>
    </span>
  );
}

export function CategoryTag({ category }: { category: Category | null }) {
  return (
    <span className={`category-tag category-${category ?? "none"}`}>
      <span className="category-dot" aria-hidden="true" />
      {categoryLabel(category)}
    </span>
  );
}

/** Due date with an overdue marker that does not rely on colour alone. */
export function DueDate({ task, withYear = false }: { task: Pick<Task, "date" | "status">; withYear?: boolean }) {
  const overdue = isOverdue(task);
  return (
    <span className={overdue ? "due due-overdue" : "due"}>
      <Icon name={overdue ? "alert" : "calendar"} size={16} />
      <time dateTime={task.date}>{formatDate(task.date, withYear)}</time>
      {overdue && <span className="due-label">Overdue</span>}
    </span>
  );
}

/** Square tile with the project's initial in its colour. */
export function ProjectTile({ id, name, size = "md" }: { id: number; name: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`project-tile tile-${size} swatch-${projectSwatch(id)}`} aria-hidden="true">
      {[...name.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export function ProjectDot({ id }: { id: number }) {
  return <span className={`project-dot swatch-${projectSwatch(id)}`} aria-hidden="true" />;
}

/** Placeholder rows while a list loads; the label is announced, the shapes are hidden from assistive technology. */
export function Skeleton({ label, rows = 3, variant = "row" }: { label: string; rows?: number; variant?: "row" | "card" }) {
  return (
    <div className="skeleton-group" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      <div aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={`skeleton skeleton-${variant}`} />
        ))}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={24} />
      </span>
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

const TOAST_MS = 5000;

/**
 * A polite live region that shows `message` as a toast and clears it after a few seconds.
 * The region stays mounted so screen readers announce each new message without moving focus.
 */
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => dismiss(), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <div role="status" className="toast-region">
      {message && (
        <div className="toast">
          <Icon name="check" size={20} className="toast-icon" />
          <span className="toast-text">{message}</span>
          <button type="button" className="icon-button toast-close" aria-label="Dismiss notification" onClick={onDismiss}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
