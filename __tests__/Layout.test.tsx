import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppShell from "@/app/components/AppShell";
import AssistantPanel from "@/app/components/AssistantPanel";
import PageHeader from "@/app/components/PageHeader";
import CurrentSidebarNav from "@/app/components/Sidebar";
import { jsonResponse, projects, stubFetch } from "./helpers";

const nav = vi.hoisted(() => ({ pathname: "/", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
}));

/** Pretends the viewport is a phone or a desktop for the sidebar's media query. */
function stubViewport(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("min-width") ? desktop : !desktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderShell() {
  return render(
    <AppShell nav={<CurrentSidebarNav />}>
      <PageHeader title="Projects" />
      <p>Page content</p>
    </AppShell>,
  );
}

beforeEach(() => {
  nav.pathname = "/";
  nav.push.mockReset();
  stubFetch({
    "GET /api/projects": () => jsonResponse(200, projects),
    "GET /api/sprints": () => jsonResponse(200, []),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Sidebar navigation", () => {
  it.each([
    ["/", "page", null, null],
    ["/tasks", null, "page", null],
    ["/projects/5", null, null, "page"],
  ])("marks the active link on %s", async (pathname, projectsCurrent, tasksCurrent, authCurrent) => {
    nav.pathname = pathname;
    stubViewport(true);
    renderShell();

    const links = within(screen.getByRole("navigation", { name: "Main" }));
    const home = links.getByRole("link", { name: "All projects" });
    const tasks = links.getByRole("link", { name: "All tasks" });
    expect(home.getAttribute("href")).toBe("/");
    expect(tasks.getAttribute("href")).toBe("/tasks");
    expect(home.getAttribute("aria-current")).toBe(projectsCurrent);
    expect(tasks.getAttribute("aria-current")).toBe(tasksCurrent);
    const auth = await links.findByRole("link", { name: "Auth" });
    expect(auth.getAttribute("href")).toBe("/projects/5");
    expect(auth.getAttribute("aria-current")).toBe(authCurrent);
  });

  it("collapses the project list and remembers it", async () => {
    stubViewport(true);
    const user = userEvent.setup();
    renderShell();

    const toggle = screen.getByRole("button", { name: "Projects" });
    await screen.findByRole("link", { name: "Auth" });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Auth" })).toBeNull();
    expect(localStorage.getItem("tm.sidebar.projectsCollapsed")).toBe("true");
  });
});

describe("Sidebar toggle", () => {
  it("opens the navigation drawer on small screens as a modal and closes it with Escape", async () => {
    stubViewport(false);
    const user = userEvent.setup();
    const { container } = renderShell();

    const toggle = screen.getByRole("button", { name: "Open navigation" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const sidebar = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(sidebar.getAttribute("role")).toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".app")?.getAttribute("data-sidebar")).toBe("open");
    expect(sidebar.getAttribute("role")).toBe("dialog");
    expect(sidebar.getAttribute("aria-modal")).toBe("true");
    expect(sidebar.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(container.querySelector(".app")?.getAttribute("data-sidebar")).toBe("closed");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open navigation" }));
  });

  it("closes the drawer when a link is followed or the close button is pressed", async () => {
    stubViewport(false);
    const user = userEvent.setup();
    const { container } = renderShell();

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await user.click(screen.getByRole("link", { name: "All tasks" }));
    expect(container.querySelector(".app")?.getAttribute("data-sidebar")).toBe("closed");

    const toggle = screen.getByRole("button", { name: "Open navigation" });
    const sidebar = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    await user.click(toggle);
    await user.click(within(sidebar).getByRole("button", { name: "Close navigation" }));
    expect(container.querySelector(".app")?.getAttribute("data-sidebar")).toBe("closed");
  });

  it("collapses the sidebar on desktop and remembers it", async () => {
    stubViewport(true);
    const user = userEvent.setup();
    const { container } = renderShell();

    const toggle = screen.getByRole("button", { name: "Hide sidebar" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await user.click(toggle);
    expect(container.querySelector(".app")?.getAttribute("data-sidebar")).toBe("collapsed");
    expect(screen.getByRole("button", { name: "Show sidebar" }).getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem("tm.sidebar.collapsed")).toBe("true");
  });
});

describe("Top bar", () => {
  it("searches all tasks from any page", async () => {
    stubViewport(true);
    const user = userEvent.setup();
    renderShell();

    const search = within(screen.getByRole("search", { name: "Search all tasks" }));
    await user.type(search.getByLabelText("Search all tasks"), " login bug {Enter}");
    expect(nav.push).toHaveBeenCalledWith("/tasks?q=login%20bug");
  });

  it("creates a project from the New menu and opens it", async () => {
    stubViewport(true);
    const fetchMock = stubFetch({
      "GET /api/projects": () => jsonResponse(200, projects),
      "POST /api/projects": () => jsonResponse(201, { ...projects[0], id: 8, name: "Ops" }),
    });
    const user = userEvent.setup();
    renderShell();

    const button = screen.getByRole("button", { name: "New" });
    await user.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await user.click(within(screen.getByRole("group", { name: "Create new" })).getByRole("button", { name: /^Project/ }));
    const dialog = screen.getByRole("dialog", { name: "New project" });
    await user.type(within(dialog).getByLabelText("Project name"), "Ops");
    await user.click(within(dialog).getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New project" })).toBeNull());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
    expect(nav.push).toHaveBeenCalledWith("/projects/8");
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Created project Ops.")).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it("closes the New menu with Escape and returns focus to it", async () => {
    stubViewport(true);
    const user = userEvent.setup();
    renderShell();

    const button = screen.getByRole("button", { name: "New" });
    await user.click(button);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Task/ }));
    await user.keyboard("{Escape}");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });
});

describe("AssistantPanel", () => {
  it("opens the docked assistant from the launcher and closes it with Escape, keeping the log", async () => {
    const user = userEvent.setup();
    render(<AssistantPanel />);

    const launcher = screen.getByRole("button", { name: "Show assistant" });
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    const panel = document.getElementById(launcher.getAttribute("aria-controls")!)!;
    expect(panel.hidden).toBe(true);

    await user.click(launcher);
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(launcher.textContent).toBe("Hide assistant");
    expect(panel.hidden).toBe(false);
    expect(screen.getByRole("log")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Message"));

    await user.keyboard("{Escape}");
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(launcher);
    expect(panel.querySelector("[role='log']")).not.toBeNull();
  });

  it("fills the message from an example prompt", async () => {
    const user = userEvent.setup();
    render(<AssistantPanel />);

    await user.click(screen.getByRole("button", { name: "Show assistant" }));
    await user.click(screen.getByRole("button", { name: "What is the status of sprint Sprint 1?" }));
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("What is the status of sprint Sprint 1?");
  });
});
