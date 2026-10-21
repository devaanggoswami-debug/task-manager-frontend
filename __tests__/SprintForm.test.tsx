import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScopeStatusCheck } from "@/app/components/ScopeStatus";
import SprintForm from "@/app/components/SprintForm";
import { ApiError, type ScopeStatus, type SprintInput } from "@/lib/api";
import { jsonResponse, projects, sprints } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ScopeStatusCheck", () => {
  it("checks status and renders a text badge with the reason, announced politely", async () => {
    const atRisk: ScopeStatus = {
      status: "at_risk",
      reason: "2 overdue task(s): #3 Fix login",
      total: 3,
      done: 0,
      blocked: 0,
      overdue: 2,
    };
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, atRisk)));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { container } = render(<ScopeStatusCheck kind="sprint" scopeId={1} name="Sprint 1" />);

    await user.click(screen.getByRole("button", { name: /Check status\s*of sprint Sprint 1/ }));
    await waitFor(() => expect(container.querySelector(".scope-badge")).not.toBeNull());
    const badge = container.querySelector(".scope-badge")!;
    expect(badge.textContent).toBe("At risk");
    expect(badge.className).toContain("scope-at_risk");
    expect(badge.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toContain("2 overdue task(s): #3 Fix login");
    expect(screen.getByRole("status").textContent).toBe("Sprint Sprint 1: At risk. 2 overdue task(s): #3 Fix login");
    expect(new URL((fetchMock.mock.calls[0] as unknown as [string])[0]).pathname).toBe("/api/sprints/1/status");
  });

  it("uses the project status endpoint and shows errors", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(404, { error: "project not found" })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ScopeStatusCheck kind="project" scopeId={5} name="Auth" />);

    await user.click(screen.getByRole("button", { name: /Check status\s*of project Auth/ }));
    expect(await screen.findByText("Could not check status: project not found")).toBeTruthy();
    expect(new URL((fetchMock.mock.calls[0] as unknown as [string])[0]).pathname).toBe("/api/projects/5/status");
  });
});

describe("SprintForm", () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, start: string, end: string) {
    await user.type(screen.getByLabelText("Sprint name"), "Sprint 3");
    await user.type(screen.getByLabelText("Start date"), start);
    await user.type(screen.getByLabelText("End date"), end);
  }

  it("creates with the implied project, hides the project select and clears after saving", async () => {
    const save = vi.fn((input: SprintInput) => Promise.resolve({ ...sprints[0], ...input, id: 3 }));
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<SprintForm heading="New sprint" submitLabel="Create sprint" projectId={5} save={save} onSaved={onSaved} />);

    expect(screen.queryByLabelText("Project")).toBeNull();
    await fill(user, "2026-11-02", "2026-11-13");
    await user.click(screen.getByRole("button", { name: "Create sprint" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ name: "Sprint 3", startDate: "2026-11-02", endDate: "2026-11-13", projectId: 5 });
    expect((screen.getByLabelText("Sprint name") as HTMLInputElement).value).toBe("");
  });

  it("edits a legacy sprint by choosing its project", async () => {
    const legacy = { ...sprints[0], projectId: null };
    const save = vi.fn((input: SprintInput) => Promise.resolve({ ...legacy, ...input }));
    const user = userEvent.setup();
    render(
      <SprintForm heading="Edit sprint" submitLabel="Save sprint" sprint={legacy} projects={projects} save={save} onSaved={vi.fn()} />,
    );

    const project = screen.getByLabelText("Project") as HTMLSelectElement;
    expect(project.value).toBe("");
    expect((screen.getByLabelText("Sprint name") as HTMLInputElement).value).toBe("Sprint 1");
    await user.click(screen.getByRole("button", { name: "Save sprint" }));
    expect(save).not.toHaveBeenCalled();

    await user.selectOptions(project, "Billing");
    await user.click(screen.getByRole("button", { name: "Save sprint" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toEqual({ name: "Sprint 1", startDate: "2026-10-19", endDate: "2026-10-30", projectId: 6 });
  });

  it("shows the endDate validation error and a 409 on their fields", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(400, "validation failed", { endDate: "must be on or after startDate" }),
      )
      .mockRejectedValueOnce(new ApiError(409, "a sprint with that name already exists"));
    const user = userEvent.setup();
    render(<SprintForm heading="New sprint" submitLabel="Create sprint" projectId={5} save={save} onSaved={vi.fn()} />);

    await fill(user, "2026-11-13", "2026-11-02");
    await user.click(screen.getByRole("button", { name: "Create sprint" }));
    const end = screen.getByLabelText("End date");
    await waitFor(() => expect(end.getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById(end.getAttribute("aria-describedby")!)?.textContent).toBe(
      "must be on or after startDate",
    );
    expect(screen.getByLabelText("Start date").hasAttribute("aria-invalid")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Create sprint" }));
    const name = screen.getByLabelText("Sprint name");
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById(name.getAttribute("aria-describedby")!)?.textContent).toBe(
      "a sprint with that name already exists",
    );
  });
});
