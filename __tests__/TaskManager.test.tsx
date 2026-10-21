import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskManager, { parseTaskQuery, taskQueryString } from "@/app/components/TaskManager";
import type { Task } from "@/lib/api";
import { baseTask as base, bodyOf, jsonResponse, pageResponse, projects, requests, sprints, stubFetch } from "./helpers";

// A tiny URL store so router.replace really changes what useSearchParams returns.
const nav = vi.hoisted(() => {
  let search = "";
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set(next: string) {
      search = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replace: vi.fn(),
  };
});

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    usePathname: () => "/tasks",
    useRouter: () => ({ replace: nav.replace }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(nav.subscribe, nav.get, nav.get)),
  };
});

const tasks: Task[] = [
  base,
  { ...base, id: 2, assignee: "Bob", status: "in_progress" },
  { ...base, id: 3, assignee: "Cara", status: "blocked" },
  { ...base, id: 4, assignee: "Dan", status: "done" },
];

const lists = {
  "GET /api/sprints": () => jsonResponse(200, sprints),
  "GET /api/projects": () => jsonResponse(200, projects),
};

beforeEach(() => {
  nav.set("");
  nav.replace.mockReset();
  nav.replace.mockImplementation((url: string) => nav.set(url.split("?")[1] ?? ""));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function taskRequests(fetchMock: ReturnType<typeof stubFetch>): string[] {
  return requests(fetchMock)
    .filter((r) => r.startsWith("GET /api/tasks?"))
    .map((r) => r.slice("GET /api/tasks".length));
}

describe("TaskManager", () => {
  it("shows a text status label for each task", async () => {
    stubFetch({ ...lists, "GET /api/tasks?page=1&pageSize=20": () => pageResponse(tasks) });
    render(<TaskManager />);

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Status" })).toBeTruthy();
    const [, ...rows] = within(table).getAllByRole("row") as HTMLTableRowElement[];
    expect(rows.map((row) => row.cells[1].textContent)).toEqual(["Not started", "In progress", "Blocked", "Done"]);
    expect(rows[0].cells[1].querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(rows[3].className).toContain("done");
    expect(screen.getByRole("navigation", { name: "Task pages" }).textContent).toContain("Page 1 of 1 (4 items)");
  });

  it("shows the status and updates in the details view", async () => {
    stubFetch({
      ...lists,
      "GET /api/tasks?page=1&pageSize=20": () => pageResponse([tasks[2]]),
      "GET /api/tasks/3": () => jsonResponse(200, tasks[2]),
      "GET /api/tasks/3/comments": () => pageResponse([]),
    });
    const user = userEvent.setup();
    render(<TaskManager />);

    await user.click(await screen.findByRole("button", { name: /View task/ }));
    const details = await screen.findByRole("dialog", { name: "Task details" });
    expect(details.textContent).toContain("Blocked");
    expect(within(details).getByRole("heading", { name: "Updates" })).toBeTruthy();
    await waitFor(() => expect(within(details).getByText("No updates yet.")).toBeTruthy());
  });

  it("shows category, labelled sprint and project names in the table and details", async () => {
    const classified: Task = { ...base, category: "finance", sprintIds: [1, 2], projectIds: [6] };
    const plain: Task = { ...base, id: 2, assignee: "Bob" };
    stubFetch({
      ...lists,
      "GET /api/tasks?page=1&pageSize=20": () => pageResponse([classified, plain]),
      "GET /api/tasks/1": () => jsonResponse(200, classified),
      "GET /api/tasks/1/comments": () => pageResponse([]),
    });
    const user = userEvent.setup();
    render(<TaskManager />);

    const table = await screen.findByRole("table");
    for (const name of ["Category", "Sprints", "Projects"]) {
      expect(within(table).getByRole("columnheader", { name })).toBeTruthy();
    }
    const [, first, second] = within(table).getAllByRole("row") as HTMLTableRowElement[];
    await waitFor(() => expect(first.cells[5].textContent).toBe("Sprint 1 (Auth), Sprint 2 (Billing)"));
    expect(first.cells[4].textContent).toBe("Finance");
    expect(first.cells[0].textContent).toContain("Write docs");
    expect(first.cells[6].textContent).toBe("Billing");
    expect([second.cells[4].textContent, second.cells[5].textContent, second.cells[6].textContent]).toEqual([
      "Unclassified",
      "—",
      "—",
    ]);

    await user.click(screen.getByRole("button", { name: /View task.*Alice/ }));
    const details = await screen.findByRole("dialog", { name: "Task details" });
    expect(details.textContent).toContain("Finance");
    const chips = Array.from(details.querySelectorAll(".chip")).map((chip) => chip.textContent);
    expect(chips).toEqual(["Sprint 1 (Auth)", "Sprint 2 (Billing)", "Billing"]);
  });

  it("reads filters from the URL and writes filter changes back to it", async () => {
    nav.set("projectId=5");
    const fetchMock = stubFetch({ ...lists, "GET /api/tasks": () => pageResponse([tasks[1]], 1) });
    const user = userEvent.setup();
    render(<TaskManager />);
    await screen.findByRole("table");

    const filters = within(screen.getByRole("group", { name: "Filter tasks" }));
    const search = within(screen.getByRole("search", { name: "Search tasks" }));
    const project = filters.getByLabelText("Project") as HTMLSelectElement;
    await waitFor(() => expect(project.value).toBe("5"));
    const sprint = filters.getByLabelText("Sprint") as HTMLSelectElement;
    expect(Array.from(sprint.options).map((o) => o.textContent)).toEqual([
      "All sprints",
      "Sprint 1 (Auth)",
      "Sprint 2 (Billing)",
    ]);

    await user.selectOptions(filters.getByLabelText("Status"), "Blocked");
    expect(nav.replace).toHaveBeenLastCalledWith("/tasks?projectId=5&status=blocked", { scroll: false });

    await user.selectOptions(filters.getByLabelText("Category"), "Unclassified");
    await user.type(search.getByLabelText("Search"), "  docs ");
    await user.click(search.getByRole("button", { name: "Search" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/tasks?projectId=5&status=blocked&category=unclassified&q=docs", {
      scroll: false,
    });

    await user.selectOptions(sprint, "Sprint 2 (Billing)");
    await waitFor(() =>
      expect(taskRequests(fetchMock).at(-1)).toBe(
        "?sprintId=2&projectId=5&status=blocked&category=unclassified&q=docs&page=1&pageSize=20",
      ),
    );
    expect(taskRequests(fetchMock)).toEqual([
      "?projectId=5&page=1&pageSize=20",
      "?projectId=5&status=blocked&page=1&pageSize=20",
      "?projectId=5&status=blocked&category=unclassified&page=1&pageSize=20",
      "?projectId=5&status=blocked&category=unclassified&q=docs&page=1&pageSize=20",
      "?sprintId=2&projectId=5&status=blocked&category=unclassified&q=docs&page=1&pageSize=20",
    ]);
    expect(nav.get()).toBe("projectId=5&sprintId=2&status=blocked&category=unclassified&q=docs");
  });

  it("explains when filters match nothing", async () => {
    nav.set("status=done");
    stubFetch({ ...lists, "GET /api/tasks": () => pageResponse([], 0) });
    render(<TaskManager />);

    expect(await screen.findByText("No tasks match these filters.")).toBeTruthy();
  });

  it("pages through tasks via the URL and resets to page 1 on a new page size", async () => {
    const fetchMock = stubFetch({
      ...lists,
      "GET /api/tasks": (url) => pageResponse([{ ...base, id: Number(url.searchParams.get("page")) }], 45),
    });
    const user = userEvent.setup();
    render(<TaskManager />);

    const pager = await screen.findByRole("navigation", { name: "Task pages" });
    await waitFor(() => expect(pager.textContent).toContain("Page 1 of 3 (45 items)"));
    await user.click(within(pager).getByRole("button", { name: /^Next\s*page$/ }));
    expect(nav.get()).toBe("page=2&pageSize=20");
    await waitFor(() => expect(pager.textContent).toContain("Page 2 of 3"));

    await user.selectOptions(within(pager).getByLabelText("Page size"), "50");
    expect(nav.get()).toBe("pageSize=50");
    expect(localStorage.getItem("tm.pageSize.tasks")).toBe("50");
    await waitFor(() => expect(taskRequests(fetchMock).at(-1)).toBe("?page=1&pageSize=50"));
  });

  it("adds a task to a sprint from its row and announces it", async () => {
    const inSprint1: Task = { ...base, sprintIds: [1], projectIds: [5] };
    const fetchMock = stubFetch({
      ...lists,
      "GET /api/tasks?page=1&pageSize=20": () => pageResponse([inSprint1]),
      "POST /api/sprints/2/tasks": () => jsonResponse(200, { ...sprints[1], taskCount: 2 }),
    });
    const user = userEvent.setup();
    render(<TaskManager />);

    const toggle = await screen.findByRole("button", { name: /Add to sprint\s*task for Alice/ });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const picker = screen.getByRole("form", { name: "Add task for Alice to a sprint" });
    const select = within(picker).getByLabelText("Sprint for task by Alice") as HTMLSelectElement;
    expect(document.activeElement).toBe(select);
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Choose a sprint", "Sprint 2 (Billing)"]);

    await user.selectOptions(select, "Sprint 2 (Billing)");
    await user.click(within(picker).getByRole("button", { name: "Add to sprint" }));

    await waitFor(() => expect(screen.queryByRole("form", { name: "Add task for Alice to a sprint" })).toBeNull());
    expect(bodyOf(fetchMock, "POST /api/sprints/2/tasks")).toEqual({ taskIds: [1] });
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Added task for Alice to Sprint 2 (Billing).")).toBe(
      true,
    );
    expect(document.activeElement).toBe(toggle);
    await waitFor(() => expect(taskRequests(fetchMock)).toHaveLength(2));
  });

  it("shows an error in the picker when adding fails", async () => {
    stubFetch({
      ...lists,
      "GET /api/tasks?page=1&pageSize=20": () => pageResponse([base]),
      "POST /api/sprints/1/tasks": () => jsonResponse(404, { error: "sprint not found" }),
    });
    const user = userEvent.setup();
    render(<TaskManager />);

    await user.click(await screen.findByRole("button", { name: /Add to sprint\s*task for Alice/ }));
    const picker = screen.getByRole("form", { name: "Add task for Alice to a sprint" });
    await user.selectOptions(within(picker).getByLabelText("Sprint for task by Alice"), "Sprint 1 (Auth)");
    await user.click(within(picker).getByRole("button", { name: "Add to sprint" }));

    const error = await within(picker).findByText("Could not add to sprint: sprint not found");
    const select = within(picker).getByLabelText("Sprint for task by Alice");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(select.getAttribute("aria-describedby")!)).toBe(error);
  });
});

describe("TaskManager slide-over", () => {
  it("creates a task from the Add task panel and announces it", async () => {
    const fetchMock = stubFetch({
      ...lists,
      "GET /api/tasks?page=1&pageSize=20": () => pageResponse(tasks),
      "POST /api/tasks": () => jsonResponse(201, { ...base, id: 9, assignee: "Zed" }),
    });
    const user = userEvent.setup();
    render(<TaskManager />);
    await screen.findByRole("table");

    const add = screen.getByRole("button", { name: "Add task" });
    await user.click(add);
    const dialog = screen.getByRole("dialog", { name: "New task" });
    await user.type(within(dialog).getByLabelText("Description"), "Ship it");
    await user.type(within(dialog).getByLabelText("Assignee"), "Zed");
    await user.type(within(dialog).getByLabelText("Due date"), "2026-11-01");
    await user.click(within(dialog).getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bodyOf(fetchMock, "POST /api/tasks")).toEqual({
      assignee: "Zed",
      date: "2026-11-01",
      description: "Ship it",
      status: "not_started",
      sprintIds: [],
      projectIds: [],
    });
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Created task for Zed.")).toBe(true);
    expect(document.activeElement).toBe(add);
  });

  it("edits the status in the details panel with the full body", async () => {
    let task: Task = { ...base, category: "sales", sprintIds: [1], projectIds: [5] };
    const fetchMock = stubFetch({
      ...lists,
      "GET /api/tasks?page=1&pageSize=20": () => pageResponse([task]),
      "GET /api/tasks/1": () => jsonResponse(200, task),
      "GET /api/tasks/1/comments": () => pageResponse([]),
      "PUT /api/tasks/1": () => {
        task = { ...task, status: "blocked" };
        return jsonResponse(200, task);
      },
    });
    const user = userEvent.setup();
    render(<TaskManager />);

    await user.click(await screen.findByRole("button", { name: /View task.*Alice/ }));
    const dialog = await screen.findByRole("dialog", { name: "Task details" });
    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    await user.selectOptions(within(dialog).getByLabelText("Status"), "Blocked");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "Save changes" })).toBeNull());
    expect(bodyOf(fetchMock, "PUT /api/tasks/1")).toEqual({
      assignee: "Alice",
      date: "2026-10-31",
      description: "Write docs",
      status: "blocked",
      category: "sales",
      sprintIds: [1],
      projectIds: [5],
    });
    expect(dialog.querySelector(".status-badge")?.textContent).toBe("Blocked");
  });

  it("deletes a task only after confirming, then closes the panel and focuses the heading", async () => {
    let deleted = false;
    const fetchMock = stubFetch({
      ...lists,
      "GET /api/tasks?page=1&pageSize=20": () => (deleted ? pageResponse([], 0) : pageResponse([base])),
      "GET /api/tasks/1": () => jsonResponse(200, base),
      "GET /api/tasks/1/comments": () => pageResponse([]),
      "DELETE /api/tasks/1": () => {
        deleted = true;
        return new Response(null, { status: 204 });
      },
    });
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const user = userEvent.setup();
    render(<TaskManager />);

    await user.click(await screen.findByRole("button", { name: /View task.*Alice/ }));
    const dialog = await screen.findByRole("dialog", { name: "Task details" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(requests(fetchMock)).not.toContain("DELETE /api/tasks/1");

    confirm.mockReturnValue(true);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(requests(fetchMock)).toContain("DELETE /api/tasks/1");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "All tasks" }));
    expect(await screen.findByText("No tasks yet.")).toBeTruthy();
  });
});

