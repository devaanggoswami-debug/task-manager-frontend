import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectView from "@/app/components/ProjectView";
import type { Sprint, Task } from "@/lib/api";
import { formatDateRange } from "@/lib/format";
import { baseTask, bodyOf, jsonResponse, pageResponse, projects, requests, sprints, stubFetch, type Handler } from "./helpers";

const params = vi.hoisted(() => ({ id: "5" }));
// A tiny URL store so router.replace (tab changes) really changes what useSearchParams returns.
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
  };
});
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useParams: () => params,
    usePathname: () => "/projects/5",
    useRouter: () => ({ replace: (url: string) => nav.set(url.split("?")[1] ?? "") }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(nav.subscribe, nav.get, nav.get)),
  };
});

const auth = projects[0];
const sprint: Sprint = sprints[0];
const member: Task = { ...baseTask, sprintIds: [1], projectIds: [5] };
const outsiders: Task[] = [
  { ...baseTask, id: 3, assignee: "Cara", description: "Audit logs" },
  { ...baseTask, id: 4, assignee: "Dan", description: "Rotate keys" },
  { ...baseTask, id: 5, assignee: "Eve", description: "Pen test" },
];

const health = { status: "on_track", reason: "0 of 1 tasks done, 10 days left", total: 1, done: 0, blocked: 0, overdue: 0 };

function routes(overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    "GET /api/projects/5": () => jsonResponse(200, auth),
    "GET /api/projects": () => jsonResponse(200, projects),
    "GET /api/sprints": () => jsonResponse(200, sprints),
    "GET /api/sprints?projectId=5&page=1&pageSize=20": () => pageResponse([sprint], 1),
    "GET /api/tasks?sprintId=1&page=1&pageSize=20": () => pageResponse([member], 1),
    "GET /api/projects/5/status": () => jsonResponse(200, { ...health, status: "at_risk", reason: "1 overdue task(s)" }),
    "GET /api/sprints/1/status": () => jsonResponse(200, health),
    ...overrides,
  };
}

