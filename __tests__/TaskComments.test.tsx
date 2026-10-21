import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskComments from "@/app/components/TaskComments";
import type { Comment } from "@/lib/api";
import { jsonResponse, pageResponse } from "./helpers";

const first: Comment = {
  id: 1,
  taskId: 7,
  author: "Alice",
  body: "Started",
  createdAt: "2026-10-20T13:00:00Z",
};

const second: Comment = { ...first, id: 2, author: "Bob", body: "Half done" };

type Handler = (url: URL, init?: RequestInit) => Response;

function stubApi({ list, post }: { list: Handler; post?: Handler }) {
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.pathname !== "/api/tasks/7/comments") return Promise.reject(new Error(`unexpected ${input}`));
    if (init?.method === "POST" && post) return Promise.resolve(post(url, init));
    return Promise.resolve(list(url, init));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("TaskComments", () => {
  it("renders comments oldest first with author and date-time", async () => {
    const fetchMock = stubApi({ list: () => pageResponse([first, second]) });
    render(<TaskComments taskId={7} />);

    const list = await screen.findByRole("list");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/tasks\/7\/comments\?page=1&pageSize=20$/);
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
    stubApi({ list: () => pageResponse([]) });
    render(<TaskComments taskId={7} />);

    expect(await screen.findByText("No updates yet.")).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("shows a deleted-task message when the task is gone", async () => {
    stubApi({ list: () => jsonResponse(404, { error: "task not found" }) });
    render(<TaskComments taskId={7} />);

    await waitFor(() => expect(screen.getByText(/no longer exists/)).toBeTruthy());
  });

  it("renders the body as literal text, preserving markup and newlines", async () => {
    const tricky = { ...first, body: "<b>bold</b>\nnext line" };
    stubApi({ list: () => pageResponse([tricky]) });
    render(<TaskComments taskId={7} />);

    const item = await screen.findByRole("listitem");
    const body = item.querySelector(".comment-body");
    expect(body?.textContent).toBe("<b>bold</b>\nnext line");
    expect(item.querySelector("b")).toBeNull();
  });

  it("posts an update, appends it, clears the update and keeps the name", async () => {
    const created: Comment = { ...first, id: 3, author: "Cara", body: "Finished" };
    const stored = [first];
    const fetchMock = stubApi({
      list: () => pageResponse(stored),
      post: () => {
        stored.push(created);
        return jsonResponse(201, created);
      },
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

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const init = post?.[1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ author: "Cara", body: "Finished" });
  });

  it("shows field errors inline", async () => {
    stubApi({
      list: () => pageResponse([]),
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
      list: () => pageResponse([]),
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

  it("pages through updates and jumps to the last page after posting", async () => {
    const all: Comment[] = Array.from({ length: 12 }, (_, i) => ({ ...first, id: i + 1, body: `Update ${i + 1}` }));
    const fetchMock = stubApi({
      list: (url) => {
        const page = Number(url.searchParams.get("page"));
        const size = Number(url.searchParams.get("pageSize"));
        return pageResponse(all.slice((page - 1) * size, page * size), all.length);
      },
      post: () => {
        const created = { ...first, id: 13, body: "Update 13" };
        all.push(created);
        return jsonResponse(201, created);
      },
    });
    const user = userEvent.setup();
    render(<TaskComments taskId={7} />);

    const nav = await screen.findByRole("navigation", { name: "Updates pages" });
    await user.selectOptions(within(nav).getByLabelText("Page size"), "10");
    await waitFor(() => expect(nav.textContent).toContain("Page 1 of 2 (12 items)"));
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(localStorage.getItem("tm.pageSize.comments")).toBe("10");

    await user.type(screen.getByLabelText("Your name"), "Cara");
    await user.type(screen.getByLabelText("Update"), "Update 13");
    await user.click(screen.getByRole("button", { name: "Add update" }));

    await waitFor(() => expect(nav.textContent).toContain("Page 2 of 2 (13 items)"));
    await waitFor(() => expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toHaveLength(3));
    expect(screen.getAllByRole("listitem")[2].textContent).toContain("Update 13");
    expect(fetchMock.mock.calls.at(-1)?.[0]).toMatch(/page=2&pageSize=10$/);
  });

  it("does not apply a post that finishes after another task was opened", async () => {
    let finish: (res: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (init?.method === "POST") return new Promise<Response>((resolve) => (finish = resolve));
        return Promise.resolve(pageResponse(new URL(input).pathname === "/api/tasks/7/comments" ? [] : [second]));
      }),
    );
    const user = userEvent.setup();
    const { rerender } = render(<TaskComments taskId={7} />);
    await screen.findByText("No updates yet.");

    await user.type(screen.getByLabelText("Your name"), "Cara");
    await user.type(screen.getByLabelText("Update"), "For task 7");
    await user.click(screen.getByRole("button", { name: "Add update" }));
    rerender(<TaskComments taskId={8} />);
    await screen.findByText("Half done");
    expect((screen.getByLabelText("Update") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Add update" })).toHaveProperty("disabled", false);
    await user.type(screen.getByLabelText("Update"), "draft for 8");

    finish(jsonResponse(201, { ...first, id: 9, body: "For task 7" }));
    await act(async () => {});
    expect((screen.getByLabelText("Update") as HTMLTextAreaElement).value).toBe("draft for 8");
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByText("For task 7", { selector: ".comment-body" })).toBeNull();
  });
});