describe("TaskManager refresh", () => {
  it("refetches tasks, sprints and projects when the Assistant reports changed data", async () => {
    const fetchMock = stubFetch({ ...lists, "GET /api/tasks?page=1&pageSize=20": () => pageResponse(tasks) });
    render(<TaskManager />);
    await screen.findByRole("table");
    await waitFor(() => expect(requests(fetchMock)).toContain("GET /api/projects"));

    act(() => {
      window.dispatchEvent(new Event("tm:data-changed"));
    });
    await waitFor(() => expect(taskRequests(fetchMock)).toHaveLength(2));
    await waitFor(() => expect(requests(fetchMock).filter((r) => r === "GET /api/projects")).toHaveLength(2));
    expect(requests(fetchMock).filter((r) => r === "GET /api/sprints")).toHaveLength(2);
  });

  it("returns to the last page when a refetch finds the current page past the end", async () => {
    nav.set("page=3");
    stubFetch({
      ...lists,
      "GET /api/tasks": (url) => (url.searchParams.get("page") === "3" ? pageResponse([], 25) : pageResponse([base], 25)),
    });
    render(<TaskManager />);

    await waitFor(() => expect(nav.get()).toBe("page=2"));
    expect(await screen.findByRole("table")).toBeTruthy();
  });

  it("clears rows from the previous filter while the new filter loads", async () => {
    let release: () => void = () => {};
    stubFetch({
      ...lists,
      "GET /api/tasks?page=1&pageSize=20": () => pageResponse(tasks),
      "GET /api/tasks?status=done&page=1&pageSize=20": () => pageResponse([tasks[3]]),
    });
    const user = userEvent.setup();
    render(<TaskManager />);
    await screen.findByRole("table");
    const gate = new Promise<void>((r) => (release = r));
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", (input: string, init?: RequestInit) => gate.then(() => original(input, init)));

    await user.selectOptions(within(screen.getByRole("group", { name: "Filter tasks" })).getByLabelText("Status"), "Done");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Loading tasks…")).toBeTruthy();
    release();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
  });
});

