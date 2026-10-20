"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { ApiError, addComment, listComments, type Comment, type FieldErrors } from "@/lib/api";

export const AUTHOR_MAX = 100;
export const BODY_MAX = 2000;

const TASK_GONE = "This task no longer exists. It may have been deleted.";

type CommentsState =
  | { taskId: number; status: "loading" }
  | { taskId: number; status: "ready"; comments: Comment[] }
  | { taskId: number; status: "error"; message: string };

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
  const [state, setState] = useState<CommentsState>({ taskId, status: "loading" });
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [postError, setPostError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Reset per-task state during render when the task changes, so the effect only sets state from async callbacks.
  if (state.taskId !== taskId) {
    setState({ taskId, status: "loading" });
    setFieldErrors({});
    setPostError(null);
    setAnnouncement("");
  }

  useEffect(() => {
    let active = true;
    listComments(taskId)
      .then((comments) => {
        if (active) setState({ taskId, status: "ready", comments });
      })
      .catch((err: unknown) => {
        if (active) setState({ taskId, status: "error", message: errorMessage(err) });
      });
    return () => {
      active = false;
    };
  }, [taskId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (posting) return;
    const target = taskId;
    setPosting(true);
    setFieldErrors({});
    setPostError(null);
    setAnnouncement("");
    try {
      const comment = await addComment(target, { author, body });
      setState((prev) =>
        prev.taskId === target && prev.status === "ready"
          ? { ...prev, comments: [...prev.comments, comment] }
          : prev,
      );
      setBody("");
      setAnnouncement("Update added");
    } catch (err) {
      const fields = err instanceof ApiError ? err.fields : {};
      setFieldErrors(fields);
      if (!fields.author && !fields.body) setPostError(`Could not add update: ${errorMessage(err)}`);
    } finally {
      setPosting(false);
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

      {state.status === "loading" && <p aria-live="polite">Loading updates…</p>}
      {state.status === "error" && (
        <p role="alert" className="banner">
          Could not load updates: {state.message}
        </p>
      )}
      {state.status === "ready" && state.comments.length === 0 && <p>No updates yet.</p>}
      {state.status === "ready" && state.comments.length > 0 && (
        <ol className="comment-list">
          {state.comments.map((comment) => (
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
          <button type="submit" disabled={posting}>
            {posting ? "Adding…" : "Add update"}
          </button>
        </div>
      </form>
    </section>
  );
}
