import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  STATUS_OPTIONS,
  addComment,
  createTask,
  deleteTask,
  listComments,
  listTasks,
  updateTask,
  type Comment,
  type Task,
} from "@/lib/api";

const BASE = "http://127.0.0.1:8080";

const task: Task = {
  id: 1,
  assignee: "Alice",
  date: "2026-10-31",
  description: "Write docs",
  status: "not_started",
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
});