beforeEach(() => {
  params.id = "5";
  nav.set("");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

type User = ReturnType<typeof userEvent.setup>;

/** Opens a sprint's "…" menu and chooses an item. */
async function chooseSprintAction(user: User, card: HTMLElement, item: string) {
  await user.click(within(card).getByRole("button", { name: "Actions for sprint Sprint 1" }));
  await user.click(within(card).getByRole("menuitem", { name: item }));
}

async function sprintCard() {
  const list = await screen.findByRole("list", { name: "Sprints in Auth" });
  return within(list).getByRole("article", { name: "Sprint 1" });
}

describe("Project page", () => {
  it("shows the project header, See all tasks link and the sprint card with its tasks", async () => {
    stubFetch(routes());
    render(<ProjectView />);

    expect(await screen.findByRole("heading", { level: 1, name: "Auth" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /See all tasks\s*in Auth/ }).getAttribute("href")).toBe("/tasks?projectId=5");
    expect(screen.getByRole("button", { name: /Refresh status\s*of project Auth/ })).toBeTruthy();
    const header = screen.getByRole("group", { name: "Project summary" });
    await waitFor(() => expect(header.querySelector(".scope-badge")?.textContent).toBe("At risk"));
    expect(header.textContent).toContain("1 overdue task(s)");

    const card = await sprintCard();
    expect(card.textContent).toContain(formatDateRange("2026-10-19", "2026-10-30"));
    expect(card.textContent).toContain("1 task");
    await waitFor(() => expect(card.querySelector(".scope-badge")?.textContent).toBe("On track"));
    expect(card.querySelector(".scope-reason")?.getAttribute("title")).toBe(health.reason);
    const tasks = await within(card).findByRole("list", { name: "Tasks in Sprint 1" });
    expect(within(tasks).getByRole("listitem").textContent).toContain("Write docs");
    expect(within(card).getByRole("navigation", { name: "Pages of tasks in Sprint 1" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Sprint pages" }).textContent).toContain("Page 1 of 1 (1 item)");
  });

  it("creates a sprint in this project", async () => {
    const fetchMock = stubFetch(
      routes({ "POST /api/sprints": () => jsonResponse(201, { ...sprint, id: 7, name: "Sprint 9" }) }),
    );
    const user = userEvent.setup();
    render(<ProjectView />);

    await user.click(await screen.findByRole("button", { name: "Add sprint" }));
    const form = screen.getByRole("form", { name: "New sprint" });
    expect(document.activeElement).toBe(within(form).getByLabelText("Sprint name"));
    expect(within(form).queryByLabelText("Project")).toBeNull();
    await user.type(within(form).getByLabelText("Sprint name"), "Sprint 9");
    await user.type(within(form).getByLabelText("Start date"), "2026-11-16");
    await user.type(within(form).getByLabelText("End date"), "2026-11-27");
    await user.click(within(form).getByRole("button", { name: "Create sprint" }));

    await waitFor(() => expect(requests(fetchMock)).toContain("POST /api/sprints"));
    expect(bodyOf(fetchMock, "POST /api/sprints")).toEqual({
      name: "Sprint 9",
      startDate: "2026-11-16",
      endDate: "2026-11-27",
      projectId: 5,
    });
    await waitFor(() =>
      expect(screen.getAllByRole("status").some((el) => el.textContent === "Created sprint Sprint 9.")).toBe(true),
    );
  });

  it("tags selected existing tasks across a search, posting their ids", async () => {
    const fetchMock = stubFetch(
      routes({
        "GET /api/tasks?excludeSprintId=1&page=1&pageSize=20": () => pageResponse(outsiders, 3),
        "GET /api/tasks?q=keys&excludeSprintId=1&page=1&pageSize=20": () => pageResponse([outsiders[1]], 1),
        "POST /api/sprints/1/tasks": () => jsonResponse(200, { ...sprint, taskCount: 3 }),
      }),
    );
    const user = userEvent.setup();
    render(<ProjectView />);

    const card = await sprintCard();
    await chooseSprintAction(user, card, "Tag existing tasks");
    const picker = within(card).getByRole("group", { name: "Tasks not in Sprint 1" }).parentElement!;
    const add = within(card).getByRole("button", { name: /Add selected/ });
    expect(add).toHaveProperty("disabled", true);

    await user.click(within(picker).getByLabelText(/Audit logs/));
    const search = within(card).getByRole("search", { name: "Search tasks to add to Sprint 1" });
    await user.type(within(search).getByLabelText("Search tasks"), "keys");
    await user.click(within(search).getByRole("button", { name: "Search" }));
    await user.click(await within(card).findByLabelText(/Rotate keys/));
    expect(within(card).queryByLabelText(/Audit logs/)).toBeNull();
    expect(add.textContent).toBe("Add selected (2)");
    await user.click(add);

    await waitFor(() => expect(requests(fetchMock)).toContain("POST /api/sprints/1/tasks"));
    expect(bodyOf(fetchMock, "POST /api/sprints/1/tasks")).toEqual({ taskIds: [3, 4] });
    await waitFor(() =>
      expect(screen.getAllByRole("status").some((el) => el.textContent === "Added 2 tasks to sprint Sprint 1.")).toBe(
        true,
      ),
    );
    expect(within(card).getByRole("button", { name: /Add selected/ }).textContent).toBe("Add selected (0)");
    expect(document.activeElement).toBe(within(search).getByLabelText("Search tasks"));
  });

  it("removes a task from the sprint with DELETE and refetches", async () => {
    let removed = false;
    const fetchMock = stubFetch(
      routes({
        "GET /api/tasks?sprintId=1&page=1&pageSize=20": () => (removed ? pageResponse([], 0) : pageResponse([member], 1)),
        "DELETE /api/sprints/1/tasks/1": () => {
          removed = true;
          return new Response(null, { status: 204 });
        },
      }),
    );
    const user = userEvent.setup();
    render(<ProjectView />);

    const card = await sprintCard();
    await user.click(await within(card).findByRole("button", { name: /Remove from sprint\s*task for Alice/ }));

    expect(await within(card).findByText("No tasks in this sprint yet.")).toBeTruthy();
    expect(requests(fetchMock)).toContain("DELETE /api/sprints/1/tasks/1");
    expect(document.activeElement).toBe(within(card).getByRole("button", { name: "Sprint 1" }));
  });

  it("prefills Add new task with this sprint and project", async () => {
    const fetchMock = stubFetch(routes({ "POST /api/tasks": () => jsonResponse(201, { ...member, id: 9 }) }));
    const user = userEvent.setup();
    render(<ProjectView />);

    const card = await sprintCard();
    await user.click(within(card).getByRole("button", { name: /Add new task/ }));
    const form = within(card).getByRole("form", { name: "New task in Sprint 1" });
    await waitFor(() => expect((within(form).getByLabelText("Sprint 1 (Auth)") as HTMLInputElement).checked).toBe(true));
    expect((within(form).getByLabelText("Auth") as HTMLInputElement).checked).toBe(true);

    await user.type(within(form).getByLabelText("Assignee"), "Alice");
    await user.type(within(form).getByLabelText("Due date"), "2026-10-31");
    await user.type(within(form).getByLabelText("Description"), "Ship it");
    await user.click(within(form).getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(within(card).queryByRole("form", { name: "New task in Sprint 1" })).toBeNull());
    expect(bodyOf(fetchMock, "POST /api/tasks")).toMatchObject({ sprintIds: [1], projectIds: [5] });
  });

  it("edits a sprint's name and dates", async () => {
    const fetchMock = stubFetch(routes({ "PUT /api/sprints/1": () => jsonResponse(200, { ...sprint, name: "Sprint 1b" }) }));
    const user = userEvent.setup();
    render(<ProjectView />);

    const card = await sprintCard();
    await chooseSprintAction(user, card, "Edit sprint");
    const form = within(card).getByRole("form", { name: "Edit sprint" });
    const name = within(form).getByLabelText("Sprint name") as HTMLInputElement;
    expect(document.activeElement).toBe(name);
    expect((within(form).getByLabelText("Project") as HTMLSelectElement).value).toBe("5");
    await user.clear(name);
    await user.type(name, "Sprint 1b");
    await user.click(within(form).getByRole("button", { name: "Save sprint" }));

    await waitFor(() => expect(requests(fetchMock)).toContain("PUT /api/sprints/1"));
    expect(bodyOf(fetchMock, "PUT /api/sprints/1")).toEqual({
      name: "Sprint 1b",
      startDate: "2026-10-19",
      endDate: "2026-10-30",
      projectId: 5,
    });
  });

  it("shows a friendly message for an unknown project", async () => {
    stubFetch(routes({ "GET /api/projects/5": () => jsonResponse(404, { error: "project not found" }) }));
    render(<ProjectView />);

    expect(await screen.findByRole("heading", { level: 1, name: "Project not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to all projects" }).getAttribute("href")).toBe("/");
  });

  it("treats a non-numeric id as not found without calling the API", () => {
    params.id = "abc";
    const fetchMock = stubFetch(routes());
    render(<ProjectView />);

    expect(screen.getByRole("heading", { level: 1, name: "Project not found" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("moves a sprint to another project, dropping it from this page", async () => {
    let moved = false;
    const fetchMock = stubFetch(
      routes({
        "GET /api/sprints?projectId=5&page=1&pageSize=20": () => (moved ? pageResponse([], 0) : pageResponse([sprint], 1)),
        "PUT /api/sprints/1": () => {
          moved = true;
          return jsonResponse(200, { ...sprint, projectId: 6 });
        },
      }),
    );
    const user = userEvent.setup();
    render(<ProjectView />);

    const card = await sprintCard();
    await chooseSprintAction(user, card, "Edit sprint");
    const project = within(card).getByLabelText("Project") as HTMLSelectElement;
    await waitFor(() => expect(project.options).toHaveLength(3));
    await user.selectOptions(project, "Billing");
    await user.click(within(card).getByRole("button", { name: "Save sprint" }));

    expect(await screen.findByText("No sprints in this project yet.")).toBeTruthy();
    expect(bodyOf(fetchMock, "PUT /api/sprints/1")).toMatchObject({ projectId: 6 });
    expect(
      screen.getAllByRole("status").some((el) => el.textContent === "Saved sprint Sprint 1 and moved it to project Billing."),
    ).toBe(true);
    expect(document.activeElement?.textContent).toBe("Sprints");
  });

  it("offers the current project in Edit sprint even before all projects load", async () => {
    stubFetch(routes({ "GET /api/projects": () => jsonResponse(500, { error: "boom" }) }));
    const user = userEvent.setup();
    render(<ProjectView />);

    const card = await sprintCard();
    await chooseSprintAction(user, card, "Edit sprint");
    const project = within(card).getByLabelText("Project") as HTMLSelectElement;
    expect(project.value).toBe("5");
    expect(project.selectedOptions[0].textContent).toBe("Auth");
  });

  it("refetches the project, sprints and statuses when the Assistant reports changed data", async () => {
    const fetchMock = stubFetch(routes());
    render(<ProjectView />);
    await sprintCard();
    await waitFor(() => expect(requests(fetchMock)).toContain("GET /api/sprints/1/status"));
    const count = (route: string) => requests(fetchMock).filter((r) => r === route).length;

    act(() => {
      window.dispatchEvent(new Event("tm:data-changed"));
    });
    await waitFor(() => expect(count("GET /api/sprints/1/status")).toBe(2));
    expect(count("GET /api/projects/5")).toBe(2);
    expect(count("GET /api/sprints?projectId=5&page=1&pageSize=20")).toBe(2);
    expect(count("GET /api/tasks?sprintId=1&page=1&pageSize=20")).toBe(2);
  });

  it("collapses a sprint section with its toggle", async () => {
    stubFetch(routes());
    const user = userEvent.setup();
    render(<ProjectView />);

    const card = await sprintCard();
    const toggle = within(card).getByRole("button", { name: "Sprint 1" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await within(card).findByRole("list", { name: "Tasks in Sprint 1" });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)?.hidden).toBe(true);
  });

  it("opens a task in a slide-over from its row, closes on Escape and returns focus", async () => {
    stubFetch(routes({ "GET /api/tasks/1/comments": () => pageResponse([]) }));
    const user = userEvent.setup();
    render(<ProjectView />);

    const card = await sprintCard();
    const opener = await within(card).findByRole("button", { name: /View task:\s*Write docs/ });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Task details" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.textContent).toContain("Write docs");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close task details" }));
    await within(dialog).findByText("No updates yet.");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);

    await user.click(opener);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close task details" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("keeps Tab inside the slide-over", async () => {
    stubFetch(routes({ "GET /api/tasks/1/comments": () => pageResponse([]) }));
    const user = userEvent.setup();
    render(<ProjectView />);

    const card = await sprintCard();
    await user.click(await within(card).findByRole("button", { name: /View task:\s*Write docs/ }));
    const dialog = screen.getByRole("dialog", { name: "Task details" });
    await within(dialog).findByText("No updates yet.");
    const close = within(dialog).getByRole("button", { name: "Close task details" });
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(close);
    await user.tab();
    expect(document.activeElement).toBe(close);
  });

  it("switches views with the tabs and keeps the view in the URL", async () => {
    stubFetch(
      routes({
        "GET /api/tasks": () => pageResponse([], 0),
      }),
    );
    const user = userEvent.setup();
    render(<ProjectView />);

    const list = await screen.findByRole("tab", { name: "List" });
    expect(list.getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("tab", { name: "Board" }));
    expect(nav.get()).toBe("view=board");
    expect(screen.getByRole("tab", { name: "Board" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(screen.getByRole("tab", { name: "Board" }).id);

    await user.keyboard("{ArrowRight}");
    expect(nav.get()).toBe("view=overview");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Overview" }));
    await user.keyboard("{Home}");
    expect(nav.get()).toBe("");
  });

  it("moves a board card to another status with a PUT of the full task body", async () => {
    nav.set("view=board");
    const card: Task = { ...member, category: "engineering" };
    let moved = false;
    const byStatus = (url: URL) => {
      const status = url.searchParams.get("status");
      const current = moved ? "done" : "not_started";
      return status === current ? pageResponse([{ ...card, status: current }], 1) : pageResponse([], 0);
    };
    const fetchMock = stubFetch(
      routes({
        "GET /api/tasks": byStatus,
        "PUT /api/tasks/1": () => {
          moved = true;
          return jsonResponse(200, { ...card, status: "done" });
        },
      }),
    );
    const user = userEvent.setup();
    render(<ProjectView />);

    const column = await screen.findByRole("region", { name: /Not started/ });
    const trigger = await within(column).findByRole("button", { name: /Not started, change status of “Write docs”/ });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    await user.click(trigger);
    const menu = within(column).getByRole("menu", { name: "Status of “Write docs”" });
    const current = within(menu).getByRole("menuitemradio", { name: "Not started" });
    expect(current.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(current);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(within(menu).getByRole("menuitemradio", { name: "Done" }));
    await user.keyboard("{Enter}");

    await waitFor(() => expect(requests(fetchMock)).toContain("PUT /api/tasks/1"));
    expect(bodyOf(fetchMock, "PUT /api/tasks/1")).toEqual({
      assignee: "Alice",
      date: "2026-10-31",
      description: "Write docs",
      status: "done",
      category: "engineering",
      sprintIds: [1],
      projectIds: [5],
    });
    const done = screen.getByRole("region", { name: /Done/ });
    expect(await within(done).findByText("Write docs")).toBeTruthy();
    expect(document.activeElement).toBe(within(done).getByRole("heading", { level: 2 }));
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Moved “Write docs” to Done.")).toBe(true);
  });

  it("refreshes a sprint's status from its actions menu and announces it", async () => {
    const fetchMock = stubFetch(routes());
    const user = userEvent.setup();
    render(<ProjectView />);

    const card = await sprintCard();
    await waitFor(() => expect(card.querySelector(".scope-badge")?.textContent).toBe("On track"));
    const menuButton = within(card).getByRole("button", { name: "Actions for sprint Sprint 1" });
    await user.click(menuButton);
    const menu = within(card).getByRole("menu", { name: "Actions for sprint Sprint 1" });
    expect(within(menu).getAllByRole("menuitem").map((el) => el.textContent)).toEqual([
      "Edit sprint",
      "Tag existing tasks",
      "Refresh status",
    ]);
    await user.keyboard("{Escape}");
    expect(within(card).getByRole("menu", { hidden: true }).hidden).toBe(true);
    expect(document.activeElement).toBe(menuButton);

    await chooseSprintAction(user, card, "Refresh status");
    await waitFor(() => expect(requests(fetchMock).filter((r) => r === "GET /api/sprints/1/status")).toHaveLength(2));
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((el) => el.textContent === `Sprint Sprint 1: On track. ${health.reason}`),
      ).toBe(true),
    );
    expect(document.activeElement).toBe(menuButton);
  });

  it("returns focus to the sprint actions button after cancelling Edit sprint", async () => {
    stubFetch(routes());
    const user = userEvent.setup();
    render(<ProjectView />);

    const card = await sprintCard();
    await chooseSprintAction(user, card, "Edit sprint");
    const form = within(card).getByRole("form", { name: "Edit sprint" });
    expect(document.activeElement).toBe(within(form).getByLabelText("Sprint name"));
    await user.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(within(card).getByRole("button", { name: "Actions for sprint Sprint 1" }));
  });

  it("pages the board with one shared control that uses the board page size", async () => {
    nav.set("view=board");
    localStorage.setItem("tm.pageSize.board", "10");
    const make = (n: number, status: Task["status"]) =>
      Array.from({ length: n }, (_, i) => ({ ...member, id: 100 + i, status, description: `Task ${status} ${i + 1}` }));
    const all: Record<string, Task[]> = { not_started: make(12, "not_started"), in_progress: make(1, "in_progress"), blocked: [], done: [] };
    const fetchMock = stubFetch(
      routes({
        "GET /api/tasks": (url) => {
          const items = all[url.searchParams.get("status") ?? ""] ?? [];
          const page = Number(url.searchParams.get("page"));
          const size = Number(url.searchParams.get("pageSize"));
          return pageResponse(items.slice((page - 1) * size, page * size), items.length);
        },
      }),
    );
    const user = userEvent.setup();
    render(<ProjectView />);

    const pager = await screen.findByRole("navigation", { name: "Board pages" });
    expect(screen.getAllByRole("navigation").filter((el) => el.getAttribute("aria-label")?.startsWith("Pages of"))).toHaveLength(0);
    expect(pager.textContent).toContain("Page 1 of 2 (13 items)");
    expect((within(pager).getByLabelText("Page size") as HTMLSelectElement).value).toBe("10");
    const notStarted = screen.getByRole("region", { name: /Not started/ });
    expect(within(notStarted).getAllByRole("listitem")).toHaveLength(10);

    await user.click(within(pager).getByRole("button", { name: /Next/ }));
    expect(await within(notStarted).findByText("Task not_started 11")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: /In progress/ })).getByText("No more tasks on this page")).toBeTruthy();
    expect(requests(fetchMock)).toContain("GET /api/tasks?projectId=5&status=done&page=2&pageSize=10");

    await user.selectOptions(within(pager).getByLabelText("Page size"), "20");
    expect(localStorage.getItem("tm.pageSize.board")).toBe("20");
    await waitFor(() => expect(within(notStarted).getAllByRole("listitem")).toHaveLength(12));
    expect(screen.getByRole("navigation", { name: "Board pages" }).textContent).toContain("Page 1 of 1 (13 items)");
    expect(within(screen.getByRole("navigation", { name: "Board pages" })).queryByRole("button", { name: /Next/ })).toBeNull();
  });
});
