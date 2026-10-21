"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiError, addComment, listCommentsPage, type Comment, type FieldErrors } from "@/lib/api";
import { isRefreshing, pageCount, usePagedList } from "@/lib/hooks";
import { RefreshingNote } from "./formHelpers";
import Pagination from "./Pagination";

export const AUTHOR_MAX = 100;
export const BODY_MAX = 2000;

const TASK_GONE = "This task no longer exists. It may have been deleted.";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 404) return TASK_GONE;
  return err instanceof Error ? err.message : "Something went wrong.";
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

interface TaskCommentsProps {
  taskId: number;
}

export default function TaskComments({ taskId }: TaskCommentsProps) {
  const id = useId();
  const [shownTaskId, setShownTaskId] = useState(taskId);
  const [reloadKey, setReloadKey] = useState(0);
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [postError, setPostError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const currentTaskId = useRef(taskId);

  useEffect(() => {
    currentTaskId.current = taskId;
  }, [taskId]);

  // Reset per-task form state during render when the task changes.
  if (shownTaskId !== taskId) {
    setShownTaskId(taskId);
    setBody("");
    setPosting(false);
    setFieldErrors({});
    setPostError(null);
    setAnnouncement("");
  }

  const comments = usePagedList<Comment>({
    listKey: "comments",
    filterKey: String(taskId),
    reloadKey,
    load: (params) => listCommentsPage(taskId, params),
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (posting) return;
    const target = taskId;
    setPosting(true);
    setFieldErrors({});
    setPostError(null);
    setAnnouncement("");
    try {
      await addComment(target, { author, body });
      // Another task was opened while posting; its form and list are not this post's to change.
      if (currentTaskId.current !== target) return;
      // Comments are oldest first, so the new one is on the last page.
      comments.setPaging({ page: pageCount(comments.total + 1, comments.pageSize), pageSize: comments.pageSize });
      setReloadKey((k) => k + 1);
      setBody("");
      setAnnouncement("Update added");
    } catch (err) {
      if (currentTaskId.current !== target) return;
      const fields = err instanceof ApiError ? err.fields : {};
      setFieldErrors(fields);
      if (!fields.author && !fields.body) setPostError(`Could not add update: ${errorMessage(err)}`);
    } finally {
      if (currentTaskId.current === target) setPosting(false);
    }
  }

  const fieldIds = { author: `${id}-author`, body: `${id}-body` };

  function errorProps(name: keyof typeof fieldIds) {
    return fieldErrors[name]
      ? { "aria-invalid": true, "aria-describedby": `${fieldIds[name]}-error` }
      : {};
  }

  function renderError(name: keyof typeof fieldIds) {
    const message = fieldErrors[name];
    if (!message) return null;
    return (
      <p id={`${fieldIds[name]}-error`} className="field-error">
        {message}
      </p>
    );
  }

  return (
    <section className="task-comments" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>Updates</h3>

      <p role="status" className="visually-hidden">
        {announcement}
      </p>

      {!comments.loaded && comments.status === "loading" && <p aria-live="polite">Loading updates…</p>}
      {comments.status === "error" && (
        <p role="alert" className="banner">
          Could not load updates: {errorMessage(comments.error)}
        </p>
      )}
      {comments.loaded && comments.total === 0 && <p>No updates yet.</p>}
      <RefreshingNote active={isRefreshing(comments)} />
      {comments.loaded && comments.items.length > 0 && (
        <ol
          className="comment-list"
          start={(comments.page - 1) * comments.pageSize + 1}
          aria-busy={isRefreshing(comments)}
        >
          {comments.items.map((comment) => (
            <li key={comment.id} className="comment">
              <p className="comment-meta">
                <strong>{comment.author}</strong>{" "}
                <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
              </p>
              <p className="comment-body">{comment.body}</p>
            </li>
          ))}
        </ol>
      )}
      {comments.loaded && comments.total > 0 && (
        <Pagination
          label="Updates pages"
          page={comments.page}
          pageSize={comments.pageSize}
          total={comments.total}
          onChange={comments.setPaging}
        />
      )}

      <form
        className="task-form comment-form"
        onSubmit={(e) => void handleSubmit(e)}
        aria-labelledby={`${id}-form-heading`}
      >
        <h4 id={`${id}-form-heading`}>Add update</h4>

        <div role="alert" className={postError ? "banner" : undefined}>
          {postError}
        </div>

        <div className="field">
          <label htmlFor={fieldIds.author}>Your name</label>
          <input
            id={fieldIds.author}
            name="author"
            type="text"
            autoComplete="name"
            required
            maxLength={AUTHOR_MAX}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            {...errorProps("author")}
          />
          {renderError("author")}
        </div>

        <div className="field">
          <label htmlFor={fieldIds.body}>Update</label>
          <textarea
            id={fieldIds.body}
            name="body"
            required
            maxLength={BODY_MAX}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            {...errorProps("body")}
          />
          {renderError("body")}
        </div>

        <div className="actions">
          {/* Not disabled while posting, so keyboard focus stays on it inside dialogs; a second submit is ignored. */}
          <button type="submit" aria-disabled={posting}>
            {posting ? "Adding…" : "Add update"}
          </button>
        </div>
      </form>
    </section>
  );
}