describe("task URL query", () => {
  it("ignores invalid values and round-trips valid ones", () => {
    const query = parseTaskQuery(
      new URLSearchParams("projectId=abc&sprintId=0&status=nope&category=sales&q=%20hi%20&page=-1&pageSize=25"),
    );
    expect(query).toEqual({
      projectId: undefined,
      sprintId: undefined,
      status: undefined,
      category: "sales",
      q: "hi",
      page: 1,
      pageSize: undefined,
    });
    const full = parseTaskQuery(new URLSearchParams("projectId=5&sprintId=2&status=done&category=unclassified&page=3&pageSize=50"));
    expect(taskQueryString(full)).toBe("projectId=5&sprintId=2&status=done&category=unclassified&page=3&pageSize=50");
  });
});

describe("TaskManager on a phone", () => {
  function stubPhone() {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  }

  it("collapses the filters behind a Filters button that shows the active count", async () => {
    stubPhone();
    nav.set("status=blocked&category=sales");
    stubFetch({
      ...lists,
      "GET /api/tasks?status=blocked&category=sales&page=1&pageSize=20": () => pageResponse([]),
    });
    const user = userEvent.setup();
    render(<TaskManager />);

    const toggle = await screen.findByRole("button", { name: /^Filters\s*2\s*active$/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const group = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(group.hidden).toBe(true);
    expect(screen.getByRole("search", { name: "Search tasks" })).toBeTruthy();

    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(group.hidden).toBe(false);
    expect((within(group).getByLabelText("Status") as HTMLSelectElement).value).toBe("blocked");
  });

  it("labels the row actions with text", async () => {
    stubPhone();
    stubFetch({ ...lists, "GET /api/tasks?page=1&pageSize=20": () => pageResponse([base]) });
    render(<TaskManager />);

    expect(await screen.findByRole("button", { name: /^View\s*task for Alice$/ })).toBeTruthy();
    const add = screen.getByRole("button", { name: /^Add to sprint\s*task for Alice$/ });
    expect(add.textContent).toContain("Add to sprint");
  });
});
