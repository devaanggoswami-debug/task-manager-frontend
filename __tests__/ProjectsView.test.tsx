import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectsView from "@/app/components/ProjectsView";
import type { Sprint } from "@/lib/api";
import { formatDateRange } from "@/lib/format";
import { bodyOf, jsonResponse, pageResponse, projects, requests, stubFetch } from "./helpers";

const legacySprint: Sprint = {
  id: 9,
  name: "Old sprint",
  startDate: "2026-09-01",
  endDate: "2026-09-14",
  taskCount: 4,
  projectId: null,
  createdAt: "x",
};

const authHealth = { status: "at_risk", reason: "1 overdue task(s)", total: 3, done: 1, blocked: 0, overdue: 1 };
const statusRoutes = {
  "GET /api/projects/5/status": () => jsonResponse(200, authHealth),
  "GET /api/projects/6/status": () =>
    jsonResponse(200, { status: "on_track", reason: "0 of 1 tasks done", total: 1, done: 0, blocked: 0, overdue: 0 }),
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Projects page", () => {
  it("lists projects with links, counts and See all tasks, and hides empty unassigned sprints", async () => {
    const fetchMock = stubFetch({
      "GET /api/projects?page=1&pageSize=20": () => pageResponse(projects, 2),
      "GET /api/projects": () => jsonResponse(200, projects),
      ...statusRoutes,
      "GET /api/sprints?unassigned=true&page=1&pageSize=20": () => pageResponse([], 0),
    });
    render(<ProjectsView />);

    expect(screen.getByRole("heading", { level: 1, name: "Projects" })).toBeTruthy();
    const list = await screen.findByRole("list", { name: "Projects" });
    const [auth] = within(list).getAllByRole("listitem");
    expect(within(auth).getByRole("link", { name: "Auth" }).getAttribute("href")).toBe("/projects/5");
    expect(auth.textContent).toContain("3 tasks");
    expect(auth.textContent).toContain("2 sprints");
    expect(within(auth).getByRole("link", { name: /See all tasks\s*in Auth/ }).getAttribute("href")).toBe(
      "/tasks?projectId=5",
    );
    await waitFor(() => expect(auth.querySelector(".scope-badge")?.textContent).toBe("At risk"));
    expect(auth.textContent).toContain("1 of 3 done");
    expect(auth.querySelector(".scope-result")?.getAttribute("title")).toBe("1 overdue task(s)");
    expect(screen.queryByRole("button", { name: "New project" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Projects pages" }).textContent).toContain("Page 1 of 1 (2 items)");
    await waitFor(() => expect(requests(fetchMock)).toContain("GET /api/sprints?unassigned=true&page=1&pageSize=20"));
    expect(screen.queryByRole("heading", { name: "Unassigned sprints" })).toBeNull();
  });

  it("renames inline, shows a 409 on the name field, and saves on retry", async () => {
    let attempt = 0;
    const fetchMock = stubFetch({
      "GET /api/projects?page=1&pageSize=20": () => pageResponse(projects, 2),
      "GET /api/projects": () => jsonResponse(200, projects),
      ...statusRoutes,
      "GET /api/sprints?unassigned=true&page=1&pageSize=20": () => pageResponse([], 0),
      "PUT /api/projects/5": () =>
        ++attempt === 1
          ? jsonResponse(409, { error: "a project with that name already exists" })
          : jsonResponse(200, { ...projects[0], name: "Identity" }),
    });
    const user = userEvent.setup();
    render(<ProjectsView />);

    await user.click(await screen.findByRole("button", { name: "Actions for project Auth" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename project" }));
    const form = screen.getByRole("form", { name: "Rename project Auth" });
    const name = within(form).getByLabelText("Project name") as HTMLInputElement;
    expect(name.value).toBe("Auth");
    expect(document.activeElement).toBe(name);
    await user.clear(name);
    await user.type(name, "Billing");
    await user.click(within(form).getByRole("button", { name: "Save name" }));

    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById(name.getAttribute("aria-describedby")!)?.textContent).toBe(
      "a project with that name already exists",
    );

    await user.clear(name);
    await user.type(name, "Identity");
    await user.click(within(form).getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Rename project Auth" })).toBeNull());
    expect(bodyOf(fetchMock, "PUT /api/projects/5")).toEqual({ name: "Billing" });
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Renamed project to Identity.")).toBe(true);
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("Actions for project Auth"));
  });

  it("creates a project and refetches the list", async () => {
    const fetchMock = stubFetch({
      "GET /api/projects?page=1&pageSize=20": () => pageResponse([], 0),
      "GET /api/projects": () => jsonResponse(200, []),
      "GET /api/sprints?unassigned=true&page=1&pageSize=20": () => pageResponse([], 0),
      "POST /api/projects": () => jsonResponse(201, projects[0]),
    });
    const user = userEvent.setup();
    render(<ProjectsView />);

    expect(await screen.findByText("No projects yet")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create your first project" }));
    const form = screen.getByRole("form", { name: "New project" });
    expect(document.activeElement).toBe(within(form).getByLabelText("Project name"));
    await user.type(within(form).getByLabelText("Project name"), "Auth");
    await user.click(within(form).getByRole("button", { name: "Create project" }));

    await waitFor(() =>
      expect(requests(fetchMock).filter((r) => r === "GET /api/projects?page=1&pageSize=20")).toHaveLength(2),
    );
    expect(bodyOf(fetchMock, "POST /api/projects")).toEqual({ name: "Auth" });
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Created project Auth.")).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "All projects" }));
  });

  it("lists unassigned sprints and assigns one to a project", async () => {
    let assigned = false;
    const fetchMock = stubFetch({
      "GET /api/projects?page=1&pageSize=20": () => pageResponse(projects, 2),
      "GET /api/projects": () => jsonResponse(200, projects),
      ...statusRoutes,
      "GET /api/sprints?unassigned=true&page=1&pageSize=20": () =>
        assigned ? pageResponse([], 0) : pageResponse([legacySprint], 1),
      "PUT /api/sprints/9": () => {
        assigned = true;
        return jsonResponse(200, { ...legacySprint, projectId: 6 });
      },
    });
    const user = userEvent.setup();
    render(<ProjectsView />);

    const section = (await screen.findByRole("heading", { name: "Unassigned sprints" })).closest("section")!;
    const item = within(within(section).getByRole("list", { name: "Unassigned sprints" })).getByRole("listitem");
    expect(item.textContent).toContain(formatDateRange("2026-09-01", "2026-09-14"));
    expect(item.textContent).toContain("4 tasks");
    expect(within(section).getByRole("navigation", { name: "Unassigned sprints pages" })).toBeTruthy();

    await user.click(within(item).getByRole("button", { name: /Edit sprint\s*Old sprint/ }));
    const project = within(item).getByLabelText("Project") as HTMLSelectElement;
    await waitFor(() => expect(project.options).toHaveLength(3));
    await user.selectOptions(project, "Billing");
    await user.click(within(item).getByRole("button", { name: "Save sprint" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Unassigned sprints" })).toBeNull());
    expect(bodyOf(fetchMock, "PUT /api/sprints/9")).toEqual({
      name: "Old sprint",
      startDate: "2026-09-01",
      endDate: "2026-09-14",
      projectId: 6,
    });
  });

  it("refetches when the Assistant reports changed data", async () => {
    const fetchMock = stubFetch({
      "GET /api/projects?page=1&pageSize=20": () => pageResponse(projects, 2),
      "GET /api/projects": () => jsonResponse(200, projects),
      ...statusRoutes,
      "GET /api/sprints?unassigned=true&page=1&pageSize=20": () => pageResponse([], 0),
    });
    render(<ProjectsView />);
    await screen.findByRole("list", { name: "Projects" });
    const before = requests(fetchMock).length;

    act(() => {
      window.dispatchEvent(new Event("tm:data-changed"));
    });
    // Projects page, all projects, unassigned sprints, and one status per listed project.
    await waitFor(() => expect(requests(fetchMock).length).toBe(before + 5));
  });

  it("checks a project's status from its actions menu and announces the result", async () => {
    const fetchMock = stubFetch({
      "GET /api/projects?page=1&pageSize=20": () => pageResponse(projects, 2),
      "GET /api/projects": () => jsonResponse(200, projects),
      ...statusRoutes,
      "GET /api/sprints?unassigned=true&page=1&pageSize=20": () => pageResponse([], 0),
    });
    const user = userEvent.setup();
    render(<ProjectsView />);

    const trigger = await screen.findByRole("button", { name: "Actions for project Auth" });
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Actions for project Auth" });
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Rename project" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Check status" }));
    await user.keyboard("{Enter}");

    await waitFor(() => expect(requests(fetchMock).filter((r) => r === "GET /api/projects/5/status")).toHaveLength(2));
    await waitFor(() =>
      expect(screen.getAllByRole("status").some((el) => el.textContent === "Project Auth: At risk. 1 overdue task(s)")).toBe(true),
    );
    expect(document.activeElement).toBe(trigger);
  });
});
