export type TaskStatus = "not_started" | "in_progress" | "blocked" | "done";

export const STATUS_OPTIONS: readonly { value: TaskStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

export const DEFAULT_STATUS: TaskStatus = "not_started";

export function statusLabel(status: TaskStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export interface Task {
  id: number;
  assignee: string;
  /** Due date, YYYY-MM-DD. */
  date: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  assignee: string;
  date: string;
  description: string;
  status: TaskStatus;
}

export interface Comment {
  id: number;
  taskId: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface CommentInput {
  author: string;
  body: string;
}

export type FieldErrors = Partial<Record<string, string>>;

export class ApiError extends Error {
  readonly status: number;
  readonly fields: FieldErrors;

  constructor(status: number, message: string, fields: FieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8080";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = `Request failed with status ${res.status}`;
  const fields: FieldErrors = {};
  try {
    const body: unknown = await res.json();
    if (isRecord(body)) {
      if (typeof body.error === "string" && body.error.trim() !== "") {
        message = body.error;
      }
      if (isRecord(body.fields)) {
        for (const [key, value] of Object.entries(body.fields)) {
          if (typeof value === "string") fields[key] = value;
        }
      }
    }
  } catch {
    // Non-JSON error body; keep the status-based message.
  }
  return new ApiError(res.status, message, fields);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new ApiError(0, `Cannot reach the API at ${API_BASE_URL}.`);
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// The backend rejects unknown JSON fields, so send exactly the contract's input shape.
function toBody({ assignee, date, description, status }: TaskInput): string {
  return JSON.stringify({ assignee, date, description, status });
}

function taskPath(id: number): string {
  return `/api/tasks/${encodeURIComponent(String(id))}`;
}

export function listTasks(): Promise<Task[]> {
  return request<Task[]>("/api/tasks");
}

export function getTask(id: number): Promise<Task> {
  return request<Task>(taskPath(id));
}

export function createTask(input: TaskInput): Promise<Task> {
  return request<Task>("/api/tasks", {
    method: "POST",
    body: toBody(input),
  });
}

export function updateTask(id: number, input: TaskInput): Promise<Task> {
  return request<Task>(taskPath(id), {
    method: "PUT",
    body: toBody(input),
  });
}

export function deleteTask(id: number): Promise<void> {
  return request<void>(taskPath(id), { method: "DELETE" });
}

export function listComments(taskId: number): Promise<Comment[]> {
  return request<Comment[]>(`${taskPath(taskId)}/comments`);
}

export function addComment(taskId: number, { author, body }: CommentInput): Promise<Comment> {
  return request<Comment>(`${taskPath(taskId)}/comments`, {
    method: "POST",
    body: JSON.stringify({ author, body }),
  });
}
