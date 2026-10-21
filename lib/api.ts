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

export type Category = "engineering" | "marketing" | "finance" | "sales" | "compliance";

export const CATEGORY_OPTIONS: readonly { value: Category; label: string }[] = [
  { value: "engineering", label: "Engineering" },
  { value: "marketing", label: "Marketing" },
  { value: "finance", label: "Finance" },
  { value: "sales", label: "Sales" },
  { value: "compliance", label: "Compliance" },
];

/** Asks the backend to classify the task from its description. Never sent on the wire. */
export const AUTO_CATEGORY = "auto";

export function categoryLabel(category: Category | null): string {
  if (category === null) return "Unclassified";
  return CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}

export interface Task {
  id: number;
  assignee: string;
  /** Due date, YYYY-MM-DD. */
  date: string;
  description: string;
  status: TaskStatus;
  category: Category | null;
  sprintIds: number[];
  projectIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  assignee: string;
  date: string;
  description: string;
  status: TaskStatus;
  /** Omitted or "auto": POST auto-classifies, PUT keeps the stored category. */
  category?: Category | typeof AUTO_CATEGORY;
  /** Omitted: POST means none, PUT keeps the current memberships. Provided: replaces the set. */
  sprintIds?: number[];
  projectIds?: number[];
}

/** Max length of a `q` search term. */
export const SEARCH_MAX = 100;

/** Filter value for tasks without a category. */
export const UNCLASSIFIED_FILTER = "unclassified";

export type CategoryFilter = Category | typeof UNCLASSIFIED_FILTER;

export interface TaskFilters {
  sprintId?: number;
  projectId?: number;
  status?: TaskStatus;
  category?: CategoryFilter;
  /** Case-insensitive substring of assignee or description. */
  q?: string;
  /** Only tasks that are NOT in this sprint. */
  excludeSprintId?: number;
}

export interface PageParams {
  /** 1-based. */
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  /** Total matching items across all pages, from the X-Total-Count header. */
  total: number;
}

export interface Sprint {
  id: number;
  name: string;
  /** YYYY-MM-DD. */
  startDate: string;
  /** YYYY-MM-DD. */
  endDate: string;
  taskCount: number;
  /** Null for legacy sprints that do not belong to a project yet. */
  projectId: number | null;
  createdAt: string;
}

export interface SprintInput {
  name: string;
  startDate: string;
  endDate: string;
  projectId: number;
}

export interface SprintFilters {
  projectId?: number;
  /** Only legacy sprints without a project. */
  unassigned?: boolean;
}

export interface Project {
  id: number;
  name: string;
  taskCount: number;
  sprintCount: number;
  createdAt: string;
}

export interface ProjectFilters {
  /** Case-insensitive name substring. */
  q?: string;
}

export interface ProjectInput {
  name: string;
}

export type ScopeHealth = "on_track" | "at_risk" | "blocked";

export const SCOPE_HEALTH_LABELS: Record<ScopeHealth, string> = {
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
};

export interface ScopeStatus {
  status: ScopeHealth;
  reason: string;
  total: number;
  done: number;
  blocked: number;
  overdue: number;
}

