import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskComments from "@/app/components/TaskComments";
import type { Comment } from "@/lib/api";

const first: Comment = {
  id: 1,
  taskId: 7,
  author: "Alice",
  body: "Started",
  createdAt: "2026-10-20T13:00:00Z",
};

const second: Comment = { ...first, id: 2, author: "Bob", body: "Half done" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Handler = (init?: RequestInit) => Response;

function stubApi({ list, post }: { list: Handler; post?: Handler }) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (!url.endsWith("/api/tasks/7/comments")) return Promise.reject(new Error(`unexpected ${url}`));
    if (init?.method === "POST" && post) return Promise.resolve(post(init));
    return Promise.resolve(list(init));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TaskComments", () => {
  it("renders comments oldest first with author and date-time", async () => {
    stubApi({ list: () => jsonResponse(200, [first, second]) });
    render(<TaskComments taskId={7} />);

    const list = await screen.findByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Alice");
    expect(items[0].textContent).toContain("Started");
    expect(items[1].textContent).toContain("Bob");
    const time = items[0].querySelector("time");
    expect(time?.getAttribute("dateTime")).toBe(first.createdAt);
    expect(time?.textContent).toBe(new Date(first.createdAt).toLocaleString());
  });

  it("shows an empty state", async () => {
    stubApi({ list: () => jsonResponse(200, []) });
    render(<TaskComments taskId={7} />);

    expect(await screen.findByText("No updates yet.")).toBeTruthy();
  });

  it("shows a deleted-task message when the task is gone", async () => {
    stubApi({ list: () => jsonResponse(404, { error: "task not found" }) });
    render(<TaskComments taskId={7} />);

    await waitFor(() => expect(screen.getByText(/no longer exists/)).toBeTruthy());
  });

  it("renders the body as literal text, preserving markup and newlines", async () => {
    const tricky = { ...first, body: "<b>bold</b>\nnext line" };
    stubApi({ list: () => jsonResponse(200, [tricky]) });
    render(<TaskComments taskId={7} />);

    const item = await screen.findByRole("listitem");
    const body = item.querySelector(".comment-body");
    expect(body?.textContent).toBe("<b>bold</b>\nnext line");
    expect(item.querySelector("b")).toBeNull();
  });

  it("posts an update, appends it, clears the update and keeps the name", async () => {
    const created: Comment = { ...first, id: 3, author: "Cara", body: "Finished" };
    const fetchMock = stubApi({
      list: () => jsonResponse(200, [first]),
      post: () => jsonResponse(201, created),
    });
    const user = userEvent.setup();
    render(<TaskComments taskId={7} />);
    await screen.findByRole("list");

    await user.type(screen.getByLabelText("Your name"), "Cara");
    await user.type(screen.getByLabelText("Update"), "Finished");
    await user.click(screen.getByRole("button", { name: "Add update" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(screen.getAllByRole("listitem")[1].textContent).toContain("Finished");
    expect((screen.getByLabelText("Update") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByLabelText("Your name") as HTMLInputElement).value).toBe("Cara");
    expect(screen.getByRole("status").textContent).toBe("Update added");

    const [, init] = fetchMock.mock.calls[1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ author: "Cara", body: "Finished" });
  });

  it("shows field errors inline", async () => {
    stubApi({
      list: () => jsonResponse(200, []),
      post: () =>
        jsonResponse(400, { error: "validation failed", fields: { author: "is required", body: "is too long" } }),
    });
    const user = userEvent.setup();
    render(<TaskComments taskId={7} />);
    await screen.findByText("No updates yet.");

    await user.type(screen.getByLabelText("Your name"), " ");
    await user.type(screen.getByLabelText("Update"), " ");
    await user.click(screen.getByRole("button", { name: "Add update" }));

    const author = screen.getByLabelText("Your name");
    await waitFor(() => expect(author.getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById(author.getAttribute("aria-describedby")!)?.textContent).toBe("is required");
    const body = screen.getByLabelText("Update");
    expect(document.getElementById(body.getAttribute("aria-describedby")!)?.textContent).toBe("is too long");
  });

  it("explains that the task was deleted when posting returns 404", async () => {
    stubApi({
      list: () => jsonResponse(200, []),
      post: () => jsonResponse(404, { error: "task not found" }),
    });
    const user = userEvent.setup();
    render(<TaskComments taskId={7} />);
    await screen.findByText("No updates yet.");

    await user.type(screen.getByLabelText("Your name"), "Cara");
    await user.type(screen.getByLabelText("Update"), "Hello");
    await user.click(screen.getByRole("button", { name: "Add update" }));

    await waitFor(() =>
      expect(screen.getAllByRole("alert").some((el) => /no longer exists/.test(el.textContent ?? ""))).toBe(
        true,
      ),
    );
  });
});
