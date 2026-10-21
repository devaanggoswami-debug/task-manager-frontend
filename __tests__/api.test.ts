import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  CATEGORY_OPTIONS,
  STATUS_OPTIONS,
  addComment,
  categoryLabel,
  createProject,
  createSprint,
  createTask,
  deleteTask,
  getProjectStatus,
  getSprintStatus,
  listComments,
  listProjects,
  listSprints,
  listTasks,
  listCommentsPage,
  listProjectsPage,
  listSprintsPage,
  listTasksPage,
  addTasksToSprint,
  removeTaskFromSprint,
  sendChat,
  sprintLabel,
  updateProject,
  updateSprint,
  updateTask,
  type ChatResponse,
  type Comment,
  type ScopeStatus,
  type Sprint,
  type Task,
} from "@/lib/api";

const BASE = "http://127.0.0.1:8080";

const task: Task = {
  id: 1,
  assignee: "Alice",
  date: "2026-10-31",
  description: "Write docs",
  status: "not_started",
  category: "engineering",
  sprintIds: [],
  projectIds: [],
  createdAt: "2026-10-20T13:00:00Z",
  updatedAt: "2026-10-20T13:00:00Z",
};

const comment: Comment = {
  id: 10,
  taskId: 1,
  author: "Bob",
  body: "Started",
  createdAt: "2026-10-20T14:00:00Z",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lib/api", () => {
  it("lists tasks from the default base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, [task]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listTasks()).resolves.toEqual([task]);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/tasks`, expect.any(Object));
  });

  it("posts only the contract fields when creating", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, task));
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      assignee: "Alice",
      date: "2026-10-31",
      description: "Write docs",
      status: "not_started" as const,
      extra: 1,
    };
    await expect(createTask(input)).resolves.toEqual(task);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/tasks`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      assignee: "Alice",
      date: "2026-10-31",
      description: "Write docs",
      status: "not_started",
    });
  });

  it("puts the full replacement including status when updating", async () => {
    const updated = { ...task, status: "blocked" as const };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, updated));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateTask(1, { assignee: "Alice", date: "2026-10-31", description: "Write docs", status: "blocked" }),
    ).resolves.toEqual(updated);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/tasks/1`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      assignee: "Alice",
      date: "2026-10-31",
      description: "Write docs",
      status: "blocked",
    });
  });

  it("exposes the four statuses in order with labels", () => {
    expect(STATUS_OPTIONS).toEqual([
      { value: "not_started", label: "Not started" },
      { value: "in_progress", label: "In progress" },
      { value: "blocked", label: "Blocked" },
      { value: "done", label: "Done" },
    ]);
  });

  it("parses 400 validation errors into ApiError with fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, { error: "validation failed", fields: { assignee: "is required" } }),
      ),
    );

    const err = await createTask({ assignee: "", date: "2026-10-31", description: "x", status: "done" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      message: "validation failed",
      fields: { assignee: "is required" },
    });
  });

  it("falls back to a status message for non-JSON errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })));

    await expect(listTasks()).rejects.toMatchObject({
      status: 500,
      message: "Request failed with status 500",
      fields: {},
    });
  });

  it("resolves to undefined on 204 delete", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteTask(7)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/tasks/7`);
    expect(init.method).toBe("DELETE");
  });

  it("wraps network failures in ApiError with status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(listTasks()).rejects.toMatchObject({ name: "ApiError", status: 0 });
  });

  it("lists comments for a task", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, [comment]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listComments(1)).resolves.toEqual([comment]);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/tasks/1/comments`, expect.any(Object));
  });

  it("posts only author and body when adding a comment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, comment));
    vi.stubGlobal("fetch", fetchMock);

    const input = { author: "Bob", body: "Started", extra: true };
    await expect(addComment(1, input)).resolves.toEqual(comment);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/tasks/1/comments`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ author: "Bob", body: "Started" });
  });

  it("parses comment 400 field errors into ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, { error: "validation failed", fields: { author: "is required", body: "is required" } }),
      ),
    );

    await expect(addComment(1, { author: " ", body: " " })).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      fields: { author: "is required", body: "is required" },
    });
  });

  it("rejects with a 404 ApiError when the task is gone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(404, { error: "task not found" }))),
    );

    await expect(listComments(9)).rejects.toMatchObject({ status: 404, message: "task not found" });
    await expect(addComment(9, { author: "Bob", body: "x" })).rejects.toMatchObject({
      status: 404,
      message: "task not found",
    });
  });

  describe("addendum v4", () => {
    const sprint: Sprint = {
      id: 2,
      name: "Sprint 1",
      startDate: "2026-10-19",
      endDate: "2026-10-30",
      taskCount: 3,
      projectId: 5,
      createdAt: "2026-10-18T10:00:00Z",
    };
    const status: ScopeStatus = {
      status: "at_risk",
      reason: "1 overdue task(s)",
      total: 3,
      done: 1,
      blocked: 0,
      overdue: 1,
    };

    it("labels categories and maps null to Unclassified", () => {
      expect(CATEGORY_OPTIONS.map((o) => o.label)).toEqual([
        "Engineering",
        "Marketing",
        "Finance",
        "Sales",
        "Compliance",
      ]);
      expect(categoryLabel("finance")).toBe("Finance");
      expect(categoryLabel(null)).toBe("Unclassified");
    });

    it("adds sprint and project filters to the task list querystring", async () => {
      const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, [task])));
      vi.stubGlobal("fetch", fetchMock);

      await listTasks({ sprintId: 2, projectId: 5 });
      await listTasks({ projectId: 5 });
      await listTasks({});

      const urls = fetchMock.mock.calls.map((call: unknown[]) => call[0]);
      expect(urls).toEqual([
        `${BASE}/api/tasks?sprintId=2&projectId=5`,
        `${BASE}/api/tasks?projectId=5`,
        `${BASE}/api/tasks`,
      ]);
    });

    it("omits category when auto and sends memberships and explicit categories", async () => {
      const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(201, task)));
      vi.stubGlobal("fetch", fetchMock);
      const fields = { assignee: "Alice", date: "2026-10-31", description: "Write docs", status: "done" as const };

      await createTask({ ...fields, category: "auto", sprintIds: [2], projectIds: [] });
      await updateTask(1, { ...fields, category: "sales", sprintIds: [], projectIds: [3, 4] });
      await updateTask(1, fields);

      const bodies = fetchMock.mock.calls.map((call: unknown[]) =>
        JSON.parse(String((call[1] as RequestInit).body)),
      );
      expect(bodies[0]).toEqual({ ...fields, sprintIds: [2], projectIds: [] });
      expect(bodies[1]).toEqual({ ...fields, category: "sales", sprintIds: [], projectIds: [3, 4] });
      expect(bodies[2]).toEqual(fields);
    });

    it("lists and creates sprints and projects with only contract fields", async () => {
      const fetchMock = vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith("/api/sprints") && init?.method === "POST") return Promise.resolve(jsonResponse(201, sprint));
        if (url.endsWith("/api/sprints")) return Promise.resolve(jsonResponse(200, [sprint]));
        if (url.endsWith("/api/projects") && init?.method === "POST") {
          return Promise.resolve(jsonResponse(201, { id: 3, name: "Auth", taskCount: 0, sprintCount: 0, createdAt: "x" }));
        }
        return Promise.resolve(jsonResponse(200, []));
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(listSprints()).resolves.toEqual([sprint]);
      await expect(listProjects()).resolves.toEqual([]);
      await createSprint({ name: "Sprint 1", startDate: "2026-10-19", endDate: "2026-10-30", projectId: 5 });
      await createProject({ name: "Auth" });

      const [sprintUrl, sprintInit] = fetchMock.mock.calls[2];
      expect(sprintUrl).toBe(`${BASE}/api/sprints`);
      expect(JSON.parse(String(sprintInit?.body))).toEqual({
        name: "Sprint 1",
        startDate: "2026-10-19",
        endDate: "2026-10-30",
        projectId: 5,
      });
      const [projectUrl, projectInit] = fetchMock.mock.calls[3];
      expect(projectUrl).toBe(`${BASE}/api/projects`);
      expect(JSON.parse(String(projectInit?.body))).toEqual({ name: "Auth" });
    });

    it("surfaces a duplicate sprint name as a 409 ApiError", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(jsonResponse(409, { error: "a sprint with that name already exists" }))),
      );

      const err = await createSprint({
        name: "Sprint 1",
        startDate: "2026-10-19",
        endDate: "2026-10-30",
        projectId: 5,
      }).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toMatchObject({ status: 409, message: "a sprint with that name already exists" });
    });

    it("fetches sprint and project status", async () => {
      const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, status)));
      vi.stubGlobal("fetch", fetchMock);

      await expect(getSprintStatus(2)).resolves.toEqual(status);
      await expect(getProjectStatus(3)).resolves.toEqual(status);
      expect(fetchMock.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        `${BASE}/api/sprints/2/status`,
        `${BASE}/api/projects/3/status`,
      ]);
    });

    it("posts the chat message and returns the response", async () => {
      const response: ChatResponse = { reply: "Created task #12", task, status: null, changed: true };
      const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, response)));
      vi.stubGlobal("fetch", fetchMock);

      await expect(sendChat("create task x")).resolves.toEqual(response);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`${BASE}/api/chat`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({ message: "create task x" });
    });
  });

  describe("addendum v5", () => {
    const sprint: Sprint = {
      id: 2,
      name: "Sprint 1",
      startDate: "2026-10-19",
      endDate: "2026-10-30",
      taskCount: 3,
      projectId: 5,
      createdAt: "x",
    };

    function paged(items: unknown[], total?: number): Response {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (total !== undefined) headers["X-Total-Count"] = String(total);
      return new Response(JSON.stringify(items), { status: 200, headers });
    }

    it("builds the task query with every filter and paging, and reads X-Total-Count", async () => {
      const fetchMock = vi.fn(() => Promise.resolve(paged([task], 41)));
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        listTasksPage({
          projectId: 5,
          sprintId: 2,
          status: "blocked",
          category: "unclassified",
          q: "  50% off_ ",
          excludeSprintId: 9,
          page: 3,
          pageSize: 20,
        }),
      ).resolves.toEqual({ items: [task], total: 41 });

      const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
      expect(url.pathname).toBe("/api/tasks");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        sprintId: "2",
        projectId: "5",
        status: "blocked",
        category: "unclassified",
        q: "50% off_",
        excludeSprintId: "9",
        page: "3",
        pageSize: "20",
      });
    });

    it("omits empty filters and falls back to the page length without a total header", async () => {
      const fetchMock = vi.fn(() => Promise.resolve(paged([task])));
      vi.stubGlobal("fetch", fetchMock);

      await expect(listTasksPage({ q: "   ", page: 1, pageSize: 10 })).resolves.toEqual({ items: [task], total: 1 });
      expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`${BASE}/api/tasks?page=1&pageSize=10`);
    });

    it("keeps the unpaged task list free of paging params", async () => {
      const fetchMock = vi.fn(() => Promise.resolve(paged([task], 1)));
      vi.stubGlobal("fetch", fetchMock);

      await expect(listTasks({ status: "done" })).resolves.toEqual([task]);
      expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`${BASE}/api/tasks?status=done`);
    });

    it("pages projects, sprints by project or unassigned, and comments", async () => {
      const fetchMock = vi.fn(() => Promise.resolve(paged([], 0)));
      vi.stubGlobal("fetch", fetchMock);

      await listProjectsPage({ q: "au", page: 2, pageSize: 50 });
      await listSprintsPage({ projectId: 5, page: 1, pageSize: 20 });
      await listSprintsPage({ unassigned: true, page: 1, pageSize: 10 });
      await expect(listCommentsPage(7, { page: 4, pageSize: 100 })).resolves.toEqual({ items: [], total: 0 });

      expect(fetchMock.mock.calls.map((call) => (call as unknown as [string])[0])).toEqual([
        `${BASE}/api/projects?q=au&page=2&pageSize=50`,
        `${BASE}/api/sprints?projectId=5&page=1&pageSize=20`,
        `${BASE}/api/sprints?unassigned=true&page=1&pageSize=10`,
        `${BASE}/api/tasks/7/comments?page=4&pageSize=100`,
      ]);
    });

    it("renames projects and replaces sprints with only the contract fields", async () => {
      const fetchMock = vi.fn((url: string) =>
        Promise.resolve(jsonResponse(200, url.includes("/projects/") ? { id: 5, name: "Identity" } : sprint)),
      );
      vi.stubGlobal("fetch", fetchMock);

      await updateProject(5, { name: "Identity", extra: 1 } as { name: string });
      await updateSprint(2, { name: "S1", startDate: "2026-10-19", endDate: "2026-10-30", projectId: 6 });

      const [projectUrl, projectInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect([projectUrl, projectInit.method]).toEqual([`${BASE}/api/projects/5`, "PUT"]);
      expect(JSON.parse(String(projectInit.body))).toEqual({ name: "Identity" });
      const [sprintUrl, sprintInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
      expect([sprintUrl, sprintInit.method]).toEqual([`${BASE}/api/sprints/2`, "PUT"]);
      expect(JSON.parse(String(sprintInit.body))).toEqual({
        name: "S1",
        startDate: "2026-10-19",
        endDate: "2026-10-30",
        projectId: 6,
      });
    });

    it("tags tasks to a sprint and untags one", async () => {
      const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
        Promise.resolve(init?.method === "DELETE" ? new Response(null, { status: 204 }) : jsonResponse(200, sprint)),
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(addTasksToSprint(2, [3, 4])).resolves.toEqual(sprint);
      await expect(removeTaskFromSprint(2, 3)).resolves.toBeUndefined();

      const [addUrl, addInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect([addUrl, addInit.method]).toEqual([`${BASE}/api/sprints/2/tasks`, "POST"]);
      expect(JSON.parse(String(addInit.body))).toEqual({ taskIds: [3, 4] });
      const [removeUrl, removeInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
      expect([removeUrl, removeInit.method]).toEqual([`${BASE}/api/sprints/2/tasks/3`, "DELETE"]);
    });

    it("surfaces unknown task ids from tagging as field errors", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve(jsonResponse(400, { error: "validation failed", fields: { taskIds: "unknown id(s): 9" } })),
        ),
      );

      await expect(addTasksToSprint(2, [9])).rejects.toMatchObject({ status: 400, fields: { taskIds: "unknown id(s): 9" } });
    });

    it("labels sprints with their project or as unassigned", () => {
      const projects = [{ id: 5, name: "Auth", taskCount: 0, sprintCount: 1, createdAt: "x" }];
      expect(sprintLabel(sprint, projects)).toBe("Sprint 1 (Auth)");
      expect(sprintLabel({ ...sprint, projectId: null }, projects)).toBe("Sprint 1 (unassigned)");
    });
  });
});