export interface ChatResponse {
  reply: string;
  task: Task | null;
  status: ScopeStatus | null;
  changed: boolean;
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

async function send(path: string, init?: RequestInit): Promise<Response> {
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
  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function requestPage<T>(path: string): Promise<Page<T>> {
  const res = await send(path);
  const items = (await res.json()) as T[];
  const raw = res.headers.get("X-Total-Count")?.trim();
  const header = raw ? Number(raw) : Number.NaN;
  const valid = Number.isInteger(header) && header >= 0;
  if (!valid && process.env.NODE_ENV === "development") {
    console.warn(`${path}: missing or invalid X-Total-Count header; pagination shows only this page.`);
  }
  // Fall back to the page length if the header is missing or not exposed by CORS.
  const total = valid ? header : items.length;
  return { items, total };
}

type QueryValue = string | number | boolean | undefined;

function withQuery(path: string, entries: [string, QueryValue][]): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function pageEntries({ page, pageSize }: PageParams): [string, QueryValue][] {
  return [
    ["page", page],
    ["pageSize", pageSize],
  ];
}

// The backend rejects unknown JSON fields, so send exactly the contract's input shape.
function toBody({ assignee, date, description, status, category, sprintIds, projectIds }: TaskInput): string {
  return JSON.stringify({
    assignee,
    date,
    description,
    status,
    ...(category !== undefined && category !== AUTO_CATEGORY ? { category } : {}),
    ...(sprintIds !== undefined ? { sprintIds } : {}),
    ...(projectIds !== undefined ? { projectIds } : {}),
  });
}

function idPath(collection: string, id: number): string {
  return `/api/${collection}/${encodeURIComponent(String(id))}`;
}

function taskPath(id: number): string {
  return idPath("tasks", id);
}

function taskFilterEntries(filters: TaskFilters): [string, QueryValue][] {
  return [
    ["sprintId", filters.sprintId],
    ["projectId", filters.projectId],
    ["status", filters.status],
    ["category", filters.category],
    ["q", filters.q?.trim()],
    ["excludeSprintId", filters.excludeSprintId],
  ];
}

export function listTasks(filters: TaskFilters = {}): Promise<Task[]> {
  return request<Task[]>(withQuery("/api/tasks", taskFilterEntries(filters)));
}

export function listTasksPage(params: TaskFilters & PageParams): Promise<Page<Task>> {
  return requestPage<Task>(withQuery("/api/tasks", [...taskFilterEntries(params), ...pageEntries(params)]));
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

export function listCommentsPage(taskId: number, params: PageParams): Promise<Page<Comment>> {
  return requestPage<Comment>(withQuery(`${taskPath(taskId)}/comments`, pageEntries(params)));
}

export function addComment(taskId: number, { author, body }: CommentInput): Promise<Comment> {
  return request<Comment>(`${taskPath(taskId)}/comments`, {
    method: "POST",
    body: JSON.stringify({ author, body }),
  });
}

function sprintFilterEntries(filters: SprintFilters): [string, QueryValue][] {
  return [
    ["projectId", filters.projectId],
    ["unassigned", filters.unassigned ? "true" : undefined],
  ];
}

function sprintBody({ name, startDate, endDate, projectId }: SprintInput): string {
  return JSON.stringify({ name, startDate, endDate, projectId });
}

export function listSprints(filters: SprintFilters = {}): Promise<Sprint[]> {
  return request<Sprint[]>(withQuery("/api/sprints", sprintFilterEntries(filters)));
}

export function listSprintsPage(params: SprintFilters & PageParams): Promise<Page<Sprint>> {
  return requestPage<Sprint>(withQuery("/api/sprints", [...sprintFilterEntries(params), ...pageEntries(params)]));
}

export function createSprint(input: SprintInput): Promise<Sprint> {
  return request<Sprint>("/api/sprints", { method: "POST", body: sprintBody(input) });
}

export function updateSprint(id: number, input: SprintInput): Promise<Sprint> {
  return request<Sprint>(idPath("sprints", id), { method: "PUT", body: sprintBody(input) });
}

/** Tags the tasks to the sprint (idempotent); the backend also adds them to the sprint's project. */
export function addTasksToSprint(sprintId: number, taskIds: number[]): Promise<Sprint> {
  return request<Sprint>(`${idPath("sprints", sprintId)}/tasks`, {
    method: "POST",
    body: JSON.stringify({ taskIds }),
  });
}

export function removeTaskFromSprint(sprintId: number, taskId: number): Promise<void> {
  return request<void>(`${idPath("sprints", sprintId)}/tasks/${encodeURIComponent(String(taskId))}`, {
    method: "DELETE",
  });
}

export function getSprintStatus(id: number): Promise<ScopeStatus> {
  return request<ScopeStatus>(`${idPath("sprints", id)}/status`);
}

export function listProjects(): Promise<Project[]> {
  return request<Project[]>("/api/projects");
}

export function listProjectsPage(params: ProjectFilters & PageParams): Promise<Page<Project>> {
  return requestPage<Project>(withQuery("/api/projects", [["q", params.q?.trim()], ...pageEntries(params)]));
}

export function getProject(id: number): Promise<Project> {
  return request<Project>(idPath("projects", id));
}

export function updateProject(id: number, { name }: ProjectInput): Promise<Project> {
  return request<Project>(idPath("projects", id), {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export function createProject({ name }: ProjectInput): Promise<Project> {
  return request<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function getProjectStatus(id: number): Promise<ScopeStatus> {
  return request<ScopeStatus>(`${idPath("projects", id)}/status`);
}

export function sendChat(message: string): Promise<ChatResponse> {
  return request<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

/** "Sprint 1 (Auth)", or "Sprint 1 (unassigned)" for a sprint without a project. */
export function sprintLabel(sprint: Sprint, projects: readonly Project[]): string {
  if (sprint.projectId === null) return `${sprint.name} (unassigned)`;
  const project = projects.find((p) => p.id === sprint.projectId);
  return `${sprint.name} (${project?.name ?? `Project #${sprint.projectId}`})`;
}

/** The full PUT body for a task as it is now, as the edit form sends it; override fields to change them. */
export function toTaskInput(task: Task): TaskInput {
  return {
    assignee: task.assignee,
    date: task.date,
    description: task.description,
    status: task.status,
    ...(task.category !== null ? { category: task.category } : {}),
    sprintIds: task.sprintIds,
    projectIds: task.projectIds,
  };
}

/** Window event fired after the Assistant changed data, so open pages refetch. */
export const DATA_CHANGED_EVENT = "tm:data-changed";

export function notifyDataChanged(): void {
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}

/** Window event fired after a project was created or renamed, so the sidebar refetches its project list. */
export const PROJECTS_CHANGED_EVENT = "tm:projects-changed";

export function notifyProjectsChanged(): void {
  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
}
