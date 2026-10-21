"use client";

import { useId, useRef, useState } from "react";
import {
  STATUS_OPTIONS,
  listTasksPage,
  statusLabel,
  toTaskInput,
  updateTask,
  type Project,
  type Task,
  type TaskStatus,
} from "@/lib/api";
import { isRefreshing, pageCount, usePagedQuery, usePageSize } from "@/lib/hooks";
import { Assignee, CategoryTag, DueDate, Skeleton } from "./display";
import { RefreshingNote, errorMessage } from "./formHelpers";
import Icon from "./Icon";
import MenuButton from "./Menu";
import Pagination from "./Pagination";
import { STATUS_ICON } from "./TaskStatusBadge";

interface BoardViewProps {
  project: Project;
  reloadKey: number;
  onChanged: () => void;
  announce: (message: string) => void;
  onOpenTask: (task: Task, opener: HTMLElement) => void;
}

type Totals = Partial<Record<TaskStatus, number>>;

/**
 * Kanban columns by task status, paged together: page N shows the Nth slice of every column, with one
 * shared page-size control. A card's status menu moves it, using the same full PUT body as the edit form.
 */
export default function BoardView({ project, reloadKey, onChanged, announce, onOpenTask }: BoardViewProps) {
  const headings = useRef(new Map<TaskStatus, HTMLHeadingElement>());
  const [moving, setMoving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = usePageSize("board");
  const [page, setPage] = useState(1);
  const [totals, setTotals] = useState<Totals>({});

  const known = STATUS_OPTIONS.every((o) => totals[o.value] !== undefined);
  const largest = Math.max(0, ...STATUS_OPTIONS.map((o) => totals[o.value] ?? 0));
  const allTasks = STATUS_OPTIONS.reduce((sum, o) => sum + (totals[o.value] ?? 0), 0);
  const pages = pageCount(largest, pageSize);
  // Moves and deletes can shrink every column; step back to the last page that still has cards.
  if (known && page > pages) setPage(pages);

  function reportTotal(status: TaskStatus, total: number) {
    setTotals((prev) => (prev[status] === total ? prev : { ...prev, [status]: total }));
  }

  async function move(task: Task, status: TaskStatus) {
    if (moving !== null || status === task.status) return;
    setMoving(task.id);
    setError(null);
    try {
      await updateTask(task.id, { ...toTaskInput(task), status });
      announce(`Moved “${task.description}” to ${statusLabel(status)}.`);
      // The card leaves this column; keep focus where it went.
      headings.current.get(status)?.focus();
      onChanged();
    } catch (err) {
      setError(`Could not change the status of “${task.description}”: ${errorMessage(err)}`);
    } finally {
      setMoving(null);
    }
  }

  return (
    <div className="board">
      <div role="alert" className={error ? "banner" : undefined}>
        {error}
      </div>
      <div className="board-columns">
        {STATUS_OPTIONS.map((option) => (
          <BoardColumn
            key={option.value}
            status={option.value}
            label={option.label}
            project={project}
            reloadKey={reloadKey}
            page={Math.min(page, pages)}
            pageSize={pageSize}
            moving={moving}
            onTotal={reportTotal}
            onMove={(task, status) => void move(task, status)}
            onOpenTask={onOpenTask}
            headingRef={(el) => {
              if (el) headings.current.set(option.value, el);
              else headings.current.delete(option.value);
            }}
          />
        ))}
      </div>
      {known && allTasks > 0 && (
        <Pagination
          label="Board pages"
          page={Math.min(page, pages)}
          pageSize={pageSize}
          total={largest}
          itemCount={allTasks}
          onChange={(next) => {
            if (next.pageSize !== pageSize) setPageSize(next.pageSize);
            setPage(next.page);
          }}
        />
      )}
    </div>
  );
}

interface BoardColumnProps {
  status: TaskStatus;
  label: string;
  project: Project;
  reloadKey: number;
  page: number;
  pageSize: number;
  moving: number | null;
  onTotal: (status: TaskStatus, total: number) => void;
  onMove: (task: Task, status: TaskStatus) => void;
  onOpenTask: (task: Task, opener: HTMLElement) => void;
  headingRef: (el: HTMLHeadingElement | null) => void;
}

function BoardColumn({ status, label, project, reloadKey, page, pageSize, moving, onTotal, onMove, onOpenTask, headingRef }: BoardColumnProps) {
  const id = useId();
  const tasks = usePagedQuery<Task>(
    JSON.stringify([project.id, status, reloadKey, page, pageSize]),
    () => listTasksPage({ projectId: project.id, status, page, pageSize }),
    (result) => onTotal(status, result.total),
    String(project.id),
  );
  const headingId = `${id}-heading`;

  return (
    <section className={`board-column column-${status}`} aria-labelledby={headingId}>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="board-column-title">
        <Icon name={STATUS_ICON[status]} size={16} />
        {label}
        {tasks.loaded && (
          <span className="count-pill">
            {tasks.total}
            <span className="visually-hidden"> tasks</span>
          </span>
        )}
      </h2>
      {!tasks.loaded && tasks.status === "loading" && <Skeleton label={`Loading ${label} tasks…`} rows={2} variant="card" />}
      {tasks.status === "error" && (
        <p role="alert" className="banner">
          Could not load tasks: {errorMessage(tasks.error)}
        </p>
      )}
      {tasks.loaded && tasks.total === 0 && <p className="empty-inline">No tasks</p>}
      {tasks.loaded && tasks.total > 0 && tasks.items.length === 0 && <p className="empty-inline">No more tasks on this page</p>}
      <RefreshingNote active={isRefreshing(tasks)} />
      {tasks.loaded && tasks.items.length > 0 && (
        <ul className="board-cards" aria-label={`${label} tasks`} aria-busy={isRefreshing(tasks)}>
          {tasks.items.map((task) => (
            <li key={task.id} className="board-card">
              <button type="button" className="task-link" onClick={(e) => onOpenTask(task, e.currentTarget)}>
                <span className="visually-hidden">View task: </span>
                <span className="description-cell">{task.description}</span>
              </button>
              <div className="board-card-meta">
                <Assignee name={task.assignee} compact />
                <DueDate task={task} />
              </div>
              <div className="board-card-footer">
                <MenuButton
                  label={`Status of “${task.description}”`}
                  triggerClassName={`status-badge status-${task.status} status-trigger`}
                  trigger={
                    <>
                      <Icon name={STATUS_ICON[task.status]} size={16} />
                      {statusLabel(task.status)}
                      <Icon name="chevronDown" size={16} className="status-trigger-chevron" />
                    </>
                  }
                  triggerHint={`, change status of “${task.description}”`}
                  align="start"
                  busy={moving === task.id}
                  disabled={moving !== null && moving !== task.id}
                  items={STATUS_OPTIONS.map((option) => ({
                    kind: "radio" as const,
                    label: option.label,
                    icon: STATUS_ICON[option.value],
                    checked: option.value === task.status,
                    className: `menu-status-${option.value}`,
                    onSelect: () => onMove(task, option.value),
                  }))}
                />
                <CategoryTag category={task.category} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
