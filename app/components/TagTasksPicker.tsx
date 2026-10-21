"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { SEARCH_MAX, addTasksToSprint, listTasksPage, type Sprint, type Task } from "@/lib/api";
import { isRefreshing, useFocusRequest, usePagedList } from "@/lib/hooks";
import { formatDate } from "@/lib/format";
import { RefreshingNote, errorMessage } from "./formHelpers";
import Pagination from "./Pagination";

/** The API accepts at most this many task ids per request. */
export const MAX_TAG_BATCH = 100;

interface TagTasksPickerProps {
  sprint: Sprint;
  reloadKey: number;
  onAdded: (count: number) => void;
}

/** Searchable, paginated checklist of tasks not yet in the sprint, with "Add selected". */
export default function TagTasksPicker({ sprint, reloadKey, onAdded }: TagTasksPickerProps) {
  const id = useId();
  const [searchText, setSearchText] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const requestFocus = useFocusRequest();

  const candidates = usePagedList<Task>({
    listKey: "tagPicker",
    filterKey: JSON.stringify([sprint.id, q]),
    reloadKey,
    load: (params) => listTasksPage({ excludeSprintId: sprint.id, q: q || undefined, ...params }),
  });

  function toggle(taskId: number, checked: boolean) {
    setSelected((prev) => (checked ? [...prev.filter((t) => t !== taskId), taskId] : prev.filter((t) => t !== taskId)));
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQ(searchText.trim());
  }

  async function handleAdd() {
    if (submitting || selected.length === 0) return;
    if (selected.length > MAX_TAG_BATCH) {
      setError(`Select at most ${MAX_TAG_BATCH} tasks at a time.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await addTasksToSprint(sprint.id, [...selected].sort((a, b) => a - b));
      const count = selected.length;
      setSelected([]);
      // The Add button disables once nothing is selected, so keep keyboard focus in the picker.
      requestFocus(() => searchInput.current);
      onAdded(count);
    } catch (err) {
      setError(`Could not add tasks: ${errorMessage(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  const searchId = `${id}-q`;
  const legendId = `${id}-legend`;

  return (
    <div className="tag-picker">
      <form className="filters" role="search" aria-label={`Search tasks to add to ${sprint.name}`} onSubmit={handleSearch}>
        <div className="field">
          <label htmlFor={searchId}>Search tasks</label>
          <div className="search-row">
            <input
              ref={searchInput}
              id={searchId}
              name="q"
              type="search"
              autoComplete="off"
              maxLength={SEARCH_MAX}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <button type="submit">Search</button>
          </div>
        </div>
      </form>

      {!candidates.loaded && candidates.status === "loading" && <p aria-live="polite">Loading tasks…</p>}
      {candidates.status === "error" && (
        <p role="alert" className="banner">
          Could not load tasks: {errorMessage(candidates.error)}
        </p>
      )}
      {candidates.loaded && candidates.total === 0 && (
        <p>{q ? "No tasks outside this sprint match the search." : "Every task is already in this sprint."}</p>
      )}
      <RefreshingNote active={isRefreshing(candidates)} />
      {candidates.loaded && candidates.items.length > 0 && (
        <fieldset className="checkbox-group" aria-labelledby={legendId} aria-busy={isRefreshing(candidates)}>
          <legend id={legendId}>Tasks not in {sprint.name}</legend>
          <div className="checkbox-list">
            {candidates.items.map((task) => {
              const checkboxId = `${id}-task-${task.id}`;
              return (
                <div key={task.id} className="checkbox-option">
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={selected.includes(task.id)}
                    onChange={(e) => toggle(task.id, e.target.checked)}
                  />
                  <label htmlFor={checkboxId}>
                    {task.description}
                    <span className="muted">
                      {" "}
                      ({task.assignee}, due <time dateTime={task.date}>{formatDate(task.date, true)}</time>)
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>
      )}
      {candidates.loaded && candidates.total > 0 && (
        <Pagination
          label={`Pages of tasks to add to ${sprint.name}`}
          page={candidates.page}
          pageSize={candidates.pageSize}
          total={candidates.total}
          onChange={candidates.setPaging}
        />
      )}

      <div role="alert" className={error ? "banner" : undefined}>
        {error}
      </div>
      <div className="actions">
        <button type="button" onClick={() => void handleAdd()} disabled={submitting || selected.length === 0}>
          {submitting ? "Adding…" : `Add selected (${selected.length})`}
        </button>
      </div>
    </div>
  );
}
