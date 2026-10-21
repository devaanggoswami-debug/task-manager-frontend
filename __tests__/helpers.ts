import { vi } from "vitest";
import type { Project, Sprint, Task } from "@/lib/api";

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** A paginated list response: the items plus the X-Total-Count header. */
export function pageResponse(items: unknown[], total: number = items.length): Response {
  return jsonResponse(200, items, { "X-Total-Count": String(total) });
}

export type Handler = (url: URL, init?: RequestInit) => Response;

/**
 * Routes fetch by "METHOD /path?query", falling back to "METHOD /path".
 * Handlers build a fresh Response per call; unknown routes reject so the UI shows an error.
 */
export function stubFetch(routes: Record<string, Handler>) {
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    const handler = routes[`${method} ${url.pathname}${url.search}`] ?? routes[`${method} ${url.pathname}`];
    if (!handler) return Promise.reject(new Error(`unexpected ${method} ${input}`));
    return Promise.resolve(handler(url, init));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** "METHOD /path?query" of every call, for asserting what was requested. */
export function requests(fetchMock: ReturnType<typeof stubFetch>): string[] {
  return fetchMock.mock.calls.map(([input, init]) => {
    const url = new URL(input);
    return `${init?.method ?? "GET"} ${url.pathname}${url.search}`;
  });
}

export function bodyOf(fetchMock: ReturnType<typeof stubFetch>, route: string): unknown {
  const index = requests(fetchMock).indexOf(route);
  if (index < 0) throw new Error(`no request ${route}`);
  return JSON.parse(String(fetchMock.mock.calls[index][1]?.body));
}

export const baseTask: Task = {
  id: 1,
  assignee: "Alice",
  date: "2026-10-31",
  description: "Write docs",
  status: "not_started",
  category: null,
  sprintIds: [],
  projectIds: [],
  createdAt: "2026-10-20T13:00:00Z",
  updatedAt: "2026-10-20T13:00:00Z",
};

export const projects: Project[] = [
  { id: 5, name: "Auth", taskCount: 3, sprintCount: 2, createdAt: "x" },
  { id: 6, name: "Billing", taskCount: 1, sprintCount: 1, createdAt: "x" },
];

export const sprints: Sprint[] = [
  { id: 1, name: "Sprint 1", startDate: "2026-10-19", endDate: "2026-10-30", taskCount: 1, projectId: 5, createdAt: "x" },
  { id: 2, name: "Sprint 2", startDate: "2026-11-02", endDate: "2026-11-13", taskCount: 1, projectId: 6, createdAt: "x" },
];
